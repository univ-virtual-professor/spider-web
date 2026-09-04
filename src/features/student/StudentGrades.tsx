import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { GraduationCap, Loader2, FileText, PenLine } from "lucide-react";

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

export default function StudentGrades() {
  const { profile } = useAuth();
  const educatorId: string = profile?.educatorId ?? "";
  const uid: string = profile?.uid ?? "";

  const [rows, setRows] = useState<Row[]>([]);
  const [attemptsLoaded, setAttemptsLoaded] = useState(false);
  const [gradesLoaded, setGradesLoaded] = useState(false);
  const [attemptRows, setAttemptRows] = useState<Row[]>([]);
  const [manualRows, setManualRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(
        collection(db, "attempts"),
        where("studentId", "==", uid),
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
  }, [uid]);

  useEffect(() => {
    if (!educatorId || !uid) return;
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "students", uid, "manualGrades"),
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
  }, [educatorId, uid]);

  useEffect(() => {
    const combined = [...attemptRows, ...manualRows].sort(
      (a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)
    );
    setRows(combined);
  }, [attemptRows, manualRows]);

  const loading = !attemptsLoaded || !gradesLoaded;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <GraduationCap className="h-6 w-6" />
          Grades
        </h1>
        <p className="text-sm text-muted-foreground">
          Your report card — tests and educator-added grades.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No grades recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {rows.map((r) => (
                <div
                  key={`${r.kind}-${r.id}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    {r.kind === "test" ? (
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[r.subject, r.date ? format(r.date, "MMM d, yyyy") : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {r.remark && (
                        <p className="mt-0.5 text-xs italic text-muted-foreground">{r.remark}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {r.kind === "test" ? "Test" : "Manual"}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {r.marks ?? "—"}
                      {r.maxMarks != null && (
                        <span className="text-muted-foreground"> / {r.maxMarks}</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
