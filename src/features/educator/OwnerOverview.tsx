import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import {
  DsPageHeader,
  DsKpiRow,
  DsCard,
  DsCardHeader,
  DsTableHead,
  DsTableRow,
  DsEmpty,
  DsSkeletonRows,
} from "@shared/ui/ds";

type Batch = { id: string; branchId: string; courseId: string; name: string; courseName: string };
type Slot = {
  batchId: string;
  teacherUid: string;
  teacherName: string;
  subject: string;
  startTime: string;
  endTime: string;
};
type Student = { id: string; batchId?: string };
type Employee = {
  id: string;
  name: string;
  status: string;
  invitedAt?: { seconds?: number } | null;
};
type LessonRef = { plannedDate?: string };
type Exam = {
  id: string;
  title: string;
  courseName: string;
  targetBatches: string[];
  examDate: string;
  status: "draft" | "published";
  syllabusUnits: LessonRef[];
};
type ExamResult = { examId: string; studentId: string; marks: number; maxMarks: number };
type PaymentRecord = { accessExpiresAt?: { seconds?: number } | null };

function toMinutes(t: string) {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function OwnerOverview() {
  const { profile, firebaseUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const educatorId = profile?.educatorId || firebaseUser?.uid || "";

  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [usedSeats, setUsedSeats] = useState(0);
  const [seatLimit, setSeatLimit] = useState(0);
  const [nearestExpiry, setNearestExpiry] = useState<number | null>(null);

  // One-time fan-out: branches -> courses -> batches -> timetable, plus the
  // flat collections that don't need traversal. Mirrors the pattern already
  // used by Dashboard.tsx / ScheduledAssessmentsList.tsx for this schema.
  useEffect(() => {
    if (!educatorId) return;
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
          snap.docs.map((c) => ({
            branchId: branchesSnap.docs[i].id,
            courseId: c.id,
            courseName: String(c.data().name || "Course"),
          }))
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

        const nextBatches: Batch[] = batchLists.flatMap((snap, i) =>
          snap.docs.map((b) => ({
            id: b.id,
            branchId: courseRefs[i].branchId,
            courseId: courseRefs[i].courseId,
            courseName: courseRefs[i].courseName,
            name: String(b.data().name || b.id),
          }))
        );
        setBatches(nextBatches);

        const slotLists = await Promise.all(
          nextBatches.map((b) =>
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
        setSlots(
          slotLists.flatMap((snap, i) =>
            snap.docs.map((d) => {
              const data = d.data() as any;
              return {
                batchId: nextBatches[i].id,
                teacherUid: String(data.teacherUid || ""),
                teacherName: String(data.teacherName || ""),
                subject: String(data.subject || ""),
                startTime: String(data.startTime || "0:0"),
                endTime: String(data.endTime || "0:0"),
              };
            })
          )
        );

        const examsSnap = await getDocs(collection(db, "educators", educatorId, "exams"));
        if (cancelled) return;
        setExams(
          examsSnap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              title: String(data.title || "Exam"),
              courseName: String(data.courseName || ""),
              targetBatches: Array.isArray(data.targetBatches) ? data.targetBatches : [],
              examDate: String(data.examDate || ""),
              status: data.status === "published" ? "published" : "draft",
              syllabusUnits: Array.isArray(data.syllabusUnits) ? data.syllabusUnits : [],
            };
          })
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "students"),
      (snap) =>
        setStudents(
          snap.docs.map((d) => ({ id: d.id, batchId: (d.data() as any)?.batchId || undefined }))
        ),
      () => setStudents([])
    );
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "employees"),
      (snap) =>
        setEmployees(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: String(data.name || "Staff"),
              status: String(data.status || ""),
              invitedAt: data.invitedAt || null,
            };
          })
        ),
      () => setEmployees([])
    );
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    getDocs(query(collection(db, "examResults"), where("educatorId", "==", educatorId))).then(
      (snap) => {
        setExamResults(
          snap.docs.map((d) => {
            const r = d.data() as any;
            return {
              examId: String(r.examId || ""),
              studentId: String(r.studentId || ""),
              marks: Number(r.marks) || 0,
              maxMarks: Number(r.maxMarks) || 0,
            };
          })
        );
      }
    );
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    const unsubSeats = onSnapshot(
      collection(db, "educators", educatorId, "billingSeats"),
      (snap) =>
        setUsedSeats(
          snap.docs.filter((d) => String(d.data()?.status || "").toLowerCase() === "active").length
        ),
      () => setUsedSeats(0)
    );
    const unsubPools = onSnapshot(
      collection(db, "educators", educatorId, "seatPools"),
      (snap) => setSeatLimit(snap.docs.reduce((s, d) => s + (Number(d.data().totalSeats) || 0), 0)),
      () => setSeatLimit(0)
    );
    const unsubPayments = onSnapshot(
      collection(db, "educators", educatorId, "paymentRecords"),
      (snap) => {
        const now = Date.now() / 1000;
        const future = (snap.docs as any[])
          .map((d) => (d.data() as PaymentRecord).accessExpiresAt?.seconds)
          .filter((s): s is number => typeof s === "number" && s > now);
        setNearestExpiry(future.length ? Math.min(...future) : null);
      },
      () => setNearestExpiry(null)
    );
    return () => {
      unsubSeats();
      unsubPools();
      unsubPayments();
    };
  }, [educatorId]);

  const studentsByBatch = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s) => {
      if (!s.batchId) return;
      map.set(s.batchId, (map.get(s.batchId) || 0) + 1);
    });
    return map;
  }, [students]);

  // A student's batch (not the exam's targetBatches) is the source of truth for which
  // batch a result belongs to, so one join (studentId -> batchId) covers every exam.
  const studentBatch = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((s) => {
      if (s.batchId) map.set(s.id, s.batchId);
    });
    return map;
  }, [students]);

  const examDateById = useMemo(() => {
    const map = new Map<string, string>();
    exams.forEach((e) => map.set(e.id, e.examDate));
    return map;
  }, [exams]);

  const batchOutcomes = useMemo(() => {
    return batches.map((batch) => {
      const batchSlots = slots.filter((s) => s.batchId === batch.id);
      const leadCounts = new Map<string, { name: string; count: number }>();
      batchSlots.forEach((s) => {
        if (!s.teacherUid) return;
        const cur = leadCounts.get(s.teacherUid) || { name: s.teacherName, count: 0 };
        cur.count += 1;
        leadCounts.set(s.teacherUid, cur);
      });
      let lead: { uid: string; name: string } | null = null;
      leadCounts.forEach((v, uid) => {
        if (!lead || v.count > (leadCounts.get(lead.uid)?.count || 0)) lead = { uid, name: v.name };
      });

      const results = examResults.filter((r) => studentBatch.get(r.studentId) === batch.id);
      const avgScore = results.length
        ? Math.round(
            (results.reduce((s, r) => s + (r.maxMarks ? r.marks / r.maxMarks : 0), 0) /
              results.length) *
              100
          )
        : null;

      // Trend: compare the batch's average on its most recent exam against the one before —
      // only meaningful with 2+ distinct exam dates, otherwise there's nothing to compare yet.
      const byExam = new Map<string, number[]>();
      results.forEach((r) => {
        const list = byExam.get(r.examId) || [];
        list.push(r.maxMarks ? (r.marks / r.maxMarks) * 100 : 0);
        byExam.set(r.examId, list);
      });
      const examAverages = Array.from(byExam.entries())
        .map(([examId, vals]) => ({
          date: examDateById.get(examId) || "",
          avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        }))
        .filter((e) => e.date)
        .sort((a, b) => a.date.localeCompare(b.date));
      const trend =
        examAverages.length >= 2
          ? Math.round(examAverages[examAverages.length - 1].avg - examAverages[0].avg)
          : null;

      return {
        id: batch.id,
        name: batch.name,
        courseName: batch.courseName,
        students: studentsByBatch.get(batch.id) || 0,
        avgScore,
        trend,
        lead,
      };
    });
  }, [batches, slots, examResults, studentBatch, studentsByBatch, examDateById]);

  const needsDecision = useMemo(() => {
    const items: { key: string; title: string; meta: string; cta: string; href: string }[] = [];

    batchOutcomes
      .filter((b) => !b.lead)
      .forEach((b) =>
        items.push({
          key: `lead-${b.id}`,
          title: `${b.name} has no faculty lead`,
          meta: `${b.students} student${b.students === 1 ? "" : "s"} enrolled, no teacher assigned yet`,
          cta: "Assign lead",
          href: "/educator/timetable",
        })
      );

    employees
      .filter((e) => e.status === "PENDING")
      .forEach((e) =>
        items.push({
          key: `emp-${e.id}`,
          title: `${e.name} invited to staff`,
          meta: "Invitation sent, awaiting acceptance",
          cta: "Review",
          href: "/educator/organization",
        })
      );

    exams
      .filter(
        (e) =>
          e.status === "draft" &&
          e.syllabusUnits.some((u) => u.plannedDate && u.plannedDate > e.examDate)
      )
      .forEach((e) =>
        items.push({
          key: `exam-${e.id}`,
          title: `${e.title} syllabus is behind`,
          meta: `${e.courseName || "Exam"} · a planned lesson falls after ${e.examDate}`,
          cta: "Review plan",
          href: "/educator/exam-schedule",
        })
      );

    return items;
  }, [batchOutcomes, employees, exams]);

  const facultyLoad = useMemo(() => {
    const byTeacher = new Map<
      string,
      { name: string; minutes: number; batchIds: Set<string>; subjects: Set<string> }
    >();
    slots.forEach((s) => {
      if (!s.teacherUid) return;
      const cur = byTeacher.get(s.teacherUid) || {
        name: s.teacherName,
        minutes: 0,
        batchIds: new Set<string>(),
        subjects: new Set<string>(),
      };
      cur.minutes += Math.max(0, toMinutes(s.endTime) - toMinutes(s.startTime));
      cur.batchIds.add(s.batchId);
      if (s.subject) cur.subjects.add(s.subject);
      byTeacher.set(s.teacherUid, cur);
    });

    return Array.from(byTeacher.entries())
      .map(([uid, v]) => {
        const hours = v.minutes / 60;
        return {
          uid,
          name: v.name,
          hrs: `${Math.round(hours * 10) / 10}h/wk`,
          meta: `${v.subjects.size ? Array.from(v.subjects).slice(0, 2).join(", ") : "No subject set"} · ${v.batchIds.size} batch${v.batchIds.size === 1 ? "" : "es"}`,
          // 30h/week as a full bar — the heaviest a single teacher realistically
          // carries across the batches this institute schedules.
          pct: Math.min(100, (hours / 30) * 100),
          tone: (hours >= 24 ? "accent" : hours >= 12 ? "info" : "slate") as
            "accent" | "info" | "slate",
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [slots]);

  const activeStudents = students.length;
  const avgScoreOverall = examResults.length
    ? Math.round(
        (examResults.reduce((s, r) => s + (r.maxMarks ? r.marks / r.maxMarks : 0), 0) /
          examResults.length) *
          100
      )
    : null;

  const renewalDays = nearestExpiry
    ? Math.max(0, Math.ceil((nearestExpiry - Date.now() / 1000) / 86400))
    : null;
  const renewalDate = nearestExpiry
    ? new Date(nearestExpiry * 1000).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  if (authLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  const kpis = [
    {
      label: "Active students",
      value: String(activeStudents),
      tone: "accent" as const,
      pct: Math.min(100, activeStudents),
    },
    {
      label: "Avg. test score",
      value: avgScoreOverall == null ? "—" : `${avgScoreOverall}%`,
      sub: avgScoreOverall == null ? "No released results yet" : undefined,
      tone: "info" as const,
      pct: avgScoreOverall ?? 0,
    },
    {
      label: "Staff seats used",
      value: `${usedSeats} / ${seatLimit || 0}`,
      tone: "slate" as const,
      pct: seatLimit ? (usedSeats / seatLimit) * 100 : 0,
    },
    {
      label: "Renewal",
      value: renewalDays == null ? "—" : `${renewalDays} day${renewalDays === 1 ? "" : "s"}`,
      sub: renewalDate || "No upcoming renewal on file",
      tone: "slate" as const,
      pct: renewalDays == null ? 0 : Math.max(0, 100 - Math.min(100, renewalDays)),
    },
  ];

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Institute overview"
        subtitle="Batch outcomes, decisions waiting on you, and how the week's teaching load is spread."
        primary={{ label: "Add batch", onClick: () => navigate("/educator/batches") }}
      />

      <DsKpiRow items={kpis} />

      <div className="grid items-start gap-3.5 lg:grid-cols-[1.6fr_1fr]">
        <DsCard className="overflow-hidden">
          <DsCardHeader title="Batch outcomes" meta="term to date" />
          {loading ? (
            <DsSkeletonRows rows={5} rowHeight={48} cols="1.6fr .6fr 1.1fr .8fr .6fr" />
          ) : batchOutcomes.length === 0 ? (
            <DsEmpty
              title="No batches yet"
              body="Batch outcomes show up here once you've created your first batch."
              action={{ label: "Add batch", onClick: () => navigate("/educator/batches") }}
            />
          ) : (
            <>
              <DsTableHead
                columns={["Batch", "Students", "Avg. score", "Trend", "Lead"]}
                cols="1.6fr .6fr 1.1fr .8fr .6fr"
              />
              {batchOutcomes.map((b) => (
                <DsTableRow key={b.id} cols="1.6fr .6fr 1.1fr .8fr .6fr">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{b.name}</div>
                    <div className="truncate font-ds-sans text-[11px] text-ds-ink/45">
                      {b.courseName}
                    </div>
                  </div>
                  <div className="font-ds-mono text-[12px]">{b.students}</div>
                  <div className="font-ds-mono text-[12px]">
                    {b.avgScore == null ? "—" : `${b.avgScore}%`}
                  </div>
                  <div
                    className={`font-ds-mono text-[11.5px] font-medium ${
                      b.trend == null
                        ? "text-ds-ink/40"
                        : b.trend < 0
                          ? "text-ds-accent"
                          : "text-ds-positive"
                    }`}
                  >
                    {b.trend == null ? "—" : `${b.trend > 0 ? "+" : ""}${b.trend}`}
                  </div>
                  <div className="flex justify-end">
                    {b.lead ? (
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-ds-fill font-ds-sans text-[9.5px] font-semibold text-ds-ink/70"
                        title={b.lead.name}
                      >
                        {initials(b.lead.name)}
                      </div>
                    ) : (
                      <span className="font-ds-sans text-[11px] text-ds-ink/35">—</span>
                    )}
                  </div>
                </DsTableRow>
              ))}
            </>
          )}
        </DsCard>

        <div className="flex flex-col gap-3.5">
          <DsCard className="p-4">
            <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Needs your decision
            </div>
            {loading ? (
              <DsSkeletonRows rows={3} rowHeight={56} />
            ) : needsDecision.length === 0 ? (
              <DsEmpty title="Nothing waiting on you" body="New decisions will show up here." />
            ) : (
              needsDecision.map((item) => (
                <div key={item.key} className="border-b border-ds-ink/[.055] py-2.5 last:border-0">
                  <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                    {item.title}
                  </div>
                  <div className="mt-0.5 font-ds-sans text-[11.5px] leading-[1.45] text-ds-ink/50">
                    {item.meta}
                  </div>
                  <button
                    onClick={() => navigate(item.href)}
                    className="mt-2 h-7 rounded-md bg-ds-ink px-2.5 font-ds-sans text-[11px] font-semibold text-white"
                  >
                    {item.cta}
                  </button>
                </div>
              ))
            )}
          </DsCard>

          <DsCard className="flex-1 p-4">
            <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Faculty load
            </div>
            {loading ? (
              <DsSkeletonRows rows={4} rowHeight={48} />
            ) : facultyLoad.length === 0 ? (
              <DsEmpty
                title="No teaching load yet"
                body="Assign teachers to timetable slots to see load here."
              />
            ) : (
              facultyLoad.map((f) => (
                <div key={f.uid} className="mb-2.5 last:mb-0">
                  <div className="flex items-baseline">
                    <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                      {f.name}
                    </div>
                    <div className="flex-1" />
                    <div className="font-ds-mono text-[11px] font-medium text-ds-ink/60">
                      {f.hrs}
                    </div>
                  </div>
                  <div className="my-0.5 font-ds-sans text-[11px] text-ds-ink/45">{f.meta}</div>
                  <div className="h-1 overflow-hidden rounded-full bg-ds-fill">
                    <div
                      className={`h-1 rounded-full ${
                        f.tone === "accent"
                          ? "bg-ds-accent"
                          : f.tone === "info"
                            ? "bg-ds-info"
                            : "bg-ds-slate"
                      }`}
                      style={{ width: `${f.pct}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </DsCard>
        </div>
      </div>
    </div>
  );
}
