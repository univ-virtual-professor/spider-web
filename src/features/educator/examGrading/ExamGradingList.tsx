import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
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
  DsStatusPill,
  DsMeter,
  DsDetailRail,
  DsEmpty,
  DsSkeletonRows,
  DsInlineError,
} from "@shared/ui/ds";
import { FLAGGED_CONFIDENCE } from "./constants";
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

type SheetRow = {
  sheet_id: string;
  student_name: string;
  student_roll: string | null;
  status: string;
};

type ExamState = "draft" | "grading" | "failed" | "awaiting_signoff" | "released";

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
  const inProgress = sheets.filter(
    (s) => s.status === "pending" || s.status === "processing"
  ).length;
  const failed = sheets.filter((s) => s.status === "failed").length;
  if (inProgress > 0) return "grading";
  if (graded === sheets.length) return exam.results_released ? "released" : "awaiting_signoff";
  if (failed > 0) return "failed";
  return "draft";
}

const STATE_LABEL: Record<ExamState, string> = {
  draft: "Draft",
  grading: "Grading",
  failed: "Needs attention",
  awaiting_signoff: "Awaiting sign-off",
  released: "Released",
};
const STATE_TONE: Record<ExamState, "slate" | "info" | "accent" | "positive"> = {
  draft: "slate",
  grading: "info",
  failed: "accent",
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
  const [releasingExamId, setReleasingExamId] = useState<string | null>(null);
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

  // The "live AI grading run" card only ever tracks an exam that's actually
  // mid-grading (never awaiting_signoff/released) so its "Running" label and
  // progress meter are always true — release/unrelease live on each exam's
  // own row instead (see rowAction below), since that's reachable for every
  // awaiting_signoff/released exam, not just whichever one this card shows.
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
          items.push({
            sheetId: gradedSheets[i].sheet_id,
            studentName: gradedSheets[i].student_name,
            grading: g,
          });
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

  async function handleToggleRelease(row: ExamRow) {
    setReleasingExamId(row.exam.id);
    try {
      const token = await firebaseUser?.getIdToken();
      const updated = row.exam.results_released
        ? await unreleaseResults(token, row.exam.id)
        : await releaseResults(token, row.exam.id);
      setRows((prev) =>
        prev.map((r) =>
          r.exam.id === updated.id
            ? { ...r, exam: updated, state: deriveState(updated, r.sheets) }
            : r
        )
      );
      toast.success(
        updated.results_released ? "Results released to students" : "Results unreleased"
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReleasingExamId(null);
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
    const c: Record<ExamState, number> = {
      draft: 0,
      grading: 0,
      failed: 0,
      awaiting_signoff: 0,
      released: 0,
    };
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
        primary={
          canCreate
            ? {
                label: "New exam",
                onClick: () => setCreateOpen(true),
                icon: <Plus className="mr-1.5 h-4 w-4" />,
              }
            : undefined
        }
      />

      {error && <DsInlineError message={error} onRetry={load} />}

      <div className="grid items-start gap-3.5 lg:grid-cols-[1.45fr_1fr]">
        <DsCard className="overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-ds-ink/[.08] px-3 py-2">
            {(["all", "draft", "grading", "failed", "awaiting_signoff", "released"] as const).map(
              (f) => (
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
              )
            )}
          </div>

          {loading ? (
            <DsSkeletonRows rows={6} rowHeight={58} />
          ) : visibleRows.length === 0 ? (
            <DsEmpty
              title={rows.length === 0 ? "No exams yet" : "No tests in this state"}
              body={
                rows.length === 0
                  ? "Create an exam to start uploading question papers and answer sheets."
                  : undefined
              }
              action={
                rows.length === 0 && canCreate
                  ? { label: "New exam", onClick: () => setCreateOpen(true) }
                  : undefined
              }
            />
          ) : (
            visibleRows.map((r) => {
              const rowAction =
                r.state === "awaiting_signoff"
                  ? { label: "Release", next: "released" as const }
                  : r.state === "released"
                    ? { label: "Unrelease", next: "awaiting_signoff" as const }
                    : null;
              return (
                <div
                  key={r.exam.id}
                  className="flex items-center gap-3 border-b border-ds-ink/[.055] px-4 hover:bg-ds-fill/30"
                  style={{ height: 58 }}
                >
                  <div
                    className={
                      "h-8 w-[3px] shrink-0 rounded-sm " +
                      (r.state === "grading"
                        ? "bg-ds-info"
                        : r.state === "awaiting_signoff" || r.state === "failed"
                          ? "bg-ds-accent"
                          : r.state === "released"
                            ? "bg-ds-positive"
                            : "bg-ds-slate")
                    }
                  />
                  <Link to={`/educator/exam-grading/${r.exam.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.exam.title}</div>
                    <div className="mt-0.5 truncate font-ds-sans text-[11px] text-ds-ink/45">
                      {r.exam.subject} · {r.sheets.length} sheet{r.sheets.length === 1 ? "" : "s"} ·
                      created {new Date(r.exam.created_at).toLocaleDateString()}
                    </div>
                  </Link>
                  {rowAction && canPublish && (
                    <button
                      onClick={() => handleToggleRelease(r)}
                      disabled={releasingExamId === r.exam.id}
                      className="h-7 shrink-0 rounded-md border border-ds-ink/[.14] px-2.5 font-ds-sans text-[11px] font-medium text-ds-ink hover:bg-ds-fill disabled:opacity-50"
                    >
                      {releasingExamId === r.exam.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        rowAction.label
                      )}
                    </button>
                  )}
                  <DsStatusPill tone={STATE_TONE[r.state]}>
                    {STATE_LABEL[r.state]}
                    {r.state === "grading" && r.sheets.length > 0
                      ? ` ${Math.round((r.gradedCount / r.sheets.length) * 100)}%`
                      : ""}
                  </DsStatusPill>
                </div>
              );
            })
          )}
        </DsCard>

        <DsDetailRail>
          {!loading && !activeRow ? (
            <DsCard className="p-0">
              <DsEmpty
                title="No grading run in progress"
                body="Start grading from a test's answer sheets to see live progress and flagged sheets here. Release and unrelease live on each test's own row once grading finishes."
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
                {activeRow.sheets.length} scanned sheet{activeRow.sheets.length === 1 ? "" : "s"} ·
                per-question feedback
              </div>
              <DsMeter
                pct={
                  activeRow.sheets.length
                    ? (activeRow.gradedCount / activeRow.sheets.length) * 100
                    : 0
                }
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
                <DsSkeletonRows rows={2} rowHeight={40} />
              ) : flagged.length === 0 ? (
                <p className="font-ds-sans text-[11.5px] text-ds-slate">
                  Nothing flagged yet — AI is confident in every graded question so far.
                </p>
              ) : (
                flagged.map((f) => (
                  <div
                    key={f.grading.id}
                    className="mb-2 rounded-[8px] border border-ds-ink/[.09] p-2.5"
                  >
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
                        <Link
                          to={`/educator/exam-grading/${activeRow.exam.id}/review/${f.sheetId}`}
                        >
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
