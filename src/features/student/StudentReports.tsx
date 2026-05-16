import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@app/providers/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";

const API_BASE = import.meta.env.VITE_MONKEY_KING_API_URL as string;

// ─── Types ────────────────────────────────────────────────────────────────────

type WeakArea = {
  subject: string;
  chapter: string;
  topic: string;
  weighted_accuracy: number;
  attempt_count: number;
};

type StrongHold = WeakArea;

type Strategy = {
  text: string;
  priority: number;
  type: string;
};

type SubjectBreakdown = {
  subject: string;
  weighted_accuracy: number;
  trend: string;
  attempt_count: number;
};

type WeeklyPoint = {
  week_label: string;
  accuracy: number;
};

type Report = {
  status: "full" | "partial" | "no_data";
  computed_at: string | null;
  is_stale: boolean;
  readiness_score: number | null;
  readiness_confidence: string | null;
  overall_trend: string | null;
  weak_areas: WeakArea[];
  strong_holds: StrongHold[];
  strategies: Strategy[];
  subject_breakdown: SubjectBreakdown[];
  tag_gaps: string[];
  weekly_history: Record<string, WeeklyPoint[]>;
  total_attempts: number;
  total_questions_analyzed: number;
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchReport(token: string): Promise<Report> {
  const res = await fetch(`${API_BASE}/api/reports/my`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
  return res.json();
}

async function triggerRecompute(token: string): Promise<{ accepted: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/reports/recompute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Recompute failed (${res.status})`);
  return res.json();
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return "Never";
  const ms = Date.parse(isoStr);
  if (!Number.isFinite(ms)) return "Unknown";
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === "declining") return <TrendingDown className="h-4 w-4 text-red-500" />;
  if (trend === "stable") return <Minus className="h-4 w-4 text-muted-foreground" />;
  return null;
}

function confidenceColor(c: string | null) {
  if (c === "high") return "text-green-600";
  if (c === "medium") return "text-yellow-600";
  return "text-muted-foreground";
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 rounded-xl bg-muted" />
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function NoDataState({ totalAttempts }: { totalAttempts: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
      <BookOpen className="h-12 w-12 text-muted-foreground/50" />
      <div>
        <p className="text-lg font-semibold">No report yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalAttempts === 0
            ? "Take your first DPP or test to unlock your performance report."
            : `Complete at least 3 tests to unlock analysis. You've done ${totalAttempts} so far.`}
        </p>
      </div>
    </div>
  );
}

// ─── Readiness gauge ─────────────────────────────────────────────────────────

function ReadinessCard({
  score,
  confidence,
  trend,
}: {
  score: number | null;
  confidence: string | null;
  trend: string | null;
}) {
  if (score === null) return null;

  const color = score >= 70 ? "text-green-600" : score >= 45 ? "text-yellow-600" : "text-red-500";
  const barColor = score >= 70 ? "bg-green-500" : score >= 45 ? "bg-yellow-500" : "bg-red-400";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Exam Readiness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3">
          <span className={`text-5xl font-bold ${color}`}>{score}</span>
          <span className="mb-1 text-xl text-muted-foreground">/100</span>
          <div className="mb-1 flex items-center gap-1">
            <TrendIcon trend={trend} />
            <span className="text-sm capitalize text-muted-foreground">
              {trend === "insufficient_data" ? "—" : trend}
            </span>
          </div>
        </div>

        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${score}%` }}
          />
        </div>

        {confidence && (
          <p className={`text-xs ${confidenceColor(confidence)}`}>
            Confidence: {confidence} — based on{" "}
            {confidence === "low"
              ? "limited attempts"
              : confidence === "medium"
                ? "moderate data"
                : "strong data"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Weak / Strong lists ─────────────────────────────────────────────────────

function AreaList({
  title,
  items,
  variant,
}: {
  title: string;
  items: WeakArea[];
  variant: "weak" | "strong";
}) {
  const isWeak = variant === "weak";

  if (!items.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {isWeak ? (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((area, idx) => {
            const label = area.topic || area.chapter || area.subject || "Unknown";
            const sub = area.topic
              ? area.chapter
                ? `${area.subject} › ${area.chapter}`
                : area.subject
              : area.subject;

            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{label}</p>
                  {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
                </div>
                <Badge
                  variant={isWeak ? "destructive" : "default"}
                  className={
                    isWeak
                      ? "shrink-0 bg-red-100 text-red-700 hover:bg-red-100"
                      : "shrink-0 bg-green-100 text-green-700 hover:bg-green-100"
                  }
                >
                  {pct(area.weighted_accuracy)}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Strategies ───────────────────────────────────────────────────────────────

function StrategiesCard({ strategies }: { strategies: Strategy[] }) {
  if (!strategies.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          What to do next
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {strategies.map((s, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {idx + 1}
              </span>
              <p className="text-sm leading-relaxed text-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

// ─── Subject accuracy bar chart ───────────────────────────────────────────────

function SubjectChart({ breakdown }: { breakdown: SubjectBreakdown[] }) {
  if (!breakdown.length) return null;

  const data = breakdown.map((s) => ({
    subject: s.subject.length > 12 ? s.subject.slice(0, 11) + "…" : s.subject,
    accuracy: Math.round(s.weighted_accuracy * 100),
    trend: s.trend,
  }));

  const barFill = (trend: string) => {
    if (trend === "improving") return "#22c55e";
    if (trend === "declining") return "#ef4444";
    return "#6366f1";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Subject Accuracy</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip
              formatter={(v: number) => [`${v}%`, "Accuracy"]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={barFill(entry.trend)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Improving
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            Declining
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
            Stable
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Weekly trend line chart ──────────────────────────────────────────────────

const LINE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];

function WeeklyTrendChart({ history }: { history: Record<string, WeeklyPoint[]> }) {
  const subjects = Object.keys(history).filter((s) => (history[s]?.length ?? 0) >= 2);
  if (!subjects.length) return null;

  // Build unified week-label set
  const allWeeks = Array.from(
    new Set(subjects.flatMap((s) => history[s].map((p) => p.week_label)))
  ).sort();

  if (allWeeks.length < 2) return null;

  const chartData = allWeeks.map((wl) => {
    const row: Record<string, string | number> = { week: wl.slice(5) }; // MM-DD
    for (const subject of subjects) {
      const pt = history[subject].find((p) => p.week_label === wl);
      row[subject] = pt ? Math.round(pt.accuracy * 100) : 0;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Progress (last 8 weeks)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div style={{ minWidth: Math.max(300, allWeeks.length * 60) }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  formatter={(v: number, name: string) => [`${v}%`, name]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {subjects.map((subject, i) => (
                  <Line
                    key={subject}
                    type="monotone"
                    dataKey={subject}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StudentReports() {
  const { firebaseUser } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: report,
    isLoading,
    isError,
    refetch,
  } = useQuery<Report>({
    queryKey: ["studentReport", firebaseUser?.uid],
    queryFn: async () => {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      return fetchReport(token);
    },
    enabled: !!firebaseUser,
    staleTime: 5 * 60 * 1000, // 5 min client-side cache
    retry: 2,
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      return triggerRecompute(token);
    },
    onSuccess: (data) => {
      if (data.accepted) {
        toast.success("Report is updating. Refresh in ~30 seconds.");
        // Auto-refetch after 30s
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["studentReport"] });
        }, 30_000);
      } else {
        toast.info(data.message);
      }
      setRefreshing(false);
    },
    onError: () => {
      toast.error("Failed to trigger report update.");
      setRefreshing(false);
    },
  });

  const handleRefresh = () => {
    setRefreshing(true);
    recomputeMutation.mutate();
  };

  // ── Header ────────────────────────────────────────────────────────────────
  const header = (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">My Reports</h1>
        <p className="text-sm text-muted-foreground">
          Personalised performance analysis based on your test history
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleRefresh}
          disabled={refreshing || recomputeMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {report?.computed_at && (
          <span className="text-xs text-muted-foreground">
            {report.is_stale ? "Updating…" : `Updated ${timeAgo(report.computed_at)}`}
          </span>
        )}
      </div>
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <ReportSkeleton />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError || !report) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">Could not load your report.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── Stale banner ──────────────────────────────────────────────────────────
  const staleBanner = report.is_stale && (
    <div className="flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-800/30 dark:bg-yellow-900/20 dark:text-yellow-200">
      <RefreshCw className="h-4 w-4 animate-spin" />
      Report is updating in the background…
    </div>
  );

  // ── Partial banner ────────────────────────────────────────────────────────
  const partialBanner = report.status === "partial" && (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-200">
      Complete {10 - report.total_attempts} more tests to unlock your full readiness score and
      weekly trend.
    </div>
  );

  // ── No data ───────────────────────────────────────────────────────────────
  if (report.status === "no_data") {
    return (
      <div className="space-y-6">
        {header}
        {staleBanner}
        <NoDataState totalAttempts={report.total_attempts} />
      </div>
    );
  }

  // ── Full / Partial report ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {header}
      {staleBanner}
      {partialBanner}

      {/* Meta strip */}
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{report.total_attempts}</strong> tests taken
        </span>
        <span>·</span>
        <span>
          <strong className="text-foreground">{report.total_questions_analyzed}</strong> questions
          analysed
        </span>
        {report.tag_gaps.length > 0 && (
          <>
            <span>·</span>
            <span>
              Concept gaps:{" "}
              {report.tag_gaps.slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="ml-1 text-xs">
                  {t}
                </Badge>
              ))}
            </span>
          </>
        )}
      </div>

      {/* Readiness */}
      <ReadinessCard
        score={report.readiness_score}
        confidence={report.readiness_confidence}
        trend={report.overall_trend}
      />

      {/* Weak + Strong side by side on wide screens */}
      <div className="grid gap-4 md:grid-cols-2">
        <AreaList title="Weak Areas" items={report.weak_areas} variant="weak" />
        <AreaList title="Strong Holds" items={report.strong_holds} variant="strong" />
      </div>

      {/* Strategies */}
      <StrategiesCard strategies={report.strategies} />

      {/* Subject accuracy bar chart */}
      <SubjectChart breakdown={report.subject_breakdown} />

      {/* Weekly trend line chart */}
      <WeeklyTrendChart history={report.weekly_history} />
    </div>
  );
}
