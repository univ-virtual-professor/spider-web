import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { ArrowLeft, Loader2, VideoOff, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@app/providers/AuthProvider";

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
  watchUrl: string;
  embedUrl: string;
  youtubeVideoId: string;
  status: "scheduled" | "live" | "completed";
  educatorId: string;
};

type ChatMessage = {
  id: string;
  senderName: string;
  text: string;
  timestamp: Date;
};

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|live\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  const trimmed = url.trim();
  if (trimmed.length === 11) {
    return trimmed;
  }
  return null;
}

export default function EducatorLiveWatch() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [liveClass, setLiveClass] = useState<LiveClass | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat UI states
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senderId, setSenderId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const { firebaseUser, profile } = useAuth();

  useEffect(() => {
    if (firebaseUser) {
      setSenderId(firebaseUser.uid);
      setSenderName(
        profile?.displayName || firebaseUser.displayName || firebaseUser.email || "Student"
      );
    }
  }, [firebaseUser, profile]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setSendingMessage(true);
    try {
      await addDoc(collection(db, "live_classes", classId, "messages"), {
        text: messageText,
        senderId: senderId,
        senderName: senderName,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSendingMessage(false);
    }

    setMessageText("");
  };
  // Fetch live class details
  useEffect(() => {
    if (!classId) return;

    const q = query(
      collection(db, "live_classes", classId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(
        snapshot.docs.map((docDoc) => {
          const data = docDoc.data();
          return {
            id: docDoc.id,
            senderName: data.senderName || "Anonymous",
            senderId: data.senderId || "",
            text: data.text || "",
            timestamp: data.createdAt ? (data.createdAt as any).toDate() : new Date(),
          };
        })
      );
    });

    return () => unsub();
  }, [classId]);

  useEffect(() => {
    if (!classId) return;

    const docRef = doc(db, "live_classes", classId);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setLiveClass({ id: snap.id, ...snap.data() } as LiveClass);
        } else {
          setLiveClass(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching live class details:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [classId]);

  const handleUpdateStatus = async (newStatus: "live" | "completed") => {
    if (!liveClass) return;
    try {
      await updateDoc(doc(db, "live_classes", liveClass.id), {
        status: newStatus,
      });
      toast.success(newStatus === "live" ? "Class is now LIVE!" : "Live Class ended.");
      navigate("/educator/live-classes");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update class status");
    }
  };

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTimeLabel = (timeStr: string) => {
    if (!timeStr) return "";
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

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!liveClass) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-soft">
        <VideoOff className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-bold">Class Not Found</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          The requested live class does not exist or has been deleted.
        </p>
        <Button onClick={() => navigate("/educator/live-classes")} className="mt-4">
          Go back to Live Classes
        </Button>
      </div>
    );
  }

  const ytId = extractYouTubeId(liveClass.watchUrl);
  const isLive = liveClass.status === "live";
  const isCompleted = liveClass.status === "completed";
  const isScheduled = liveClass.status === "scheduled";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/educator/live-classes")}
            className="shrink-0 rounded-full hover:bg-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{liveClass.title}</h1>
              {isLive ? (
                <Badge className="flex shrink-0 items-center gap-1.5 rounded-full border-none bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-600 hover:bg-red-500/10">
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-red-500" />
                  LIVE NOW
                </Badge>
              ) : isCompleted ? (
                <Badge className="shrink-0 rounded-full border-none bg-green-500/10 px-2.5 py-0.5 text-xs font-bold text-green-600">
                  COMPLETED
                </Badge>
              ) : (
                <Badge className="shrink-0 rounded-full border-none bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-600">
                  SCHEDULED
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {liveClass.courseName} · Batch: {liveClass.batchName}
            </p>
          </div>
        </div>

        {/* Educator Actions */}
        <div className="flex gap-2">
          {isScheduled && (
            <Button
              className="rounded-lg bg-red-600 font-semibold text-white hover:bg-red-700"
              onClick={() => handleUpdateStatus("live")}
            >
              Start Stream Live
            </Button>
          )}
          {isLive && (
            <Button
              variant="outline"
              className="rounded-lg border-red-200 font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => handleUpdateStatus("completed")}
            >
              End Live Stream
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stream player and info */}
        <div className="space-y-6 lg:col-span-2">
          {liveClass.embedUrl ? (
            <div className="relative aspect-video h-[85vh] w-full overflow-hidden rounded-2xl border bg-black shadow-md">
              <iframe
                src={liveClass.embedUrl}
                title={liveClass.title}
                className="absolute inset-0 h-full w-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <VideoOff className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="text-base font-semibold">Video Stream Not Setup</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                There is no watch URL linked to this class. Make sure YouTube broadcast setup was
                successful.
              </p>
            </div>
          )}

          {/* Message Input Box directly below iframe */}
          {liveClass.status === "live" && (
            <form
              onSubmit={handleSendMessage}
              className="flex gap-2 rounded-2xl border border-border/50 bg-card p-3 shadow-soft"
            >
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type a message to the class..."
                className="h-11 flex-1 rounded-lg border-input bg-card py-5 focus:ring-primary"
              />
              <Button
                type="submit"
                className="gradient-bg h-11 gap-1.5 rounded-lg px-4 text-white shadow-soft"
              >
                <Send className="h-4 w-4" /> Send
              </Button>
            </form>
          )}
        </div>

        {/* Attendance/Stream Management Sidebar */}
        {liveClass.status == "live" && (
          <div className="space-y-6">
            {/* Live Chat Panel on the right of iframe */}
            <Card className="flex h-[400px] flex-col border-border/50 shadow-soft">
              <CardHeader className="border-b border-border/30 pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live Chat
                </CardTitle>
              </CardHeader>
              <CardContent className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No messages yet. Say hello!
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col text-xs">
                      <div className="mb-0.5 flex items-center gap-1.5 font-bold">
                        <span className={"text-foreground"}>{msg.senderName}</span>

                        <span className="ml-auto text-[9px] font-normal text-muted-foreground/60">
                          {msg.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="break-words rounded-lg bg-muted/50 p-2 text-foreground/95">
                        {msg.text}
                      </p>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
