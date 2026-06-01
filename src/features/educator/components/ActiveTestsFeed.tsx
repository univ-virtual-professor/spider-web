import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Clock, Key, Play, CheckCircle2, CalendarClock } from "lucide-react";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";
import { cn } from "@shared/lib/utils";

type AssignStatus = "live" | "upcoming" | "code_active" | "past" | "code_expired";

interface AssignRow {
  id: string;
  testTitle: string;
  batchName: string;
  accessType: "scheduled" | "access_code";
  accessCode: string | null;
  isDpp: boolean;
  startTime: Timestamp | null;
  endTime: Timestamp | null;
  expiresAt: Timestamp | null;
  createdAt: Timestamp | null;
  status: AssignStatus;
}

function toMs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return null;
}

function getStatus(accessType: string, startTime: any, endTime: any, expiresAt: any): AssignStatus {
  const now = Date.now();
  if (accessType === "access_code") {
    const expMs = toMs(expiresAt);
    return !expMs || expMs > now ? "code_active" : "code_expired";
  }
  const startMs = toMs(startTime);
  const endMs = toMs(endTime);
  if (!startMs) return "upcoming";
  if (endMs && endMs < now) return "past";
  if (startMs <= now && (!endMs || endMs >= now)) return "live";
  return "upcoming";
}

function StatusConfig(status: AssignStatus) {
  switch (status) {
    case "live":
      return {
        icon: <Play className="h-4 w-4" />,
        iconClass: "bg-green-500/10 text-green-600",
        label: "Live",
        badgeClass: "bg-green-500/10 text-green-600",
      };
    case "upcoming":
      return {
        icon: <CalendarClock className="h-4 w-4" />,
        iconClass: "bg-primary/10 text-primary",
        label: "Upcoming",
        badgeClass: "bg-primary/10 text-primary",
      };
    case "code_active":
      return {
        icon: <Key className="h-4 w-4" />,
        iconClass: "bg-amber-500/10 text-amber-600",
        label: "Code",
        badgeClass: "bg-amber-500/10 text-amber-700",
      };
    case "past":
      return {
        icon: <CheckCircle2 className="h-4 w-4" />,
        iconClass: "bg-muted text-muted-foreground",
        label: "Past",
        badgeClass: "bg-muted text-muted-foreground",
      };
    default:
      return {
        icon: <FileText className="h-4 w-4" />,
        iconClass: "bg-muted text-muted-foreground",
        label: "Expired",
        badgeClass: "bg-muted text-muted-foreground",
      };
  }
}

export default function ActiveTestsFeed() {
  const { profile } = useAuth();
  const { tenant } = useTenant();
  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [rows, setRows] = useState<AssignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!educatorId) return;
    const q = query(
      collection(db, "educators", educatorId, "batchAssignments"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const parsed: AssignRow[] = snap.docs.map((doc) => {
          const data = doc.data() as any;
          const title = String(data.testTitle || "Untitled");
          const isDpp =
            title.toLowerCase().includes("dpp") || title.toLowerCase().includes("practice");
          const accessType = data.accessType === "access_code" ? "access_code" : "scheduled";
          const status = getStatus(accessType, data.startTime, data.endTime, data.expiresAt);
          return {
            id: doc.id,
            testTitle: title,
            batchName: String(data.batchName || ""),
            accessType,
            accessCode: data.accessCode ? String(data.accessCode) : null,
            isDpp,
            startTime: data.startTime || null,
            endTime: data.endTime || null,
            expiresAt: data.expiresAt || null,
            createdAt: data.createdAt || null,
            status,
          };
        });

        // Sort: live first, then upcoming, then code_active, then past/expired; secondary by createdAt desc
        const order: Record<AssignStatus, number> = {
          live: 0,
          upcoming: 1,
          code_active: 2,
          past: 3,
          code_expired: 4,
        };
        parsed.sort((a, b) => {
          const diff = order[a.status] - order[b.status];
          if (diff !== 0) return diff;
          return (toMs(b.createdAt) ?? 0) - (toMs(a.createdAt) ?? 0);
        });

        setRows(
          parsed.filter((r) => r.status !== "past" && r.status !== "code_expired").slice(0, 8)
        );
        setLoading(false);
      },
      () => setLoading(false)
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

    if (rows.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-muted/5 py-12 text-muted-foreground">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/5">
            <FileText className="h-5 w-5 text-primary/40" />
          </div>
          <p className="text-sm font-medium text-foreground">No active assignments</p>
          <p className="mt-1 text-xs">Assign tests to batches to see them here.</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-border/40">
        {rows.map((row) => {
          const cfg = StatusConfig(row.status);
          const timeAgo = row.createdAt?.toMillis
            ? formatDistanceToNow(row.createdAt.toMillis(), { addSuffix: true })
            : "Recently";

          return (
            <div
              key={row.id}
              className="flex items-start gap-4 p-4 transition-colors hover:bg-muted/30"
            >
              <div className={cn("mt-1 rounded-full p-2", cfg.iconClass)} title={cfg.label}>
                {cfg.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-semibold text-foreground">
                    {row.testTitle}
                  </p>
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {timeAgo}
                  </span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">{row.batchName}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="h-5 px-1.5 py-0 text-[10px]">
                    {row.isDpp ? "DPP" : "Test"}
                  </Badge>
                  <Badge className={cn("h-5 border-none px-1.5 py-0 text-[10px]", cfg.badgeClass)}>
                    {cfg.label}
                    {row.status === "code_active" && row.accessCode && (
                      <span className="ml-1 font-mono opacity-70">{row.accessCode}</span>
                    )}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [loading, rows]);

  return (
    <Card className="flex h-[450px] w-full flex-col border-border/50 shadow-sm">
      <CardHeader className="border-b border-border/50 bg-muted/10 pb-4">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Active Assignments
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              Live, upcoming, and access-code batch assignments
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
