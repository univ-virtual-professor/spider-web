import { useEffect, useState, useCallback } from "react";
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
  getDocs,
  where,
  deleteDoc,
} from "firebase/firestore";
import { cn } from "@shared/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { useNavigate } from "react-router-dom";

type AppNotification = {
  id: string;
  notificationId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: any;
  createdByRole: "ADMIN" | "EDUCATOR";
};

interface NotificationBellProps {
  uid: string;
  canBroadcast?: boolean;
  onBroadcast?: () => void;
  supportThreadCount?: number;
  supportThreadLink?: string;
}

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

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      );
    }, () => setNotifications([]));
    return () => unsub();
  }, [uid]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = useCallback(async (notifId: string) => {
    try {
      await updateDoc(doc(db, "users", uid, "notifications", notifId), { read: true });
    } catch { /* silent */ }
  }, [uid]);

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach((n) => {
      batch.update(doc(db, "users", uid, "notifications", n.id), { read: true });
    });
    try { await batch.commit(); } catch { /* silent */ }
  }, [uid, notifications]);

  const clearAll = useCallback(async () => {
    if (!notifications.length) return;
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      batch.delete(doc(db, "users", uid, "notifications", n.id));
    });
    try { await batch.commit(); } catch { /* silent */ }
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
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0 rounded-xl shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">Notifications</span>
          <div className="flex items-center gap-1">
            {canBroadcast && onBroadcast && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                title="Send notification"
                onClick={() => { setOpen(false); onBroadcast(); }}
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
                    "w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors",
                    !n.read && "bg-primary/5"
                  )}
                  onClick={() => markRead(n.id)}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                    <div className={cn("flex-1 min-w-0", n.read && "pl-3.5")}>
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{relativeTime(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))}

              {supportThreadCount > 0 && (
                <>
                  {notifications.length > 0 && <div className="border-t border-border" />}
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-2"
                    onClick={() => {
                      setOpen(false);
                      if (supportThreadLink) navigate(supportThreadLink);
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-0.5" />
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
