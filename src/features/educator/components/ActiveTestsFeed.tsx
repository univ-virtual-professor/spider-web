import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Clock, FilePlus, CalendarCheck } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";

interface ActiveTest {
  id: string;
  title: string;
  subject?: string;
  createdAt: any;
  updatedAt: any;
  startTime: any;
  isDpp: boolean;
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
      (snap) => {
        const fetched = snap.docs.map((doc) => {
          const data = doc.data();
          const title = (data.title || "").toLowerCase();
          const isDpp = title.includes("dpp") || title.includes("practice");
          return {
            id: doc.id,
            title: data.title || "Untitled Test",
            subject: data.subject || "General",
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            startTime: data.startTime,
            isDpp,
          };
        }) as ActiveTest[];

        // Sort by most recently updated or created
        fetched.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const timeB = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });

        setTests(fetched.slice(0, 10)); // Show top 10 recent
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching active tests:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [educatorId]);

  return (
    <Card className="flex w-full flex-col border-border/50 shadow-sm">
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
              Recently created or scheduled tests & DPPs
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-primary/30 max-h-[350px] overflow-y-auto">
          {loading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : tests.length === 0 ? (
            <div className="flex flex-col items-center justify-center bg-muted/5 py-12 text-muted-foreground">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/5">
                <FileText className="h-5 w-5 text-primary/40" />
              </div>
              <p className="text-sm font-medium text-foreground">No recent assessments</p>
              <p className="mt-1 text-xs">Create a test or DPP to see it here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {tests.map((test) => {
                const timeRef = test.updatedAt || test.createdAt;
                const timeStr = timeRef?.toMillis
                  ? formatDistanceToNow(timeRef.toMillis(), { addSuffix: true })
                  : "Recently";

                return (
                  <div
                    key={test.id}
                    className="flex items-start gap-4 p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="mt-1">
                      {test.startTime ? (
                        <div
                          className="rounded-full bg-primary/10 p-2 text-primary"
                          title="Scheduled"
                        >
                          <CalendarCheck className="h-4 w-4" />
                        </div>
                      ) : (
                        <div
                          className="rounded-full bg-muted p-2 text-muted-foreground"
                          title="Created/Draft"
                        >
                          <FilePlus className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-semibold text-foreground">
                          {test.title}
                        </p>
                        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {timeStr}
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
                        {test.startTime && (
                          <Badge className="h-5 border-none bg-green-500/10 px-1.5 py-0 text-[10px] text-green-600 hover:bg-green-500/20 dark:text-green-400">
                            Scheduled
                          </Badge>
                        )}
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
