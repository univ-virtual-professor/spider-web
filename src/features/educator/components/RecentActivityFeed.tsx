import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  ChevronRight,
  ClipboardCheck,
  Clock,
  AlertCircle,
  PlayCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";
import { cn } from "@shared/lib/utils";

type AttemptDoc = any;
type StudentDoc = any;
type BatchDoc = any;

interface RecentActivityFeedProps {
  attempts: AttemptDoc[];
  students: StudentDoc[];
  batches: BatchDoc[];
  isLoading: boolean;
}

export default function RecentActivityFeed({
  attempts,
  students,
  batches,
  isLoading,
}: RecentActivityFeedProps) {
  const navigate = useNavigate();
  const [activityType, setActivityType] = useState<"dpp" | "test">("dpp");
  const [isFeedLoading, setIsFeedLoading] = useState(false);

  // Smooth loading transition on toggle
  useEffect(() => {
    setIsFeedLoading(true);
    const t = setTimeout(() => setIsFeedLoading(false), 400);
    return () => clearTimeout(t);
  }, [activityType, attempts]);

  const activityData = useMemo(() => {
    // 1. Filter by DPP vs Test
    const filtered = attempts.filter((a) => {
      const title = String(a.testTitle || "").toLowerCase();
      const isDpp = title.includes("dpp") || title.includes("practice");
      return activityType === "dpp" ? isDpp : !isDpp;
    });

    // 2. Sort by newest
    const sorted = [...filtered].sort((a, b) => {
      const timeA = a.submittedAt?.toMillis
        ? a.submittedAt.toMillis()
        : a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : 0;
      const timeB = b.submittedAt?.toMillis
        ? b.submittedAt.toMillis()
        : b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : 0;
      return timeB - timeA;
    });

    // 3. Take top 10 and map data
    return sorted.slice(0, 10).map((attempt) => {
      const student = students.find((s) => s.id === attempt.studentId);
      const batch = batches.find((b) => b.id === student?.batchId);

      const status = String(attempt.status || "").toLowerCase();
      const isCompleted = ["submitted", "completed", "finished"].includes(status);
      const isStarted = ["in-progress", "inprogress", "running", "started"].includes(status);

      let activityText = "";
      if (isCompleted) activityText = `Completed ${attempt.testTitle || "Test"}`;
      else if (isStarted) activityText = `Started ${attempt.testTitle || "Test"}`;
      else activityText = `Attempted ${attempt.testTitle || "Test"}`;

      const timestamp = attempt.submittedAt?.toMillis
        ? attempt.submittedAt.toMillis()
        : attempt.createdAt?.toMillis
          ? attempt.createdAt.toMillis()
          : null;
      return {
        id: attempt.id,
        studentId: attempt.studentId,
        studentName:
          student?.name ||
          student?.displayName ||
          student?.fullName ||
          attempt.studentName ||
          "Unknown Student",
        avatar: student?.avatarUrl || "",
        batchName: batch?.name || "No Batch",
        activityText,
        status,
        timestamp,
        isCompleted,
        isStarted,
      };
    });
  }, [attempts, students, batches, activityType]);

  const showLoading = isLoading || isFeedLoading;
  const hasActivity = activityData.length > 0;

  const getStatusConfig = (status: string, isCompleted: boolean, isStarted: boolean) => {
    if (isCompleted)
      return { label: "Completed", variant: "success" as const, icon: ClipboardCheck };
    if (isStarted) return { label: "In Progress", variant: "warning" as const, icon: PlayCircle };
    if (status === "missed")
      return { label: "Missed", variant: "destructive" as const, icon: AlertCircle };
    return { label: "Pending", variant: "outline" as const, icon: Clock };
  };

  return (
    <Card className="card-hover w-full border-border shadow-sm">
      <CardHeader className="flex flex-col justify-between gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-center">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Activity className="h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>Track latest student participation and engagement.</CardDescription>
        </div>

        <Tabs
          value={activityType}
          onValueChange={(v: any) => setActivityType(v)}
          className="w-auto"
        >
          <TabsList className="bg-muted/50">
            <TabsTrigger value="dpp" className="px-4 py-1.5 text-xs">
              DPP Activity
            </TabsTrigger>
            <TabsTrigger value="test" className="px-4 py-1.5 text-xs">
              Test Activity
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="p-0">
        <div className="scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/30 max-h-[480px] overflow-y-auto">
          {showLoading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          ) : !hasActivity ? (
            <div className="flex flex-col items-center justify-center bg-muted/5 py-20 text-muted-foreground">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
                <Activity className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="font-medium text-foreground">No recent activity found</p>
              <p className="mt-1 text-sm">Try adjusting your filters or switching activity type.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {activityData.map((item) => {
                const config = getStatusConfig(item.status, item.isCompleted, item.isStarted);
                const StatusIcon = config.icon;

                return (
                  <div
                    key={item.id}
                    className="group flex cursor-pointer flex-col gap-4 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
                    onClick={() => navigate(`/educator/analytics`)}
                  >
                    {/* Left: Student Info */}
                    <div className="flex min-w-[180px] items-center gap-3">
                      <Avatar className="h-10 w-10 border border-border/50 transition-colors group-hover:border-primary/30">
                        <AvatarImage src={item.avatar} alt={item.studentName} />
                        <AvatarFallback className="bg-primary/5 text-xs text-primary">
                          {item.studentName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="overflow-hidden">
                        <p className="truncate text-sm font-semibold leading-tight text-foreground">
                          {item.studentName}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                          {item.batchName}
                        </p>
                      </div>
                    </div>

                    {/* Center: Activity Text */}
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                        {item.activityText}
                      </p>
                    </div>

                    {/* Right: Meta */}
                    <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right">
                        <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                          {item.timestamp
                            ? formatDistanceToNow(item.timestamp, { addSuffix: true })
                            : "N/A"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn(
                            "flex h-6 items-center gap-1 border-none px-2 py-0 text-[10px] font-bold uppercase tracking-wider",
                            item.isCompleted
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : item.isStarted
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : item.status === "missed"
                                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                  : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          <StatusIcon className="h-2.5 w-2.5" />
                          {config.label}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-primary/50" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
