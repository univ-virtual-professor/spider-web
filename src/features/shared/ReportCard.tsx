import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";
import { toast } from "sonner";

import { db } from "@shared/lib/firebase";
import { Button } from "@shared/ui/button";
import { Textarea } from "@shared/ui/textarea";
import { DsPageHeader, DsCard, DsTableHead, DsTableRow, DsMeter } from "@shared/ui/ds";
import { examCountsTowardReportCard, type CurriculumExamDoc } from "@shared/lib/examModel";
import { Loader2, Printer } from "lucide-react";

type TestRow = {
  id: string;
  title: string;
  subject?: string;
  marks: number | null;
  maxMarks: number | null;
  date: Date | null;
  kind: "test" | "manual";
};

type CurriculumRow = {
  examId: string;
  title: string;
  subject: string;
  date: string;
  marks: number;
  maxMarks: number;
  rank: number | null;
  totalStudents: number;
};

type Props = {
  educatorId: string;
  studentUid: string;
  studentName: string;
  // Only the educator's own view of a student's report card lets faculty remarks be edited —
  // the student's own view (StudentReportCard.tsx) is read-only.
  canEditRemark?: boolean;
};

function pct(marks: number, max: number) {
  return max > 0 ? (marks / max) * 100 : 0;
}

function tone(p: number) {
  return p < 50 ? "#cf6134" : p < 75 ? "#1a7fb3" : "#3f8f6b";
}

// Shared term report card — the student's own view (StudentReportCard.tsx) and an educator's
// view of one of their students (EducatorStudentReportCard.tsx) render the exact same data.
// Rule #1 (BUILD-NOTES §05): ad-hoc tests (online attempts + manually entered grades) and
// curriculum exams (educators/{id}/exams, see ExamSchedule.tsx) are kept in separate sections —
// only curriculum exams whose results have been released (rule #8) carry a rank. "Download PDF"
// is window.print() — no new PDF library dependency, the browser's own print-to-PDF covers it.
// "Share with parent" is not built: BUILD-NOTES §06 lists parent access as not yet designed
// (SMS-only login today, no sharing path), so it's left out rather than invented.
export default function ReportCard({
  educatorId,
  studentUid,
  studentName,
  canEditRemark = false,
}: Props) {
  const [instituteName, setInstituteName] = useState("");
  const [batchId, setBatchId] = useState<string | undefined>();
  const [courseId, setCourseId] = useState<string | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [batchName, setBatchName] = useState("");
  const [studentLoaded, setStudentLoaded] = useState(false);
  const [remark, setRemark] = useState<{ text: string; by: string; at: Date | null } | null>(null);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  const [attemptRows, setAttemptRows] = useState<TestRow[]>([]);
  const [manualRows, setManualRows] = useState<TestRow[]>([]);
  const [attemptsLoaded, setAttemptsLoaded] = useState(false);
  const [gradesLoaded, setGradesLoaded] = useState(false);

  const [curriculumRows, setCurriculumRows] = useState<CurriculumRow[]>([]);
  const [curriculumLoaded, setCurriculumLoaded] = useState(false);

  const [attendance, setAttendance] = useState<{
    total: number;
    present: number;
    months: { month: string; pct: number }[];
  }>({ total: 0, present: 0, months: [] });

  // Student profile: batch/course for scoping exams + attendance, and the faculty remark.
  useEffect(() => {
    if (!educatorId || !studentUid) return;
    const unsub = onSnapshot(
      doc(db, "educators", educatorId, "students", studentUid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : null;
        setBranchId(data?.branchId);
        setCourseId(data?.courseId);
        setBatchId(data?.batchId);
        const r = data?.reportCardRemark;
        if (r?.text) {
          setRemark({
            text: String(r.text),
            by: String(r.by || ""),
            at: r.at?.toDate ? r.at.toDate() : null,
          });
          setRemarkDraft(String(r.text));
        } else {
          setRemark(null);
          setRemarkDraft("");
        }
        setStudentLoaded(true);
      },
      () => setStudentLoaded(true)
    );
    return () => unsub();
  }, [educatorId, studentUid]);

  useEffect(() => {
    if (!educatorId) return;
    getDoc(doc(db, "educators", educatorId)).then((snap) => {
      const data = snap.exists() ? snap.data() : null;
      setInstituteName(String(data?.builderConfig?.instituteName || data?.coachingName || ""));
    });
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId || !branchId || !courseId || !batchId) {
      setBatchName("");
      return;
    }
    getDoc(
      doc(
        db,
        "educators",
        educatorId,
        "branches",
        branchId,
        "courses",
        courseId,
        "batches",
        batchId
      )
    ).then((snap) => {
      setBatchName(snap.exists() ? String(snap.data().name || "") : "");
    });
  }, [educatorId, branchId, courseId, batchId]);

  // Ad-hoc tests: online attempts (`attempts`, top-level) + manually entered grades
  // (nested per-student, no curriculum-exam link) — neither carries a venue or syllabus.
  useEffect(() => {
    if (!studentUid) return;
    const unsub = onSnapshot(
      query(
        collection(db, "attempts"),
        where("studentId", "==", studentUid),
        where("status", "==", "submitted"),
        orderBy("createdAt", "desc"),
        limit(100)
      ),
      (snap) => {
        setAttemptRows(
          snap.docs.map((d) => {
            const data = d.data() as any;
            const ts: Timestamp | undefined = data.submittedAt || data.createdAt;
            return {
              id: d.id,
              title: String(data.testTitle || "Test"),
              subject: data.subject,
              marks: typeof data.score === "number" ? data.score : null,
              maxMarks: typeof data.maxScore === "number" ? data.maxScore : null,
              date: ts?.toDate ? ts.toDate() : null,
              kind: "test" as const,
            };
          })
        );
        setAttemptsLoaded(true);
      },
      () => setAttemptsLoaded(true)
    );
    return () => unsub();
  }, [studentUid]);

  useEffect(() => {
    if (!educatorId || !studentUid) return;
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "students", studentUid, "manualGrades"),
      (snap) => {
        setManualRows(
          snap.docs.map((d) => {
            const data = d.data() as any;
            const ts: Timestamp | undefined = data.gradedAt || data.createdAt;
            return {
              id: d.id,
              title: String(data.title || "Grade"),
              subject: data.subject,
              marks: typeof data.marks === "number" ? data.marks : null,
              maxMarks: typeof data.maxMarks === "number" ? data.maxMarks : null,
              date: ts?.toDate ? ts.toDate() : null,
              kind: "manual" as const,
            };
          })
        );
        setGradesLoaded(true);
      },
      () => setGradesLoaded(true)
    );
    return () => unsub();
  }, [educatorId, studentUid]);

  const testRows = useMemo(
    () =>
      [...attemptRows, ...manualRows].sort(
        (a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)
      ),
    [attemptRows, manualRows]
  );

  // Curriculum exams: read only this student's own `examResults` docs (query by studentId) —
  // never a cross-student query. Rank and totalStudents are written once by the educator at
  // release time (ExamSchedule.tsx's `recomputeRanks`), not computed here, specifically so a
  // student's browser never needs read access to classmates' marks. Gated by rule #1
  // (reportCardEligible) + rule #8 (resultsReleased) — see examCountsTowardReportCard.
  useEffect(() => {
    if (!educatorId || !studentUid) {
      setCurriculumRows([]);
      setCurriculumLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resultsSnap = await getDocs(
          query(
            collection(db, "examResults"),
            where("educatorId", "==", educatorId),
            where("studentId", "==", studentUid)
          )
        );
        const results = resultsSnap.docs.map((d) => d.data() as any);
        const exams = await Promise.all(
          results.map((r) => getDoc(doc(db, "educators", educatorId, "exams", r.examId)))
        );
        const rows: CurriculumRow[] = [];
        results.forEach((mine, i) => {
          const examSnap = exams[i];
          if (!examSnap.exists()) return;
          const exam = { id: examSnap.id, ...(examSnap.data() as any) } as CurriculumExamDoc;
          if (!examCountsTowardReportCard(exam)) return;
          rows.push({
            examId: exam.id,
            title: exam.title,
            subject: exam.courseName,
            date: exam.examDate,
            marks: mine.marks,
            maxMarks: mine.maxMarks,
            rank: typeof mine.rank === "number" ? mine.rank : null,
            totalStudents: typeof mine.totalStudents === "number" ? mine.totalStudents : 0,
          });
        });
        if (!cancelled) {
          setCurriculumRows(rows.sort((a, b) => b.date.localeCompare(a.date)));
        }
      } finally {
        if (!cancelled) setCurriculumLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [educatorId, studentUid]);

  // Attendance: this student's batch sessions, grouped by month for the mini bars.
  useEffect(() => {
    if (!educatorId || !branchId || !courseId || !batchId) {
      setAttendance({ total: 0, present: 0, months: [] });
      return;
    }
    const unsub = onSnapshot(
      collection(
        db,
        "educators",
        educatorId,
        "branches",
        branchId,
        "courses",
        courseId,
        "batches",
        batchId,
        "sessions"
      ),
      (snap) => {
        const byMonth = new Map<string, { total: number; present: number }>();
        let total = 0;
        let present = 0;
        snap.docs.forEach((d) => {
          const data = d.data() as any;
          const dateStr = String(data.date || d.id);
          const status = (data.attendance || {})[studentUid];
          if (!status) return;
          total += 1;
          const attended = status === "present" || status === "late";
          if (attended) present += 1;
          const monthKey = /^\d{4}-\d{2}/.test(dateStr) ? dateStr.slice(0, 7) : null;
          if (monthKey) {
            const agg = byMonth.get(monthKey) || { total: 0, present: 0 };
            agg.total += 1;
            if (attended) agg.present += 1;
            byMonth.set(monthKey, agg);
          }
        });
        const months = [...byMonth.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, agg]) => ({
            month: format(new Date(`${key}-01T00:00:00`), "MMM"),
            pct: agg.total > 0 ? Math.round((agg.present / agg.total) * 100) : 0,
          }));
        setAttendance({ total, present, months });
      }
    );
    return () => unsub();
  }, [educatorId, branchId, courseId, batchId, studentUid]);

  async function saveRemark() {
    if (!educatorId || !studentUid) return;
    setSavingRemark(true);
    try {
      await setDoc(
        doc(db, "educators", educatorId, "students", studentUid),
        {
          reportCardRemark: {
            text: remarkDraft.trim(),
            by: instituteName ? `${studentName}'s class teacher` : "Class teacher",
            at: Timestamp.now(),
          },
        },
        { merge: true }
      );
      toast.success("Remark saved");
    } catch {
      toast.error("Failed to save remark");
    } finally {
      setSavingRemark(false);
    }
  }

  const loading = !studentLoaded || !attemptsLoaded || !gradesLoaded || !curriculumLoaded;

  const bySubject = useMemo(() => {
    const map = new Map<string, TestRow[]>();
    for (const r of testRows) {
      if (r.marks == null || r.maxMarks == null) continue;
      const key = r.subject || "General";
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [testRows]);

  const subjectSummary = useMemo(() => {
    return [...bySubject.entries()].map(([subject, list]) => {
      const sorted = [...list].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
      const pcts = sorted.map((r) => pct(r.marks as number, r.maxMarks as number));
      const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length;
      const best = Math.max(...pcts);
      const half = Math.max(1, Math.floor(pcts.length / 2));
      const firstHalf = pcts.slice(0, half);
      const secondHalf = pcts.slice(half);
      const trend =
        secondHalf.length > 0
          ? Math.round(
              secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length -
                firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
            )
          : 0;
      return { subject, tests: list.length, avg, best, trend };
    });
  }, [bySubject]);

  const overall = useMemo(() => {
    let total = 0;
    let max = 0;
    for (const r of testRows) {
      if (r.marks == null || r.maxMarks == null) continue;
      total += r.marks;
      max += r.maxMarks;
    }
    return max > 0 ? (total / max) * 100 : null;
  }, [testRows]);

  const recentTrendBars = useMemo(() => {
    const withMarks = [...testRows]
      .filter((r) => r.marks != null && r.maxMarks != null)
      .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0))
      .slice(-10);
    return withMarks.map((r) => ({
      label: r.date ? format(r.date, "d MMM") : "—",
      pct: pct(r.marks as number, r.maxMarks as number),
    }));
  }, [testRows]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ds-slate" />
      </div>
    );
  }

  return (
    <div className="space-y-5 font-ds-sans print:space-y-0">
      <div className="print:hidden">
        <DsPageHeader
          title="Report card"
          subtitle={`${studentName}${batchName ? ` · ${batchName}` : ""}`}
        />
      </div>
      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_340px] print:block">
        <DsCard className="overflow-hidden print:border-0">
          <div className="flex items-end gap-3 border-b border-ds-ink/[.08] px-[18px] py-4 print:hidden">
            <div>
              <div className="font-ds-serif text-[15px] font-semibold text-ds-ink">
                {instituteName || "Report card"}
              </div>
              <div className="mt-[3px] font-ds-sans text-[11.5px] text-ds-ink/50">
                {studentName}
                {batchName ? ` · ${batchName}` : ""}
                {` · issued ${format(new Date(), "d MMMM yyyy")}`}
              </div>
            </div>
            <div className="flex-1" />
            <Button className="h-[30px] gap-2 px-2.5 text-[12px]" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          </div>

          {subjectSummary.length === 0 ? (
            <p className="py-10 text-center font-ds-sans text-[12.5px] text-ds-slate">
              No tests recorded yet.
            </p>
          ) : (
            <>
              <DsTableHead
                columns={["Subject", "Tests", "Average", "Best", "Trend"]}
                cols="1.3fr .8fr .8fr .8fr 1fr"
              />
              {subjectSummary.map((s) => (
                <DsTableRow key={s.subject} cols="1.3fr .8fr .8fr .8fr 1fr" height={52}>
                  <div className="font-semibold">{s.subject}</div>
                  <div className="font-ds-mono text-[12px] text-ds-ink/60">{s.tests}</div>
                  <div
                    className="font-ds-mono text-[13px] font-semibold"
                    style={{ color: tone(s.avg) }}
                  >
                    {Math.round(s.avg)}%
                  </div>
                  <div className="font-ds-mono text-[12px] text-ds-ink/60">
                    {Math.round(s.best)}%
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-[5px] w-[70px] overflow-hidden rounded-full bg-ds-fill">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, s.avg))}%`,
                          background: tone(s.avg),
                        }}
                      />
                    </div>
                    <div
                      className="w-7 text-right font-ds-mono text-[11.5px] font-medium"
                      style={{ color: s.trend < 0 ? "#cf6134" : "#3f8f6b" }}
                    >
                      {s.trend > 0 ? `+${s.trend}` : s.trend}
                    </div>
                  </div>
                </DsTableRow>
              ))}
              {overall != null && (
                <DsTableRow cols="1.3fr .8fr .8fr .8fr 1fr" height={48} className="font-semibold">
                  <div>Overall</div>
                  <div className="font-ds-mono text-[12px] text-ds-ink/60">{testRows.length}</div>
                  <div className="font-ds-mono text-[13px]" style={{ color: tone(overall) }}>
                    {Math.round(overall)}%
                  </div>
                  <div />
                  <div />
                </DsTableRow>
              )}
            </>
          )}

          <div className="px-[18px] py-4">
            <div className="mb-2.5 font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/45">
              Curriculum exams · marks by subject
            </div>
            {curriculumRows.length === 0 ? (
              <p className="py-4 font-ds-sans text-[12px] text-ds-ink/45">
                No curriculum exam results released yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-[9px] border border-ds-ink/[.09]">
                <DsTableHead
                  columns={["Exam", "Date", "Subject", "Marks", "Rank"]}
                  cols="1.5fr .7fr .9fr .8fr .7fr"
                />
                {curriculumRows.map((r) => (
                  <DsTableRow key={r.examId} cols="1.5fr .7fr .9fr .8fr .7fr" height={48}>
                    <div className="truncate font-semibold">{r.title}</div>
                    <div className="font-ds-mono text-[11px] text-ds-ink/50">
                      {/^\d{4}-\d{2}-\d{2}$/.test(r.date)
                        ? format(new Date(`${r.date}T00:00:00`), "d MMM")
                        : r.date}
                    </div>
                    <div className="truncate text-ds-ink/70">{r.subject}</div>
                    <div
                      className="font-ds-mono text-[12px] font-semibold"
                      style={{ color: tone(pct(r.marks, r.maxMarks)) }}
                    >
                      {r.marks}/{r.maxMarks}
                    </div>
                    <div className="text-right font-ds-mono text-[11.5px] font-medium text-ds-ink/60">
                      {r.rank != null ? `${r.rank} / ${r.totalStudents}` : "—"}
                    </div>
                  </DsTableRow>
                ))}
              </div>
            )}
          </div>

          <div className="px-[18px] py-4">
            <div className="mb-2 font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/45">
              Faculty remarks
            </div>
            {canEditRemark ? (
              <div className="max-w-[640px] space-y-2">
                <Textarea
                  value={remarkDraft}
                  onChange={(e) => setRemarkDraft(e.target.value)}
                  placeholder="Add a remark for this student's report card..."
                  className="font-ds-sans text-[13px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={saveRemark}
                    disabled={savingRemark || !remarkDraft.trim()}
                  >
                    Save remark
                  </Button>
                  {remark?.at && (
                    <span className="font-ds-sans text-[11px] text-ds-ink/45">
                      Last updated {format(remark.at, "d MMM yyyy")}
                    </span>
                  )}
                </div>
              </div>
            ) : remark ? (
              <>
                <p className="max-w-[640px] font-ds-sans text-[13px] leading-[1.7] text-ds-ink/75">
                  {remark.text}
                </p>
                <div className="mt-2.5 font-ds-sans text-[11.5px] text-ds-ink/45">
                  {remark.by}
                  {remark.at ? ` · ${format(remark.at, "d MMMM yyyy")}` : ""}
                </div>
              </>
            ) : (
              <p className="font-ds-sans text-[12px] text-ds-ink/45">No remarks yet.</p>
            )}
          </div>
        </DsCard>

        <div className="flex flex-col gap-3.5 print:mt-4 print:flex-row print:gap-3">
          <DsCard className="p-4 print:flex-1 print:border print:p-3">
            <div className="mb-3 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Attendance
            </div>
            {attendance.total === 0 ? (
              <p className="font-ds-sans text-[12px] text-ds-ink/45">No sessions recorded yet.</p>
            ) : (
              <>
                <div className="mb-3 flex items-baseline gap-2.5">
                  <div className="font-ds-serif text-[30px] font-semibold leading-none text-ds-ink">
                    {Math.round((attendance.present / attendance.total) * 100)}%
                  </div>
                  <div className="font-ds-sans text-[12px] text-ds-ink/50">
                    {attendance.present} of {attendance.total} sessions
                  </div>
                </div>
                {attendance.months.map((m) => (
                  <div key={m.month} className="mb-2 flex items-center gap-2.5">
                    <div className="w-[34px] font-ds-mono text-[11px] text-ds-ink/45">
                      {m.month}
                    </div>
                    <DsMeter
                      pct={m.pct}
                      tone={m.pct < 50 ? "accent" : m.pct < 75 ? "info" : "positive"}
                    />
                  </div>
                ))}
              </>
            )}
          </DsCard>

          <DsCard className="flex-1 p-4 print:border print:p-3">
            <div className="mb-3 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Test average over time
            </div>
            {recentTrendBars.length === 0 ? (
              <p className="font-ds-sans text-[12px] text-ds-ink/45">No tests recorded yet.</p>
            ) : (
              <>
                <div className="flex h-[104px] items-end gap-[5px]">
                  {recentTrendBars.map((b, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                      <div
                        className="w-full rounded-t-[3px]"
                        style={{ height: `${Math.max(2, b.pct)}px`, background: tone(b.pct) }}
                      />
                      <div className="font-ds-mono text-[9.5px] text-ds-ink/40">{b.label}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 font-ds-sans text-[11.5px] leading-[1.5] text-ds-ink/50">
                  Latest {recentTrendBars.length} tests, in order.
                </p>
              </>
            )}
          </DsCard>
        </div>
      </div>
    </div>
  );
}
