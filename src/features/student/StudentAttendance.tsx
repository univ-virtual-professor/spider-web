import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { format, parseISO } from "date-fns";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { CalendarCheck, Loader2 } from "lucide-react";

type Status = "present" | "absent" | "late";
type Session = { id: string; date: string; subject?: string; status: Status | undefined };

const STATUS_BADGE: Record<Status, string> = {
  present: "bg-green-500/10 text-green-700 border-green-200",
  late: "bg-amber-500/10 text-amber-700 border-amber-200",
  absent: "bg-red-500/10 text-red-700 border-red-200",
};

export default function StudentAttendance() {
  const { profile } = useAuth();
  const educatorId: string = profile?.educatorId ?? "";
  const branchId: string = profile?.branchId ?? "";
  const courseId: string = profile?.courseId ?? "";
  const batchId: string = profile?.batchId ?? "";
  const uid: string = profile?.uid ?? "";

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const ready = !!(educatorId && branchId && courseId && batchId);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          branchId,
          "courses",
          courseId,
          "batches",
          batchId,
          "sessions"
        ),
        orderBy("date", "desc")
      ),
      (snap) => {
        setSessions(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              date: String(data.date || d.id),
              subject: data.subject ? String(data.subject) : undefined,
              status: (data.attendance || {})[uid] as Status | undefined,
            };
          })
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [ready, educatorId, branchId, courseId, batchId, uid]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Your batch isn't set up yet — check back once you're enrolled.
      </div>
    );
  }

  const marked = sessions.filter((s) => s.status);
  const presentCount = marked.filter((s) => s.status === "present").length;
  const lateCount = marked.filter((s) => s.status === "late").length;
  const absentCount = marked.filter((s) => s.status === "absent").length;
  const pct =
    marked.length > 0 ? Math.round(((presentCount + lateCount) / marked.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarCheck className="h-6 w-6" />
          Attendance
        </h1>
        <p className="text-sm text-muted-foreground">Your class attendance record.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{pct}%</p>
            <p className="text-xs text-muted-foreground">Attendance</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-green-600">{presentCount}</p>
            <p className="text-xs text-muted-foreground">Present</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{lateCount}</p>
            <p className="text-xs text-muted-foreground">Late</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-red-600">{absentCount}</p>
            <p className="text-xs text-muted-foreground">Absent</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No attendance recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm">
                      {(() => {
                        try {
                          return format(parseISO(s.date), "EEEE, MMM d, yyyy");
                        } catch {
                          return s.date;
                        }
                      })()}
                    </p>
                    {s.subject && <p className="text-xs text-muted-foreground">{s.subject}</p>}
                  </div>
                  {s.status ? (
                    <Badge
                      variant="outline"
                      className={`text-xs capitalize ${STATUS_BADGE[s.status]}`}
                    >
                      {s.status}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Not marked
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
