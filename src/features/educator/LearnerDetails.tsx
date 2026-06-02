import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, MoreVertical, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@shared/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu";
import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { toast } from "sonner";

type LearnerDoc = {
  uid?: string;
  name?: string;
  email?: string;
  status?: string;
  joinedAt?: any;
  lastSeenAt?: any;
  updatedAt?: any;
};

type UserDoc = {
  displayName?: string;
  name?: string;
  photoURL?: string;
  avatar?: string;
};

type AttemptDoc = {
  id: string;
  studentId?: string;
  testId?: string;
  testTitle?: string;
  subject?: string;
  status?: string;
  createdAt?: any;
  submittedAt?: any;
  score?: number;
  maxScore?: number;
  timeTakenSec?: number;
  timeSpent?: number;
};

type StudentStatCard = {
  label: string;
  value: string;
  hint: string;
};

type StudentTrendPoint = {
  date: string;
  score: number;
};

type StudentSubjectPoint = {
  subject: string;
  score: number;
};

type StudentRecentAttempt = {
  id: string;
  title: string;
  subject: string;
  status: string;
  scoreLabel: string;
  timeLabel: string;
  dateLabel: string;
};

type StudentDive = {
  avgScore: number;
  completedAttempts: number;
  strongestSubject: string;
  weakestSubject: string;
  scoreTrend: StudentTrendPoint[];
  subjectPerformance: StudentSubjectPoint[];
  recentAttempts: StudentRecentAttempt[];
  statCards: StudentStatCard[];
  classAvgDelta: number;
  firstLastDelta: number;
  activeDays: number;
};

function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.now();
}

function isCompletedStatus(status?: string) {
  const s = String(status || "").toLowerCase();
  return ["completed", "submitted", "finished", "done"].includes(s);
}

function average(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}

function getAttemptTimeSeconds(a: AttemptDoc) {
  const direct = safeNum(a.timeTakenSec, NaN);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return Math.max(0, safeNum(a.timeSpent, 0));
}

function formatMinutes(seconds: number) {
  if (!seconds) return "0 min";
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

function formatShortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatShortDateTime(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(ms?: number) {
  if (!ms) return "-";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))} hr ago`;
  if (diff < 7 * 86_400_000) return `${Math.max(1, Math.round(diff / 86_400_000))} day ago`;
  return formatShortDate(ms);
}

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function getLearnerName(learner: LearnerDoc | null, profile: UserDoc | null) {
  if (!learner) return "Student";
  return profile?.displayName || profile?.name || learner.name || learner.email || "Student";
}

export default function LearnerDetails() {
  const nav = useNavigate();
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const { studentId = "" } = useParams<{ studentId: string }>();
  const { firebaseUser, profile, role, loading: authLoading } = useAuth();

  const educatorId = profile?.educatorId || firebaseUser?.uid || null;

  const [learner, setLearner] = useState<LearnerDoc | null>(null);
  const [learnerProfile, setLearnerProfile] = useState<UserDoc | null>(null);
  const [learnerAttempts, setLearnerAttempts] = useState<AttemptDoc[]>([]);
  const [classAttempts, setClassAttempts] = useState<AttemptDoc[]>([]);

  const [learnerLoaded, setLearnerLoaded] = useState(false);
  const [attemptsLoaded, setAttemptsLoaded] = useState(false);
  const [classAttemptsLoaded, setClassAttemptsLoaded] = useState(false);
  const [seatActive, setSeatActive] = useState(false);
  const [actionBusy, setActionBusy] = useState<"revoke-seat" | "delete" | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && role && role !== "EDUCATOR" && role !== "ADMIN") {
      nav("/login?role=educator");
    }
  }, [authLoading, role, nav]);

  useEffect(() => {
    if (!educatorId || !studentId) return;

    const unsubLearner = onSnapshot(
      doc(db, "educators", educatorId, "students", studentId),
      (snap) => {
        setLearner(snap.exists() ? (snap.data() as LearnerDoc) : null);
        setLearnerLoaded(true);
      },
      () => {
        setLearner(null);
        setLearnerLoaded(true);
      }
    );

    const unsubLearnerAttempts = onSnapshot(
      query(
        collection(db, "attempts"),
        where("educatorId", "==", educatorId),
        where("studentId", "==", studentId)
      ),
      (snap) => {
        setLearnerAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setAttemptsLoaded(true);
      },
      () => {
        setLearnerAttempts([]);
        setAttemptsLoaded(true);
      }
    );

    const unsubClassAttempts = onSnapshot(
      query(collection(db, "attempts"), where("educatorId", "==", educatorId)),
      (snap) => {
        setClassAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setClassAttemptsLoaded(true);
      },
      () => {
        setClassAttempts([]);
        setClassAttemptsLoaded(true);
      }
    );

    const unsubSeat = onSnapshot(
      doc(db, "educators", educatorId, "billingSeats", studentId),
      (snap) => {
        if (!snap.exists()) {
          setSeatActive(false);
          return;
        }
        const status = String((snap.data() as any)?.status || "").toLowerCase();
        setSeatActive(status === "active");
      },
      () => setSeatActive(false)
    );

    (async () => {
      try {
        const profileSnap = await getDoc(doc(db, "users", studentId));
        setLearnerProfile(profileSnap.exists() ? (profileSnap.data() as UserDoc) : null);
      } catch {
        setLearnerProfile(null);
      }
    })();

    return () => {
      unsubLearner();
      unsubLearnerAttempts();
      unsubClassAttempts();
      unsubSeat();
    };
  }, [educatorId, studentId]);

  async function postWithToken(path: string, body: any) {
    if (!firebaseUser) throw new Error("Not logged in");
    const token = await firebaseUser.getIdToken();
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Request failed");
    return data;
  }

  const handleRevokeSeat = async () => {
    if (!seatActive) {
      toast.info("Seat is not active for this learner.");
      return;
    }
    setActionBusy("revoke-seat");
    try {
      await postWithToken("/api/billing/revoke-seat", { studentId: studentId });
      toast.success("Seat revoked");
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke seat");
    } finally {
      setActionBusy(null);
    }
  };

  const handleDeleteStudent = async () => {
    setActionBusy("delete");
    try {
      await postWithToken("/api/tenant/delete-student", { studentId });
      toast.success("Student deleted");
      nav(-1);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete student");
      setActionBusy(null);
    }
  };

  const ready = learnerLoaded && attemptsLoaded && classAttemptsLoaded;

  const dive = useMemo<StudentDive | null>(() => {
    if (!learner) return null;

    const learnerUid = String(learner.uid || "").trim();
    const attempts =
      learnerAttempts.length > 0
        ? [...learnerAttempts]
        : classAttempts.filter((a) => {
            const sid = String(a.studentId || "").trim();
            if (!sid) return false;
            return sid === studentId || (learnerUid && sid === learnerUid);
          });
    const completed = attempts.filter((a) => isCompletedStatus(a.status));
    const classCompleted = classAttempts.filter((a) => isCompletedStatus(a.status));

    const completedScores = completed.map((a) => safeNum(a.score, 0));
    const avgStudentScore = completedScores.length ? average(completedScores) : 0;
    const bestScore = completedScores.length ? Math.max(...completedScores) : 0;
    const avgStudentTime = completed.length
      ? average(completed.map((a) => getAttemptTimeSeconds(a)))
      : 0;
    const classAvgScore = classCompleted.length
      ? average(classCompleted.map((a) => safeNum(a.score, 0)))
      : 0;

    const sortedCompleted = [...completed].sort(
      (a, b) => toMillis(a.submittedAt || a.createdAt) - toMillis(b.submittedAt || b.createdAt)
    );
    const firstScore = sortedCompleted.length ? safeNum(sortedCompleted[0].score, 0) : 0;
    const lastScore = sortedCompleted.length
      ? safeNum(sortedCompleted[sortedCompleted.length - 1].score, 0)
      : 0;

    const scoreTrend = sortedCompleted.slice(-12).map((a) => ({
      date: formatShortDate(toMillis(a.submittedAt || a.createdAt)),
      score: safeNum(a.score, 0),
    }));

    const subjectAgg = new Map<string, { sum: number; count: number }>();
    for (const a of completed) {
      const subject = String(a.subject || "General").trim() || "General";
      const existing = subjectAgg.get(subject) || { sum: 0, count: 0 };
      existing.sum += safeNum(a.score, 0);
      existing.count += 1;
      subjectAgg.set(subject, existing);
    }

    const subjectPerformance = Array.from(subjectAgg.entries())
      .map(([subject, value]) => ({
        subject,
        score: value.count ? Math.round(value.sum / value.count) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const strongestSubject = subjectPerformance[0]?.subject || "-";
    const weakestSubject = subjectPerformance.length
      ? subjectPerformance[subjectPerformance.length - 1].subject
      : "-";

    const recentAttempts = [...attempts]
      .sort(
        (a, b) => toMillis(b.submittedAt || b.createdAt) - toMillis(a.submittedAt || a.createdAt)
      )
      .slice(0, 8)
      .map((a) => ({
        id: a.id,
        title: String(a.testTitle || a.testId || "Test"),
        subject: String(a.subject || "General"),
        status: String(a.status || "unknown"),
        scoreLabel: isCompletedStatus(a.status)
          ? `${safeNum(a.score, 0)}/${safeNum(a.maxScore, 0)}`
          : "In progress",
        timeLabel: isCompletedStatus(a.status) ? formatMinutes(getAttemptTimeSeconds(a)) : "-",
        dateLabel: formatShortDateTime(toMillis(a.submittedAt || a.createdAt)),
      }));

    const activeDays = new Set(
      attempts.map((a) => new Date(toMillis(a.submittedAt || a.createdAt)).toDateString())
    ).size;

    const statCards: StudentStatCard[] = [
      {
        label: "Attempts",
        value: String(attempts.length),
        hint: `${completed.length} completed`,
      },
      {
        label: "Completed Tests",
        value: String(completed.length),
        hint: `${attempts.length - completed.length} pending/incomplete`,
      },
      {
        label: "Best Score",
        value: String(bestScore),
        hint:
          strongestSubject !== "-" ? `Best subject: ${strongestSubject}` : "Awaiting subject data",
      },
      {
        label: "Completion Rate",
        value: `${attempts.length ? Math.round((completed.length / attempts.length) * 100) : 0}%`,
        hint: `${attempts.length - completed.length} unfinished attempts`,
      },
      {
        label: "Strongest",
        value: strongestSubject,
        hint: strongestSubject !== "-" ? "Top performing subject" : "Awaiting subject data",
      },
      {
        label: "Needs Work",
        value: weakestSubject,
        hint: weakestSubject !== "-" ? "Priority focus subject" : "Need more attempts to compare",
      },
    ];

    return {
      avgScore: avgStudentScore,
      completedAttempts: completed.length,
      strongestSubject,
      weakestSubject,
      scoreTrend,
      subjectPerformance,
      recentAttempts,
      statCards,
      classAvgDelta: avgStudentScore - classAvgScore,
      firstLastDelta: lastScore - firstScore,
      activeDays,
    };
  }, [learner, learnerAttempts, classAttempts]);

  if (authLoading || !ready) {
    return <div className="p-6 text-muted-foreground">Loading learner details...</div>;
  }

  if (!learner) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="outline" onClick={() => nav("/educator/learners")}>
          Back to Learners
        </Button>
        <Card>
          <CardContent className="p-6 text-muted-foreground">
            Learner not found for this educator.
          </CardContent>
        </Card>
      </div>
    );
  }

  const learnerName = getLearnerName(learner, learnerProfile);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Learner Deep Dive</h1>
          <p className="text-sm text-muted-foreground">
            Detailed analytics and progress for this learner.
          </p>
        </div>
        {!isApp && (
          <Button variant="outline" onClick={() => nav("/educator/learners")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Learners
          </Button>
        )}
      </div>

      <Card className="overflow-hidden border-0 shadow-lg">
        <CardContent className="p-0">
          <div className="gradient-bg p-4 text-white sm:p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar className="h-14 w-14 shadow-xl ring-4 ring-white/35">
                  <AvatarImage
                    src={learnerProfile?.photoURL || learnerProfile?.avatar || undefined}
                  />
                  <AvatarFallback className="bg-white/20 font-semibold text-white">
                    {initials(learnerName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold leading-tight">{learnerName}</p>
                  <p className="truncate text-sm text-white/85">{learner.email || "No email"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge className="border-white/30 bg-white/15 text-white hover:bg-white/20">
                      Joined {formatRelativeTime(toMillis(learner.joinedAt))}
                    </Badge>
                    <Badge className="border-white/30 bg-white/10 text-white hover:bg-white/15">
                      Last seen{" "}
                      {formatRelativeTime(toMillis(learner.lastSeenAt || learner.updatedAt))}
                    </Badge>
                    <Badge className="border-white/30 bg-white/10 text-white hover:bg-white/15">
                      {String(learner.status || "Unknown")}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 md:items-center">
                <div className="text-sm text-white/85 md:text-right">
                  {dive
                    ? "Performance summary is available in the cards below."
                    : "No attempts found for this learner yet."}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-white/15 text-white hover:bg-white/25 hover:text-white"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onClick={handleRevokeSeat}
                      disabled={!seatActive || actionBusy !== null}
                    >
                      {actionBusy === "revoke-seat" ? "Revoking seat..." : "Revoke Seat"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={actionBusy !== null}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Student
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {dive && (
            <div className="border-t bg-muted/20 p-4 sm:p-6">
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
                {dive.statCards.map((item) => (
                  <Card key={item.label} className="bg-background/80">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-2xl font-bold">{item.value}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {dive && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Student Score Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dive.scoreTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" className="fill-muted-foreground text-xs" />
                      <YAxis className="fill-muted-foreground text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(204, 91%, 56%)"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {dive.scoreTrend.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Need submitted attempts to render trend.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Subject-wise Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dive.subjectPerformance}
                      layout="vertical"
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="fill-muted-foreground text-xs" />
                      <YAxis
                        dataKey="subject"
                        type="category"
                        width={100}
                        className="fill-muted-foreground text-xs"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                        }}
                      />
                      <Bar dataKey="score" fill="hsl(184, 87%, 65%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {dive.subjectPerformance.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No completed subject data available.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Recent Attempts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dive.recentAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{attempt.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {attempt.subject} • {attempt.dateLabel}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge variant="outline">{attempt.status}</Badge>
                      <Badge variant="secondary">{attempt.scoreLabel}</Badge>
                      <Badge variant="secondary">{attempt.timeLabel}</Badge>
                    </div>
                  </div>
                ))}
                {dive.recentAttempts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No attempts found for this learner.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coaching Signals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">Score vs class average</p>
                  <p
                    className={`mt-1 text-2xl font-bold ${dive.classAvgDelta >= 0 ? "text-green-600" : "text-amber-600"}`}
                  >
                    {dive.classAvgDelta >= 0 ? "+" : ""}
                    {dive.classAvgDelta}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">Improvement from first to latest</p>
                  <p
                    className={`mt-1 text-2xl font-bold ${dive.firstLastDelta >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {dive.firstLastDelta >= 0 ? "+" : ""}
                    {dive.firstLastDelta}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">Activity footprint</p>
                  <p className="mt-1 text-2xl font-bold">{dive.activeDays}</p>
                  <p className="mt-1 text-xs text-muted-foreground">days with attempt activity</p>
                </div>
                <div className="rounded-lg border border-dashed p-4">
                  <p className="text-sm font-medium">Recommended focus</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {dive.weakestSubject !== "-"
                      ? `Prioritize ${dive.weakestSubject}, then reinforce ${dive.strongestSubject}.`
                      : "Need more completed attempts to identify a clear focus topic."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Student
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="font-medium">{learner?.name || studentId}</p>
            <p className="text-sm text-muted-foreground">
              This will permanently remove the student from your institute, revoke their seat, and
              clear their enrollment. <strong>This action cannot be undone.</strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={actionBusy === "delete"}
              onClick={() => {
                setDeleteDialogOpen(false);
                handleDeleteStudent();
              }}
            >
              {actionBusy === "delete" ? "Deleting..." : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
