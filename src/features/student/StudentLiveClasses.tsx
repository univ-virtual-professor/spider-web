import { useEffect, useState, useMemo } from "react";
import { collection, doc, getDoc, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Calendar, Clock, Loader2, VideoOff, Play } from "lucide-react";
import { toast } from "sonner";

type LiveClass = {
  id: string;
  title: string;
  batchId: string;
  batchName: string;
  date: string;
  time: string;
  duration: number;
  description?: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  scheduledTimestamp: any;
  educatorId: string;
  status: "scheduled" | "live" | "completed";
};

export default function StudentLiveClasses() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant } = useTenant();

  const educatorId = tenant?.educatorId || profile?.educatorId || null;
  const batchId = profile?.batchId || null;

  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [educatorName, setEducatorName] = useState("");
  const [loading, setLoading] = useState(true);

  // Watch Dialog State
  const [selectedWatchClass, setSelectedWatchClass] = useState<LiveClass | null>(null);

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
    if (!educatorId || !batchId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "educators", educatorId, "liveClasses"),
      where("batchId", "==", batchId),
      orderBy("scheduledTimestamp", "asc")
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

  // Filter out completed classes (only show live and scheduled/upcoming)
  const activeClasses = useMemo(() => {
    return classes.filter((item) => item.status !== "completed");
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
    const [hours, minutes] = timeStr.split(":");
    const hr = parseInt(hours);
    const ampm = hr >= 12 ? "PM" : "AM";
    const formattedHr = hr % 12 || 12;
    return `${formattedHr}:${minutes} ${ampm}`;
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
        <h1 className="text-2xl font-bold tracking-tight">Upcoming Live Classes</h1>
        <p className="text-sm text-muted-foreground">
          Stay on top of your schedule and join live interactive sessions
        </p>
      </div>

      {activeClasses.length === 0 ? (
        <div className="flex h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-soft">
          <VideoOff className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold">No upcoming classes</h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            No live classes scheduled for your batch at this time.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {activeClasses.map((item) => (
            <Card
              key={item.id}
              className={`relative flex flex-col justify-between overflow-hidden border-border/50 shadow-soft transition-all duration-200 ${
                item.status === "live"
                  ? "border-red-500/40 ring-1 ring-red-500/20"
                  : "hover:border-primary/30"
              }`}
            >
              {item.status === "live" && (
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
                  {item.status === "live" ? (
                    <Badge className="flex shrink-0 items-center gap-1.5 rounded-full border-none bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-500/10">
                      <span className="h-1.5 w-1.5 animate-ping rounded-full bg-red-500" />
                      LIVE NOW
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
                    <span>{formatDateLabel(item.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-4 w-4 text-primary/65" />
                    <span>
                      {formatTimeLabel(item.time)} · {item.duration} mins
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  {item.status === "live" && item.youtubeVideoId ? (
                    <Button
                      className="gradient-bg w-full rounded-lg py-5 text-xs font-semibold shadow-sm"
                      onClick={() => setSelectedWatchClass(item)}
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
          ))}
        </div>
      )}

      {/* Watch Stream Dialog */}
      <Dialog
        open={!!selectedWatchClass}
        onOpenChange={(open) => !open && setSelectedWatchClass(null)}
      >
        <DialogContent className="max-w-3xl rounded-xl">
          <DialogHeader>
            <DialogTitle className="truncate text-lg font-bold">
              {selectedWatchClass?.title}
            </DialogTitle>
            <CardDescription>Educator: {educatorName}</CardDescription>
          </DialogHeader>
          {selectedWatchClass?.youtubeVideoId && (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black shadow-md">
              <iframe
                src={`https://www.youtube.com/embed/${selectedWatchClass.youtubeVideoId}?autoplay=1`}
                title={selectedWatchClass.title}
                className="absolute inset-0 h-full w-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          {selectedWatchClass?.description && (
            <div className="mt-2 max-h-[150px] space-y-1 overflow-y-auto pr-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Description
              </h4>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {selectedWatchClass.description}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
