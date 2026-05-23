import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ShieldAlert, XCircle, MonitorOff } from "lucide-react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";

interface CheatAlert {
  id: string;
  studentId: string;
  studentName: string;
  testId: string;
  testTitle: string;
  violationType: string;
  tenantSlug: string;
  timestamp: any;
}

export default function CheatActivityFeed() {
  const { profile } = useAuth();
  const { tenant } = useTenant();
  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [alerts, setAlerts] = useState<CheatAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!educatorId) return;

    const q = query(
      collection(db, "educators", educatorId, "cheat_alerts"),
      orderBy("timestamp", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetchedAlerts = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as CheatAlert[];

        setAlerts(fetchedAlerts);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching cheat alerts:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [educatorId]);

  const getViolationIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("tab") || t.includes("window")) return <MonitorOff className="h-3.5 w-3.5" />;
    if (t.includes("fullscreen")) return <XCircle className="h-3.5 w-3.5" />;
    return <AlertTriangle className="h-3.5 w-3.5" />;
  };

  return (
    <Card className="flex h-[450px] w-full flex-col border-red-500/20 shadow-sm">
      <CardHeader className="border-b border-border/50 bg-red-50/30 pb-4 dark:bg-red-950/10">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-red-100 p-1.5 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-red-700 dark:text-red-400">
              Security Alerts
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              Live proctoring violations & tab switches
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-red-500/30 h-full overflow-y-auto">
          {loading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center bg-muted/5 py-12 text-muted-foreground">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                <ShieldAlert className="h-5 w-5 text-green-500/60" />
              </div>
              <p className="text-sm font-medium text-foreground">No violations detected</p>
              <p className="mt-1 text-xs">Students are taking tests securely.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {alerts.map((alert) => {
                const timeStr = alert.timestamp?.toMillis
                  ? formatDistanceToNow(alert.timestamp.toMillis(), { addSuffix: true })
                  : "Recently";

                return (
                  <div
                    key={alert.id}
                    className="p-4 transition-colors hover:bg-red-50/50 dark:hover:bg-red-950/20"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-foreground">
                        {alert.studentName}
                      </p>
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
                        {timeStr}
                      </span>
                    </div>

                    <div className="mb-3 flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="flex h-5 items-center gap-1 border-red-200 bg-red-100 px-1.5 py-0 text-[10px] text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400"
                      >
                        {getViolationIcon(alert.violationType)}
                        {alert.violationType}
                      </Badge>
                    </div>

                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      Test:{" "}
                      <span className="font-medium text-foreground/80">{alert.testTitle}</span>
                    </p>
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
