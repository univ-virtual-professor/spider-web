import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Calendar, Clock, Loader2, VideoOff, Play } from "lucide-react";
import { toast } from "sonner";

type LiveClass = {
  id: string;
  title: string;
  branchId: string;
  branchName: string;
  courseId: string;
  courseName: string;
  batchId: string;
  batchName: string;
  scheduledDate: string;
  startTime: string;
  description?: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  scheduledTimestamp: Timestamp;
  educatorId: string;
  status: "scheduled" | "live" | "completed";
};

export default function StudentLiveClasses() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant } = useTenant();

  const educatorId = tenant?.educatorId || profile?.educatorId || null;
  const batchId = profile?.batchId || null;
  const branchId = profile?.branchId || null;
  const courseId = profile?.courseId || null;
  const navigate = useNavigate();

  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [educatorName, setEducatorName] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"scheduled" | "live" | "completed">("scheduled");

  // Fetch educator details
  useEffect(() => {
    if (!educatorId) return;

    getDoc(doc(db, "educators", educatorId))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setEducatorName(
            data.displayName || data.fullName || data.coachingName || "your educator"
          );
        }
      })
      .catch((err) => {
        console.error("Error fetching educator details:", err);
      });
  }, [educatorId]);

  // Fetch live classes scheduled for student's batch
  useEffect(() => {
    if (!educatorId || !profile?.branchId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "live_classes"),
      where("educatorId", "==", educatorId),
      where("batchId", "==", batchId),
      where("branchId", "==", branchId),
      where("courseId", "==", courseId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setClasses(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<LiveClass, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Error loading live classes:", err);
        toast.error("Failed to load live classes");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [educatorId, batchId]);

  // Status-based lists
  const filteredClasses = useMemo(() => {
    const now = new Date();
    return classes.filter((item) => {
      let scheduledDate: Date | null = null;
      if (item.scheduledTimestamp) {
        if (typeof item.scheduledTimestamp.toDate === "function") {
          scheduledDate = item.scheduledTimestamp.toDate();
        } else if ((item.scheduledTimestamp as any).seconds) {
          scheduledDate = new Date((item.scheduledTimestamp as any).seconds * 1000);
        }
      } else if (item.scheduledDate) {
        scheduledDate = new Date(item.scheduledDate);
      }

      const isPast = scheduledDate && !isNaN(scheduledDate.getTime()) && now >= scheduledDate;

      if (activeTab === "live") {
        return item.status === "live" || (item.status === "scheduled" && isPast);
      }
      if (activeTab === "scheduled") {
        return item.status === "scheduled" && !isPast;
      }
      return item.status === activeTab;
    });
  }, [classes, activeTab]);

  // Statistics Computations
  const stats = useMemo(() => {
    const now = new Date();
    const total = classes.length;
    let upcoming = 0;
    let live = 0;
    let completed = 0;

    classes.forEach((item) => {
      let scheduledDate: Date | null = null;
      if (item.scheduledTimestamp) {
        if (typeof item.scheduledTimestamp.toDate === "function") {
          scheduledDate = item.scheduledTimestamp.toDate();
        } else if ((item.scheduledTimestamp as any).seconds) {
          scheduledDate = new Date((item.scheduledTimestamp as any).seconds * 1000);
        }
      } else if (item.scheduledDate) {
        scheduledDate = new Date(item.scheduledDate);
      }

      const isPast = scheduledDate && !isNaN(scheduledDate.getTime()) && now >= scheduledDate;

      if (item.status === "completed") {
        completed++;
      } else if (item.status === "live" || (item.status === "scheduled" && isPast)) {
        live++;
      } else {
        upcoming++;
      }
    });

    return { total, upcoming, live, completed };
  }, [classes]);

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTimeLabel = (timeStr: string) => {
    if (!timeStr) return "";
    if (timeStr.includes("T") || (timeStr.includes("-") && timeStr.length > 5)) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      }
    }
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
      const hr = parseInt(parts[0], 10);
      const min = parts[1];
      const ampm = hr >= 12 ? "PM" : "AM";
      const formattedHr = hr % 12 || 12;
      return `${formattedHr}:${min} ${ampm}`;
    }
    return timeStr;
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!batchId) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-soft">
        <VideoOff className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-bold">No Batch Assigned</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          You are not enrolled in any batch. Please contact your educator to join a batch and view
          scheduled live classes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live Classes</h1>
        <p className="text-sm text-muted-foreground">
          Stay on top of your schedule and join live interactive sessions
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex space-x-6">
          {(["scheduled", "live", "completed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative pb-3 text-sm font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "scheduled" ? "Upcoming" : tab}
              {stats[tab === "scheduled" ? "upcoming" : tab] > 0 && (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                    tab === "live"
                      ? "animate-pulse bg-red-500/10 text-red-600"
                      : tab === "scheduled"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {stats[tab === "scheduled" ? "upcoming" : tab]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {filteredClasses.length === 0 ? (
        <div className="flex h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-soft">
          <VideoOff className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold">
            {activeTab === "scheduled"
              ? "No upcoming classes"
              : activeTab === "live"
                ? "No live classes right now"
                : "No completed classes"}
          </h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {activeTab === "scheduled"
              ? "No live classes scheduled for your batch at this time."
              : activeTab === "live"
                ? "There are no ongoing live streams for your batch."
                : "No completed class recordings are available."}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredClasses.map((item) => {
            const now = new Date();
            let scheduledDate: Date | null = null;
            if (item.scheduledTimestamp) {
              if (typeof item.scheduledTimestamp.toDate === "function") {
                scheduledDate = item.scheduledTimestamp.toDate();
              } else if ((item.scheduledTimestamp as any).seconds) {
                scheduledDate = new Date((item.scheduledTimestamp as any).seconds * 1000);
              }
            } else if (item.scheduledDate) {
              scheduledDate = new Date(item.scheduledDate);
            }
            const isPast = scheduledDate && !isNaN(scheduledDate.getTime()) && now >= scheduledDate;
            const isLive = item.status === "live" || (item.status === "scheduled" && isPast);
            const isCompleted = item.status === "completed";

            return (
              <Card
                key={item.id}
                className={`relative flex flex-col justify-between overflow-hidden border-border/50 shadow-soft transition-all duration-200 ${
                  isLive ? "border-red-500/40 ring-1 ring-red-500/20" : "hover:border-primary/30"
                }`}
              >
                {isLive && (
                  <div className="absolute left-0 top-0 h-[3.5px] w-full animate-pulse bg-red-500" />
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="line-clamp-2 truncate text-base font-bold leading-tight">
                        {item.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Educator:{" "}
                        <span className="font-semibold text-foreground">{educatorName}</span>
                      </p>
                    </div>
                    {isLive ? (
                      <Badge className="flex shrink-0 items-center gap-1.5 rounded-full border-none bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-500/10">
                        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-red-500" />
                        LIVE NOW
                      </Badge>
                    ) : isCompleted ? (
                      <Badge className="shrink-0 rounded-full border-none bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold text-green-600">
                        COMPLETED
                      </Badge>
                    ) : (
                      <Badge className="shrink-0 rounded-full border-none bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-600">
                        UPCOMING
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pb-4">
                  {item.description && (
                    <p className="line-clamp-2 h-8 text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  <div className="space-y-2 border-t border-border/40 pt-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-4 w-4 text-primary/65" />
                      <span>{formatDateLabel(item.scheduledDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-4 w-4 text-primary/65" />
                      <span>{formatTimeLabel(item.startTime)}</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    {isCompleted ? (
                      item.youtubeVideoId ? (
                        <Button
                          className="gradient-bg w-full rounded-lg py-5 text-xs font-semibold shadow-sm"
                          onClick={() => navigate(`/student/live-classes/${item.id}`)}
                        >
                          <Play className="mr-1.5 h-3.5 w-3.5 fill-current" /> Watch Recording
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full cursor-not-allowed rounded-lg py-5 text-xs font-semibold opacity-60"
                          disabled
                        >
                          No Recording Available
                        </Button>
                      )
                    ) : isLive && item.youtubeVideoId ? (
                      <Button
                        className="gradient-bg w-full rounded-lg py-5 text-xs font-semibold shadow-sm"
                        onClick={() => navigate(`/student/live-classes/${item.id}`)}
                      >
                        <Play className="mr-1.5 h-3.5 w-3.5 fill-current" /> Watch Class
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full cursor-not-allowed rounded-lg py-5 text-xs font-semibold opacity-60"
                        disabled
                      >
                        Watch Class (Upcoming)
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
