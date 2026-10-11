import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  GitBranch,
  GraduationCap,
  Users,
  CalendarCheck,
  Plus,
  Trash2,
  PenLine,
  FileText,
  Printer,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/tabs";
import { Input } from "@shared/ui/input";
import { Textarea } from "@shared/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";

import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { Skeleton } from "@shared/ui/skeleton";
import { cn } from "@shared/lib/utils";
import {
  AnalysisView,
  downloadCsv,
  topicsToCsv,
  type AnalysisData,
} from "@shared/components/analysis/AnalysisView";

type LearnerDoc = {
  uid?: string;
  name?: string;
  email?: string;
  status?: string;
  branchId?: string;
  courseId?: string;
  batchId?: string;
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
  pendingManualReviewCount?: number;
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

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

type StudentStatCard = {
  label: string;
  value: string;
  hint: string;
};

type SessionDoc = {
  id: string;
  date: string;
  subject?: string;
  status?: "present" | "absent" | "late";
};
type ManualGradeDoc = {
  id: string;
  title: string;
  subject?: string;
  marks: number;
  maxMarks: number;
  remark?: string;
  gradedAt?: any;
};

export default function StudentDetails() {
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

  const [branchName, setBranchName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [batchName, setBatchName] = useState("");

  const [learnerLoaded, setLearnerLoaded] = useState(false);
  const [attemptsLoaded, setAttemptsLoaded] = useState(false);
  const [seatActive, setSeatActive] = useState(false);
  const [actionBusy, setActionBusy] = useState<"revoke-seat" | "status" | null>(null);

  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [manualGrades, setManualGrades] = useState<ManualGradeDoc[]>([]);
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);
  const [gradeTitle, setGradeTitle] = useState("");
  const [gradeSubject, setGradeSubject] = useState("");
  const [gradeMarks, setGradeMarks] = useState("");
  const [gradeMax, setGradeMax] = useState("");
  const [gradeRemark, setGradeRemark] = useState("");

  const [report, setReport] = useState<AnalysisData | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportReloadKey, setReportReloadKey] = useState(0);

  // monkey-king has no faculty-facing report endpoint yet (only GET /api/reports/my, scoped
  // to the signed-in student) — read the same cached computation straight from Firestore
  // (users/{studentId}/reports/summary, written by monkey-king's report_manager.compute_report)
  // instead. See docs/agents/risks.md for the access-rule caveat.
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setReportLoading(true);
    setReportError(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", studentId, "reports", "summary"));
        if (cancelled) return;
        if (!snap.exists()) {
          setReport({
            status: "no_data",
            totalAttempts: 0,
            totalQuestionsAnalyzed: 0,
            topics: [],
            subjects: [],
          });
        } else {
          const d = snap.data() as any;
          const mapArea = (a: any, tone: "weak" | "strong") => ({
            subject: String(a?.subject || ""),
            chapter: String(a?.chapter || ""),
            topic: String(a?.topic || ""),
            accuracy: Number(a?.weighted_accuracy ?? 0),
            attempts: Number(a?.attempt_count ?? 0),
            tone,
          });
          setReport({
            status: d.status || "no_data",
            totalAttempts: Number(d.totalAttempts || 0),
            totalQuestionsAnalyzed: Number(d.totalQuestionsAnalyzed || 0),
            topics: [
              ...((d.weakAreasFull || []) as any[]).map((a) => mapArea(a, "weak")),
              ...((d.strongHoldsFull || []) as any[]).map((a) => mapArea(a, "strong")),
            ],
            subjects: ((d.subjectBreakdown || []) as any[]).map((s) => ({
              subject: String(s?.subject || ""),
              accuracy: Number(s?.weighted_accuracy ?? 0),
              trend: (s?.trend || "insufficient_data") as AnalysisData["subjects"][number]["trend"],
              attempts: Number(s?.attempt_count ?? 0),
            })),
          });
        }
      } catch {
        if (!cancelled) setReportError("Could not load this student's analysis.");
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, reportReloadKey]);

  useEffect(() => {
    if (!educatorId || !studentId) return;

    // Resolve Names
    const resolveAcademicNames = async (l: LearnerDoc) => {
      if (!l.branchId) return;
      try {
        const brSnap = await getDoc(doc(db, "educators", educatorId, "branches", l.branchId));
        if (brSnap.exists()) setBranchName(brSnap.data().name || l.branchId);

        if (l.courseId) {
          const cSnap = await getDoc(
            doc(db, "educators", educatorId, "branches", l.branchId, "courses", l.courseId)
          );
          if (cSnap.exists()) setCourseName(cSnap.data().name || l.courseId);

          if (l.batchId) {
            const bSnap = await getDoc(
              doc(
                db,
                "educators",
                educatorId,
                "branches",
                l.branchId,
                "courses",
                l.courseId,
                "batches",
                l.batchId
              )
            );
            if (bSnap.exists()) setBatchName(bSnap.data().name || l.batchId);
          }
        }
      } catch (err) {
        console.error("Error resolving academic names:", err);
      }
    };

    const unsubLearner = onSnapshot(
      doc(db, "educators", educatorId, "students", studentId),
      (snap) => {
        const data = snap.exists() ? (snap.data() as LearnerDoc) : null;
        setLearner(data);
        setLearnerLoaded(true);
        if (data) resolveAcademicNames(data);
      },
      () => setLearnerLoaded(true)
    );

    const unsubAttempts = onSnapshot(
      query(
        collection(db, "attempts"),
        where("educatorId", "==", educatorId),
        where("studentId", "==", studentId),
        orderBy("createdAt", "desc")
      ),
      (snap) => {
        setLearnerAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setAttemptsLoaded(true);
      },
      () => setAttemptsLoaded(true)
    );

    const unsubSeat = onSnapshot(
      doc(db, "educators", educatorId, "billingSeats", studentId),
      (snap) => {
        setSeatActive(
          snap.exists() && String(snap.data()?.status || "").toLowerCase() === "active"
        );
      }
    );

    (async () => {
      const pSnap = await getDoc(doc(db, "users", studentId));
      if (pSnap.exists()) setLearnerProfile(pSnap.data() as UserDoc);
    })();

    return () => {
      unsubLearner();
      unsubAttempts();
      unsubSeat();
    };
  }, [educatorId, studentId]);

  // Attendance sessions for this student's batch
  useEffect(() => {
    if (!educatorId || !learner?.branchId || !learner?.courseId || !learner?.batchId) {
      setSessions([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          learner.branchId,
          "courses",
          learner.courseId,
          "batches",
          learner.batchId,
          "sessions"
        ),
        orderBy("date", "desc")
      ),
      (snap) => {
        setSessions(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              date: String(data.date || d.id),
              subject: data.subject ? String(data.subject) : undefined,
              status: (data.attendance || {})[studentId],
            };
          })
        );
      }
    );
    return () => unsub();
  }, [educatorId, learner?.branchId, learner?.courseId, learner?.batchId, studentId]);

  // Manual grades for this student
  useEffect(() => {
    if (!educatorId || !studentId) return;
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "students", studentId, "manualGrades"),
      (snap) => {
        setManualGrades(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }
    );
    return () => unsub();
  }, [educatorId, studentId]);

  async function addManualGrade() {
    if (!educatorId || !studentId || !gradeTitle.trim() || !gradeMarks || !gradeMax) return;
    try {
      await addDoc(collection(db, "educators", educatorId, "students", studentId, "manualGrades"), {
        title: gradeTitle.trim(),
        subject: gradeSubject.trim() || null,
        marks: Number(gradeMarks),
        maxMarks: Number(gradeMax),
        remark: gradeRemark.trim() || null,
        gradedBy: educatorId,
        gradedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      });
      setGradeDialogOpen(false);
      setGradeTitle("");
      setGradeSubject("");
      setGradeMarks("");
      setGradeMax("");
      setGradeRemark("");
      toast.success("Grade added");
    } catch {
      toast.error("Failed to add grade");
    }
  }

  async function deleteManualGrade(gradeId: string) {
    if (!educatorId || !studentId) return;
    if (!window.confirm("Delete this grade entry?")) return;
    try {
      await deleteDoc(
        doc(db, "educators", educatorId, "students", studentId, "manualGrades", gradeId)
      );
      toast.success("Grade removed");
    } catch {
      toast.error("Failed to remove grade");
    }
  }

  const ready = learnerLoaded && attemptsLoaded;

  const dive = useMemo(() => {
    if (!learner) return null;
    const completed = learnerAttempts.filter((a) => isCompletedStatus(a.status));
    const completedScores = completed.map((a) => safeNum(a.score, 0));
    const bestScore = completedScores.length ? Math.max(...completedScores) : 0;

    const scoreTrend = [...completed]
      .sort(
        (a, b) => toMillis(a.submittedAt || a.createdAt) - toMillis(b.submittedAt || b.createdAt)
      )
      .slice(-10)
      .map((a) => ({
        date: formatShortDate(toMillis(a.submittedAt || a.createdAt)),
        score: safeNum(a.score, 0),
      }));

    const subjMap = new Map<string, { sum: number; count: number }>();
    completed.forEach((a) => {
      const s = a.subject || "General";
      const e = subjMap.get(s) || { sum: 0, count: 0 };
      e.sum += safeNum(a.score, 0);
      e.count++;
      subjMap.set(s, e);
    });

    const subjectPerformance = Array.from(subjMap.entries())
      .map(([subject, { sum, count }]) => ({
        subject,
        score: Math.round(sum / count),
      }))
      .sort((a, b) => b.score - a.score);

    const strongestSubject = subjectPerformance[0]?.subject || "-";
    const weakestSubject = subjectPerformance.length
      ? subjectPerformance[subjectPerformance.length - 1].subject
      : "-";

    const statCards: StudentStatCard[] = [
      {
        label: "Attempts",
        value: String(learnerAttempts.length),
        hint: `${completed.length} completed`,
      },
      {
        label: "Completed Tests",
        value: String(completed.length),
        hint: `${learnerAttempts.length - completed.length} pending`,
      },
      {
        label: "Best Score",
        value: `${bestScore}%`,
        hint: strongestSubject !== "-" ? `In ${strongestSubject}` : "Awaiting data",
      },
      {
        label: "Completion Rate",
        value: `${learnerAttempts.length ? Math.round((completed.length / learnerAttempts.length) * 100) : 0}%`,
        hint: "Total consistency",
      },
      {
        label: "Strongest",
        value: strongestSubject,
        hint: "Top performance",
      },
      {
        label: "Needs Work",
        value: weakestSubject,
        hint: "Priority focus",
      },
    ];

    return {
      scoreTrend,
      subjectPerformance,
      recentAttempts: learnerAttempts.slice(0, 10),
      statCards,
    };
  }, [learner, learnerAttempts]);

  if (authLoading || !ready) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!learner)
    return <div className="p-12 text-center text-muted-foreground">Student not found.</div>;

  const learnerName =
    learnerProfile?.displayName || learnerProfile?.name || learner.name || "Student";

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 p-6 duration-700 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          {!isApp && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => nav("/educator/students")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{learnerName}</h1>
            <p className="text-muted-foreground">{learner.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {branchName && (
            <Badge
              variant="secondary"
              className="border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-indigo-600"
            >
              <GitBranch className="mr-1.5 h-3 w-3" />
              {branchName}
            </Badge>
          )}
          {courseName && (
            <Badge
              variant="secondary"
              className="border-purple-500/20 bg-purple-500/10 px-3 py-1 text-purple-600"
            >
              <GraduationCap className="mr-1.5 h-3 w-3" />
              {courseName}
            </Badge>
          )}
          {batchName && (
            <Badge
              variant="secondary"
              className="border-blue-500/20 bg-blue-500/10 px-3 py-1 text-blue-600"
            >
              <Users className="mr-1.5 h-3 w-3" />
              {batchName}
            </Badge>
          )}
          <Badge
            className={cn(
              "px-3 py-1",
              learner.status?.toUpperCase() === "ACTIVE"
                ? "border-green-500/20 bg-green-500/10 text-green-600"
                : "border-zinc-500/20 bg-zinc-500/10 text-zinc-600"
            )}
          >
            {learner.status?.toUpperCase() || "UNKNOWN"}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8 pt-4">
          {/* Stat Cards */}
          {dive?.statCards && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {dive.statCards.map((card) => (
                <Card
                  key={card.label}
                  className="group border-border/50 transition-colors hover:border-primary/50"
                >
                  <CardContent className="space-y-1 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="text-2xl font-bold">{card.value}</p>
                    <p className="text-[10px] font-medium text-muted-foreground">{card.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Score Progression</CardTitle>
                <CardDescription>
                  Visualizing performance trend across last 10 tests
                </CardDescription>
              </CardHeader>
              <CardContent className="h-80 pt-4">
                {dive?.scoreTrend.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dive.scoreTrend}>
                      <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        className="stroke-muted/30"
                      />
                      <XAxis dataKey="date" className="text-[10px] font-bold" />
                      <YAxis domain={[0, 100]} className="text-[10px] font-bold" />
                      <Tooltip contentStyle={{ borderRadius: "12px" }} />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        fill="url(#colorScore)"
                        strokeWidth={3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed text-sm text-muted-foreground">
                    No trend data available.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Subject Performance</CardTitle>
                <CardDescription>Accuracy distribution by domain</CardDescription>
              </CardHeader>
              <CardContent className="h-80 pt-4">
                {dive?.subjectPerformance.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dive.subjectPerformance} layout="vertical">
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        className="stroke-muted/30"
                      />
                      <XAxis type="number" hide domain={[0, 100]} />
                      <YAxis
                        dataKey="subject"
                        type="category"
                        className="text-[10px] font-bold"
                        width={80}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="score"
                        fill="hsl(var(--primary))"
                        radius={[0, 4, 4, 0]}
                        barSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed text-sm text-muted-foreground">
                    No subject data available.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Attempts List */}
          <Card className="overflow-hidden border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Recent Attempts</CardTitle>
              <CardDescription>Detailed log of latest test participation</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-y border-border/50 bg-muted/30">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Test Title
                      </th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Status
                      </th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Score
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {learnerAttempts.slice(0, 10).map((a) => (
                      <tr
                        key={a.id}
                        className="cursor-pointer transition-colors hover:bg-muted/20"
                        onClick={() => nav(`/educator/attempts/${a.id}`)}
                      >
                        <td className="px-6 py-4 text-sm font-semibold">
                          <span>{a.testTitle || a.testId}</span>
                          {(a.pendingManualReviewCount ?? 0) > 0 && (
                            <Link
                              to={`/educator/review-submissions/${a.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge className="ml-2 bg-amber-100 text-xs text-amber-700">
                                {a.pendingManualReviewCount} pending
                              </Badge>
                            </Link>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-none px-2 py-0.5 text-[10px] font-bold uppercase",
                              isCompletedStatus(a.status)
                                ? "bg-green-500/10 text-green-600"
                                : "bg-amber-500/10 text-amber-600"
                            )}
                          >
                            {a.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold">
                          {isCompletedStatus(a.status) ? `${a.score}/${a.maxScore}` : "—"}
                        </td>
                        <td className="px-6 py-4 text-right text-xs font-medium text-muted-foreground">
                          {formatShortDateTime(toMillis(a.submittedAt || a.createdAt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarCheck className="h-5 w-5" />
                  Attendance
                </CardTitle>
                <CardDescription>
                  {sessions.filter((s) => s.status).length > 0
                    ? `${Math.round(
                        (sessions.filter((s) => s.status === "present" || s.status === "late")
                          .length /
                          sessions.filter((s) => s.status).length) *
                          100
                      )}% attendance across ${sessions.filter((s) => s.status).length} sessions`
                    : "No sessions recorded yet"}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sessions.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No attendance sessions recorded for this batch yet.
                </p>
              ) : (
                <div className="divide-y divide-border/50">
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="text-sm">
                          {(() => {
                            try {
                              return format(parseISO(s.date), "EEEE, MMM d, yyyy");
                            } catch {
                              return s.date;
                            }
                          })()}
                        </p>
                        {s.subject && <p className="text-xs text-muted-foreground">{s.subject}</p>}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs capitalize",
                          s.status === "present" &&
                            "border-green-200 bg-green-500/10 text-green-700",
                          s.status === "late" && "border-amber-200 bg-amber-500/10 text-amber-700",
                          s.status === "absent" && "border-red-200 bg-red-500/10 text-red-700",
                          !s.status && "text-muted-foreground"
                        )}
                      >
                        {s.status || "Not marked"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades" className="pt-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <GraduationCap className="h-5 w-5" />
                  Grades
                </CardTitle>
                <CardDescription>Test scores plus any manually added grades</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to={`/educator/students/${studentId}/report-card`} target="_blank">
                    <Printer className="h-3.5 w-3.5" />
                    Report Card
                  </Link>
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => setGradeDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Grade
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {learnerAttempts
                  .filter((a) => isCompletedStatus(a.status))
                  .map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-6 py-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.testTitle || a.testId}</p>
                          <p className="text-xs text-muted-foreground">
                            {[a.subject, formatShortDate(toMillis(a.submittedAt || a.createdAt))]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Test
                      </Badge>
                      <span className="shrink-0 text-sm font-semibold">
                        {a.score}
                        <span className="text-muted-foreground"> / {a.maxScore}</span>
                      </span>
                    </div>
                  ))}
                {manualGrades.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{g.title}</p>
                        <p className="text-xs text-muted-foreground">{g.subject}</p>
                        {g.remark && (
                          <p className="mt-0.5 text-xs italic text-muted-foreground">{g.remark}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Manual
                    </Badge>
                    <span className="shrink-0 text-sm font-semibold">
                      {g.marks}
                      <span className="text-muted-foreground"> / {g.maxMarks}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive"
                      onClick={() => deleteManualGrade(g.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {learnerAttempts.filter((a) => isCompletedStatus(a.status)).length === 0 &&
                  manualGrades.length === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      No grades recorded yet.
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="pt-4">
          <AnalysisView
            loading={reportLoading}
            error={reportError}
            onRetry={() => setReportReloadKey((k) => k + 1)}
            data={report}
            onPracticeTopic={() => nav("/educator/dpp")}
            noDataHint="This student hasn't taken enough tests yet to unlock topic-level analysis."
          />
          {report && report.topics.length > 0 && (
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => nav("/educator/dpp")}
              >
                Assign practice
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv(`${learner?.name || studentId}-analysis.csv`, topicsToCsv(report))}
              >
                Export
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={gradeDialogOpen} onOpenChange={setGradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Grade</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title (e.g. Class Participation)"
              value={gradeTitle}
              onChange={(e) => setGradeTitle(e.target.value)}
            />
            <Input
              placeholder="Subject (optional)"
              value={gradeSubject}
              onChange={(e) => setGradeSubject(e.target.value)}
            />
            <div className="flex gap-3">
              <Input
                type="number"
                placeholder="Marks"
                value={gradeMarks}
                onChange={(e) => setGradeMarks(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Max marks"
                value={gradeMax}
                onChange={(e) => setGradeMax(e.target.value)}
              />
            </div>
            <Textarea
              placeholder="Remark (optional)"
              value={gradeRemark}
              onChange={(e) => setGradeRemark(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={addManualGrade}
              disabled={!gradeTitle.trim() || !gradeMarks || !gradeMax}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
