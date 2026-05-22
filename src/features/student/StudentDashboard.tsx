import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Target, Trophy, TrendingUp, Play, ArrowRight, Clock } from "lucide-react";
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
import { BookOpen, GraduationCap, Users2 } from "lucide-react";

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

type LiveTest = {
  id: string;
  title?: string;
  subject?: string;
  durationMinutes?: number;
  questionsCount?: number;
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
        where("status", "in", ["completed", "submitted", "finished", "done"]),
        orderBy("createdAt", "desc"),
        limit(500) // fetch more to ensure each student has enough attempts
      );
      const snap = await getDocs(qTop);

      // Group attempts by student, keeping insertion order (already desc by createdAt)
      const studentAttempts: Record<string, number[]> = {};
      snap.docs.forEach((d) => {
        const a = d.data() as any;
        const sid = String(a?.studentId || "");
        if (!sid) return;
        const sc = safeNum(a?.score, 0);
        const maxSc = safeNum(a?.maxScore, 1);
        const pct = (sc / maxSc) * 100; // use percentage so different max scores are comparable
        if (!studentAttempts[sid]) studentAttempts[sid] = [];
        studentAttempts[sid].push(pct);
      });

      // Average of last 5 (already sorted desc, so first 5 = most recent 5)
      const avgOf5 = (scores: number[]) => {
        const last5 = scores.slice(0, 5);
        return last5.reduce((sum, s) => sum + s, 0) / last5.length;
      };

      const sorted = Object.entries(studentAttempts)
        .map(([studentId, scores]) => ({ studentId, avg: avgOf5(scores) }))
        .sort((a, b) => b.avg - a.avg)
        .map(({ studentId }) => studentId);

      const idx = sorted.findIndex((id) => id === firebaseUser!.uid);
      return { rank: idx >= 0 ? idx + 1 : null, totalParticipants: sorted.length };
    },
    enabled: canLoad,
    staleTime: 2 * 60 * 1000,
  });

  const studentBatchId = profile?.batchId;

  // Live (published) tests — filter by student's batch after fetch (avoids composite index)
  const { data: liveTests = [] } = useQuery<LiveTest[]>({
    queryKey: ["liveTests", educatorId, studentBatchId],
    queryFn: async () => {
      const now = Date.now();
      const q = query(
        collection(db, "educators", educatorId!, "my_tests"),
        where("isPublished", "==", true),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      return all
        .filter((t: any) =>
          t.targetBatches === undefined || t.targetBatches === null
            ? true
            : studentBatchId
              ? t.targetBatches.includes(studentBatchId)
              : t.targetBatches.length === 0
        )
        .filter((t: any) => toMillis(t.startTime) <= now)
        .filter((t: any) => toMillis(t.endTime) >= now)
        .slice(0, 4);
    },
    enabled: !!educatorId,
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

  // Leaderboard top 5
  const { data: leaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboardPreview", educatorId],
    queryFn: async () => {
      const qTop = query(
        collection(db, "attempts"),
        where("educatorId", "==", educatorId!),
        where("status", "in", ["completed", "submitted", "finished", "done"]),
        orderBy("score", "desc"),
        limit(200)
      );
      const snap = await getDocs(qTop);
      const best: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const a = d.data() as any;
        const sid = String(a?.studentId || "");
        if (!sid) return;
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
    <div className="space-y-6">
      {/* Welcome Banner */}
      <Card className="card-soft overflow-hidden border-0 bg-gradient-to-r from-pastel-mint to-pastel-lavender">
        <CardContent className="flex flex-col items-center justify-between gap-4 p-6 md:flex-row">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome back, {firstName}!</h1>
            <p className="mt-1 text-muted-foreground">Ready to take on today's challenges?</p>
          </div>
          <Button className="gradient-bg rounded-xl" asChild>
            <Link to="/student/tests">
              <Play className="mr-2 h-4 w-4" />
              Browse Tests
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Enrollment Details */}
      {(enrollment?.batchName ||
        enrollment?.courseName ||
        (enrollment?.subjectNames?.length ?? 0) > 0) && (
        <Card className="card-soft border-0 bg-muted/40">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              {enrollment?.courseName && (
                <div className="flex min-w-0 items-center gap-2">
                  <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
                  <span className="shrink-0 text-muted-foreground">Program:</span>
                  <span className="truncate font-medium">{enrollment.courseName}</span>
                </div>
              )}
              {enrollment?.batchName && (
                <div className="flex min-w-0 items-center gap-2">
                  <Users2 className="h-4 w-4 shrink-0 text-primary" />
                  <span className="shrink-0 text-muted-foreground">Batch:</span>
                  <span className="truncate font-medium">{enrollment.batchName}</span>
                </div>
              )}
              {(enrollment?.subjectNames?.length ?? 0) > 0 && (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                  <span className="shrink-0 text-muted-foreground">Subjects:</span>
                  <div className="flex flex-wrap gap-1">
                    {enrollment!.subjectNames.map((s) => (
                      <Badge key={s} variant="secondary" className="rounded-full text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resume In-Progress Test — prominent */}
      {inProgressAttempt && (
        <Card className="card-soft border-0 border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                In Progress
              </p>
              <p className="mt-0.5 font-semibold text-foreground">{inProgressAttempt.testTitle}</p>
              <p className="text-sm text-muted-foreground">{inProgressAttempt.subject}</p>
            </div>
            <Button className="gradient-bg shrink-0 rounded-xl" asChild>
              <Link to={`/student/tests/${inProgressAttempt.testId}/attempt`}>Continue Test</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Live Tests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Today's Tests</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/student/tests">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        {liveTests.length === 0 ? (
          <Card className="card-soft border-0">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No tests available right now. Check back soon!
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {liveTests.map((test) => (
              <Card key={test.id} className="card-soft flex flex-col border-0">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">
                    {test.title || "Untitled Test"}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {test.subject && <span>{test.subject}</span>}
                    {test.durationMinutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {test.durationMinutes} min
                      </span>
                    )}
                    {test.questionsCount && <span>{test.questionsCount} Qs</span>}
                  </div>
                  <Button size="sm" className="gradient-bg mt-auto w-full rounded-lg" asChild>
                    <Link to={`/student/tests/${test.id}`}>Start Test</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <StudentMetricCard
          title="Current Rank"
          value={rank ? `#${rank}` : "—"}
          subtitle={totalParticipants ? `out of ${totalParticipants}` : "in your coaching"}
          icon={TrendingUp}
          color="peach"
        />
        <StudentMetricCard
          title="Avg Accuracy"
          value={`${avgScore}%`}
          icon={Target}
          color="yellow"
        />
      </div>

      {/* Leaderboard Preview + Score Trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leaderboard */}
        <Card className="card-soft border-0">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-amber-500" />
              Top Performers
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/student/rankings">
                Full Rankings <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No rankings yet. Be the first!
              </p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry) => {
                  const isMe = entry.studentId === firebaseUser?.uid;
                  const rankColors: Record<number, string> = {
                    1: "text-amber-500",
                    2: "text-slate-500",
                    3: "text-orange-500",
                  };
                  return (
                    <div
                      key={entry.rank}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isMe ? "bg-primary/10 font-semibold" : ""}`}
                    >
                      <span
                        className={`w-6 text-sm font-bold ${rankColors[entry.rank] || "text-muted-foreground"}`}
                      >
                        #{entry.rank}
                      </span>
                      <span className="flex-1 truncate text-sm">
                        {isMe ? "You" : entry.name.split(" ")[0]}
                      </span>
                      <Badge variant="secondary" className="rounded-full text-xs">
                        {entry.score}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score Trend */}
        <Card className="card-soft border-0">
          <CardHeader>
            <CardTitle className="text-lg">Score Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={{ borderRadius: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Subject Performance */}
      {subjectPerformance.length > 0 && (
        <Card className="card-soft border-0">
          <CardHeader>
            <CardTitle className="text-lg">Subject Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={subjectPerformance}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="subject" className="text-xs" tick={{ fontSize: 10 }} />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={{ borderRadius: "12px" }} />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
