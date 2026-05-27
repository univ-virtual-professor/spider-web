import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Target, TrendingUp, Users } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";

import { toast } from "sonner";

import { db } from "@shared/lib/firebase";
import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";

import DashboardStatsGrid from "./components/DashboardStatsGrid";
import AttemptsAnalyticsChart from "./components/AttemptsAnalyticsChart";
import RecentActivityFeed from "./components/RecentActivityFeed";
import StudentHealthOverview from "./components/StudentHealthOverview";
import TopPerformersLeaderboard from "./components/TopPerformersLeaderboard";

type BranchDoc = { id: string; name: string };
type CourseDoc = { id: string; name: string; branchId: string };
type BatchDoc = { id: string; name: string; courseId: string; branchId: string };

type UserDoc = {
  displayName?: string;
  name?: string;
  photoURL?: string;
  avatar?: string;
  batch?: string;
  batchName?: string;
};

type LearnerDoc = {
  uid?: string;
  name?: string;
  email?: string;
  status?: string;
  tenantSlug?: string;
  branchId?: string;
  courseId?: string;
  batchId?: string;
  joinedAt?: any;
  lastSeenAt?: any;
  updatedAt?: any;
};

type AttemptDoc = {
  educatorId?: string;
  studentId?: string;
  createdAt?: any;
  submittedAt?: any;

  status?: string;
  subject?: string;

  testId?: string;
  testTitle?: string;

  score?: number;
  maxScore?: number;
  accuracy?: number;
  timeTakenSec?: number;
  timeSpent?: number;
  correctCount?: number;
  incorrectCount?: number;
  unansweredCount?: number;
};

type GrowthPoint = { date: string; students: number; active: number };
type PieSlice = { name: string; value: number; color: string };
type TopPerformer = {
  studentId: string;
  name: string;
  avatarSeed: string;
  score: number;
  tests: number;
};
type Struggling = {
  studentId: string;
  name: string;
  avatarSeed: string;
  score: number;
  weakness: string;
};
type TestAgg = { name: string; attempts: number; avgScore: number };
type BatchAgg = {
  batch: string;
  avgScore: number;
  students: number;
  growth: number;
};
type LearnerRow = { id: string; data: LearnerDoc; profile: UserDoc | null };
type AttemptRow = { id: string; data: AttemptDoc };
type StudentStatCard = { label: string; value: string; hint: string };
type StudentTrendPoint = { date: string; score: number };
type StudentSubjectPoint = { subject: string; score: number };
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
  totalAttempts: number;
  completedAttempts: number;
  avgScore: number;
  bestScore: number;
  completionRate: number;
  avgTimeSec: number;
  firstLastDelta: number;
  classAvgDelta: number;
  activeDays: number;
  strongestSubject: string;
  weakestSubject: string;
  scoreTrend: StudentTrendPoint[];
  subjectPerformance: StudentSubjectPoint[];
  recentAttempts: StudentRecentAttempt[];
};

const PIE_COLORS = [
  "hsl(204, 91%, 56%)",
  "hsl(184, 87%, 65%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(271, 81%, 56%)",
  "hsl(0, 84%, 60%)",
  "hsl(199, 89%, 48%)",
];

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.now();
}

function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAccuracy(a: AttemptDoc) {
  if (a.accuracy != null) {
    const n = Number(a.accuracy);
    if (!Number.isFinite(n)) return 0;
    const pct = n <= 1.01 ? n * 100 : n;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }
  const score = safeNum(a.score, 0);
  const maxScore = safeNum(a.maxScore, 0);
  if (!maxScore) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

function isCompletedStatus(status?: string) {
  const s = String(status || "").toLowerCase();
  return ["completed", "submitted", "finished", "done"].includes(s);
}

function isActiveStatus(status?: string) {
  const s = String(status || "").toLowerCase();
  return s === "active";
}

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function formatCompactInt(n: number) {
  return n.toLocaleString();
}

function pctChange(curr: number, prev: number) {
  if (prev <= 0 && curr <= 0) return 0;
  if (prev <= 0) return 100;
  return Math.round(((curr - prev) / prev) * 100);
}

function formatMinutes(seconds: number) {
  if (!seconds) return "0 min";
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

function weekLabel(i: number) {
  return `Week ${i}`;
}

function formatShortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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
  if (!ms) return "—";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))} hr ago`;
  if (diff < 7 * 86_400_000) return `${Math.max(1, Math.round(diff / 86_400_000))} day ago`;
  return formatShortDate(ms);
}

function average(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}

function getLearnerName(learner: LearnerRow | null) {
  if (!learner) return "Student";
  return (
    learner.profile?.displayName ||
    learner.profile?.name ||
    learner.data.name ||
    learner.data.email ||
    "Student"
  );
}

function getAttemptTimeSeconds(a: AttemptDoc) {
  const direct = safeNum(a.timeTakenSec, NaN);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return Math.max(0, safeNum(a.timeSpent, 0));
}

export default function Analytics() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const isApp = new URLSearchParams(window.location.search).get("_app") === "1" || window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";

  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [periodDays, setPeriodDays] = useState<string>("30");
  const days = useMemo(() => Number(periodDays), [periodDays]);

  const [loading, setLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("__all__");

  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [periodAttempts, setPeriodAttempts] = useState<AttemptRow[]>([]);

  const [totalStudents, setTotalStudents] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [avgScore, setAvgScore] = useState(0);
  const [avgTime, setAvgTime] = useState(0);
  const [completionRate, setCompletionRate] = useState(0);

  const [studentsChange, setStudentsChange] = useState(0);
  const [attemptsChange, setAttemptsChange] = useState(0);
  const [avgScoreChange, setAvgScoreChange] = useState(0);
  const [avgTimeChange, setAvgTimeChange] = useState(0);

  const [studentGrowthData, setStudentGrowthData] = useState<GrowthPoint[]>([]);
  const [attemptsTrendData, setAttemptsTrendData] = useState<{ date: string; attempts: number }[]>(
    []
  );
  const [attemptDistribution, setAttemptDistribution] = useState<PieSlice[]>([]);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);
  const [strugglingStudents, setStrugglingStudents] = useState<Struggling[]>([]);
  const [mostAttemptedTests, setMostAttemptedTests] = useState<TestAgg[]>([]);
  const [batchComparisonData, setBatchComparisonData] = useState<BatchAgg[]>([]);

  // Dashboard filter states
  const [allBranches, setAllBranches] = useState<BranchDoc[]>([]);
  const [allCourses, setAllCourses] = useState<CourseDoc[]>([]);
  const [allBatches, setAllBatches] = useState<BatchDoc[]>([]);

  const [selectedBranchName, setSelectedBranchName] = useState<string>("All");
  const [selectedCourseName, setSelectedCourseName] = useState<string>("All");
  const [selectedBatchName, setSelectedBatchName] = useState<string>("All");

  const [isDataFiltering, setIsDataFiltering] = useState(false);

  const uniqueBranches = useMemo(
    () => Array.from(new Set(allBranches.map((b) => b.name))).sort(),
    [allBranches]
  );
  const uniqueCourses = useMemo(
    () => Array.from(new Set(allCourses.map((c) => c.name))).sort(),
    [allCourses]
  );
  const uniqueBatches = useMemo(
    () => Array.from(new Set(allBatches.map((b) => b.name))).sort(),
    [allBatches]
  );

  const canLoad = useMemo(() => {
    return !authLoading && !tenantLoading && !!firebaseUser?.uid && !!educatorId;
  }, [authLoading, tenantLoading, firebaseUser?.uid, educatorId]);

  const getDateRanges = useCallback(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);

    const prevEnd = new Date(start.getTime());
    prevEnd.setMilliseconds(-1);

    const prevStart = new Date(start.getTime());
    prevStart.setDate(prevStart.getDate() - days);
    prevStart.setHours(0, 0, 0, 0);

    return {
      start,
      end,
      prevStart,
      prevEnd,
      startTs: Timestamp.fromDate(start),
      endTs: Timestamp.fromDate(end),
      prevStartTs: Timestamp.fromDate(prevStart),
      prevEndTs: Timestamp.fromDate(prevEnd),
    };
  }, [days]);

  const fetchUserProfiles = useCallback(async (studentIds: string[]) => {
    const uniqueIds = Array.from(new Set(studentIds.filter(Boolean)));
    const out: Record<string, UserDoc | null> = {};
    await Promise.all(
      uniqueIds.map(async (sid) => {
        try {
          const snap = await getDoc(doc(db, "users", sid));
          out[sid] = snap.exists() ? (snap.data() as UserDoc) : null;
        } catch {
          out[sid] = null;
        }
      })
    );
    return out;
  }, []);

  const loadAnalytics = useCallback(async () => {
    if (!canLoad || !educatorId) return;

    setLoading(true);

    try {
      const { startTs, endTs, prevStartTs, prevEndTs, start } = getDateRanges();
      const learnersCol = collection(db, "educators", educatorId, "students");

      const [
        studentsAllSnap,
        newCurrSnap,
        newPrevSnap,
        learnersSnap,
        attemptsSnap,
        attemptsCountCurrSnap,
        attemptsCountPrevSnap,
        prevAttemptsSnap,
        baselineSnap,
        newLearnersSnap,
      ] = await Promise.all([
        getCountFromServer(query(learnersCol)),
        getCountFromServer(
          query(learnersCol, where("joinedAt", ">=", startTs), where("joinedAt", "<=", endTs))
        ),
        getCountFromServer(
          query(
            learnersCol,
            where("joinedAt", ">=", prevStartTs),
            where("joinedAt", "<=", prevEndTs)
          )
        ),
        getDocs(learnersCol),
        getDocs(
          query(
            collection(db, "attempts"),
            where("educatorId", "==", educatorId),
            where("createdAt", ">=", startTs),
            where("createdAt", "<=", endTs),
            orderBy("createdAt", "asc"),
            limit(5000)
          )
        ),
        getCountFromServer(
          query(
            collection(db, "attempts"),
            where("educatorId", "==", educatorId),
            where("createdAt", ">=", startTs),
            where("createdAt", "<=", endTs)
          )
        ),
        getCountFromServer(
          query(
            collection(db, "attempts"),
            where("educatorId", "==", educatorId),
            where("createdAt", ">=", prevStartTs),
            where("createdAt", "<=", prevEndTs)
          )
        ),
        getDocs(
          query(
            collection(db, "attempts"),
            where("educatorId", "==", educatorId),
            where("createdAt", ">=", prevStartTs),
            where("createdAt", "<=", prevEndTs),
            orderBy("createdAt", "asc"),
            limit(2000)
          )
        ),
        getCountFromServer(query(learnersCol, where("joinedAt", "<", Timestamp.fromDate(start)))),
        getDocs(
          query(
            learnersCol,
            where("joinedAt", ">=", startTs),
            where("joinedAt", "<=", endTs),
            orderBy("joinedAt", "asc"),
            limit(5000)
          )
        ),
      ]);

      const totalStudentsCount = studentsAllSnap.data().count;
      const newStudentsCurr = newCurrSnap.data().count;
      const newStudentsPrev = newPrevSnap.data().count;
      const attemptsCurrCount = attemptsCountCurrSnap.data().count;
      const attemptsPrevCount = attemptsCountPrevSnap.data().count;
      const baseline = baselineSnap.data().count;

      const rawLearners = learnersSnap.docs.map((snap) => ({
        id: snap.id,
        data: snap.data() as LearnerDoc,
      }));
      const learnerIds = rawLearners.map((row) => row.id);
      const learnerProfiles = await fetchUserProfiles(learnerIds);
      const nextLearners: LearnerRow[] = rawLearners
        .map((row) => ({ ...row, profile: learnerProfiles[row.id] || null }))
        .sort((a, b) => toMillis(b.data.joinedAt) - toMillis(a.data.joinedAt));

      setLearners(nextLearners);
      setTotalStudents(totalStudentsCount);
      setStudentsChange(pctChange(newStudentsCurr, newStudentsPrev));

      if (attemptsSnap.size >= 5000) {
        toast.warning("Analytics is showing last 5000 attempts for this period.");
      }

      const attempts: AttemptRow[] = attemptsSnap.docs.map((d) => ({
        id: d.id,
        data: d.data() as AttemptDoc,
      }));
      setPeriodAttempts(attempts);
      setTotalAttempts(attemptsCurrCount);
      setAttemptsChange(pctChange(attemptsCurrCount, attemptsPrevCount));

      const completed = attempts.filter((a) => isCompletedStatus(a.data.status));
      const completedCount = completed.length;
      const avgAcc =
        completedCount > 0 ? average(completed.map((a) => safeNum(a.data.score, 0))) : 0;
      const avgTimeSec =
        completedCount > 0 ? average(completed.map((a) => getAttemptTimeSeconds(a.data))) : 0;

      setAvgScore(avgAcc);
      setAvgTime(avgTimeSec);
      setCompletionRate(
        attemptsCurrCount > 0 ? Math.round((completedCount / attemptsCurrCount) * 100) : 0
      );

      const prevDocs = prevAttemptsSnap.docs.map((d) => d.data() as AttemptDoc);
      const prevCompleted = prevDocs.filter((a) => isCompletedStatus(a.status));
      const prevAvgAcc =
        prevCompleted.length > 0 ? average(prevCompleted.map((a) => safeNum(a.score, 0))) : 0;
      const prevAvgTime =
        prevCompleted.length > 0 ? average(prevCompleted.map((a) => getAttemptTimeSeconds(a))) : 0;

      setAvgScoreChange(pctChange(avgAcc, prevAvgAcc));
      setAvgTimeChange(Math.round((avgTimeSec - prevAvgTime) / 60));

      const totalWeeks = Math.max(1, Math.ceil(days / 7));
      const weekStarts: number[] = [];
      for (let i = 0; i < totalWeeks; i++) {
        const dt = new Date(start.getTime());
        dt.setDate(start.getDate() + i * 7);
        weekStarts.push(dt.getTime());
      }

      const newLearnerTimes = newLearnersSnap.docs.map((d) =>
        toMillis((d.data() as LearnerDoc).joinedAt)
      );
      const weekNewCounts = new Array(totalWeeks).fill(0);
      for (const ms of newLearnerTimes) {
        const idx = Math.min(
          totalWeeks - 1,
          Math.max(0, Math.floor((ms - weekStarts[0]) / (7 * 864e5)))
        );
        weekNewCounts[idx] += 1;
      }

      const weekActiveSets: Array<Set<string>> = new Array(totalWeeks)
        .fill(null)
        .map(() => new Set());
      for (const a of attempts) {
        const sid = String(a.data.studentId || "");
        if (!sid) continue;
        const ms = toMillis(a.data.createdAt || a.data.submittedAt);
        const idx = Math.min(
          totalWeeks - 1,
          Math.max(0, Math.floor((ms - weekStarts[0]) / (7 * 864e5)))
        );
        weekActiveSets[idx].add(sid);
      }

      const growth: GrowthPoint[] = [];
      let cumulative = baseline;
      for (let i = 0; i < totalWeeks; i++) {
        cumulative += weekNewCounts[i];
        growth.push({
          date: weekLabel(i + 1),
          students: cumulative,
          active: weekActiveSets[i].size,
        });
      }
      setStudentGrowthData(growth);

      const attemptsTrend: { date: string; attempts: number }[] = [];
      const trendMap = new Map<string, number>();
      for (const a of attempts) {
        const ms = toMillis(a.data.createdAt || a.data.submittedAt);
        const dateStr = formatShortDate(ms);
        trendMap.set(dateStr, (trendMap.get(dateStr) || 0) + 1);
      }
      for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime());
        d.setDate(d.getDate() + i);
        const dStr = formatShortDate(d.getTime());
        attemptsTrend.push({
          date: dStr,
          attempts: trendMap.get(dStr) || 0,
        });
      }
      setAttemptsTrendData(attemptsTrend);

      const subjectMap = new Map<string, number>();
      for (const a of attempts) {
        const subject = String(a.data.subject || "General").trim() || "General";
        subjectMap.set(subject, (subjectMap.get(subject) || 0) + 1);
      }
      const totalAttemptDocs = attempts.length || 1;
      const pie: PieSlice[] = Array.from(subjectMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, count], idx) => ({
          name,
          value: Math.round((count / totalAttemptDocs) * 100),
          color: PIE_COLORS[idx % PIE_COLORS.length],
        }));
      setAttemptDistribution(pie);

      const perStudent = new Map<
        string,
        {
          attempts: number;
          sumAcc: number;
          subject: Map<string, { sum: number; cnt: number }>;
        }
      >();
      for (const a of completed) {
        const sid = String(a.data.studentId || "");
        if (!sid) continue;
        const sc = safeNum(a.data.score, 0);
        const subject = String(a.data.subject || "General").trim() || "General";
        const existing = perStudent.get(sid) || {
          attempts: 0,
          sumAcc: 0,
          subject: new Map(),
        };
        existing.attempts += 1;
        existing.sumAcc += sc;
        const subjAgg = existing.subject.get(subject) || { sum: 0, cnt: 0 };
        subjAgg.sum += sc;
        subjAgg.cnt += 1;
        existing.subject.set(subject, subjAgg);
        perStudent.set(sid, existing);
      }

      const studentStats = Array.from(perStudent.entries()).map(([studentId, value]) => {
        let weakness = "General";
        let weaknessAvg = Infinity;
        for (const [subject, subjAgg] of value.subject.entries()) {
          const subjectAvg = subjAgg.cnt ? subjAgg.sum / subjAgg.cnt : Infinity;
          if (subjectAvg < weaknessAvg) {
            weaknessAvg = subjectAvg;
            weakness = subject;
          }
        }
        return {
          studentId,
          avg: value.attempts ? Math.round(value.sumAcc / value.attempts) : 0,
          tests: value.attempts,
          weakness,
        };
      });

      studentStats.sort((a, b) => b.avg - a.avg);
      const top = studentStats.slice(0, 5).map((s) => {
        const learner = nextLearners.find((row) => row.id === s.studentId) || null;
        return {
          studentId: s.studentId,
          name: getLearnerName(learner),
          avatarSeed: s.studentId.slice(0, 8),
          score: s.avg,
          tests: s.tests,
        };
      });
      setTopPerformers(top);

      const struggling = studentStats
        .filter((s) => s.tests >= 3)
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 3)
        .map((s) => {
          const learner = nextLearners.find((row) => row.id === s.studentId) || null;
          return {
            studentId: s.studentId,
            name: getLearnerName(learner),
            avatarSeed: s.studentId.slice(0, 8),
            score: s.avg,
            weakness: s.weakness,
          };
        });
      setStrugglingStudents(struggling);

      const testMap = new Map<string, { cnt: number; sumAcc: number }>();
      for (const a of completed) {
        const title = String(a.data.testTitle || a.data.testId || "Test").trim() || "Test";
        const sc = safeNum(a.data.score, 0);
        const t = testMap.get(title) || { cnt: 0, sumAcc: 0 };
        t.cnt += 1;
        t.sumAcc += sc;
        testMap.set(title, t);
      }
      const most: TestAgg[] = Array.from(testMap.entries())
        .map(([name, v]) => ({
          name,
          attempts: v.cnt,
          avgScore: v.cnt ? Math.round(v.sumAcc / v.cnt) : 0,
        }))
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 8);
      setMostAttemptedTests(most);

      const batchMap = new Map<string, { students: Set<string>; sumAcc: number; cnt: number }>();
      for (const a of completed) {
        const sid = String(a.data.studentId || "");
        if (!sid) continue;
        const learner = nextLearners.find((row) => row.id === sid) || null;
        const batch =
          learner?.profile?.batchName ||
          learner?.profile?.batch ||
          learner?.data.tenantSlug ||
          "Main";
        const sc = safeNum(a.data.score, 0);
        const existing = batchMap.get(batch) || {
          students: new Set<string>(),
          sumAcc: 0,
          cnt: 0,
        };
        existing.students.add(sid);
        existing.sumAcc += sc;
        existing.cnt += 1;
        batchMap.set(batch, existing);
      }
      const growthPct = pctChange(newStudentsCurr, newStudentsPrev);
      const batches: BatchAgg[] = Array.from(batchMap.entries())
        .map(([batch, value]) => ({
          batch,
          avgScore: value.cnt ? Math.round(value.sumAcc / value.cnt) : 0,
          students: value.students.size,
          growth: Math.max(0, growthPct),
        }))
        .sort((a, b) => b.students - a.students)
        .slice(0, 4);
      setBatchComparisonData(batches);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load educator analytics.");
    } finally {
      setLoading(false);
    }
  }, [canLoad, educatorId, fetchUserProfiles, getDateRanges, days]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics, periodDays]);

  // Fetch all branches, courses, and batches (Same as Dashboard.tsx)
  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "branches"), async (snap) => {
      const branchesData = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || "Unknown Branch",
      }));
      setAllBranches(branchesData);

      const coursesData: CourseDoc[] = [];
      const batchesData: BatchDoc[] = [];

      for (const b of branchesData) {
        const cSnap = await getDocs(
          collection(db, "educators", educatorId, "branches", b.id, "courses")
        );
        for (const c of cSnap.docs) {
          coursesData.push({ id: c.id, branchId: b.id, name: c.data().name || "Unknown Program" });
          const bSnap = await getDocs(
            collection(db, "educators", educatorId, "branches", b.id, "courses", c.id, "batches")
          );
          for (const batch of bSnap.docs) {
            batchesData.push({
              id: batch.id,
              branchId: b.id,
              courseId: c.id,
              name: batch.data().name || "Unknown Batch",
            });
          }
        }
      }
      setAllCourses(coursesData);
      setAllBatches(batchesData);
    });
    return () => unsub();
  }, [educatorId]);

  // Automated filter defaults
  useEffect(() => {
    if (uniqueBranches.length === 1 && selectedBranchName === "All") {
      setSelectedBranchName(uniqueBranches[0]);
    }
  }, [uniqueBranches, selectedBranchName]);

  useEffect(() => {
    if (uniqueCourses.length === 1 && selectedCourseName === "All") {
      setSelectedCourseName(uniqueCourses[0]);
    }
  }, [uniqueCourses, selectedCourseName]);

  useEffect(() => {
    if (uniqueBatches.length === 1 && selectedBatchName === "All") {
      setSelectedBatchName(uniqueBatches[0]);
    }
  }, [uniqueBatches, selectedBatchName]);

  // Simulated filter delay
  useEffect(() => {
    setIsDataFiltering(true);
    const timer = setTimeout(() => setIsDataFiltering(false), 500);
    return () => clearTimeout(timer);
  }, [selectedBranchName, selectedCourseName, selectedBatchName]);

  const dashboardFilteredStudents = useMemo(() => {
    const validBranchIds =
      selectedBranchName === "All"
        ? new Set(allBranches.map((b) => b.id))
        : new Set(allBranches.filter((b) => b.name === selectedBranchName).map((b) => b.id));

    const validCourseIds =
      selectedCourseName === "All"
        ? new Set(allCourses.map((c) => c.id))
        : new Set(allCourses.filter((c) => c.name === selectedCourseName).map((c) => c.id));

    const validBatchIds =
      selectedBatchName === "All"
        ? new Set(allBatches.map((b) => b.id))
        : new Set(allBatches.filter((b) => b.name === selectedBatchName).map((b) => b.id));

    return learners.filter((s) => {
      if (selectedBranchName !== "All" && !validBranchIds.has(s.data.branchId as string))
        return false;
      if (selectedCourseName !== "All" && !validCourseIds.has(s.data.courseId as string))
        return false;
      if (selectedBatchName !== "All" && !validBatchIds.has(s.data.batchId as string)) return false;
      return true;
    });
  }, [
    learners,
    selectedBranchName,
    selectedCourseName,
    selectedBatchName,
    allBranches,
    allCourses,
    allBatches,
  ]);

  const dashboardFilteredAttempts = useMemo(() => {
    const validStudentIds = new Set(dashboardFilteredStudents.map((s) => s.id));
    return periodAttempts.filter((a) => validStudentIds.has(a.data.studentId as string));
  }, [periodAttempts, dashboardFilteredStudents]);

  const studentsForDashboard = useMemo(() => {
    return dashboardFilteredStudents.map((s) => ({
      id: s.id,
      name: getLearnerName(s),
      ...s.data,
    }));
  }, [dashboardFilteredStudents]);

  const attemptsForDashboard = useMemo(() => {
    return dashboardFilteredAttempts.map((a) => ({
      id: a.id,
      ...a.data,
    }));
  }, [dashboardFilteredAttempts]);

  const activeBatchesCount = useMemo(() => {
    return (
      allBatches.filter((b) => {
        if (
          selectedBranchName !== "All" &&
          !allBranches.find((br) => br.name === selectedBranchName && br.id === b.branchId)
        )
          return false;
        if (
          selectedCourseName !== "All" &&
          !allCourses.find((c) => c.name === selectedCourseName && c.id === b.courseId)
        )
          return false;
        if (selectedBatchName !== "All" && b.name !== selectedBatchName) return false;
        return true;
      }).length || 0
    );
  }, [
    allBatches,
    selectedBranchName,
    selectedCourseName,
    selectedBatchName,
    allBranches,
    allCourses,
  ]);

  useEffect(() => {
    if (selectedStudentId === "__all__") return;
    const exists = learners.some((row) => row.id === selectedStudentId);
    if (!exists) setSelectedStudentId("__all__");
  }, [learners, selectedStudentId]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return learners.slice(0, 50);
    return learners
      .filter((row) => {
        const name = getLearnerName(row).toLowerCase();
        const email = String(row.data.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 50);
  }, [learners, studentSearch]);

  const selectedLearner = useMemo(() => {
    if (selectedStudentId === "__all__") return null;
    return learners.find((row) => row.id === selectedStudentId) || null;
  }, [learners, selectedStudentId]);

  const selectedStudentDive = useMemo<StudentDive | null>(() => {
    if (!selectedLearner) return null;

    const attempts = periodAttempts.filter((row) => row.data.studentId === selectedLearner.id);
    const completed = attempts.filter((row) => isCompletedStatus(row.data.status));
    const classCompleted = periodAttempts.filter((row) => isCompletedStatus(row.data.status));

    const completedScores = completed.map((row) => safeNum(row.data.score, 0));
    // Svg Score calculator.....
    const avgStudentScore = completedScores.length ? average(completedScores) : 0;
    const bestScore = completedScores.length ? Math.max(...completedScores) : 0;
    const avgStudentTime = completed.length
      ? average(completed.map((row) => getAttemptTimeSeconds(row.data)))
      : 0;
    const classAvgScore = classCompleted.length
      ? average(classCompleted.map((row) => safeNum(row.data.score, 0)))
      : 0;

    const sortedCompleted = [...completed].sort(
      (a, b) =>
        toMillis(a.data.submittedAt || a.data.createdAt) -
        toMillis(b.data.submittedAt || b.data.createdAt)
    );
    const firstScore = sortedCompleted.length ? safeNum(sortedCompleted[0].data.score, 0) : 0;
    const lastScore = sortedCompleted.length
      ? safeNum(sortedCompleted[sortedCompleted.length - 1].data.score, 0)
      : 0;

    const scoreTrend = sortedCompleted.slice(-12).map((row) => ({
      date: formatShortDate(toMillis(row.data.submittedAt || row.data.createdAt)),
      score: safeNum(row.data.score, 0),
    }));

    const subjectAgg = new Map<string, { sum: number; count: number }>();
    for (const row of completed) {
      const subject = String(row.data.subject || "General").trim() || "General";
      const existing = subjectAgg.get(subject) || { sum: 0, count: 0 };
      existing.sum += safeNum(row.data.score, 0);
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

    const strongestSubject = subjectPerformance[0]?.subject || "—";
    const weakestSubject = subjectPerformance.length
      ? subjectPerformance[subjectPerformance.length - 1].subject
      : "—";

    const recentAttempts = [...attempts]
      .sort(
        (a, b) =>
          toMillis(b.data.submittedAt || b.data.createdAt) -
          toMillis(a.data.submittedAt || a.data.createdAt)
      )
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        title: String(row.data.testTitle || row.data.testId || "Test"),
        subject: String(row.data.subject || "General"),
        status: String(row.data.status || "unknown"),
        scoreLabel: isCompletedStatus(row.data.status)
          ? `${safeNum(row.data.score, 0)}/${safeNum(row.data.maxScore, 0)}`
          : "In progress",
        timeLabel: isCompletedStatus(row.data.status)
          ? formatMinutes(getAttemptTimeSeconds(row.data))
          : "—",
        dateLabel: formatShortDateTime(toMillis(row.data.submittedAt || row.data.createdAt)),
      }));

    const activeDays = new Set(
      attempts.map((row) =>
        new Date(toMillis(row.data.submittedAt || row.data.createdAt)).toDateString()
      )
    ).size;

    return {
      totalAttempts: attempts.length,
      completedAttempts: completed.length,
      avgScore: avgStudentScore,
      bestScore,
      completionRate: attempts.length ? Math.round((completed.length / attempts.length) * 100) : 0,
      avgTimeSec: avgStudentTime,
      firstLastDelta: lastScore - firstScore,
      classAvgDelta: avgStudentScore - classAvgScore,
      activeDays,
      strongestSubject,
      weakestSubject,
      scoreTrend,
      subjectPerformance,
      recentAttempts,
    };
  }, [periodAttempts, selectedLearner]);

  const stats = useMemo(() => {
    return [
      {
        icon: Users,
        label: "Total Students",
        value: formatCompactInt(totalStudents),
        change: `${studentsChange >= 0 ? "+" : ""}${studentsChange}%`,
        positive: studentsChange >= 0,
      },
      {
        icon: Target,
        label: "Total Attempts",
        value: formatCompactInt(totalAttempts),
        change: `${attemptsChange >= 0 ? "+" : ""}${attemptsChange}%`,
        positive: attemptsChange >= 0,
      },
      {
        icon: TrendingUp,
        label: "Avg Score",
        value: `${avgScore}`,
        change: `${avgScoreChange >= 0 ? "+" : ""}${avgScoreChange}%`,
        positive: avgScoreChange >= 0,
      },
      {
        icon: Clock,
        label: "Avg Time/Test",
        value: formatMinutes(avgTime),
        change: `${avgTimeChange >= 0 ? "+" : ""}${avgTimeChange}min`,
        positive: avgTimeChange <= 0,
      },
    ];
  }, [
    totalStudents,
    totalAttempts,
    avgScore,
    avgTime,
    studentsChange,
    attemptsChange,
    avgScoreChange,
    avgTimeChange,
  ]);

  if (!canLoad) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.34 }}
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            {!isApp && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => navigate("/educator")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">Students Overview</h2>
              <p className="text-sm text-muted-foreground">
                Monitor performance trends, activity levels, and overall academic health across your
                programs.
              </p>
            </div>
          </div>

          {/* Global Filters */}
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="w-full sm:w-1/3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Branch</label>
              <Select value={selectedBranchName} onValueChange={setSelectedBranchName}>
                <SelectTrigger className="h-9 w-full bg-white dark:bg-zinc-900">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueBranches.length !== 1 && <SelectItem value="All">All Branches</SelectItem>}
                  {uniqueBranches.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-1/3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Program
              </label>
              <Select value={selectedCourseName} onValueChange={setSelectedCourseName}>
                <SelectTrigger className="h-9 w-full bg-white dark:bg-zinc-900">
                  <SelectValue placeholder="All Programs" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueCourses.length !== 1 && <SelectItem value="All">All Programs</SelectItem>}
                  {uniqueCourses.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-1/3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Batch</label>
              <Select value={selectedBatchName} onValueChange={setSelectedBatchName}>
                <SelectTrigger className="h-9 w-full bg-white dark:bg-zinc-900">
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueBatches.length !== 1 && <SelectItem value="All">All Batches</SelectItem>}
                  {uniqueBatches.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dashboard Components */}
          <DashboardStatsGrid
            students={studentsForDashboard}
            attempts={attemptsForDashboard}
            activeBatchesCount={activeBatchesCount}
            isLoading={isDataFiltering || loading}
          />

          <TopPerformersLeaderboard
            attempts={attemptsForDashboard}
            students={studentsForDashboard}
            isLoading={isDataFiltering || loading}
            selectedBranchName={selectedBranchName}
            selectedCourseName={selectedCourseName}
          />

          <AttemptsAnalyticsChart
            attempts={attemptsForDashboard}
            isLoading={isDataFiltering || loading}
          />

          <RecentActivityFeed
            attempts={attemptsForDashboard}
            students={studentsForDashboard}
            batches={allBatches}
            isLoading={isDataFiltering || loading}
          />

          <StudentHealthOverview
            students={studentsForDashboard}
            attempts={attemptsForDashboard}
            isLoading={isDataFiltering || loading}
          />
        </div>
      </motion.div>
    </div>
  );
}

