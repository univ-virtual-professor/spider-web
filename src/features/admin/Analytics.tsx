import { useEffect, useMemo, useState } from "react";
import { Users, GraduationCap, BookOpen, Activity, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import {
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import {
  Timestamp,
  collection,
  getDocs,
  getCountFromServer,
  orderBy,
  query,
  where,
} from "firebase/firestore";

type PeriodMode = "week" | "daily" | "monthly" | "annual";

type BucketRow = {
  label: string;
  attempts: number;
  activeStudents: number;
  activeEducators: number;
  newStudents: number;
  newEducators: number;
};

type AttemptDoc = {
  createdAt?: Timestamp | null;
  studentId?: string;
  educatorId?: string;
};

type UserDoc = {
  createdAt?: Timestamp | null;
  role?: string;
};

const PERIOD_LABELS: Record<PeriodMode, string> = {
  week: "Last Week",
  daily: "30 Days",
  monthly: "12 Months",
  annual: "5 Years",
};

function sinceTs(mode: PeriodMode): Timestamp {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (mode === "week") d.setDate(d.getDate() - 6);
  else if (mode === "daily") d.setDate(d.getDate() - 29);
  else if (mode === "monthly") {
    d.setMonth(d.getMonth() - 12);
    d.setDate(1);
  } else {
    d.setFullYear(d.getFullYear() - 5);
    d.setMonth(0);
    d.setDate(1);
  }
  return Timestamp.fromDate(d);
}

function bucketKey(ms: number, mode: PeriodMode): string {
  const d = new Date(ms);
  if (mode === "week" || mode === "daily") return d.toISOString().slice(0, 10);
  if (mode === "monthly") return d.toISOString().slice(0, 7);
  return String(d.getFullYear());
}

function generateBuckets(mode: PeriodMode): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (mode === "week") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
      });
    }
  } else if (mode === "daily") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      });
    }
  } else if (mode === "monthly") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      out.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const yr = new Date().getFullYear() - i;
      out.push({ key: String(yr), label: String(yr) });
    }
  }
  return out;
}

export default function AdminAnalytics() {
  const { firebaseUser, loading: authLoading, role } = useAuth();

  const [period, setPeriod] = useState<PeriodMode>("daily");
  const [staticLoading, setStaticLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);

  const [totalInstitutes, setTotalInstitutes] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [chartData, setChartData] = useState<BucketRow[]>([]);
  const [periodSummary, setPeriodSummary] = useState({
    totalAttempts: 0,
    uniqueStudents: 0,
    uniqueEducators: 0,
  });

  const canView = useMemo(
    () => !authLoading && !!firebaseUser?.uid && role === "ADMIN",
    [authLoading, firebaseUser?.uid, role]
  );

  async function fetchStatic() {
    const [instSnap, studSnap] = await Promise.all([
      getCountFromServer(query(collection(db, "users"), where("role", "==", "EDUCATOR"))),
      getCountFromServer(query(collection(db, "users"), where("role", "==", "STUDENT"))),
    ]);
    setTotalInstitutes(instSnap.data().count);
    setTotalStudents(studSnap.data().count);
  }

  async function fetchPeriod(mode: PeriodMode) {
    const from = sinceTs(mode);
    const buckets = generateBuckets(mode);

    const [attemptsSnap, usersSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "attempts"),
          where("createdAt", ">=", from),
          orderBy("createdAt", "asc")
        )
      ),
      // query without role filter to avoid composite index requirement; filter in JS
      getDocs(
        query(collection(db, "users"), where("createdAt", ">=", from), orderBy("createdAt", "asc"))
      ),
    ]);

    // --- bucket maps ---
    const attMap: Record<string, number> = {};
    const stuActiveMap: Record<string, Set<string>> = {};
    const eduActiveMap: Record<string, Set<string>> = {};
    const stuNewMap: Record<string, number> = {};
    const eduNewMap: Record<string, number> = {};

    buckets.forEach(({ key }) => {
      attMap[key] = 0;
      stuActiveMap[key] = new Set();
      eduActiveMap[key] = new Set();
      stuNewMap[key] = 0;
      eduNewMap[key] = 0;
    });

    const allStudents = new Set<string>();
    const allEducators = new Set<string>();

    // --- attempts ---
    attemptsSnap.docs.forEach((doc) => {
      const a = doc.data() as AttemptDoc;
      const ms = a.createdAt ? a.createdAt.seconds * 1000 : Date.now();
      const key = bucketKey(ms, mode);
      if (attMap[key] != null) {
        attMap[key]++;
        if (a.studentId) stuActiveMap[key].add(a.studentId);
        if (a.educatorId) eduActiveMap[key].add(a.educatorId);
      }
      if (a.studentId) allStudents.add(a.studentId);
      if (a.educatorId) allEducators.add(a.educatorId);
    });

    // --- new user registrations ---
    usersSnap.docs.forEach((doc) => {
      const u = doc.data() as UserDoc;
      if (!u.createdAt) return;
      const ms = u.createdAt.seconds * 1000;
      const key = bucketKey(ms, mode);
      if (u.role === "STUDENT" && stuNewMap[key] != null) stuNewMap[key]++;
      if (u.role === "EDUCATOR" && eduNewMap[key] != null) eduNewMap[key]++;
    });

    setChartData(
      buckets.map(({ key, label }) => ({
        label,
        attempts: attMap[key] ?? 0,
        activeStudents: stuActiveMap[key]?.size ?? 0,
        activeEducators: eduActiveMap[key]?.size ?? 0,
        newStudents: stuNewMap[key] ?? 0,
        newEducators: eduNewMap[key] ?? 0,
      }))
    );
    setPeriodSummary({
      totalAttempts: attemptsSnap.size,
      uniqueStudents: allStudents.size,
      uniqueEducators: allEducators.size,
    });
  }

  useEffect(() => {
    if (!canView) return;
    setStaticLoading(true);
    fetchStatic()
      .catch(() => toast.error("Failed to load platform stats."))
      .finally(() => setStaticLoading(false));
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    setPeriodLoading(true);
    fetchPeriod(period)
      .catch(() => toast.error("Failed to load analytics."))
      .finally(() => setPeriodLoading(false));
  }, [canView, period]);

  function handleRefresh() {
    setStaticLoading(true);
    setPeriodLoading(true);
    Promise.all([
      fetchStatic().finally(() => setStaticLoading(false)),
      fetchPeriod(period).finally(() => setPeriodLoading(false)),
    ]).catch(() => toast.error("Failed to refresh."));
  }

  // Compute cumulative totals from the bucket-level new-registration counts.
  // baseline = (platform total) – (all new in the fetched window) so the last bucket lands on the current total.
  const cumulativeData = useMemo(() => {
    const totalNewStu = chartData.reduce((s, r) => s + r.newStudents, 0);
    const totalNewEdu = chartData.reduce((s, r) => s + r.newEducators, 0);
    let cumStu = totalStudents - totalNewStu;
    let cumEdu = totalInstitutes - totalNewEdu;
    return chartData.map((row) => {
      cumStu += row.newStudents;
      cumEdu += row.newEducators;
      return { ...row, totalStudents: cumStu, totalEducators: cumEdu };
    });
  }, [chartData, totalStudents, totalInstitutes]);

  if (authLoading) return <div className="py-12 text-center text-muted-foreground">Loading…</div>;
  if (role !== "ADMIN")
    return <div className="py-12 text-center text-muted-foreground">Access denied.</div>;

  const cards = [
    {
      title: "Total Institutes",
      value: totalInstitutes,
      sub: "registered",
      loading: staticLoading,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      title: "Total Students",
      value: totalStudents,
      sub: "registered",
      loading: staticLoading,
      icon: GraduationCap,
      color: "text-green-500",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
    },
    {
      title: "Tests Taken",
      value: periodSummary.totalAttempts,
      sub: PERIOD_LABELS[period].toLowerCase(),
      loading: periodLoading,
      icon: BookOpen,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
    },
    {
      title: "Active Students",
      value: periodSummary.uniqueStudents,
      sub: `of ${totalStudents} total`,
      loading: periodLoading || staticLoading,
      icon: GraduationCap,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
    {
      title: "Active Educators",
      value: periodSummary.uniqueEducators,
      sub: `of ${totalInstitutes} total`,
      loading: periodLoading || staticLoading,
      icon: Activity,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
    },
  ];

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  };

  function ChartCard({
    title,
    lines,
    data,
    fullWidth = false,
  }: {
    title: string;
    lines: { key: string; color: string; label: string; dashed?: boolean }[];
    data: object[];
    fullWidth?: boolean;
  }) {
    return (
      <Card className={`border-border/50 ${fullWidth ? "col-span-full" : ""}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            {periodLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : data.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                No data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {lines.map((l) => (
                    <Line
                      key={l.key}
                      type="monotone"
                      dataKey={l.key}
                      name={l.label}
                      stroke={l.color}
                      strokeWidth={l.dashed ? 1.5 : 2}
                      strokeDasharray={l.dashed ? "4 3" : undefined}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Analytics</h1>
          <p className="mt-1 text-muted-foreground">Platform activity and engagement</p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["week", "daily", "monthly", "annual"] as PeriodMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setPeriod(m)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {PERIOD_LABELS[m]}
              </button>
            ))}
          </div>
          <Button variant="outline" className="gap-2" onClick={handleRefresh}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* 5 stat cards — one row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((s) => (
          <Card key={s.title} className={`border ${s.border} bg-card`}>
            <CardContent className="p-4">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-xl font-bold text-foreground">
                {s.loading ? "—" : s.value.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">{s.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                {s.loading ? "" : s.sub}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title={`Tests Taken — ${PERIOD_LABELS[period]}`}
          fullWidth
          data={chartData}
          lines={[{ key: "attempts", color: "#f97316", label: "Tests Taken" }]}
        />
        <ChartCard
          title="Students"
          data={cumulativeData}
          lines={[
            { key: "activeStudents", color: "#f43f5e", label: "Active" },
            { key: "totalStudents", color: "#86efac", label: "Total", dashed: true },
          ]}
        />
        <ChartCard
          title="Educators"
          data={cumulativeData}
          lines={[
            { key: "activeEducators", color: "#06b6d4", label: "Active" },
            { key: "totalEducators", color: "#93c5fd", label: "Total", dashed: true },
          ]}
        />
      </div>
    </div>
  );
}
