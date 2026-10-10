import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { useAuth } from "@app/providers/AuthProvider";
import {
  DsCard,
  DsCardHeader,
  DsMeter,
  DsStatusPill,
} from "@shared/ui/ds";
import { DsEmpty, DsFrozenBadge, DsInlineError, DsSkeletonRows } from "./dsLocalStates";
import {
  approveGrading,
  getExam,
  getResults,
  listAnswerSheets,
  overrideGrading,
  startGrading,
  type AnswerSheet,
  type Exam,
  type Grading,
} from "./api";

// Flagged = low AI confidence and not yet reviewed — same bar used on the test
// list's live grading run card, kept in sync here.
const FLAGGED_CONFIDENCE = 0.75;
const ZOOM_STEPS = [75, 100, 125, 150];

function isFlagged(g: Grading) {
  return g.status === "graded" && !g.teacher_approved && (g.confidence == null || g.confidence < FLAGGED_CONFIDENCE);
}

type SheetListItem = {
  sheet_id: string;
  student_name: string;
  student_roll: string | null;
  status: string;
  total_marks_awarded: number | null;
  total_max_marks: number | null;
};

export default function ExamGradingReview() {
  const { examId, sheetId } = useParams<{ examId: string; sheetId: string }>();
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Exam | null>(null);
  const [sheetList, setSheetList] = useState<SheetListItem[]>([]);
  const [sheet, setSheet] = useState<AnswerSheet | null>(null);
  const [gradings, setGradings] = useState<Grading[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regrading, setRegrading] = useState(false);

  const [rotation, setRotation] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(1); // index into ZOOM_STEPS, default 100%

  const [marksInput, setMarksInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    setRotation(0);
    setZoomIdx(1);
  }, [examId, sheetId, firebaseUser]);

  async function load() {
    if (!sheetId || !examId || !firebaseUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const [examData, summary, results] = await Promise.all([
        getExam(token, examId),
        listAnswerSheets(token, examId),
        getResults(token, sheetId),
      ]);
      setExam(examData);
      setSheetList(summary.students);
      setSheet(results.sheet);
      const graded = results.gradings.filter((g) => g.status === "graded" || g.status === "approved");
      setGradings(graded);
      const firstFlagged = graded.find(isFlagged);
      setSelectedId((firstFlagged || graded[0])?.id ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const selected = gradings.find((g) => g.id === selectedId) || null;
  const selectedIndex = gradings.findIndex((g) => g.id === selectedId);
  const flaggedCount = gradings.filter(isFlagged).length;
  const frozen = !!exam?.results_released;

  useEffect(() => {
    setMarksInput(String(selected?.marks_awarded ?? 0));
    setReasonInput("");
  }, [selectedId]);

  function goTo(offset: number) {
    if (gradings.length === 0) return;
    const next = (selectedIndex + offset + gradings.length) % gradings.length;
    setSelectedId(gradings[next].id);
    setRotation(0);
    setZoomIdx(1);
  }

  async function handleOverride() {
    if (!selected) return;
    const marks = Number(marksInput);
    if (!Number.isFinite(marks) || marks < 0 || marks > (selected.max_marks ?? 0)) {
      return toast.error(`Marks must be between 0 and ${selected.max_marks}`);
    }
    setSaving(true);
    try {
      const token = await firebaseUser?.getIdToken();
      await overrideGrading(token, selected.id, marks, reasonInput.trim());
      setGradings((prev) =>
        prev.map((g) => (g.id === selected.id ? { ...g, marks_awarded: marks, teacher_approved: true } : g))
      );
      toast.success("Grade updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAcceptAndNext() {
    if (!selected) return;
    setSaving(true);
    try {
      const token = await firebaseUser?.getIdToken();
      await approveGrading(token, selected.id);
      setGradings((prev) => prev.map((g) => (g.id === selected.id ? { ...g, teacher_approved: true } : g)));
      const nextFlagged = gradings.find((g) => g.id !== selected.id && isFlagged(g));
      if (nextFlagged) {
        setSelectedId(nextFlagged.id);
        setRotation(0);
        setZoomIdx(1);
      } else {
        toast.success("Every flagged question on this sheet is reviewed");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegrade() {
    if (!sheet) return;
    if (!window.confirm("Re-run AI grading for this whole sheet? Current marks will be replaced.")) return;
    setRegrading(true);
    try {
      const token = await firebaseUser?.getIdToken();
      await startGrading(token, sheet.id, "instant");
      toast.success("Regrade queued for this sheet — results will update shortly.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegrading(false);
    }
  }

  const batchStats = useMemo(() => {
    const total = sheetList.length;
    const graded = sheetList.filter((s) => s.status === "graded").length;
    return { total, graded };
  }, [sheetList]);

  if (loading) {
    return (
      <div className="space-y-3.5 font-ds-sans">
        <DsSkeletonRows rows={1} height={36} />
        <DsSkeletonRows rows={8} height={60} />
      </div>
    );
  }

  if (error || !sheet || !exam) {
    return (
      <div className="flex flex-col items-center gap-4 p-12 text-center font-ds-sans">
        <AlertCircle className="h-12 w-12 text-ds-accent" />
        <p className="text-[13px] font-semibold text-ds-ink">{error || "Answer sheet not found"}</p>
        <Button asChild variant="outline">
          <Link to={`/educator/exam-grading/${examId}`}>Back</Link>
        </Button>
      </div>
    );
  }

  const imageUrl = selected?.annotated_image_url || selected?.cropped_image_url || null;

  return (
    <div className="space-y-3.5 font-ds-sans">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-1">
          <Link to={`/educator/exam-grading/${examId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-ds-serif text-[19px] font-semibold text-ds-ink">
            {exam.title} · Sheet review
          </h1>
          <p className="font-ds-sans text-[12px] text-ds-slate">
            {exam.subject} · AI graded, {frozen ? "released" : "awaiting your sign-off"}
          </p>
        </div>
        {frozen && <DsFrozenBadge />}
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[212px_minmax(0,1fr)_320px]">
        {/* Sheets rail */}
        <DsCard className="overflow-hidden">
          <div className="border-b border-ds-ink/[.08] px-3.5 py-2.5">
            <div className="font-ds-sans text-[12.5px] font-semibold text-ds-ink">Sheets</div>
            <div className="mt-0.5 font-ds-mono text-[11px] text-ds-ink/45">
              {batchStats.graded} graded · {flaggedCount} flagged
            </div>
          </div>
          {sheetList.map((s) => {
            const pct =
              s.total_marks_awarded != null && s.total_max_marks
                ? (s.total_marks_awarded / s.total_max_marks) * 100
                : null;
            const fg = pct == null ? "text-ds-ink/30" : pct < 50 ? "text-ds-accent" : pct < 75 ? "text-ds-info" : "text-ds-positive";
            return (
              <button
                key={s.sheet_id}
                onClick={() => navigate(`/educator/exam-grading/${examId}/review/${s.sheet_id}`)}
                className={
                  "flex w-full items-center gap-2 border-b border-ds-ink/[.055] px-3.5 py-2.5 text-left " +
                  (s.sheet_id === sheetId ? "bg-ds-fill/60" : "hover:bg-ds-fill/30")
                }
              >
                <div className={"h-1.5 w-1.5 shrink-0 rounded-full " + fg.replace("text-", "bg-")} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-ds-sans text-[12px] font-medium text-ds-ink">
                    {s.student_name}
                  </div>
                  {s.student_roll && (
                    <div className="truncate font-ds-mono text-[10.5px] text-ds-ink/40">{s.student_roll}</div>
                  )}
                </div>
                <div className={"font-ds-mono text-[11px] font-medium " + fg}>
                  {s.total_marks_awarded != null ? `${s.total_marks_awarded}/${s.total_max_marks}` : "—"}
                </div>
              </button>
            );
          })}
        </DsCard>

        {/* Scan viewer */}
        <DsCard className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-ds-ink/[.08] px-4 py-2.5">
            <div className="font-ds-sans text-[12.5px] font-semibold text-ds-ink">
              {sheet.student_name}
              {sheet.student_roll ? ` · ${sheet.student_roll}` : ""}
            </div>
            {selected && isFlagged(selected) && <DsStatusPill tone="accent">Flagged</DsStatusPill>}
            <div className="flex-1" />
            {gradings.length > 0 && (
              <div className="flex items-center gap-1 font-ds-mono text-[11.5px] text-ds-ink/50">
                <button onClick={() => goTo(-1)} className="rounded p-1 hover:bg-ds-fill">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                Q {selectedIndex + 1} / {gradings.length}
                <button onClick={() => goTo(1)} className="rounded p-1 hover:bg-ds-fill">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="flex h-[26px] items-center gap-1.5 rounded-md border border-ds-ink/[.14] px-2 font-ds-sans text-[11px] font-medium text-ds-ink"
            >
              <RotateCw className="h-3 w-3" />
              Rotate
            </button>
            <button
              onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
              className="flex h-[26px] items-center rounded-md border border-ds-ink/[.14] px-1.5"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <div className="font-ds-mono text-[11px] text-ds-ink/60">{ZOOM_STEPS[zoomIdx]}%</div>
            <button
              onClick={() => setZoomIdx((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
              className="flex h-[26px] items-center rounded-md border border-ds-ink/[.14] px-1.5"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>

          <div className="flex min-h-[500px] items-center justify-center overflow-auto bg-ds-fill p-4">
            {gradings.length === 0 ? (
              <DsEmpty
                title="Nothing to review yet"
                body={
                  sheet.status === "processing"
                    ? "Grading is in progress — questions will appear here as they're graded."
                    : sheet.status === "pending"
                      ? "Grading is queued and hasn't started yet."
                      : sheet.status === "failed"
                        ? sheet.error_message || "Grading failed for this sheet."
                        : "No graded questions yet."
                }
              />
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt={`Question ${selected?.question_no} answer`}
                className="max-h-[560px] rounded border border-ds-ink/[.12] bg-white object-contain transition-transform"
                style={{ transform: `rotate(${rotation}deg) scale(${ZOOM_STEPS[zoomIdx] / 100})` }}
              />
            ) : (
              <p className="font-ds-sans text-[12px] text-ds-slate">No scanned image available for this question.</p>
            )}
          </div>
        </DsCard>

        {/* Rubric rail */}
        <div className="flex flex-col gap-3.5">
          {selected ? (
            <DsCard className="p-4">
              <div className="mb-0.5 flex items-baseline gap-2">
                <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                  Q{selected.question_no}
                </div>
                <div className="flex-1" />
                <div className="font-ds-serif text-[14px] font-semibold text-ds-ink">
                  {selected.marks_awarded ?? 0} / {selected.max_marks ?? 0}
                </div>
              </div>
              <div className="mb-3 font-ds-sans text-[11.5px] text-ds-ink/50">
                {selected.question_text || "Subjective"}
                {selected.confidence != null ? ` · confidence ${Math.round(selected.confidence * 100)}%` : ""}
              </div>

              {(selected.annotation_json?.steps || []).length === 0 ? (
                <p className="font-ds-sans text-[11.5px] text-ds-slate">
                  No rubric-step breakdown for this question.
                </p>
              ) : (
                (selected.annotation_json?.steps || []).map((step, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 border-b border-ds-ink/[.055] py-2 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-ds-sans text-[12px] font-medium text-ds-ink">{step.title}</div>
                      <div className="mt-0.5 font-ds-sans text-[11px] leading-[1.4] text-ds-ink/50">
                        {step.note}
                      </div>
                    </div>
                    <div
                      className={
                        "shrink-0 font-ds-mono text-[12px] font-semibold " +
                        (step.marks_awarded >= step.max_marks
                          ? "text-ds-positive"
                          : step.marks_awarded <= 0
                            ? "text-ds-accent"
                            : "text-ds-info")
                      }
                    >
                      {step.marks_awarded}/{step.max_marks}
                    </div>
                  </div>
                ))
              )}
              {(selected.annotation_json?.steps || []).length > 0 && (
                <p className="mt-2 font-ds-sans text-[10.5px] text-ds-ink/40">
                  Per-step marks are read-only until grade-engine's per-step grading lands — override the
                  question's total below.
                </p>
              )}

              {selected.feedback && (
                <>
                  <div className="mb-1.5 mt-3.5 font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/45">
                    Feedback sent to student
                  </div>
                  <div className="rounded-[9px] border border-ds-ink/[.13] bg-white px-3 py-2.5 font-ds-sans text-[12px] leading-[1.6] text-ds-ink/75">
                    {selected.feedback}
                  </div>
                </>
              )}

              {frozen ? (
                <p className="mt-3.5 font-ds-sans text-[11.5px] text-ds-slate">
                  Results are released to students — unrelease from the test page to make changes.
                </p>
              ) : (
                <>
                  <div className="mb-1.5 mt-3.5 flex items-center gap-2">
                    <label className="font-ds-sans text-[11.5px] font-medium text-ds-ink">
                      Override total marks
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={selected.max_marks ?? undefined}
                      step={0.5}
                      value={marksInput}
                      onChange={(e) => setMarksInput(e.target.value)}
                      className="h-7 w-16 rounded-md border border-ds-ink/[.14] px-2 font-ds-mono text-[12px]"
                    />
                    <span className="font-ds-mono text-[11px] text-ds-ink/45">/ {selected.max_marks}</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    className="mb-2.5 h-8 w-full rounded-md border border-ds-ink/[.14] px-2.5 font-ds-sans text-[12px]"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleAcceptAndNext}
                      disabled={saving}
                      className="flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[7px] bg-ds-ink font-ds-sans text-[12.5px] font-semibold text-white disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Accept &amp; next flagged
                    </button>
                    <button
                      onClick={handleOverride}
                      disabled={saving}
                      className="h-[34px] rounded-[7px] border border-ds-ink/[.14] px-3 font-ds-sans text-[12.5px] font-medium text-ds-ink disabled:opacity-50"
                    >
                      Save override
                    </button>
                  </div>
                  <button
                    onClick={handleRegrade}
                    disabled={regrading}
                    className="mt-1.5 h-[30px] w-full rounded-[7px] border border-ds-ink/[.14] font-ds-sans text-[11.5px] font-medium text-ds-ink disabled:opacity-50"
                  >
                    {regrading ? "Queuing regrade…" : "Regrade this sheet"}
                  </button>
                </>
              )}
            </DsCard>
          ) : (
            <DsCard className="p-0">
              <DsInlineError message={error || "Nothing to review for this sheet yet."} />
            </DsCard>
          )}

          <DsCard>
            <DsCardHeader title="Batch run" />
            <div className="p-4 pt-3">
              <DsMeter pct={batchStats.total ? (batchStats.graded / batchStats.total) * 100 : 0} tone="info" />
              <div className="mt-2 flex font-ds-mono text-[11px] text-ds-ink/50">
                <div>{batchStats.graded} of {batchStats.total} sheets graded</div>
              </div>
              <div className="mt-3 flex gap-2">
                <div className="flex-1 rounded-[8px] bg-ds-fill p-2.5">
                  <div className="font-ds-serif text-[17px] font-semibold leading-none text-ds-ink">
                    {flaggedCount}
                  </div>
                  <div className="mt-1 font-ds-sans text-[10.5px] text-ds-ink/45">Flagged (this sheet)</div>
                </div>
                <div className="flex-1 rounded-[8px] bg-ds-fill p-2.5">
                  <div className="font-ds-serif text-[17px] font-semibold leading-none text-ds-ink">
                    {gradings.filter((g) => g.teacher_approved).length}
                  </div>
                  <div className="mt-1 font-ds-sans text-[10.5px] text-ds-ink/45">Reviewed (this sheet)</div>
                </div>
              </div>
            </div>
          </DsCard>
        </div>
      </div>
    </div>
  );
}
