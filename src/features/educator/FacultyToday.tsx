import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import {
  DsPageHeader,
  DsKpiRow,
  DsCard,
  DsCardHeader,
  DsAlertStrip,
  DsEmpty,
  DsSkeletonRows,
} from "@shared/ui/ds";
import { listAnswerSheets, listExams } from "./examGrading/api";

const MONKEY_KING_API = import.meta.env.VITE_MONKEY_KING_API_URL as string;

type Batch = { id: string; branchId: string; courseId: string; name: string; courseName: string };
type Slot = {
  id: string;
  batchId: string;
  batchName: string;
  teacherUid: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};
// One row per (DPP test, batch) — a single `my_tests` doc with type "from_dpp" can target
// several batches (see ScheduledDpps.tsx, the source of truth for this data shape).
type DppRow = { dppId: string; batchId: string; batchName: string };
type SheetsAwaitingReview = { examId: string; title: string; sheetCount: number };
// GET /api/reports/batches/{batch_id}/students (docs/agents/mockups/revamp/faculty-report-api.md,
// also consumed by StudentsListing.tsx) — one call per batch, no per-student Firestore reads.
type WeakArea = { subject: string; chapter: string; topic: string; weighted_accuracy: number };
type WeakTopic = { topic: string; studentIds: Set<string>; batchIds: Set<string> };

function fmtTime(t: string) {
  const [h, m] = (t || "0:0").split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function FacultyToday() {
  const { profile, firebaseUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const educatorId = profile?.educatorId || firebaseUser?.uid || "";
  const uid = firebaseUser?.uid || "";

  const [loading, setLoading] = useState(true);
  const [mySlots, setMySlots] = useState<Slot[]>([]);
  const [myBatchIds, setMyBatchIds] = useState<Set<string>>(new Set());
  const [batchPathById, setBatchPathById] = useState<
    Map<string, { branchId: string; courseId: string }>
  >(new Map());
  const [studentsByBatch, setStudentsByBatch] = useState<Map<string, number>>(new Map());
  const [sessionMarked, setSessionMarked] = useState<Map<string, boolean>>(new Map());
  const [dpps, setDpps] = useState<DppRow[]>([]);
  const [dppSubmitted, setDppSubmitted] = useState<Map<string, number>>(new Map());
  const [reviewExams, setReviewExams] = useState<SheetsAwaitingReview[]>([]);
  const [gradingError, setGradingError] = useState(false);
  const [weakTopic, setWeakTopic] = useState<WeakTopic | null>(null);

  const todayDow = new Date().getDay();
  const dateStr = new Date().toISOString().slice(0, 10);

  // Fan out branches -> courses -> batches -> timetable once, then keep only
  // this teacher's own slots and which batches they teach (business rule #7:
  // a Faculty's own view is scoped to their own batches).
  useEffect(() => {
    if (!educatorId || !uid) return;
    let cancelled = false;

    (async () => {
      try {
        const branchesSnap = await getDocs(collection(db, "educators", educatorId, "branches"));
        const courseLists = await Promise.all(
          branchesSnap.docs.map((b) =>
            getDocs(collection(db, "educators", educatorId, "branches", b.id, "courses"))
          )
        );
        const courseRefs = courseLists.flatMap((snap, i) =>
          snap.docs.map((c) => ({ branchId: branchesSnap.docs[i].id, courseId: c.id }))
        );
        const batchLists = await Promise.all(
          courseRefs.map((c) =>
            getDocs(
              collection(
                db,
                "educators",
                educatorId,
                "branches",
                c.branchId,
                "courses",
                c.courseId,
                "batches"
              )
            )
          )
        );
        if (cancelled) return;

        const batches: Batch[] = batchLists.flatMap((snap, i) =>
          snap.docs.map((b) => ({
            id: b.id,
            branchId: courseRefs[i].branchId,
            courseId: courseRefs[i].courseId,
            courseName: "",
            name: String(b.data().name || b.id),
          }))
        );
        setBatchPathById(
          new Map(batches.map((b) => [b.id, { branchId: b.branchId, courseId: b.courseId }]))
        );

        const slotLists = await Promise.all(
          batches.map((b) =>
            getDocs(
              collection(
                db,
                "educators",
                educatorId,
                "branches",
                b.branchId,
                "courses",
                b.courseId,
                "batches",
                b.id,
                "timetable"
              )
            )
          )
        );
        if (cancelled) return;

        const allSlots = slotLists.flatMap((snap, i) =>
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              batchId: batches[i].id,
              batchName: batches[i].name,
              teacherUid: String(data.teacherUid || ""),
              subject: String(data.subject || ""),
              dayOfWeek: Number(data.dayOfWeek ?? -1),
              startTime: String(data.startTime || "0:0"),
              endTime: String(data.endTime || "0:0"),
            } as Slot;
          })
        );
        const mine = allSlots.filter((s) => s.teacherUid === uid);
        setMySlots(mine);
        setMyBatchIds(new Set(mine.map((s) => s.batchId)));

        // DPPs: `educators/{id}/my_tests` docs with type "from_dpp" are the generated sets
        // (same source ScheduledDpps.tsx / DppGenerator.tsx read), one doc per generation run,
        // each possibly targeting several batches. Only today's generation, only this
        // teacher's own batches.
        const batchNameById = new Map(mine.map((s) => [s.batchId, s.batchName]));
        const dppSnap = await getDocs(
          query(
            collection(db, "educators", educatorId, "my_tests"),
            where("type", "==", "from_dpp")
          )
        );
        if (cancelled) return;
        const todayDpps: DppRow[] = dppSnap.docs.flatMap((d) => {
          const data = d.data() as any;
          const createdMs = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0;
          const createdDate = createdMs ? new Date(createdMs).toISOString().slice(0, 10) : "";
          if (createdDate !== dateStr) return [];
          const targetBatches: string[] = Array.isArray(data.targetBatches)
            ? data.targetBatches
            : [];
          return targetBatches
            .filter((batchId) => batchNameById.has(batchId))
            .map((batchId) => ({
              dppId: d.id,
              batchId,
              batchName: batchNameById.get(batchId) || batchId,
            }));
        });
        setDpps(todayDpps);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [educatorId, uid]);

  useEffect(() => {
    if (!educatorId) return;
    getDocs(collection(db, "educators", educatorId, "students")).then((snap) => {
      const byBatch = new Map<string, number>();
      snap.docs.forEach((d) => {
        const batchId = (d.data() as any)?.batchId;
        if (!batchId) return;
        byBatch.set(batchId, (byBatch.get(batchId) || 0) + 1);
      });
      setStudentsByBatch(byBatch);
    });
  }, [educatorId]);

  // Today's own sessions, soonest first.
  const todaySessions = useMemo(
    () =>
      mySlots
        .filter((s) => s.dayOfWeek === todayDow)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [mySlots, todayDow]
  );

  // Sessions live at batches/{batchId}/sessions/{slotId}_{dateStr}, nested under
  // the batch's branch/course, which today's slots don't carry — batchPathById
  // (captured above while fanning out the timetable) resolves that path.
  useEffect(() => {
    if (!educatorId || todaySessions.length === 0 || batchPathById.size === 0) {
      setSessionMarked(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        todaySessions.map(async (s) => {
          const path = batchPathById.get(s.batchId);
          if (!path) return [s.id, false] as const;
          const ref = doc(
            db,
            "educators",
            educatorId,
            "branches",
            path.branchId,
            "courses",
            path.courseId,
            "batches",
            s.batchId,
            "sessions",
            `${s.id}_${dateStr}`
          );
          const snap = await getDoc(ref);
          return [s.id, snap.exists()] as const;
        })
      );
      if (!cancelled) setSessionMarked(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [educatorId, todaySessions, batchPathById, dateStr]);

  // DPP submitted counts. Attempts don't carry a batchId or testId directly — they carry
  // batchAssignmentId, a reference to the batchAssignments doc for (testId, batchId). Same
  // two-step resolution ScheduledDpps.tsx uses: no assignment doc means nothing to count
  // honestly, so that row is left unset rather than reported as a fake 0%.
  useEffect(() => {
    if (!educatorId || dpps.length === 0) {
      setDppSubmitted(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        dpps.map(async (row) => {
          const key = `${row.dppId}_${row.batchId}`;
          try {
            const assignSnap = await getDocs(
              query(
                collection(db, "educators", educatorId, "batchAssignments"),
                where("testId", "==", row.dppId),
                where("batchId", "==", row.batchId)
              )
            );
            if (assignSnap.empty) return null;
            const assignmentId = assignSnap.docs[0].id;
            const countSnap = await getCountFromServer(
              query(
                collection(db, "attempts"),
                where("educatorId", "==", educatorId),
                where("batchAssignmentId", "==", assignmentId)
              )
            );
            return [key, countSnap.data().count] as const;
          } catch {
            return null;
          }
        })
      );
      if (!cancelled) {
        setDppSubmitted(new Map(entries.filter((e): e is readonly [string, number] => e !== null)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dpps, educatorId]);

  // Grade-engine: exams fully AI-graded and waiting for this teacher's sign-off.
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const list = await listExams(token);
        const withSheets = await Promise.all(
          list.map(async (exam) => {
            try {
              const summary = await listAnswerSheets(token, exam.id);
              return { exam, sheets: summary.students };
            } catch {
              return { exam, sheets: [] as { status: string }[] };
            }
          })
        );
        if (cancelled) return;
        const awaiting = withSheets
          .filter(
            (row) =>
              row.sheets.length > 0 &&
              row.sheets.every((s) => s.status === "graded") &&
              !row.exam.results_released
          )
          .map((row) => ({
            examId: row.exam.id,
            title: row.exam.title,
            sheetCount: row.sheets.length,
          }));
        setReviewExams(awaiting);
      } catch {
        if (!cancelled) setGradingError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  // Weak-area signal: one GET /api/reports/batches/{batch_id}/students call per the teacher's
  // own batch (not per student — see faculty-report-api.md), aggregated by topic across all of
  // them. A student counts against a topic when one of their (already top-3) weakAreas names it
  // with weighted_accuracy below 40%. Picks the topic hurting the most students to surface as
  // the single alert, matching the design's one-strip-at-a-time layout.
  useEffect(() => {
    if (!firebaseUser || myBatchIds.size === 0) {
      setWeakTopic(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const perBatch = await Promise.all(
          Array.from(myBatchIds).map(async (batchId) => {
            try {
              const res = await fetch(
                `${MONKEY_KING_API}/api/reports/batches/${batchId}/students`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              if (!res.ok)
                return { batchId, students: [] as { studentId: string; weakAreas: WeakArea[] }[] };
              const body = (await res.json()) as {
                students: { studentId: string; weakAreas: WeakArea[] }[];
              };
              return { batchId, students: body.students || [] };
            } catch {
              return { batchId, students: [] as { studentId: string; weakAreas: WeakArea[] }[] };
            }
          })
        );
        if (cancelled) return;

        const byTopic = new Map<string, WeakTopic>();
        perBatch.forEach(({ batchId, students }) => {
          students.forEach((s) => {
            (s.weakAreas || [])
              .filter((w) => w.topic && w.weighted_accuracy < 0.4)
              .forEach((w) => {
                const cur = byTopic.get(w.topic) || {
                  topic: w.topic,
                  studentIds: new Set<string>(),
                  batchIds: new Set<string>(),
                };
                cur.studentIds.add(s.studentId);
                cur.batchIds.add(batchId);
                byTopic.set(w.topic, cur);
              });
          });
        });

        let worst: WeakTopic | null = null;
        byTopic.forEach((v) => {
          if (!worst || v.studentIds.size > worst.studentIds.size) worst = v;
        });
        setWeakTopic(worst);
      } catch {
        if (!cancelled) setWeakTopic(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, myBatchIds]);

  const sessionsToday = todaySessions.length;
  const attendanceMarkedCount = todaySessions.filter((s) => sessionMarked.get(s.id)).length;
  const sheetsToReview = reviewExams.reduce((s, e) => s + e.sheetCount, 0);
  const dppTotalDue = dpps.length;
  // Only batches with a resolvable submission count (see the effect above) count toward the
  // KPI's denominator too, so a batch with no assignment doc can't silently drag the % down.
  const dppRowsWithCounts = dpps.filter((row) => dppSubmitted.has(`${row.dppId}_${row.batchId}`));
  const dppSubmittedTotal = dppRowsWithCounts.reduce(
    (sum, row) => sum + (dppSubmitted.get(`${row.dppId}_${row.batchId}`) || 0),
    0
  );
  const dppCapacityTotal = dppRowsWithCounts.reduce(
    (sum, row) => sum + (studentsByBatch.get(row.batchId) || 0),
    0
  );

  const nextSession = todaySessions.find((s) => !sessionMarked.get(s.id));

  if (authLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  const kpis = [
    {
      label: "Sessions today",
      value: String(sessionsToday),
      tone: "accent" as const,
      pct: Math.min(100, sessionsToday * 15),
    },
    {
      label: "Attendance marked",
      value: sessionsToday ? `${attendanceMarkedCount} of ${sessionsToday}` : "—",
      tone: "info" as const,
      pct: sessionsToday ? (attendanceMarkedCount / sessionsToday) * 100 : 0,
    },
    {
      label: "Sheets to review",
      value: gradingError ? "—" : String(sheetsToReview),
      sub: gradingError ? "Couldn't reach grading" : undefined,
      tone: "slate" as const,
      pct: Math.min(100, sheetsToReview * 2),
    },
    {
      label: "DPP submitted",
      value: dppCapacityTotal
        ? `${Math.round((dppSubmittedTotal / dppCapacityTotal) * 100)}%`
        : "—",
      sub: dppTotalDue ? `${dppTotalDue} batch${dppTotalDue === 1 ? "" : "es"}` : "None due today",
      tone: "slate" as const,
      pct: dppCapacityTotal ? (dppSubmittedTotal / dppCapacityTotal) * 100 : 0,
    },
  ];

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        primary={
          nextSession
            ? {
                label: "Mark attendance",
                onClick: () =>
                  navigate("/educator/attendance", {
                    state: { batchId: nextSession.batchId, date: dateStr },
                  }),
              }
            : undefined
        }
        secondary={{ label: "Week view", onClick: () => navigate("/educator/timetable") }}
      />

      <DsKpiRow items={kpis} />

      <div className="grid items-start gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <DsCard className="overflow-hidden">
          <DsCardHeader title="Your schedule · today" meta={`${sessionsToday} sessions`} />
          {loading ? (
            <DsSkeletonRows rows={4} rowHeight={64} />
          ) : todaySessions.length === 0 ? (
            <DsEmpty
              title="No sessions scheduled today"
              body="Your timetable has nothing assigned to you today."
            />
          ) : (
            todaySessions.map((s) => {
              const marked = sessionMarked.get(s.id);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-b border-ds-ink/[.055] px-4 py-3 last:border-0"
                >
                  <div className="w-12 shrink-0 font-ds-mono text-[12px] text-ds-ink/55">
                    {fmtTime(s.startTime)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-ds-sans text-[12.5px] font-semibold text-ds-ink">
                      {s.subject || "Session"}
                    </div>
                    <div className="mt-0.5 truncate font-ds-sans text-[11.5px] text-ds-ink/45">
                      {s.batchName}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      navigate("/educator/attendance", {
                        state: { batchId: s.batchId, date: dateStr },
                      })
                    }
                    className={`h-7 shrink-0 rounded-md px-2.5 font-ds-sans text-[11.5px] font-semibold ${
                      marked ? "border border-ds-ink/15 text-ds-ink/50" : "bg-ds-accent text-white"
                    }`}
                  >
                    {marked ? "Attendance marked" : "Mark attendance"}
                  </button>
                </div>
              );
            })
          )}
        </DsCard>

        <div className="flex flex-col gap-3.5">
          <DsCard className="p-4">
            <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Waiting on you
            </div>
            {reviewExams.length === 0 ? (
              <DsEmpty
                title="Nothing to review"
                body="Sheets awaiting your sign-off will show up here once AI grading finishes."
              />
            ) : (
              reviewExams.map((e) => (
                <div key={e.examId} className="border-b border-ds-ink/[.055] py-2.5 last:border-0">
                  <div className="flex items-baseline gap-2">
                    <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                      {e.title}
                    </div>
                    <div className="flex-1" />
                    <div className="font-ds-mono text-[11px] font-semibold text-ds-accent">
                      REVIEW
                    </div>
                  </div>
                  <div className="mt-0.5 font-ds-sans text-[11.5px] text-ds-ink/50">
                    {e.sheetCount} sheet{e.sheetCount === 1 ? "" : "s"} AI graded, awaiting sign-off
                  </div>
                  <button
                    onClick={() => navigate("/educator/exam-grading")}
                    className="mt-2 h-7 rounded-md bg-ds-ink px-2.5 font-ds-sans text-[11px] font-semibold text-white"
                  >
                    Review
                  </button>
                </div>
              ))
            )}
          </DsCard>

          {weakTopic && (
            <DsAlertStrip
              title="Weak-area signal"
              body={`${weakTopic.studentIds.size} student${weakTopic.studentIds.size === 1 ? "" : "s"} across ${weakTopic.batchIds.size} batch${weakTopic.batchIds.size === 1 ? "" : "es"} are weak on ${weakTopic.topic}. A practice set can help close the gap.`}
              actions={[
                {
                  label: "Generate practice set",
                  onClick: () => navigate("/educator/dpp"),
                  primary: true,
                },
                { label: "See students", onClick: () => navigate("/educator/students") },
              ]}
            />
          )}

          <DsCard className="flex-1 p-4">
            <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Daily practice
            </div>
            {dpps.length === 0 ? (
              <DsEmpty
                title="No DPP generated today"
                body="Today's practice sets for your batches will show up here once generated."
              />
            ) : (
              dpps.map((row) => {
                const key = `${row.dppId}_${row.batchId}`;
                const total = studentsByBatch.get(row.batchId) || 0;
                const submitted = dppSubmitted.get(key);
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2.5 border-b border-ds-ink/[.055] py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                        {row.batchName}
                      </div>
                      <div className="font-ds-sans text-[11px] text-ds-ink/45">
                        Today's daily practice
                      </div>
                    </div>
                    <div className="flex-1" />
                    <div className="font-ds-mono text-[11.5px] font-medium text-ds-ink/60">
                      {submitted == null || !total
                        ? "—"
                        : `${Math.round((submitted / total) * 100)}%`}
                    </div>
                  </div>
                );
              })
            )}
          </DsCard>
        </div>
      </div>
    </div>
  );
}
