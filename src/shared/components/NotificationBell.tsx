import { useEffect, useState, useCallback, useRef } from "react";
import { Bell, Pencil, Check, Trash2 } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/popover";
import { db } from "@shared/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  writeBatch,
  doc,
  updateDoc,
} from "firebase/firestore";
import { cn } from "@shared/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type AppNotification = {
  id: string;
  notificationId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: any;
  createdByRole: "ADMIN" | "EDUCATOR";
  type?: string;
  attemptId?: string;
};

interface NotificationBellProps {
  uid: string;
  canBroadcast?: boolean;
  onBroadcast?: () => void;
  supportThreadCount?: number;
  supportThreadLink?: string;
}

// Global cache of played notification IDs to prevent duplicate sound/toast triggers across multiple bell instances (e.g., mobile + desktop)
const playedNotifications = new Set<string>();

export default function NotificationBell({
  uid,
  canBroadcast,
  onBroadcast,
  supportThreadCount = 0,
  supportThreadLink,
}: NotificationBellProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isFirstLoadRef = useRef(true);

  const markRead = useCallback(
    async (notifId: string) => {
      try {
        await updateDoc(doc(db, "users", uid, "notifications", notifId), { read: true });
      } catch {
        /* silent */
      }
    },
    [uid]
  );

  const handleNotificationClick = useCallback(
    async (n: AppNotification) => {
      setOpen(false);
      await markRead(n.id);

      if (n.type === "review_needed") {
        if (n.attemptId) {
          navigate(`/educator/review-submissions/${n.attemptId}`);
        } else {
          navigate("/educator/review-submissions");
        }
      } else if (n.type === "qp_status_update") {
        navigate("/educator/question-papers");
      } else if (n.type === "qp_request") {
        navigate("/admin/question-paper-requests");
      } else if (n.type === "question_reported" || n.title === "Question Reported") {
        navigate("/admin/reported-questions");
      }
    },
    [navigate, markRead]
  );

  // Play a gentle dual-tone notification sound using browser AudioContext
  const playNotificationSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();

      const playTone = (freq: number, start: number, duration: number, volume: number) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);

        gainNode.gain.setValueAtTime(volume, start);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(start);
        osc.stop(start + duration);
      };

      const triggerChime = () => {
        console.log("[NotificationBell] Playing synthetic chime sound...");
        const now = audioCtx.currentTime;
        playTone(1046.5, now, 0.3, 0.18); // C6 (Higher)
        playTone(1318.51, now + 0.1, 0.4, 0.18); // E6 (Higher)
      };

      if (audioCtx.state === "suspended") {
        audioCtx
          .resume()
          .then(triggerChime)
          .catch((err) => {
            console.warn("[NotificationBell] AudioContext resume failed:", err);
          });
      } else {
        triggerChime();
      }
    } catch (e) {
      console.warn("[NotificationBell] Failed to play synthetic chime sound:", e);
    }
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const newNotifs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setNotifications(newNotifs);

        if (isFirstLoadRef.current) {
          isFirstLoadRef.current = false;
          return;
        }

        // Subsequent updates: check for newly added notifications
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const docData = change.doc.data() as AppNotification;
            const notifId = change.doc.id;

            // Only trigger sound/banner for notifications that are unread and haven't been played/shown yet
            if (!docData.read && !playedNotifications.has(notifId)) {
              playedNotifications.add(notifId);
              playNotificationSound();

              const notif = { id: notifId, ...docData };
              toast(notif.title, {
                id: notifId, // Use notification ID to prevent sonner from creating duplicate toast banners
                description: notif.body,
                duration: 8000,
                action: {
                  label: "View",
                  onClick: () => handleNotificationClick(notif),
                },
              });
            }
          }
        });
      },
      () => setNotifications([])
    );
    return () => unsub();
  }, [uid, playNotificationSound, handleNotificationClick]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach((n) => {
      batch.update(doc(db, "users", uid, "notifications", n.id), { read: true });
    });
    try {
      await batch.commit();
    } catch {
      /* silent */
    }
  }, [uid, notifications]);

  const clearAll = useCallback(async () => {
    if (!notifications.length) return;
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      batch.delete(doc(db, "users", uid, "notifications", n.id));
    });
    try {
      await batch.commit();
    } catch {
      /* silent */
    }
  }, [uid, notifications]);

  function relativeTime(ts: any): string {
    try {
      const date = ts?.toDate ? ts.toDate() : new Date(ts);
      return formatDistanceToNowStrict(date, { addSuffix: true });
    } catch {
      return "";
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl">
          <Bell className="h-5 w-5" />
          {(unreadCount > 0 || supportThreadCount > 0) && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 rounded-xl p-0 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-1">
            {canBroadcast && onBroadcast && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                title="Send notification"
                onClick={() => {
                  setOpen(false);
                  onBroadcast();
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {notifications.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  title="Mark all read"
                  onClick={markAllRead}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg text-destructive"
                  title="Clear all"
                  onClick={clearAll}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && supportThreadCount === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <>
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={cn(
                    "w-full border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50",
                    !n.read && "bg-primary/5"
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                    )}
                    <div className={cn("min-w-0 flex-1", n.read && "pl-3.5")}>
                      <p className="truncate text-sm font-medium md:hidden">
                        {n.title.includes(":") ? n.title.split(":")[0].trim() : n.title}
                      </p>
                      <p className="hidden truncate text-sm font-medium md:block">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {relativeTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}

              {supportThreadCount > 0 && (
                <>
                  {notifications.length > 0 && <div className="border-t border-border" />}
                  <button
                    className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => {
                      setOpen(false);
                      if (supportThreadLink) navigate(supportThreadLink);
                    }}
                  >
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                    <div>
                      <p className="text-sm font-medium">Messages</p>
                      <p className="text-xs text-muted-foreground">
                        {supportThreadCount} unread conversation{supportThreadCount > 1 ? "s" : ""}
                      </p>
                    </div>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
