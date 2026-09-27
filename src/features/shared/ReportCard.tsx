import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";

import { db } from "@shared/lib/firebase";
import { Button } from "@shared/ui/button";
import { Loader2, Printer } from "lucide-react";

type Row = {
  id: string;
  title: string;
  subject?: string;
  marks: number | null;
  maxMarks: number | null;
  date: Date | null;
  kind: "test" | "manual";
  remark?: string;
};

type Props = {
  educatorId: string;
  studentUid: string;
  studentName: string;
};

// Print-optimized term report card, reused for both the student's own view
// (StudentReportCard.tsx) and an educator's view of one of their students
// (EducatorStudentReportCard.tsx) — same data shape StudentGrades.tsx already
// queries (attempts + manualGrades), just laid out for printing/PDF export
// instead of an in-app scrollable list. "Download PDF" is window.print() —
// no new PDF library dependency; the browser's own print-to-PDF covers this.
export default function ReportCard({ educatorId, studentUid, studentName }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [attemptsLoaded, setAttemptsLoaded] = useState(false);
  const [gradesLoaded, setGradesLoaded] = useState(false);
  const [attemptRows, setAttemptRows] = useState<Row[]>([]);
  const [manualRows, setManualRows] = useState<Row[]>([]);
  const [instituteName, setInstituteName] = useState("");

  useEffect(() => {
    if (!educatorId) return;
    getDoc(doc(db, "educators", educatorId)).then((snap) => {
      const data = snap.exists() ? snap.data() : null;
      setInstituteName(String(data?.builderConfig?.instituteName || data?.coachingName || ""));
    });
  }, [educatorId]);

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
              remark: data.remark,
            };
          })
        );
        setGradesLoaded(true);
      },
      () => setGradesLoaded(true)
    );
    return () => unsub();
  }, [educatorId, studentUid]);

  useEffect(() => {
    setRows(
      [...attemptRows, ...manualRows].sort(
        (a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)
      )
    );
  }, [attemptRows, manualRows]);

  const loading = !attemptsLoaded || !gradesLoaded;

  const bySubject = new Map<string, { total: number; max: number; count: number }>();
  for (const r of rows) {
    if (r.marks == null || r.maxMarks == null) continue;
    const key = r.subject || "General";
    const agg = bySubject.get(key) || { total: 0, max: 0, count: 0 };
    agg.total += r.marks;
    agg.max += r.maxMarks;
    agg.count += 1;
    bySubject.set(key, agg);
  }
  const overallTotal = [...bySubject.values()].reduce((s, v) => s + v.total, 0);
  const overallMax = [...bySubject.values()].reduce((s, v) => s + v.max, 0);
  const overallPct = overallMax > 0 ? ((overallTotal / overallMax) * 100).toFixed(1) : null;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 print:p-0">
      <div className="flex items-center justify-end print:hidden">
        <Button className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      <div className="rounded-xl border p-8 print:rounded-none print:border-0">
        <div className="mb-6 border-b pb-4 text-center">
          <h1 className="text-2xl font-bold">{instituteName || "Term Report Card"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Student Performance Report</p>
        </div>

        <div className="mb-6 flex items-center justify-between text-sm">
          <div>
            <p className="text-muted-foreground">Student</p>
            <p className="font-semibold">{studentName}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">Generated</p>
            <p className="font-semibold">{format(new Date(), "MMM d, yyyy")}</p>
          </div>
        </div>

        {bySubject.size > 0 && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Subject Summary
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5">Subject</th>
                  <th className="py-1.5 text-right">Assessments</th>
                  <th className="py-1.5 text-right">Score</th>
                  <th className="py-1.5 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {[...bySubject.entries()].map(([subject, agg]) => (
                  <tr key={subject} className="border-b border-border/50">
                    <td className="py-1.5">{subject}</td>
                    <td className="py-1.5 text-right">{agg.count}</td>
                    <td className="py-1.5 text-right">
                      {agg.total}/{agg.max}
                    </td>
                    <td className="py-1.5 text-right">
                      {agg.max > 0 ? ((agg.total / agg.max) * 100).toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {overallPct && (
                <tfoot>
                  <tr className="font-semibold">
                    <td className="py-2">Overall</td>
                    <td className="py-2 text-right"></td>
                    <td className="py-2 text-right">
                      {overallTotal}/{overallMax}
                    </td>
                    <td className="py-2 text-right">{overallPct}%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Detailed Record
          </h2>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No grades recorded yet.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5">Assessment</th>
                  <th className="py-1.5">Subject</th>
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5 text-right">Marks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="border-b border-border/50">
                    <td className="py-1.5">{r.title}</td>
                    <td className="py-1.5">{r.subject || "—"}</td>
                    <td className="py-1.5">{r.date ? format(r.date, "MMM d, yyyy") : "—"}</td>
                    <td className="py-1.5 text-right">
                      {r.marks ?? "—"}
                      {r.maxMarks != null && (
                        <span className="text-muted-foreground">/{r.maxMarks}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
