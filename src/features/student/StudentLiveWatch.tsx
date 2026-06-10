import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  addDoc,
  collection,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { ArrowLeft, Loader2, VideoOff, Send } from "lucide-react";

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
  senderId: string;
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

export default function StudentLiveWatch() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [liveClass, setLiveClass] = useState<LiveClass | null>(null);
  const [educatorName, setEducatorName] = useState("");
  const [loading, setLoading] = useState(true);

  // Chat UI states
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senderId, setSenderId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const { firebaseUser, profile } = useAuth();

  useEffect(() => {
    if (firebaseUser) {
      setSenderId(firebaseUser.uid);
      setSenderName(
        profile?.displayName || firebaseUser.displayName || firebaseUser.email || "Student"
      );
    }
  }, [firebaseUser, profile]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

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

  // Fetch live class details
  useEffect(() => {
    if (!classId) return;

    const docRef = doc(db, "live_classes", classId);
    const unsub = onSnapshot(
      docRef,
      async (snap) => {
        if (snap.exists()) {
          const classData = { id: snap.id, ...snap.data() } as LiveClass;

          setLiveClass((prevClass) => {
            if (prevClass && prevClass.status === "live" && classData.status === "completed") {
              toast.info("This live class has ended.");
              setTimeout(() => navigate("/student/live-classes"), 100);
            }
            return classData;
          });

          // Fetch educator details
          if (classData.educatorId) {
            try {
              const educatorSnap = await getDoc(doc(db, "educators", classData.educatorId));
              if (educatorSnap.exists()) {
                const data = educatorSnap.data();
                setEducatorName(
                  data.displayName || data.fullName || data.coachingName || "your educator"
                );
              }
            } catch (err) {
              console.error("Error fetching educator details:", err);
            }
          }
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
        <Button onClick={() => navigate("/student/live-classes")} className="mt-4">
          Go back to Live Classes
        </Button>
      </div>
    );
  }

  const ytId = extractYouTubeId(liveClass.watchUrl);
  const isLive = liveClass.status === "live";
  const isCompleted = liveClass.status === "completed";

  return (
    <div className="space-y-6">
      {/* Header / Back action */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/student/live-classes")}
          className="rounded-full hover:bg-primary"
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
                UPCOMING
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Main Stream Area */}
        <div className="w-full">
          {liveClass.embedUrl ? (
            <div className="relative aspect-video h-[85vh] w-full overflow-hidden rounded-2xl border bg-black shadow-md">
              <iframe
                src={`https://www.youtube.com/embed/${liveClass.youtubeVideoId}?autoplay=1&origin=${encodeURIComponent(window.location.origin)}`}
                title={liveClass.title}
                className="absolute inset-0 h-full w-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
              <div className="absolute inset-0 z-10" style={{ pointerEvents: "all" }} />
            </div>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <VideoOff className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="text-base font-semibold">Video Stream Not Available</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                There is no streaming link connected to this scheduled class.
              </p>
            </div>
          )}
        </div>
        {liveClass.status === "live" && (
          <div className="space-y-6">
            <Card className="flex h-[500px] flex-col border-border/50 shadow-soft">
              <CardHeader className="border-b border-border/30 pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live Chat
                </CardTitle>
              </CardHeader>

              {/* Messages */}
              <CardContent className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No messages yet. Say hello!
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col text-xs">
                      <div className="mb-0.5 flex items-center gap-1.5 font-bold">
                        <span className="text-foreground">
                          {msg.senderId == firebaseUser?.uid ? "You" : msg.senderName}
                        </span>
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

              {/* Input pinned at bottom inside the card */}
              <div className="border-t border-border/30 p-3">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="h-10 flex-1 rounded-lg border-input bg-card focus:ring-primary"
                  />
                  <Button
                    type="submit"
                    className="gradient-bg h-10 gap-1.5 rounded-lg px-4 text-white shadow-soft"
                    disabled={sendingMessage}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
