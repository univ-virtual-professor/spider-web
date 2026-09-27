import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { format } from "date-fns";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { DsPageHeader, DsCard, DsCardHeader, DsStatusPill } from "@shared/ui/ds";
import { Loader2 } from "lucide-react";

type LessonRef = { moduleId: string; lessonId: string; lessonTitle: string };
type SeatAssignment = { studentId: string; seatLabel: string };
type ExamDoc = {
  id: string;
  title: string;
  examDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  hall: string;
  syllabusUnits: LessonRef[];
  reportCardEligible: boolean;
  seatingPlan?: SeatAssignment[];
};

function fmtDate(d: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export default function StudentExamSchedule() {
  const { profile } = useAuth();
  const educatorId: string = profile?.educatorId ?? "";
  const batchId: string = profile?.batchId ?? "";
  const studentUid: string = profile?.uid ?? "";

  const [exams, setExams] = useState<ExamDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const ready = !!(educatorId && batchId);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, "educators", educatorId, "exams"),
        where("targetBatches", "array-contains", batchId),
        where("status", "==", "published")
      ),
      (snap) => {
        setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [ready, educatorId, batchId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ds-slate" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="py-12 text-center font-ds-sans text-sm text-ds-slate">
        Your batch isn't set up yet — check back once you're enrolled.
      </div>
    );
  }

  const sorted = [...exams]
    .filter((e) => e.examDate >= format(new Date(), "yyyy-MM-dd"))
    .sort((a, b) => a.examDate.localeCompare(b.examDate));
  const [next, ...rest] = sorted;
  const mySeat = next?.seatingPlan?.find((a) => a.studentId === studentUid);
  const daysAway = next
    ? Math.max(0, Math.round((new Date(next.examDate).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader title="Exams" subtitle="Your upcoming exam schedule." />

      {sorted.length === 0 ? (
        <DsCard className="p-12 text-center">
          <p className="font-ds-sans text-[12.5px] text-ds-slate">No exams scheduled yet.</p>
        </DsCard>
      ) : (
        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_1fr]">
          <div className="flex flex-col gap-3.5">
            <DsCard className="p-5">
              <div className="flex items-baseline gap-2">
                <div className="font-ds-sans text-[16px] font-semibold text-ds-ink">
                  {next.title}
                </div>
                {daysAway > 0 && (
                  <DsStatusPill tone="accent">
                    {daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`}
                  </DsStatusPill>
                )}
                <div className="flex-1" />
                <div className="font-ds-mono text-[11.5px] text-ds-ink/45">
                  {fmtDate(next.examDate)}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Time", `${next.startTime}–${next.endTime}`],
                  ["Venue", next.venue || "TBA"],
                  ["Hall", next.hall || "TBA"],
                  ["Seat", mySeat?.seatLabel || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-ds-canvas p-3">
                    <div className="font-ds-sans text-[10.5px] font-medium uppercase tracking-[.04em] text-ds-ink/45">
                      {k}
                    </div>
                    <div className="mt-1.5 font-ds-sans text-[15px] font-semibold text-ds-ink">
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </DsCard>

            {next.syllabusUnits?.length > 0 && (
              <DsCard className="overflow-hidden">
                <DsCardHeader title="Syllabus for this exam" />
                {next.syllabusUnits.map((u) => (
                  <div
                    key={`${u.moduleId}-${u.lessonId}`}
                    className="flex items-center gap-3 border-b border-ds-ink/[.055] px-4 py-3 last:border-0"
                  >
                    <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                      {u.lessonTitle}
                    </div>
                  </div>
                ))}
              </DsCard>
            )}

            {rest.length > 0 && (
              <DsCard className="overflow-hidden">
                <DsCardHeader title="Rest of the term" />
                {rest.map((exam) => {
                  const d = new Date(exam.examDate + "T00:00:00");
                  return (
                    <div
                      key={exam.id}
                      className="flex items-center gap-3.5 border-b border-ds-ink/[.055] px-4 py-3 last:border-0"
                    >
                      <div className="w-11 shrink-0 text-center">
                        <div className="font-ds-serif text-[15px] font-semibold leading-none text-ds-ink">
                          {d.getDate()}
                        </div>
                        <div className="mt-0.5 font-ds-mono text-[10px] text-ds-ink/45">
                          {d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}
                        </div>
                      </div>
                      <div className="h-8 w-[3px] shrink-0 rounded-sm bg-ds-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-ds-sans text-[12.5px] font-semibold text-ds-ink">
                          {exam.title}
                        </div>
                        {exam.reportCardEligible && (
                          <div className="mt-0.5 font-ds-sans text-[11px] text-ds-ink/45">
                            Report-card eligible
                          </div>
                        )}
                      </div>
                      <div className="font-ds-mono text-[11.5px] text-ds-ink/50">
                        {[exam.venue, exam.hall].filter(Boolean).join(", ") || "—"}
                      </div>
                    </div>
                  );
                })}
              </DsCard>
            )}
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="rounded-[10px] bg-ds-ink p-4 text-white">
              <div className="font-ds-sans text-[14px] font-semibold">Reporting instructions</div>
              <div className="mt-2 font-ds-sans text-[12px] leading-[1.65] text-white/65">
                Report to {[next.venue, next.hall].filter(Boolean).join(", ") || "your exam venue"}{" "}
                by {next.startTime}. Bring your institute ID.
              </div>
              {mySeat && (
                <div className="mt-3 rounded-md bg-white/10 px-3 py-2 font-ds-sans text-[12px] font-semibold">
                  Your seat: {mySeat.seatLabel}
                </div>
              )}
            </div>

            <DsCard className="p-4">
              <div className="mb-1 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                Term exam plan
              </div>
              <p className="mb-3 font-ds-sans text-[11.5px] text-ds-ink/50">
                {sorted.length} exam{sorted.length === 1 ? "" : "s"} scheduled.
              </p>
              {sorted.slice(0, 5).map((exam) => (
                <div
                  key={exam.id}
                  className="flex justify-between gap-3 border-b border-ds-ink/[.055] py-2 font-ds-sans text-[12px] last:border-0"
                >
                  <div className="truncate text-ds-ink/60">{exam.title}</div>
                  <div className="shrink-0 font-medium text-ds-ink">{fmtDate(exam.examDate)}</div>
                </div>
              ))}
            </DsCard>
          </div>
        </div>
      )}
    </div>
  );
}
