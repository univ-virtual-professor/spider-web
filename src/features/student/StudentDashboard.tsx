import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Target,
  Trophy,
  TrendingUp,
  Play,
  ArrowRight,
  Clock,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { StudentMetricCard } from "@features/student/components/StudentMetricCard";
import { DailyQuoteCard } from "@features/student/components/DailyQuoteCard";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, GraduationCap, Users2, Zap as DppIcon, BookOpenCheck } from "lucide-react";

type AttemptStatus = "in-progress" | "completed" | "expired";

type AttemptRow = {
  id: string;
  testId: string;
  testTitle: string;
  subject: string;
  status: AttemptStatus;
  score: number;
  maxScore: number;
  accuracy: number;
  timeSpent: number;
  rank: number;
  totalParticipants: number;
  createdAt: string;
};

type UserDoc = {
  displayName?: string;
  name?: string;
  photoURL?: string;
  avatar?: string;
};

type DashTest = {
  id: string;
  title?: string;
  subject?: string;
  durationMinutes?: number;
  questionsCount?: number;
  type?: string;
  _startsAtMs?: number;
  _windowExpiresAt?: number | null;
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  studentId: string;
};

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.now();
}

function safeNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function accuracyFrom(score: number, maxScore: number) {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

function formatDateLabel(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Starting now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function normalizeStatus(raw: any): AttemptStatus {
  const s = String(raw || "").toLowerCase();
  if (s === "in-progress" || s === "inprogress" || s === "running" || s === "started")
    return "in-progress";
  if (s === "expired" || s === "timeout") return "expired";
  return "completed";
}

function mapAttemptRow(id: string, a: any): AttemptRow {
  const score = safeNum(a?.score, 0);
  const maxScore = safeNum(a?.maxScore, 0);
  const accuracy =
    a?.accuracy != null
      ? (() => {
          const n = Number(a.accuracy);
          const pct = Number.isFinite(n)
            ? n <= 1.01
              ? n * 100
              : n
            : accuracyFrom(score, maxScore);
          return Math.max(0, Math.min(100, Math.round(pct)));
        })()
      : accuracyFrom(score, maxScore);
  const createdAtMs = toMillis(a?.createdAt);
  const startedAtMs = toMillis(a?.startedAt || a?.createdAt);
  const submittedAtMs = a?.submittedAt ? toMillis(a?.submittedAt) : undefined;
  const computedSeconds =
    submittedAtMs != null ? Math.max(0, Math.round((submittedAtMs - startedAtMs) / 1000)) : 0;
  const timeSpent = safeNum(a?.timeSpent, computedSeconds);

  return {
    id,
    testId: String(a?.testId || a?.testSeriesId || ""),
    testTitle: String(a?.testTitle || "Test"),
    subject: String(a?.subject || "General Test"),
    status: normalizeStatus(a?.status),
    score,
    maxScore,
    accuracy,
    timeSpent,
    rank: 0,
    totalParticipants: 0,
    createdAt: new Date(createdAtMs).toISOString(),
  };
}

export default function StudentDashboard() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const canLoad = useMemo(
    () => !authLoading && !tenantLoading && !!firebaseUser?.uid && !!educatorId,
    [authLoading, tenantLoading, firebaseUser?.uid, educatorId]
  );

  // User profile
  const { data: userDoc = null } = useQuery({
    queryKey: ["studentUserDoc", firebaseUser?.uid],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "users", firebaseUser!.uid));
      return snap.exists() ? (snap.data() as UserDoc) : null;
    },
    enabled: !!firebaseUser?.uid,
    staleTime: 2 * 60 * 1000,
  });

  // Attempts
  const { data: attempts = [], isLoading: attemptsLoading } = useQuery({
    queryKey: ["studentDashboardAttempts", firebaseUser?.uid, educatorId],
    queryFn: async () => {
      const qAttempts = query(
        collection(db, "attempts"),
        where("studentId", "==", firebaseUser!.uid),
        where("educatorId", "==", educatorId!),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snap = await getDocs(qAttempts);
      return snap.docs.map((d) => mapAttemptRow(d.id, d.data()));
    },
    enabled: canLoad,
    staleTime: 60 * 1000,
  });

  // Rank
  const { data: rankData = { rank: null as number | null, totalParticipants: 0 } } = useQuery({
    queryKey: ["studentRank", firebaseUser?.uid, educatorId],
    queryFn: async () => {
      const qTop = query(
        collection(db, "attempts"),
        where("educatorId", "==", educatorId!),
        orderBy("createdAt", "desc"),
        limit(500)
      );
      const snap = await getDocs(qTop);
      const DONE = new Set(["completed", "submitted", "finished", "done"]);
      const best: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const a = d.data() as any;
        const sid = String(a?.studentId || "");
        if (!sid || !DONE.has(String(a?.status || "").toLowerCase())) return;
        const sc = safeNum(a?.score, 0);
        best[sid] = Math.max(best[sid] || 0, sc);
      });
      const sorted = Object.entries(best)
        .sort((a, b) => b[1] - a[1])
        .map(([studentId]) => studentId);
      const idx = sorted.findIndex((id) => id === firebaseUser!.uid);
      return { rank: idx >= 0 ? idx + 1 : null, totalParticipants: sorted.length };
    },
    enabled: canLoad,
    staleTime: 2 * 60 * 1000,
  });

  const studentBatchId = profile?.batchId;

  // All tests split into running / unlocked (via access code) / upcoming
  const {
    data: dashboardTests = {
      running: [] as DashTest[],
      unlocked: [] as DashTest[],
      upcoming: [] as DashTest[],
    },
  } = useQuery({
    queryKey: ["dashboardTests", firebaseUser?.uid, educatorId, studentBatchId],
    queryFn: async () => {
      const now = Date.now();

      // Fetch student's valid access-code unlocks
      const unlockSnap = await getDocs(
        query(
          collection(db, "testUnlocks"),
          where("studentId", "==", firebaseUser!.uid),
          where("educatorId", "==", educatorId!)
        )
      );
      const unlockedMap = new Map<string, number | null>();
      unlockSnap.docs.forEach((d) => {
        const data = d.data() as any;
        const tid = String(data.testSeriesId || data.testId || "");
        if (!tid) return;
        const we = data?.windowExpiresAt;
        const expMs =
          data?.windowMinutes === 0 || !we
            ? null
            : typeof we?.toMillis === "function"
              ? we.toMillis()
              : null;
        if (expMs !== null && expMs <= now) return; // expired window, skip
        const existing = unlockedMap.get(tid);
        if (existing === undefined) unlockedMap.set(tid, expMs);
        else if (existing !== null && expMs === null) unlockedMap.set(tid, null);
        else if (existing !== null && expMs !== null && expMs > existing)
          unlockedMap.set(tid, expMs);
      });

      // Fetch per-batch assignments for student's batch
      const assignMap = new Map<string, any>();
      if (studentBatchId) {
        const assignSnap = await getDocs(
          query(
            collection(db, "educators", educatorId!, "batchAssignments"),
            where("batchId", "==", studentBatchId)
          )
        );
        assignSnap.docs.forEach((d) => {
          const data = d.data() as any;
          assignMap.set(String(data.testId || ""), data);
        });
      }

      const snap = await getDocs(
        query(
          collection(db, "educators", educatorId!, "my_tests"),
          orderBy("createdAt", "desc"),
          limit(80)
        )
      );
      const all = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((t: any) =>
          t.targetBatches === undefined || t.targetBatches === null
            ? true
            : studentBatchId
              ? t.targetBatches.includes(studentBatchId)
              : t.targetBatches.length === 0
        );

      const running: DashTest[] = [];
      const unlocked: DashTest[] = [];
      const upcoming: DashTest[] = [];

      all.forEach((t: any) => {
        const assignment = assignMap.get(t.id);
        if (assignment) {
          if (assignment.accessType === "scheduled") {
            const startMs = assignment.startTime ? toMillis(assignment.startTime) : null;
            const endMs = assignment.endTime ? toMillis(assignment.endTime) : null;
            if (startMs && startMs > now && assignment.isScheduleActive) {
              upcoming.push({ ...t, _startsAtMs: startMs });
            } else if (startMs && endMs && now >= startMs && now <= endMs) {
              running.push(t);
            }
          } else if (assignment.accessType === "access_code") {
            if (unlockedMap.has(t.id)) {
              unlocked.push({ ...t, _windowExpiresAt: unlockedMap.get(t.id) });
            }
          }
        } else {
          // Legacy: use test doc fields for tests assigned before this model change
          const startMs = t.startTime ? toMillis(t.startTime) : null;
          const endMs = t.endTime ? toMillis(t.endTime) : null;
          if (startMs && startMs > now && t.isScheduleActive === true) {
            upcoming.push({ ...t, _startsAtMs: startMs });
          } else if (startMs && endMs && now >= startMs && now <= endMs) {
            running.push(t);
          } else if (unlockedMap.has(t.id)) {
            unlocked.push({ ...t, _windowExpiresAt: unlockedMap.get(t.id) });
          }
        }
      });

      upcoming.sort((a: any, b: any) => a._startsAtMs! - b._startsAtMs!);
      const dpps = all.filter((t: any) => t.type === "from_dpp").slice(0, 5);
      return {
        running: running.slice(0, 6),
        unlocked: unlocked.slice(0, 6),
        upcoming: upcoming.slice(0, 5),
        dpps,
      };
    },
    enabled: canLoad,
    staleTime: 2 * 60 * 1000,
  });

  // Enrollment details (batch name, course/program name, subject names)
  const { data: enrollment = null } = useQuery({
    queryKey: [
      "studentEnrollment",
      firebaseUser?.uid,
      educatorId,
      profile?.batchId,
      profile?.courseId,
    ],
    queryFn: async () => {
      const { branchId, courseId, batchId, globalCourseName, subjectIds } = profile!;
      const results: {
        batchName: string | null;
        courseName: string | null;
        subjectNames: string[];
      } = {
        batchName: null,
        courseName: globalCourseName || null,
        subjectNames: [],
      };

      if (educatorId && branchId && courseId) {
        // Fetch course name (fallback if globalCourseName is empty)
        if (!results.courseName) {
          try {
            const courseSnap = await getDoc(
              doc(db, "educators", educatorId, "branches", branchId, "courses", courseId)
            );
            if (courseSnap.exists()) results.courseName = String(courseSnap.data()?.name || "");
          } catch {
            /* non-fatal */
          }
        }

        // Fetch batch name
        if (batchId) {
          try {
            const batchSnap = await getDoc(
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
            );
            if (batchSnap.exists()) results.batchName = String(batchSnap.data()?.name || "");
          } catch {
            /* non-fatal */
          }
        }
      }

      // Fetch subject names
      const ids = (subjectIds || []).filter(Boolean);
      if (ids.length > 0) {
        try {
          const q = query(collection(db, "subjects"), where(documentId(), "in", ids.slice(0, 10)));
          const snap = await getDocs(q);
          results.subjectNames = snap.docs.map((d) => String(d.data()?.name || "")).filter(Boolean);
        } catch {
          /* non-fatal */
        }
      }

      return results;
    },
    enabled: !!firebaseUser?.uid && !!profile?.branchId,
    staleTime: 5 * 60 * 1000,
  });

  // Attempt counts per test (to filter out already-attempted tests)
  const { data: attemptCounts = {} } = useQuery({
    queryKey: ["studentAttemptCounts", firebaseUser?.uid, educatorId],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, "attempts"),
          where("studentId", "==", firebaseUser!.uid),
          where("educatorId", "==", educatorId!),
          where("status", "==", "submitted")
        )
      );
      const counts: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const tid = String(d.data().testId || "");
        if (tid) counts[tid] = (counts[tid] || 0) + 1;
      });
      return counts;
    },
    enabled: canLoad,
    staleTime: 60 * 1000,
  });

  // Leaderboard top 5
  const { data: leaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboardPreview", educatorId],
    queryFn: async () => {
      const qTop = query(
        collection(db, "attempts"),
        where("educatorId", "==", educatorId!),
        orderBy("createdAt", "desc"),
        limit(500)
      );
      const snap = await getDocs(qTop);
      const DONE = new Set(["completed", "submitted", "finished", "done"]);
      const best: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const a = d.data() as any;
        const sid = String(a?.studentId || "");
        if (!sid || !DONE.has(String(a?.status || "").toLowerCase())) return;
        const sc = safeNum(a?.score, 0);
        best[sid] = Math.max(best[sid] || 0, sc);
      });
      const sorted = Object.entries(best)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      return Promise.all(
        sorted.map(async ([studentId, score], idx) => {
          try {
            const userSnap = await getDoc(doc(db, "users", studentId));
            const name = userSnap.exists()
              ? String(userSnap.data()?.displayName || userSnap.data()?.name || "Student")
              : "Student";
            return { rank: idx + 1, name, score, studentId };
          } catch {
            return { rank: idx + 1, name: "Student", score, studentId };
          }
        })
      );
    },
    enabled: canLoad,
    staleTime: 3 * 60 * 1000,
  });

  const loading = attemptsLoading;
  const rank = rankData.rank;
  const totalParticipants = rankData.totalParticipants;

  const attemptsWithRank = useMemo(
    () =>
      attempts.map((a) => ({
        ...a,
        rank: a.status === "completed" && rank ? rank : 0,
        totalParticipants: a.status === "completed" ? totalParticipants : 0,
      })),
    [attempts, rank, totalParticipants]
  );

  const firstName = useMemo(() => {
    const name =
      userDoc?.displayName ||
      userDoc?.name ||
      profile?.displayName ||
      firebaseUser?.displayName ||
      "Student";
    return name.split(" ")[0] || "Student";
  }, [userDoc, profile, firebaseUser]);

  const completedAttempts = useMemo(
    () => attemptsWithRank.filter((a) => a.status === "completed"),
    [attemptsWithRank]
  );
  const inProgressAttempt = useMemo(
    () => attemptsWithRank.find((a) => a.status === "in-progress") || null,
    [attemptsWithRank]
  );

  const avgScore = useMemo(() => {
    if (completedAttempts.length === 0) return 0;
    return Math.round(
      completedAttempts.reduce((acc, a) => acc + a.accuracy, 0) / completedAttempts.length
    );
  }, [completedAttempts]);

  const bestAccuracy = useMemo(() => {
    if (completedAttempts.length === 0) return 0;
    return Math.max(...completedAttempts.map((a) => a.accuracy));
  }, [completedAttempts]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const scoreTrend = useMemo(() => {
    return [...completedAttempts]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-8)
      .map((a) => ({ date: formatDateLabel(new Date(a.createdAt).getTime()), score: a.score }));
  }, [completedAttempts]);

  const subjectPerformance = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const a of completedAttempts) {
      const key = a.subject || "General Test";
      map[key] = map[key] || { total: 0, count: 0 };
      map[key].total += a.score;
      map[key].count += 1;
    }
    return Object.entries(map)
      .map(([subject, v]) => ({ subject, score: Math.round(v.total / Math.max(1, v.count)) }))
      .sort((x, y) => y.score - x.score);
  }, [completedAttempts]);

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Welcome back, {firstName}!</h1>
          {(enrollment?.courseName ||
            enrollment?.batchName ||
            (enrollment?.subjectNames?.length ?? 0) > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {enrollment?.courseName && (
                <span className="flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                  <GraduationCap className="h-3 w-3" />
                  {enrollment.courseName}
                </span>
              )}
              {enrollment?.batchName && (
                <span className="flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                  <Users2 className="h-3 w-3" />
                  {enrollment.batchName}
                </span>
              )}
              {enrollment?.subjectNames?.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <BookOpen className="h-3 w-3" />
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <Button size="sm" className="gradient-bg shrink-0 rounded-lg" asChild>
          <Link to="/student/tests">
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Browse Tests
          </Link>
        </Button>
      </div>

      {/* Daily Quote */}
      {tenant?.quotes && tenant.quotes.length > 0 && (
        <DailyQuoteCard
          quotes={tenant.quotes}
          instituteName={
            tenant.builderConfig?.instituteName || tenant.coachingName || "Your Institute"
          }
          primaryColor={tenant.builderConfig?.customColor || "#6366f1"}
        />
      )}

      {/* Resume In-Progress Test */}
      {inProgressAttempt && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              In Progress
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {inProgressAttempt.testTitle}
            </p>
            <p className="text-xs text-muted-foreground">{inProgressAttempt.subject}</p>
          </div>
          <Button size="sm" className="gradient-bg shrink-0 rounded-lg" asChild>
            <Link to={`/student/tests/${inProgressAttempt.testId}/attempt`}>Continue</Link>
          </Button>
        </div>
      )}

      {/* Empty state for new students */}
      {completedAttempts.length === 0 &&
        dashboardTests.running.length === 0 &&
        dashboardTests.unlocked.length === 0 &&
        dashboardTests.upcoming.length === 0 &&
        dashboardTests.dpps?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
            <BookOpenCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-base font-semibold text-foreground">You're all set!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your educator will assign tests soon. Check back here to see them.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button size="sm" className="gradient-bg rounded-lg" asChild>
                <Link to="/student/tests">Browse Tests</Link>
              </Button>
              <Button size="sm" variant="outline" className="rounded-lg" asChild>
                <Link to="/student/content">View Content</Link>
              </Button>
            </div>
          </div>
        )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StudentMetricCard
          title="Rank"
          value={rank ? `#${rank}` : "—"}
          subtitle={totalParticipants ? `of ${totalParticipants}` : undefined}
          icon={TrendingUp}
          color="peach"
        />
        <StudentMetricCard
          title="Avg Accuracy"
          value={`${avgScore}%`}
          icon={Target}
          color="yellow"
        />
        <StudentMetricCard
          title="Tests Done"
          value={completedAttempts.length}
          icon={CheckCircle2}
          color="mint"
        />
        <StudentMetricCard
          title="Best Score"
          value={bestAccuracy > 0 ? `${bestAccuracy}%` : "—"}
          icon={Zap}
          color="lavender"
        />
      </div>

      {/* Daily Practice (DPPs) */}
      {dashboardTests.dpps && dashboardTests.dpps.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <DppIcon className="h-4 w-4 text-primary" />
              Daily Practice
            </h2>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link to="/student/tests">
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dashboardTests.dpps.map((test) => (
              <div
                key={test.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="gradient-bg h-1" />
                <div className="flex flex-1 flex-col gap-3 p-3.5">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                    {test.title || "Daily Practice"}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {test.subject && <span className="truncate">{test.subject}</span>}
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {test.durationMinutes && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {test.durationMinutes}m
                        </span>
                      )}
                      {test.questionsCount && <span>{test.questionsCount}Q</span>}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="gradient-bg h-7 w-full rounded-lg text-xs font-medium"
                    asChild
                  >
                    <Link to={`/student/tests/${test.id}`}>Start Practice</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tests Section */}
      {(() => {
        const counts = attemptCounts as Record<string, number>;
        const visibleRunning = dashboardTests.running.filter((t) => !(counts[t.id] > 0));
        const visibleUnlocked = dashboardTests.unlocked.filter((t) => !(counts[t.id] > 0));
        const visibleUpcoming = dashboardTests.upcoming;
        const anyVisible =
          visibleRunning.length > 0 || visibleUnlocked.length > 0 || visibleUpcoming.length > 0;

        return (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Tests</h2>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                <Link to="/student/tests">
                  View All <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>

            {/* Running now */}
            {visibleRunning.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                    Live Now
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleRunning.map((test) => (
                    <div
                      key={test.id}
                      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="h-1 bg-red-500" />
                      <div className="flex flex-1 flex-col gap-3 p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                            {test.title || "Untitled Test"}
                          </p>
                          <Badge className="shrink-0 rounded-full bg-red-100 px-1.5 py-0 text-[9px] font-bold tracking-wider text-red-600 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-400">
                            LIVE
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {test.subject && <span className="truncate">{test.subject}</span>}
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            {test.durationMinutes && (
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />
                                {test.durationMinutes}m
                              </span>
                            )}
                            {test.questionsCount && <span>{test.questionsCount}Q</span>}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="gradient-bg h-7 w-full rounded-lg text-xs font-medium"
                          asChild
                        >
                          <Link to={`/student/tests/${test.id}`}>Start Test</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unlocked via access code */}
            {visibleUnlocked.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Unlocked
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleUnlocked.map((test) => {
                    const expMs = test._windowExpiresAt;
                    const timeLeft = expMs != null ? expMs - now : null;
                    return (
                      <div
                        key={test.id}
                        className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="h-1 bg-emerald-500" />
                        <div className="flex flex-1 flex-col gap-3 p-3.5">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                            {test.title || "Untitled Test"}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {test.subject && <span className="truncate">{test.subject}</span>}
                            <span className="ml-auto flex shrink-0 items-center gap-2">
                              {test.durationMinutes && (
                                <span className="flex items-center gap-0.5">
                                  <Clock className="h-3 w-3" />
                                  {test.durationMinutes}m
                                </span>
                              )}
                              {test.questionsCount && <span>{test.questionsCount}Q</span>}
                            </span>
                          </div>
                          {timeLeft !== null && (
                            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              ⏱ Window closes in {formatCountdown(timeLeft)}
                            </p>
                          )}
                          <Button
                            size="sm"
                            className="gradient-bg h-7 w-full rounded-lg text-xs font-medium"
                            asChild
                          >
                            <Link to={`/student/tests/${test.id}`}>Start Test</Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upcoming */}
            {visibleUpcoming.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Upcoming
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleUpcoming.map((test) => {
                    const msLeft = test._startsAtMs! - now;
                    return (
                      <div
                        key={test.id}
                        className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="h-1 bg-amber-400" />
                        <div className="flex flex-1 flex-col gap-3 p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                              {test.title || "Untitled Test"}
                            </p>
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0 text-[9px] font-bold tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                              in {formatCountdown(msLeft)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {test.subject && <span className="truncate">{test.subject}</span>}
                            <span className="ml-auto flex shrink-0 items-center gap-2">
                              {test.durationMinutes && (
                                <span className="flex items-center gap-0.5">
                                  <Clock className="h-3 w-3" />
                                  {test.durationMinutes}m
                                </span>
                              )}
                              {test.questionsCount && <span>{test.questionsCount}Q</span>}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-full rounded-lg text-xs font-medium"
                            asChild
                          >
                            <Link to={`/student/tests/${test.id}`}>View Details</Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!anyVisible && (
              <p className="rounded-xl border border-border bg-muted/30 py-6 text-center text-sm text-muted-foreground">
                No tests available right now.
              </p>
            )}
          </section>
        );
      })()}

      {/* Leaderboard Preview + Score Trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="card-soft border-0 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4">
            <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-amber-500" />
              Top Performers
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link to="/student/rankings">
                Full <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pb-4">
            {leaderboard.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">No rankings yet.</p>
            ) : (
              <div className="space-y-1">
                {leaderboard.map((entry) => {
                  const isMe = entry.studentId === firebaseUser?.uid;
                  const rankColors: Record<number, string> = {
                    1: "text-amber-500",
                    2: "text-slate-400",
                    3: "text-orange-400",
                  };
                  return (
                    <div
                      key={entry.rank}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${isMe ? "bg-primary/10 font-semibold" : ""}`}
                    >
                      <span
                        className={`w-5 text-xs font-bold ${rankColors[entry.rank] || "text-muted-foreground"}`}
                      >
                        #{entry.rank}
                      </span>
                      <span className="flex-1 truncate text-sm">
                        {isMe ? "You" : entry.name.split(" ")[0]}
                      </span>
                      <Badge variant="secondary" className="rounded-full px-2 py-0 text-xs">
                        {entry.score}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-soft border-0 shadow-md">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">Score Trend</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {scoreTrend.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">No attempts yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={scoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Subject Performance */}
      {subjectPerformance.length > 0 && (
        <Card className="card-soft border-0 shadow-md">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">Subject Performance</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={subjectPerformance}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
