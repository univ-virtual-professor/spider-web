import { useMemo, useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, subDays, startOfDay, startOfMonth, isAfter, isBefore } from "date-fns";
import { BarChart3, AlertCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Skeleton } from "@shared/ui/skeleton";

type AttemptDoc = any;

interface AttemptsAnalyticsChartProps {
  attempts: AttemptDoc[];
  isLoading: boolean;
}

export default function AttemptsAnalyticsChart({
  attempts,
  isLoading,
}: AttemptsAnalyticsChartProps) {
  const [attemptType, setAttemptType] = useState<"both" | "dpp" | "test">("both");
  const [timeRange, setTimeRange] = useState<"7" | "30" | "90">("7");
  const [isChartLoading, setIsChartLoading] = useState(false);

  // Simulate smooth chart re-rendering loading state on filter change
  useEffect(() => {
    setIsChartLoading(true);
    const t = setTimeout(() => setIsChartLoading(false), 400);
    return () => clearTimeout(t);
  }, [attemptType, timeRange, attempts]);

  const { chartData, metrics } = useMemo(() => {
    const days = parseInt(timeRange);
    const now = new Date();
    const currentPeriodStart = startOfDay(subDays(now, days));
    const previousPeriodStart = startOfDay(subDays(now, days * 2));

    let currentTotal = 0;
    let previousTotal = 0;

    const buckets: Record<string, { timestamp: number; dpp: number; test: number }> = {};

    // Initialize buckets
    if (timeRange === "90") {
      // Group by month
      for (let i = 2; i >= 0; i--) {
        const d = startOfMonth(subDays(now, i * 30));
        const key = format(d, "MMM yyyy");
        buckets[key] = { timestamp: d.getTime(), dpp: 0, test: 0 };
      }
    } else {
      // Group by day
      for (let i = days - 1; i >= 0; i--) {
        const d = startOfDay(subDays(now, i));
        const key = format(d, "MMM dd");
        buckets[key] = { timestamp: d.getTime(), dpp: 0, test: 0 };
      }
    }

    attempts.forEach((a) => {
      const ts = a.submittedAt?.toMillis
        ? a.submittedAt.toMillis()
        : a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : null;
      if (!ts) return;
      const d = new Date(ts);

      const title = String(a.testTitle || "").toLowerCase();
      const isDpp = title.includes("dpp") || title.includes("practice");
      const isTest = !isDpp;

      // Filter by attempt type
      if (attemptType === "dpp" && !isDpp) return;
      if (attemptType === "test" && !isTest) return;

      if (isAfter(d, currentPeriodStart) || d.getTime() === currentPeriodStart.getTime()) {
        currentTotal++;
        const key = timeRange === "90" ? format(d, "MMM yyyy") : format(d, "MMM dd");
        if (!buckets[key]) {
          buckets[key] = { timestamp: d.getTime(), dpp: 0, test: 0 };
        }
        if (isDpp) buckets[key].dpp++;
        if (isTest) buckets[key].test++;
      } else if (isAfter(d, previousPeriodStart) && isBefore(d, currentPeriodStart)) {
        previousTotal++;
      }
    });

    const data = Object.entries(buckets)
      .map(([date, counts]) => ({
        date,
        timestamp: counts.timestamp,
        dpp: counts.dpp,
        test: counts.test,
        total: counts.dpp + counts.test,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const growth =
      previousTotal === 0
        ? currentTotal > 0
          ? 100
          : 0
        : ((currentTotal - previousTotal) / previousTotal) * 100;

    return {
      chartData: data,
      metrics: {
        total: currentTotal,
        avgDaily: Math.round((currentTotal / days) * 10) / 10,
        growth: Math.round(growth * 10) / 10,
        isUp: growth >= 0,
      },
    };
  }, [attempts, timeRange, attemptType]);

  const showLoading = isLoading || isChartLoading;
  const hasData = chartData.some((d) => d.total > 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-white p-3 shadow-xl dark:bg-zinc-900">
          <p className="mb-2 text-sm font-medium">{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="capitalize text-muted-foreground">{entry.name}:</span>
                <span className="font-semibold">{entry.value}</span>
              </div>
            ))}
            {attemptType === "both" && (
              <div className="mt-1 flex items-center justify-between border-t border-border pt-1 text-sm">
                <span className="font-medium text-muted-foreground">Total:</span>
                <span className="font-bold">
                  {payload.reduce((sum: number, p: any) => sum + p.value, 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="card-hover w-full overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-primary" />
              Attempts Analytics
            </CardTitle>
            <CardDescription className="mt-1">
              Track DPP and Test participation trends dynamically.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Select value={attemptType} onValueChange={(v: any) => setAttemptType(v)}>
              <SelectTrigger className="h-9 w-[140px] bg-background">
                <SelectValue placeholder="Attempt Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Both Attempts</SelectItem>
                <SelectItem value="dpp">DPP Attempts</SelectItem>
                <SelectItem value="test">Test Attempts</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
              <SelectTrigger className="h-9 w-[130px] bg-background">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 3 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="p-6">
          {/* Summary Metrics */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
              <p className="mb-1 text-sm font-medium text-muted-foreground">Total Attempts</p>
              <div className="flex items-end justify-between">
                <p className="font-display text-3xl font-bold">
                  {showLoading ? <Skeleton className="h-8 w-16" /> : metrics.total.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Chart Area */}
          <div className="relative mt-4 h-[350px] w-full">
            {showLoading ? (
              <div className="flex h-full w-full items-end justify-between gap-2 px-4 pb-8">
                {Array.from({ length: parseInt(timeRange) === 90 ? 3 : 7 }).map((_, i) => (
                  <div key={i} className="flex h-full w-full flex-col justify-end gap-1">
                    <Skeleton
                      className="w-full rounded-t-sm"
                      style={{ height: `${Math.random() * 40 + 20}%` }}
                    />
                    <Skeleton
                      className="w-full rounded-t-sm"
                      style={{ height: `${Math.random() * 40 + 10}%` }}
                    />
                  </div>
                ))}
              </div>
            ) : !hasData ? (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 text-muted-foreground">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
                  <AlertCircle className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="font-medium text-foreground">No attempt analytics available</p>
                <p className="mt-1 max-w-sm text-center text-sm">
                  There is no attempt data available for the selected filters and time range.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    className="text-border/40"
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "currentColor" }}
                    className="text-muted-foreground"
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "currentColor" }}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "currentColor", opacity: 0.05 }}
                  />
                  {attemptType === "both" && <Legend wrapperStyle={{ paddingTop: "20px" }} />}

                  {(attemptType === "both" || attemptType === "dpp") && (
                    <Bar
                      dataKey="dpp"
                      name="DPP"
                      stackId="a"
                      fill="#10b981"
                      radius={attemptType === "dpp" ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      animationDuration={1000}
                    />
                  )}
                  {(attemptType === "both" || attemptType === "test") && (
                    <Bar
                      dataKey="test"
                      name="Test"
                      stackId="a"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1000}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
