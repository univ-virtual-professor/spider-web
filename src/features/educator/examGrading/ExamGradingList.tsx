import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { PERMISSIONS } from "@shared/lib/rolesConfig";
import {
  DsPageHeader,
  DsCard,
  DsTableRow,
  DsStatusPill,
  DsMeter,
  DsDetailRail,
} from "@shared/ui/ds";
import { DsEmpty, DsSkeletonRows, DsInlineError } from "./dsLocalStates";
import {
  approveGrading,
  createExam,
  getResults,
  listAnswerSheets,
  listExams,
  releaseResults,
  unreleaseResults,
  type Exam,
  type Grading,
} from "./api";

// Flagged = AI graded the question but either confidence is below this bar or
// the educator hasn't approved/overridden it yet. There's no server-side
// "flagged" flag, so this is derived client-side from real grading data.
const FLAGGED_CONFIDENCE = 0.75;

type SheetRow = {
  sheet_id: string;
  student_name: string;
  student_roll: string | null;
  status: string;
};

type ExamState = "draft" | "grading" | "awaiting_signoff" | "released";

type ExamRow = {
  exam: Exam;
  sheets: SheetRow[];
  state: ExamState;
  gradedCount: number;
};

type FlaggedItem = {
  sheetId: string;
  studentName: string;
  grading: Grading;
};

function deriveState(exam: Exam, sheets: SheetRow[]): ExamState {
  if (sheets.length === 0) return "draft";
  const graded = sheets.filter((s) => s.status === "graded").length;
  const inProgress = sheets.filter((s) => s.status === "pending" || s.status === "processing").length;
  if (inProgress > 0) return "grading";
  if (graded === sheets.length) return exam.results_released ? "released" : "awaiting_signoff";
  return "draft";
}

const STATE_LABEL: Record<ExamState, string> = {
  draft: "Draft",
  grading: "Grading",
  awaiting_signoff: "Awaiting sign-off",
  released: "Released",
};
const STATE_TONE: Record<ExamState, "slate" | "info" | "accent" | "positive"> = {
  draft: "slate",
  grading: "info",
  awaiting_signoff: "accent",
  released: "positive",
};

export default function ExamGradingList() {
  const { firebaseUser } = useAuth();
  const { isEmployee, hasPermission } = useEmployee();
  const canCreate = !isEmployee || hasPermission(PERMISSIONS.TESTS_CREATE);
  const canPublish = !isEmployee || hasPermission(PERMISSIONS.TESTS_PUBLISH);

  const [rows, setRows] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ExamState>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);

  const [flagged, setFlagged] = useState<FlaggedItem[]>([]);
  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [firebaseUser]);

  async function load() {
    if (!firebaseUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const exams = await listExams(token);
      const summaries = await Promise.all(
        exams.map(async (exam) => {
          try {
            const summary = await listAnswerSheets(token, exam.id);
            return { exam, sheets: summary.students };
          } catch {
            return { exam, sheets: [] as SheetRow[] };
          }
        })
      );
      const built: ExamRow[] = summaries.map(({ exam, sheets }) => ({
        exam,
        sheets,
        state: deriveState(exam, sheets),
        gradedCount: sheets.filter((s) => s.status === "graded").length,
      }));
      built.sort(
        (a, b) => new Date(b.exam.created_at).getTime() - new Date(a.exam.created_at).getTime()
      );
      setRows(built);
      loadFlagged(token, built);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // The "live AI grading run" card tracks one exam at a time — the most
  // recently created exam that currently has sheets mid-grading.
  const activeRow = useMemo(() => rows.find((r) => r.state === "grading") || null, [rows]);

  async function loadFlagged(token: string, built: ExamRow[]) {
    const active = built.find((r) => r.state === "grading");
    if (!active) {
      setFlagged([]);
      return;
    }
    setFlaggedLoading(true);
    try {
      const gradedSheets = active.sheets.filter((s) => s.status === "graded");
      const results = await Promise.all(
        gradedSheets.map((s) => getResults(token, s.sheet_id).catch(() => null))
      );
      const items: FlaggedItem[] = [];
      results.forEach((r, i) => {
        if (!r) return;
        for (const g of r.gradings) {
          if (g.status !== "graded") continue;
          if (g.teacher_approved) continue;
          if (g.confidence != null && g.confidence >= FLAGGED_CONFIDENCE) continue;
          items.push({ sheetId: gradedSheets[i].sheet_id, studentName: gradedSheets[i].student_name, grading: g });
        }
      });
      items.sort((a, b) => (a.grading.confidence ?? 0) - (b.grading.confidence ?? 0));
      setFlagged(items.slice(0, 5));
    } finally {
      setFlaggedLoading(false);
    }
  }

  async function handleAccept(item: FlaggedItem) {
    setAcceptingId(item.grading.id);
    try {
      const token = await firebaseUser?.getIdToken();
      await approveGrading(token, item.grading.id);
      setFlagged((prev) => prev.filter((f) => f.grading.id !== item.grading.id));
      toast.success("AI marks accepted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleRelease() {
    if (!activeRow) return;
    setReleaseBusy(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const updated = activeRow.exam.results_released
        ? await unreleaseResults(token, activeRow.exam.id)
        : await releaseResults(token, activeRow.exam.id);
      setRows((prev) =>
        prev.map((r) => (r.exam.id === updated.id ? { ...r, exam: updated, state: deriveState(updated, r.sheets) } : r))
      );
      toast.success(updated.results_released ? "Results released to students" : "Results unreleased");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReleaseBusy(false);
    }
  }

  async function handleCreate() {
    if (!title.trim() || !subject.trim()) return toast.error("Title and subject are required");
    setCreating(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const exam = await createExam(token, title.trim(), subject.trim());
      setRows((prev) => [{ exam, sheets: [], state: "draft", gradedCount: 0 }, ...prev]);
      setCreateOpen(false);
      setTitle("");
      setSubject("");
      toast.success("Exam created");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<ExamState, number> = { draft: 0, grading: 0, awaiting_signoff: 0, released: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);

  const visibleRows = filter === "all" ? rows : rows.filter((r) => r.state === filter);

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Tests & grading"
        subtitle={
          rows.length === 0
            ? "Create, schedule, and review what the AI graded."
            : `${rows.length} test${rows.length === 1 ? "" : "s"} · ${counts.awaiting_signoff} awaiting your sign-off`
        }
        primary={canCreate ? { label: "New exam", onClick: () => setCreateOpen(true), icon: <Plus className="mr-1.5 h-4 w-4" /> } : undefined}
      />

      {error && <DsInlineError message={error} onRetry={load} />}

      <div className="grid items-start gap-3.5 lg:grid-cols-[1.45fr_1fr]">
        <DsCard className="overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-ds-ink/[.08] px-3 py-2">
            {(["all", "draft", "grading", "awaiting_signoff", "released"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  "rounded-md px-2.5 py-1 font-ds-sans text-[12px] font-medium " +
                  (filter === f ? "bg-ds-fill text-ds-ink" : "text-ds-ink/55 hover:bg-ds-fill/60")
                }
              >
                {f === "all" ? `All · ${rows.length}` : `${STATE_LABEL[f]} · ${counts[f]}`}
              </button>
            ))}
          </div>

          {loading ? (
            <DsSkeletonRows rows={6} height={58} />
          ) : visibleRows.length === 0 ? (
            <DsEmpty
              title={rows.length === 0 ? "No exams yet" : "No tests in this state"}
              body={
                rows.length === 0
                  ? "Create an exam to start uploading question papers and answer sheets."
                  : undefined
              }
              action={
                rows.length === 0 && canCreate ? (
                  <Button size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    New exam
                  </Button>
                ) : undefined
              }
            />
          ) : (
            visibleRows.map((r) => (
              <Link key={r.exam.id} to={`/educator/exam-grading/${r.exam.id}`} className="block">
                <DsTableRow cols="3px minmax(0,1fr) auto" height={58} className="gap-3 hover:bg-ds-fill/30">
                  <div
                    className={
                      "h-8 rounded-sm " +
                      (r.state === "grading"
                        ? "bg-ds-info"
                        : r.state === "awaiting_signoff"
                          ? "bg-ds-accent"
                          : r.state === "released"
                            ? "bg-ds-positive"
                            : "bg-ds-slate")
                    }
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.exam.title}</div>
                    <div className="mt-0.5 truncate font-ds-sans text-[11px] text-ds-ink/45">
                      {r.exam.subject} · {r.sheets.length} sheet{r.sheets.length === 1 ? "" : "s"} · created{" "}
                      {new Date(r.exam.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <DsStatusPill tone={STATE_TONE[r.state]}>
                    {STATE_LABEL[r.state]}
                    {r.state === "grading" && r.sheets.length > 0
                      ? ` ${Math.round((r.gradedCount / r.sheets.length) * 100)}%`
                      : ""}
                  </DsStatusPill>
                </DsTableRow>
              </Link>
            ))
          )}
        </DsCard>

        <DsDetailRail>
          {!loading && !activeRow ? (
            <DsCard className="p-0">
              <DsEmpty
                title="No grading run in progress"
                body="Start grading from a test's answer sheets to see live progress and flagged sheets here."
              />
            </DsCard>
          ) : activeRow ? (
            <DsCard className="p-4">
              <div className="flex items-center gap-2">
                <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                  {activeRow.exam.title} · AI grading
                </div>
                <DsStatusPill tone="info">Running</DsStatusPill>
              </div>
              <div className="mb-3 mt-1 font-ds-sans text-[11.5px] text-ds-ink/50">
                {activeRow.sheets.length} scanned sheet{activeRow.sheets.length === 1 ? "" : "s"} · per-question feedback
              </div>
              <DsMeter
                pct={activeRow.sheets.length ? (activeRow.gradedCount / activeRow.sheets.length) * 100 : 0}
                tone="info"
              />
              <div className="mt-2 flex font-ds-mono text-[11px] text-ds-ink/50">
                <div>{activeRow.gradedCount} graded</div>
                <div className="flex-1" />
                <div>{activeRow.sheets.length - activeRow.gradedCount} remaining</div>
              </div>

              <div className="mb-2 mt-3.5 font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/45">
                Flagged for your review
              </div>
              {flaggedLoading ? (
                <DsSkeletonRows rows={2} height={40} />
              ) : flagged.length === 0 ? (
                <p className="font-ds-sans text-[11.5px] text-ds-slate">
                  Nothing flagged yet — AI is confident in every graded question so far.
                </p>
              ) : (
                flagged.map((f) => (
                  <div key={f.grading.id} className="mb-2 rounded-[8px] border border-ds-ink/[.09] p-2.5">
                    <div className="flex items-baseline gap-2">
                      <div className="font-ds-sans text-[12px] font-semibold text-ds-ink">
                        {f.studentName}
                      </div>
                      <div className="font-ds-mono text-[11px] text-ds-ink/45">
                        Q{f.grading.question_no}
                      </div>
                      <div className="flex-1" />
                      <div className="font-ds-mono text-[11.5px] font-semibold text-ds-accent">
                        {f.grading.marks_awarded}/{f.grading.max_marks}
                      </div>
                    </div>
                    <div className="mt-1 font-ds-sans text-[11.5px] leading-[1.5] text-ds-ink/55">
                      {f.grading.confidence != null
                        ? `Confidence ${Math.round(f.grading.confidence * 100)}%. `
                        : ""}
                      {f.grading.feedback || "Not yet approved."}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" className="h-7 px-2.5 text-[11px]" asChild>
                        <Link to={`/educator/exam-grading/${activeRow.exam.id}/review/${f.sheetId}`}>
                          Open sheet
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-[11px]"
                        disabled={acceptingId === f.grading.id}
                        onClick={() => handleAccept(f)}
                      >
                        {acceptingId === f.grading.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Accept AI marks"
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}

              {canPublish && (
                <button
                  onClick={handleRelease}
                  disabled={releaseBusy || activeRow.gradedCount < activeRow.sheets.length}
                  className="mt-3 flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[7px] bg-ds-accent font-ds-sans text-[12.5px] font-semibold text-white disabled:opacity-40"
                >
                  {releaseBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Release results to students
                </button>
              )}
            </DsCard>
          ) : null}
        </DsDetailRail>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Exam</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                placeholder="e.g. Class XII Accountancy Mid-Term"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Input
                placeholder="e.g. Accountancy"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
