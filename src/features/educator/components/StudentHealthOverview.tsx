import { useMemo } from "react";
import { Zap, Activity, AlertCircle, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { cn } from "@shared/lib/utils";

type Attempt = {
  id: string;
  studentId?: string;
  score?: number;
  maxScore?: number;
  status?: string;
  submittedAt?: any;
  createdAt?: any;
};

type Student = {
  id: string;
  name?: string;
};

interface StudentHealthOverviewProps {
  students: Student[];
  attempts: Attempt[];
  isLoading: boolean;
}

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

function isCompleted(status?: string) {
  const s = String(status || "").toLowerCase();
  return ["submitted", "completed", "finished", "done"].includes(s);
}

export default function StudentHealthOverview({
  students,
  attempts,
  isLoading,
}: StudentHealthOverviewProps) {
  const healthStats = useMemo(() => {
    if (isLoading) return null;

    // Get latest completed attempt for each student
    const latestAttempts = new Map<string, Attempt>();

    attempts.forEach((a) => {
      if (!a.studentId || !isCompleted(a.status)) return;

      const currentLatest = latestAttempts.get(a.studentId);
      const aTime = toMillis(a.submittedAt || a.createdAt);
      const cTime = currentLatest
        ? toMillis(currentLatest.submittedAt || currentLatest.createdAt)
        : 0;

      if (!currentLatest || aTime > cTime) {
        latestAttempts.set(a.studentId, a);
      }
    });

    const categories = {
      excellent: 0,
      good: 0,
      average: 0,
      weak: 0,
    };

    latestAttempts.forEach((a) => {
      const score = Number(a.score || 0);
      const maxScore = Number(a.maxScore || 100);
      const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;

      if (pct >= 91) categories.excellent++;
      else if (pct >= 75) categories.good++;
      else if (pct >= 50) categories.average++;
      else categories.weak++;
    });

    const totalWithData = latestAttempts.size;

    return {
      excellent: {
        count: categories.excellent,
        pct: totalWithData ? Math.round((categories.excellent / totalWithData) * 100) : 0,
      },
      good: {
        count: categories.good,
        pct: totalWithData ? Math.round((categories.good / totalWithData) * 100) : 0,
      },
      average: {
        count: categories.average,
        pct: totalWithData ? Math.round((categories.average / totalWithData) * 100) : 0,
      },
      weak: {
        count: categories.weak,
        pct: totalWithData ? Math.round((categories.weak / totalWithData) * 100) : 0,
      },
      totalWithData,
    };
  }, [attempts, isLoading]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!healthStats || healthStats.totalWithData === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h3 className="text-xl font-bold tracking-tight">Student Health Overview</h3>
          <p className="text-sm text-muted-foreground">
            Performance distribution based on students' latest test scores.
          </p>
        </div>
        <Card className="border-2 border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Activity className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h4 className="text-lg font-semibold">No completed test data</h4>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Complete test attempts are required to calculate academic health metrics.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cards = [
    {
      title: "Excellent Students",
      count: healthStats.excellent.count,
      pct: healthStats.excellent.pct,
      desc: "Scoring 91% and above",
      icon: Zap,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      gradient: "from-emerald-500/20 to-transparent",
      accent: "border-emerald-500/20",
    },
    {
      title: "Good Students",
      count: healthStats.good.count,
      pct: healthStats.good.pct,
      desc: "Scoring 75% – 90%",
      icon: TrendingUp,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      gradient: "from-blue-500/20 to-transparent",
      accent: "border-blue-500/20",
    },
    {
      title: "Average Students",
      count: healthStats.average.count,
      pct: healthStats.average.pct,
      desc: "Scoring 50% – 74%",
      icon: Activity,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      gradient: "from-amber-500/20 to-transparent",
      accent: "border-amber-500/20",
    },
    {
      title: "Weak Students",
      count: healthStats.weak.count,
      pct: healthStats.weak.pct,
      desc: "Scoring below 50%",
      icon: AlertCircle,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      gradient: "from-rose-500/20 to-transparent",
      accent: "border-rose-500/20",
    },
  ];

  return (
    <div className="space-y-6 duration-700 animate-in fade-in slide-in-from-bottom-4">
      <div className="space-y-1">
        <h3 className="text-xl font-bold tracking-tight">Student Health Overview</h3>
        <p className="text-sm text-muted-foreground">
          Performance distribution based on students' latest test scores.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <div key={card.title}>
            <Card
              className={cn(
                "relative overflow-hidden border-border/50 transition-all duration-300",
                card.accent
              )}
            >
              <CardContent className="relative z-10 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className={cn("rounded-xl p-2", card.bg, card.color)}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="bg-muted/50 text-[10px] font-bold">
                    {card.pct}% of total
                  </Badge>
                </div>

                <div className="space-y-1">
                  <p className="text-3xl font-bold tracking-tighter">
                    {card.count}
                    <span className="ml-1.5 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Students
                    </span>
                  </p>
                  <p className="text-sm font-semibold text-foreground/80">{card.title}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {card.desc}
                  </span>
                  <div
                    className={cn(
                      "h-1.5 w-1.5 animate-pulse rounded-full",
                      card.color.replace("text-", "bg-")
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({
  className,
  variant,
  children,
}: {
  className?: string;
  variant?: "secondary";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold transition-colors",
        variant === "secondary" && "bg-secondary text-secondary-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
