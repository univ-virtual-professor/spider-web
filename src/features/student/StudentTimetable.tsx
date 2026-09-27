import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { DsPageHeader, DsCard, DsDetailRail } from "@shared/ui/ds";
import { Video, MapPin, Loader2 } from "lucide-react";

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

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_PX = 56;

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

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
        <Loader2 className="h-6 w-6 animate-spin text-ds-slate" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="py-12 text-center font-ds-sans text-sm text-ds-slate">
        Your batch isn't set up yet — check back once you're enrolled.
      </div>
    );
  }

  const startHour = slots.length
    ? Math.max(6, Math.min(...slots.map((s) => Math.floor(toMinutes(s.startTime) / 60))))
    : 8;
  const endHour = slots.length
    ? Math.min(21, Math.max(...slots.map((s) => Math.ceil(toMinutes(s.endTime) / 60))))
    : 18;
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i);

  const today = slots
    .filter((s) => s.dayOfWeek === todayDow)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader title="Timetable" subtitle="Your batch's weekly class schedule." />

      {slots.length === 0 ? (
        <DsCard className="p-12 text-center">
          <p className="font-ds-sans text-[12.5px] text-ds-slate">No classes scheduled yet.</p>
        </DsCard>
      ) : (
        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_268px]">
          <DsCard className="overflow-hidden">
            <div
              className="grid border-b border-ds-ink/[.08] bg-ds-canvas"
              style={{ gridTemplateColumns: `48px repeat(7,1fr)` }}
            >
              <div />
              {DAY_LABELS.map((label, dow) => (
                <div
                  key={dow}
                  className={
                    "border-l border-ds-ink/[.06] py-2 text-center " +
                    (dow === todayDow ? "bg-ds-accent/[.06]" : "")
                  }
                >
                  <div
                    className={
                      "font-ds-sans text-[12px] font-semibold " +
                      (dow === todayDow ? "text-ds-accent" : "text-ds-ink")
                    }
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `48px repeat(7,1fr)` }}>
              <div className="border-r border-ds-ink/[.06]">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="pr-2 text-right font-ds-mono text-[10px] text-ds-ink/40"
                    style={{ height: HOUR_PX }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {DAY_LABELS.map((_, dow) => {
                const daySlots = slots.filter((s) => s.dayOfWeek === dow);
                return (
                  <div
                    key={dow}
                    className="relative border-l border-ds-ink/[.06]"
                    style={{
                      height: hours.length * HOUR_PX,
                      background:
                        dow === todayDow
                          ? "hsl(var(--ds-accent) / 0.03)"
                          : `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_PX - 1}px, hsl(var(--ds-ink) / .06) ${HOUR_PX - 1}px ${HOUR_PX}px)`,
                    }}
                  >
                    {daySlots.map((slot) => {
                      const top = (toMinutes(slot.startTime) / 60 - startHour) * HOUR_PX;
                      const height = Math.max(
                        22,
                        ((toMinutes(slot.endTime) - toMinutes(slot.startTime)) / 60) * HOUR_PX
                      );
                      return (
                        <div
                          key={slot.id}
                          className="absolute left-1 right-1 overflow-hidden rounded-md border-l-[3px] border-ds-info bg-ds-info/10 p-1.5"
                          style={{ top, height }}
                        >
                          <div className="line-clamp-2 font-ds-sans text-[10.5px] font-semibold leading-tight text-ds-ink">
                            {slot.subject}
                          </div>
                          <div className="mt-0.5 truncate font-ds-sans text-[9.5px] text-ds-ink/55">
                            {slot.teacherName}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </DsCard>

          <DsDetailRail>
            <DsCard className="p-4">
              <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                Today · {DAY_LABELS[todayDow]}
              </div>
              {today.length === 0 ? (
                <p className="font-ds-sans text-[11.5px] text-ds-ink/40">No classes today.</p>
              ) : (
                today.map((t) => (
                  <div
                    key={t.id}
                    className="flex gap-2.5 border-b border-ds-ink/[.055] py-2 last:border-0"
                  >
                    <div className="w-11 shrink-0 font-ds-mono text-[11px] text-ds-ink/55">
                      {t.startTime}
                    </div>
                    <div className="w-[3px] shrink-0 rounded-sm bg-ds-info" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-ds-sans text-[12.5px] font-medium text-ds-ink">
                        {t.subject}
                      </div>
                      <div className="truncate font-ds-sans text-[11px] text-ds-ink/45">
                        {t.teacherName}
                      </div>
                      {t.lessonId && (
                        <Link
                          to="/student/curriculum"
                          className="mt-0.5 inline-block font-ds-sans text-[10.5px] text-ds-accent hover:underline"
                        >
                          Today's topic
                        </Link>
                      )}
                    </div>
                    {t.mode === "online" && t.meetingLink ? (
                      <a
                        href={t.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-fit shrink-0 items-center gap-1 rounded-md bg-ds-fill px-1.5 py-0.5 font-ds-sans text-[10px] font-medium text-ds-ink"
                      >
                        <Video className="h-2.5 w-2.5" />
                        Join
                      </a>
                    ) : (
                      <span className="flex h-fit shrink-0 items-center gap-1 rounded-md bg-ds-fill px-1.5 py-0.5 font-ds-sans text-[10px] font-medium text-ds-ink/60">
                        <MapPin className="h-2.5 w-2.5" />
                        {t.mode}
                      </span>
                    )}
                  </div>
                ))
              )}
            </DsCard>
          </DsDetailRail>
        </div>
      )}
    </div>
  );
}
