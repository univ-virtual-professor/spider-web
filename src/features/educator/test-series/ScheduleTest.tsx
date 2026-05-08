/**
 * ScheduleTest — improved scheduling dialog with proper Calendar picker,
 * isScheduleActive toggle, and basic weekly/monthly recurrence.
 *
 * Fields written to educators/{uid}/my_tests/{testId}:
 *   startTime, endTime, scheduledTimezone, isScheduleActive, recurrence
 */

import { useEffect, useState } from "react";
import { Clock, X, RefreshCw, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Label } from "@shared/ui/label";
import { Switch } from "@shared/ui/switch";
import { Input } from "@shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { toast } from "sonner";
import { doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, auth } from "@shared/lib/firebase";
import { logError } from "@shared/lib/errorLogger";

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL as string;

// ─── types ────────────────────────────────────────────────────────────────────

type RecurrenceType = "none" | "weekly" | "monthly";

interface ScheduleTestProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  test: any;
  userId: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toLocalInput(ts: any): string {
  if (!ts) return "";
  const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToTimestamp(value: string): Timestamp | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

function userTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── component ───────────────────────────────────────────────────────────────

export default function ScheduleTest({ open, onOpenChange, test, userId }: ScheduleTestProps) {
  const [loading, setLoading] = useState(false);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isScheduleActive, setIsScheduleActive] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("none");
  const [recurrenceDayOfWeek, setRecurrenceDayOfWeek] = useState(1); // Monday
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState(1);
  const [recurrenceEndsAt, setRecurrenceEndsAt] = useState("");

  const tz = userTimezone();

  // Populate from test doc on open
  useEffect(() => {
    if (!open || !test) return;
    setStartTime(toLocalInput(test.startTime));
    setEndTime(toLocalInput(test.endTime));
    setIsScheduleActive(!!test.isScheduleActive);
    setRecurrenceType(test.recurrence?.type ?? "none");
    setRecurrenceDayOfWeek(test.recurrence?.dayOfWeek ?? 1);
    setRecurrenceDayOfMonth(test.recurrence?.dayOfMonth ?? 1);
    setRecurrenceEndsAt(toLocalInput(test.recurrence?.endsAt));
  }, [open, test]);

  const handleClear = () => {
    setStartTime("");
    setEndTime("");
    setIsScheduleActive(false);
    setRecurrenceType("none");
    setRecurrenceEndsAt("");
  };

  const validate = (): boolean => {
    if (startTime && endTime) {
      const s = new Date(startTime);
      const e = new Date(endTime);
      if (s >= e) {
        toast.error("End time must be after start time.");
        return false;
      }
      if (recurrenceType !== "none") {
        const endsAt = recurrenceEndsAt ? new Date(recurrenceEndsAt) : null;
        if (endsAt && endsAt <= e) {
          toast.error("Recurrence end date must be after the first end time.");
          return false;
        }
      }
    } else if (startTime || endTime) {
      toast.error("Set both start and end times, or clear both to remove schedule.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!test || !userId) return;
    if (!validate()) return;

    setLoading(true);
    try {
      const testRef = doc(db, "educators", userId, "my_tests", test.id);

      const hasSchedule = !!(startTime && endTime);

      const recurrence =
        hasSchedule && recurrenceType !== "none"
          ? {
              type: recurrenceType,
              ...(recurrenceType === "weekly" ? { dayOfWeek: recurrenceDayOfWeek } : {}),
              ...(recurrenceType === "monthly" ? { dayOfMonth: recurrenceDayOfMonth } : {}),
              durationHours: (() => {
                const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
                return Math.round(ms / 3600000);
              })(),
              endsAt: recurrenceEndsAt ? localInputToTimestamp(recurrenceEndsAt) : null,
            }
          : null;

      await updateDoc(testRef, {
        startTime: hasSchedule ? localInputToTimestamp(startTime) : null,
        endTime: hasSchedule ? localInputToTimestamp(endTime) : null,
        scheduledTimezone: tz,
        isScheduleActive: hasSchedule ? isScheduleActive : false,
        recurrence,
        updatedAt: serverTimestamp(),
      });

      toast.success(hasSchedule ? "Schedule saved!" : "Schedule cleared.");
      onOpenChange(false);

      // Fire notification to eligible students (non-blocking)
      fireTestNotification({ hasSchedule, isScheduleActive }).catch(() => {});
    } catch (e) {
      logError(e, "ScheduleTest.handleSave");
      toast.error("Failed to update schedule.");
    } finally {
      setLoading(false);
    }
  };

  async function fireTestNotification({
    hasSchedule,
    isScheduleActive: newActive,
  }: { hasSchedule: boolean; isScheduleActive: boolean }) {
    const batchIds: string[] = test.targetBatches ?? [];
    if (!batchIds.length) return; // no eligible students

    const wasScheduled = !!(test.isScheduleActive && test.startTime);
    const nowScheduled = hasSchedule && newActive;
    const prevStartStr = toLocalInput(test.startTime);

    let notifTitle = "";
    let notifBody = "";

    const fmtStart = startTime ? new Date(startTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
    const fmtPrev = prevStartStr ? new Date(prevStartStr).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
    const testName = test.title || "Upcoming Test";
    const duration = test.durationMinutes ? ` · ${test.durationMinutes} min` : "";

    if (!wasScheduled && nowScheduled) {
      notifTitle = `Test Scheduled: ${testName}`;
      notifBody = `${testName} is scheduled for ${fmtStart}${duration}.`;
    } else if (wasScheduled && !nowScheduled) {
      notifTitle = `Test Cancelled: ${testName}`;
      notifBody = `${testName} (previously scheduled for ${fmtPrev}) has been cancelled.`;
    } else if (wasScheduled && nowScheduled && prevStartStr !== startTime) {
      notifTitle = `Test Rescheduled: ${testName}`;
      notifBody = `${testName} has been moved to ${fmtStart}${duration}.`;
    } else {
      return; // nothing notification-worthy changed
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${MONKEY_KING}/api/notifications/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: notifTitle,
          body: notifBody,
          target_type: "educator_filtered",
          batch_ids: batchIds,
        }),
      });
    } catch (e) {
      logError(e, "ScheduleTest.fireTestNotification");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Schedule Test
          </DialogTitle>
          <DialogDescription>
            Set a time window when enrolled students can access this test without an access code.
            Times are in your local timezone ({tz}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Date/time inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startTime" className="text-xs">Start</Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime" className="text-xs">End</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-xl text-sm"
              />
            </div>
          </div>

          {/* Auto-activate toggle */}
          {(startTime || endTime) && (
            <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Auto-publish at start time</p>
                <p className="text-xs text-muted-foreground">
                  Test becomes live automatically when the schedule starts
                </p>
              </div>
              <Switch
                checked={isScheduleActive}
                onCheckedChange={setIsScheduleActive}
              />
            </div>
          )}

          {/* Recurrence */}
          {(startTime && endTime) && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Recurrence
                </Label>
                <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No recurrence (one-time)</SelectItem>
                    <SelectItem value="weekly">Repeat weekly</SelectItem>
                    <SelectItem value="monthly">Repeat monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recurrenceType === "weekly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Day of week</Label>
                  <div className="flex gap-1">
                    {DAY_LABELS.map((day, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setRecurrenceDayOfWeek(i)}
                        className={`flex-1 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          recurrenceDayOfWeek === i
                            ? "bg-primary text-white border-primary"
                            : "border-muted text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recurrenceType === "monthly" && (
                <div className="space-y-1.5">
                  <Label htmlFor="dayOfMonth" className="text-xs">Day of month (1–28)</Label>
                  <Input
                    id="dayOfMonth"
                    type="number"
                    min={1}
                    max={28}
                    value={recurrenceDayOfMonth}
                    onChange={(e) => setRecurrenceDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value))))}
                    className="rounded-xl"
                  />
                </div>
              )}

              {recurrenceType !== "none" && (
                <div className="space-y-1.5">
                  <Label htmlFor="endsAt" className="text-xs">Recurrence ends (optional)</Label>
                  <Input
                    id="endsAt"
                    type="datetime-local"
                    value={recurrenceEndsAt}
                    onChange={(e) => setRecurrenceEndsAt(e.target.value)}
                    className="rounded-xl text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {(startTime || endTime) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="w-fit text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
            >
              <X className="h-4 w-4 mr-1" />
              Clear Schedule
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="rounded-xl gradient-bg text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
