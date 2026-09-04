import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { CalendarClock, Video, MapPin, Loader2 } from "lucide-react";

type Slot = {
  id: string;
  subject: string;
  teacherName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  mode: "offline" | "online";
  meetingLink?: string;
  moduleId?: string;
  lessonId?: string;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function StudentTimetable() {
  const { profile } = useAuth();
  const educatorId: string = profile?.educatorId ?? "";
  const branchId: string = profile?.branchId ?? "";
  const courseId: string = profile?.courseId ?? "";
  const batchId: string = profile?.batchId ?? "";

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  const ready = !!(educatorId && branchId && courseId && batchId);
  const todayDow = new Date().getDay();

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
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
        "timetable"
      ),
      (snap) => {
        setSlots(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [ready, educatorId, branchId, courseId, batchId]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarClock className="h-6 w-6" />
          Timetable
        </h1>
        <p className="text-sm text-muted-foreground">Your batch's weekly class schedule.</p>
      </div>

      {slots.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No classes scheduled yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {DAY_LABELS.map((label, dow) => {
            const daySlots = slots
              .filter((s) => s.dayOfWeek === dow)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            if (daySlots.length === 0) return null;
            const isToday = dow === todayDow;
            return (
              <Card key={dow} className={isToday ? "border-primary/40 bg-primary/5" : undefined}>
                <CardContent className="pt-5">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    {label}
                    {isToday && (
                      <Badge className="bg-primary/15 text-[10px] text-primary">Today</Badge>
                    )}
                  </p>
                  <div className="space-y-2">
                    {daySlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{slot.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {slot.startTime}–{slot.endTime} · {slot.teacherName}
                          </p>
                          {slot.lessonId && (
                            <Link
                              to="/student/curriculum"
                              className="mt-1 inline-block text-xs text-primary underline"
                            >
                              Today's topic
                            </Link>
                          )}
                        </div>
                        {slot.mode === "online" && slot.meetingLink ? (
                          <a
                            href={slot.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                          >
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Video className="h-3 w-3" />
                              Join
                            </Badge>
                          </a>
                        ) : (
                          <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                            {slot.mode === "online" ? (
                              <Video className="h-3 w-3" />
                            ) : (
                              <MapPin className="h-3 w-3" />
                            )}
                            {slot.mode}
                          </Badge>
                        )}
                      </div>
                    ))}
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
