import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Clock, FilePlus, Play, CheckCircle2 } from "lucide-react";

import { collection, onSnapshot, Timestamp } from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";

import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";

import { cn } from "@shared/lib/utils";

type TestStatus = "draft" | "running" | "completed";

interface ActiveTest {
  id: string;
  title: string;
  subject: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  startTime?: Timestamp;
  endTime?: Timestamp;
  isDpp: boolean;
  status: TestStatus;
}

function getTestStatus(startTime?: Timestamp, endTime?: Timestamp): TestStatus {
  const now = Date.now();

  if (!startTime) return "draft";

  const startMs = startTime.toMillis();

  if (startMs > now) return "draft";

  if (!endTime) return "running";

  return now > endTime.toMillis() ? "completed" : "running";
}

function getStatusStyles(status: TestStatus) {
  switch (status) {
    case "completed":
      return {
        icon: <CheckCircle2 className="h-4 w-4" />,
        iconClass: "bg-muted text-muted-foreground",
        badgeClass: "bg-muted text-muted-foreground",
        label: "Completed",
      };

    case "running":
      return {
        icon: <Play className="h-4 w-4" />,
        iconClass: "bg-green-500/10 text-green-600",
        badgeClass: "bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400",
        label: "Running",
      };

    default:
      return {
        icon: <FilePlus className="h-4 w-4" />,
        iconClass: "bg-muted text-muted-foreground",
        badgeClass: "bg-muted text-muted-foreground",
        label: "Draft",
      };
  }
}

export default function ActiveTestsFeed() {
  const { profile } = useAuth();
  const { tenant } = useTenant();

  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [tests, setTests] = useState<ActiveTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!educatorId) return;

    const q = collection(db, "educators", educatorId, "my_tests");

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const parsedTests: ActiveTest[] = snapshot.docs
          .map((doc) => {
            const data = doc.data();

            const title = data.title || "Untitled Test";

            const isDpp =
              title.toLowerCase().includes("dpp") || title.toLowerCase().includes("practice");

            const status = getTestStatus(data.startTime, data.endTime);

            return {
              id: doc.id,
              title,
              subject: data.subject || "General",
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              startTime: data.startTime,
              endTime: data.endTime,
              isDpp,
              status,
            };
          })
          .filter((test) => {
            if (!test.startTime) return true;

            return test.startTime.toMillis() <= Date.now();
          })
          .sort((a, b) => {
            if (a.status === "running" && b.status !== "running") return -1;
            if (b.status === "running" && a.status !== "running") return 1;

            const aTime = a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0;

            const bTime = b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0;

            return bTime - aTime;
          })
          .slice(0, 10);

        setTests(parsedTests);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching tests:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [educatorId]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="divide-y divide-border/40">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      );
    }

    if (tests.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-muted/5 py-12 text-muted-foreground">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/5">
            <FileText className="h-5 w-5 text-primary/40" />
          </div>

          <p className="text-sm font-medium text-foreground">No recent assessments</p>

          <p className="mt-1 text-xs">Create a test or DPP to see it here.</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-border/40">
        {tests.map((test) => {
          const statusConfig = getStatusStyles(test.status);

          const timeRef = test.updatedAt || test.createdAt;

          const timeAgo = timeRef?.toMillis
            ? formatDistanceToNow(timeRef.toMillis(), {
                addSuffix: true,
              })
            : "Recently";

          return (
            <div
              key={test.id}
              className="flex items-start gap-4 p-4 transition-colors hover:bg-muted/30"
            >
              <div
                className={cn("mt-1 rounded-full p-2", statusConfig.iconClass)}
                title={statusConfig.label}
              >
                {statusConfig.icon}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-semibold text-foreground">{test.title}</p>

                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {timeAgo}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="h-5 bg-background px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                  >
                    {test.subject}
                  </Badge>

                  <Badge variant="secondary" className="h-5 px-1.5 py-0 text-[10px]">
                    {test.isDpp ? "DPP" : "Test"}
                  </Badge>

                  <Badge
                    className={cn(
                      "h-5 border-none px-1.5 py-0 text-[10px]",
                      statusConfig.badgeClass
                    )}
                  >
                    {statusConfig.label}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [loading, tests]);

  return (
    <Card className="flex h-[450px] w-full flex-col border-border/50 shadow-sm">
      <CardHeader className="border-b border-border/50 bg-muted/10 pb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5 text-primary">
            <FileText className="h-5 w-5" />
          </div>

          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Recent Assessments
            </CardTitle>

            <CardDescription className="mt-0.5 text-xs">
              Recently created or active tests & DPPs
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-primary/30 h-full overflow-y-auto">
          {content}
        </div>
      </CardContent>
    </Card>
  );
}
