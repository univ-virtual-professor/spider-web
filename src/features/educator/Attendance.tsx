import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { format } from "date-fns";
import { toast } from "sonner";
import { Link, useLocation } from "react-router-dom";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { Button } from "@shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/popover";
import { Calendar } from "@shared/ui/calendar";
import { Textarea } from "@shared/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@shared/ui/toggle-group";
import { DsPageHeader, DsCard, DsDetailRail } from "@shared/ui/ds";
import { CalendarClock, CalendarIcon, Loader2, MessageSquarePlus, Check, X } from "lucide-react";

type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type Batch = { id: string; courseId: string; branchId: string; name: string };
type Student = { id: string; name: string; email?: string };
type Slot = {
  id: string;
  subject: string;
  teacherUid: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type Status = "present" | "absent" | "late";

type CorrectionRequest = {
  id: string;
  studentId: string;
  studentName: string;
  currentStatus: Status;
  requestedStatus: Status;
  reason: string;
  status: "pending" | "applied" | "rejected";
  requestedByName: string;
};

export default function Attendance() {
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";
  const { isEmployee } = useEmployee();
  const location = useLocation();
  const navState = location.state as { batchId?: string; date?: string } | null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>(navState?.batchId || "");
  const [date, setDate] = useState<Date>(navState?.date ? new Date(navState.date) : new Date());
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");

  const [students, setStudents] = useState<Student[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [sessionTeacherUid, setSessionTeacherUid] = useState<string>("");
  const [sessionExists, setSessionExists] = useState(false);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [correctionTarget, setCorrectionTarget] = useState<Student | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<Status>("present");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId) || null;
  const dateStr = format(date, "yyyy-MM-dd");

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
    });
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId || branches.length === 0) {
      setCourses([]);
      return;
    }
    const unsubs = branches.map((branch) =>
      onSnapshot(
        collection(db, "educators", educatorId, "branches", branch.id, "courses"),
        (snap) => {
          const bc = snap.docs.map((d) => ({
            id: d.id,
            branchId: branch.id,
            name: d.data().name as string,
          }));
          setCourses((prev) => [...prev.filter((c) => c.branchId !== branch.id), ...bc]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [branches, educatorId]);

  useEffect(() => {
    if (!educatorId || courses.length === 0) {
      setBatches([]);
      setLoading(false);
      return;
    }
    const unsubs = courses.map((course) =>
      onSnapshot(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          course.branchId,
          "courses",
          course.id,
          "batches"
        ),
        (snap) => {
          const cb = snap.docs.map((d) => ({
            id: d.id,
            courseId: course.id,
            branchId: course.branchId,
            name: d.data().name as string,
          }));
          setBatches((prev) => [...prev.filter((b) => b.courseId !== course.id), ...cb]);
          setLoading(false);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [courses, educatorId]);

  useEffect(() => {
    if (!selectedBatchId && batches.length > 0) {
      setSelectedBatchId(batches[0].id);
    }
  }, [batches, selectedBatchId]);

  // Roster for the selected batch
  useEffect(() => {
    if (!educatorId || !selectedBatchId) {
      setStudents([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, "educators", educatorId, "students"),
        where("batchId", "==", selectedBatchId)
      ),
      (snap) => {
        setStudents(
          snap.docs.map((d) => ({
            id: d.id,
            name: String(d.data().name || d.data().displayName || "Unnamed"),
            email: d.data().email,
          }))
        );
      }
    );
    return () => unsub();
  }, [educatorId, selectedBatchId]);

  // Timetable slots for the selected batch
  useEffect(() => {
    if (!educatorId || !selectedBatch) {
      setSlots([]);
      return;
    }
    const unsub = onSnapshot(
      collection(
        db,
        "educators",
        educatorId,
        "branches",
        selectedBatch.branchId,
        "courses",
        selectedBatch.courseId,
        "batches",
        selectedBatch.id,
        "timetable"
      ),
      (snap) => setSlots(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    return () => unsub();
  }, [educatorId, selectedBatch]);

  const daySlots = useMemo(
    () =>
      slots
        .filter((s) => s.dayOfWeek === date.getDay())
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [slots, date]
  );

  useEffect(() => {
    if (daySlots.length > 0 && !daySlots.some((s) => s.id === selectedSlotId)) {
      setSelectedSlotId(daySlots[0].id);
    } else if (daySlots.length === 0) {
      setSelectedSlotId("");
    }
  }, [daySlots, selectedSlotId]);

  const sessionId = selectedSlotId ? `${selectedSlotId}_${dateStr}` : dateStr;
  const selectedSlot = daySlots.find((s) => s.id === selectedSlotId) || null;

  function sessionRef() {
    if (!selectedBatch) return null;
    return doc(
      db,
      "educators",
      educatorId,
      "branches",
      selectedBatch.branchId,
      "courses",
      selectedBatch.courseId,
      "batches",
      selectedBatch.id,
      "sessions",
      sessionId
    );
  }

  // Load existing session for this batch+date(+slot), if any
  useEffect(() => {
    if (!educatorId || !selectedBatch) return;
    setSessionLoaded(false);
    const ref = sessionRef();
    if (!ref) return;
    getDoc(ref).then((snap) => {
      const data = snap.exists() ? snap.data() : null;
      setStatuses((data?.attendance as Record<string, Status>) || {});
      setSessionTeacherUid(String(data?.teacherUid || ""));
      setSessionExists(!!data);
      setSessionLoaded(true);
    });
  }, [educatorId, selectedBatch, sessionId]);

  // Correction requests for this session (business rule #6) — Faculty who owns
  // the session applies/rejects; Ops (or anyone else) sees them read-only here
  // and files new ones from the org-wide AttendanceCorrections page instead.
  useEffect(() => {
    const ref = sessionRef();
    if (!ref) {
      setCorrections([]);
      return;
    }
    const unsub = onSnapshot(collection(ref, "correctionRequests"), (snap) => {
      setCorrections(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [educatorId, selectedBatch, sessionId]);

  // Business rule #6: once a session has a recorded owner (teacherUid), only
  // that teacher (or the org head) can edit it directly — anyone else files a
  // correction request instead of overwriting the record themselves. Before a
  // session is ever saved, whoever marks it first becomes its owner, same as
  // today's behavior.
  const isSessionOwner =
    !isEmployee || !sessionExists || !sessionTeacherUid || profile?.uid === sessionTeacherUid;
  const pendingCorrections = corrections.filter((c) => c.status === "pending");

  const effectiveStatuses: Record<string, Status> = useMemo(() => {
    const out: Record<string, Status> = {};
    students.forEach((s) => {
      out[s.id] = statuses[s.id] || "present";
    });
    return out;
  }, [students, statuses]);

  const presentCount = Object.values(effectiveStatuses).filter((s) => s === "present").length;

  function setStatus(studentId: string, status: Status) {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
  }

  function markAllPresent() {
    const next: Record<string, Status> = {};
    students.forEach((s) => (next[s.id] = "present"));
    setStatuses(next);
  }

  async function saveSession() {
    if (!educatorId || !selectedBatch || !isSessionOwner) return;
    setSaving(true);
    try {
      const ref = doc(
        db,
        "educators",
        educatorId,
        "branches",
        selectedBatch.branchId,
        "courses",
        selectedBatch.courseId,
        "batches",
        selectedBatch.id,
        "sessions",
        sessionId
      );
      await setDoc(
        ref,
        {
          date: dateStr,
          batchId: selectedBatch.id,
          batchName: selectedBatch.name,
          attendance: effectiveStatuses,
          markedBy: educatorId,
          ...(selectedSlot
            ? {
                slotId: selectedSlot.id,
                subject: selectedSlot.subject,
                teacherUid: selectedSlot.teacherUid,
              }
            : {}),
          updatedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
        },
        { merge: true }
      );
      toast.success("Attendance saved");
    } catch {
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  function openCorrectionDialog(student: Student) {
    setCorrectionTarget(student);
    setCorrectionStatus(effectiveStatuses[student.id] || "present");
    setCorrectionReason("");
  }

  async function submitCorrection() {
    const ref = sessionRef();
    if (!ref || !correctionTarget) return;
    setCorrectionBusy(true);
    try {
      await addDoc(collection(ref, "correctionRequests"), {
        studentId: correctionTarget.id,
        studentName: correctionTarget.name,
        currentStatus: effectiveStatuses[correctionTarget.id] || "present",
        requestedStatus: correctionStatus,
        reason: correctionReason.trim(),
        status: "pending",
        requestedBy: profile?.uid || "",
        requestedByName: profile?.displayName || profile?.email || "Staff",
        batchId: selectedBatch?.id,
        batchName: selectedBatch?.name,
        date: dateStr,
        createdAt: Timestamp.now(),
      });
      toast.success("Correction requested");
      setCorrectionTarget(null);
    } catch {
      toast.error("Failed to request correction");
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function resolveCorrection(correction: CorrectionRequest, apply: boolean) {
    const ref = sessionRef();
    if (!ref) return;
    try {
      if (apply) {
        await updateDoc(ref, {
          [`attendance.${correction.studentId}`]: correction.requestedStatus,
          updatedAt: Timestamp.now(),
        });
      }
      await updateDoc(doc(ref, "correctionRequests", correction.id), {
        status: apply ? "applied" : "rejected",
        resolvedBy: profile?.uid || "",
        resolvedAt: Timestamp.now(),
      });
      toast.success(apply ? "Correction applied" : "Correction rejected");
    } catch {
      toast.error("Failed to resolve correction");
    }
  }

  const absentCount = Object.values(effectiveStatuses).filter((s) => s === "absent").length;
  const lateCount = Object.values(effectiveStatuses).filter((s) => s === "late").length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ds-slate" />
      </div>
    );
  }

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader title="Attendance" subtitle="Mark today's session and chase what's missing." />

      {batches.length === 0 ? (
        <DsCard className="p-12 text-center">
          <p className="font-ds-sans text-[12.5px] text-ds-slate">
            No batches yet — create one under Batches first.
          </p>
        </DsCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
              <SelectTrigger className="h-9 w-full border-ds-ink/15 sm:w-64">
                <SelectValue placeholder="Select a batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {branches.find((br) => br.id === b.branchId)?.name} ·{" "}
                    {courses.find((c) => c.id === b.courseId)?.name} · {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <button className="flex h-9 items-center gap-2 rounded-md border border-ds-ink/15 px-3 font-ds-sans text-[12.5px] font-medium text-ds-ink hover:bg-ds-fill">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(date, "MMM d, yyyy")}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) setDate(d);
                    setPopoverOpen(false);
                  }}
                  disabled={(d) => d > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {selectedBatch && daySlots.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {daySlots.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSlotId(s.id)}
                    className={
                      "rounded-md px-2.5 py-1.5 font-ds-sans text-[12px] font-medium " +
                      (selectedSlotId === s.id
                        ? "bg-ds-accent/15 text-ds-accent"
                        : "border border-ds-ink/15 text-ds-ink hover:bg-ds-fill")
                    }
                  >
                    {s.subject}{" "}
                    <span className="text-ds-ink/45">
                      {s.startTime}–{s.endTime}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1" />
            <div className="font-ds-mono text-[11.5px] text-ds-ink/45">
              {students.length} students
            </div>
          </div>

          {selectedBatch && daySlots.length === 0 && (
            <p className="flex items-center gap-1.5 font-ds-sans text-[12px] text-ds-ink/50">
              <CalendarClock className="h-3.5 w-3.5" />
              No class scheduled for this batch on {format(date, "EEEE")}s —{" "}
              <Link to="/educator/timetable" className="text-ds-accent hover:underline">
                set up a timetable
              </Link>{" "}
              or mark attendance without one below.
            </p>
          )}

          {!isSessionOwner && (
            <p className="rounded-[10px] border border-ds-accent/25 bg-ds-accent/[.08] px-3.5 py-2.5 font-ds-sans text-[12px] text-ds-accent">
              This session belongs to another teacher — you can request a correction per student,
              but only that teacher (or the org head) can apply it.
            </p>
          )}

          {!selectedBatch ? null : students.length === 0 ? (
            <DsCard className="p-12 text-center">
              <p className="font-ds-sans text-[12.5px] text-ds-slate">
                No students enrolled in this batch yet.
              </p>
            </DsCard>
          ) : (
            <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_1fr]">
              <DsCard className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-ds-ink/[.08] px-4 py-3">
                  <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                    {selectedSlot
                      ? `${selectedSlot.subject} · ${selectedSlot.startTime}`
                      : selectedBatch.name}
                  </div>
                  <div className="flex-1" />
                  {isSessionOwner && (
                    <>
                      <button
                        onClick={markAllPresent}
                        className="h-7 rounded-md border border-ds-ink/15 px-2.5 font-ds-sans text-[11.5px] font-medium text-ds-ink hover:bg-ds-fill"
                      >
                        Mark all present
                      </button>
                      <button
                        onClick={saveSession}
                        disabled={saving || !sessionLoaded}
                        className="flex h-7 items-center gap-1.5 rounded-md bg-ds-accent px-2.5 font-ds-sans text-[11.5px] font-semibold text-white hover:bg-ds-accent/90 disabled:opacity-60"
                      >
                        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                        Submit
                      </button>
                    </>
                  )}
                </div>
                {students.map((s, idx) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2.5 border-b border-ds-ink/[.055] px-4 py-2.5 last:border-0"
                  >
                    <div className="w-6 font-ds-mono text-[11px] text-ds-ink/40">{idx + 1}</div>
                    <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ds-fill font-ds-sans text-[10px] font-semibold text-ds-ink/70">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 truncate font-ds-sans text-[12.5px] font-medium text-ds-ink">
                      {s.name}
                    </div>
                    {isSessionOwner ? (
                      <div className="flex gap-0.5 rounded-md bg-ds-fill p-0.5">
                        {(["present", "absent", "late"] as Status[]).map((st) => (
                          <button
                            key={st}
                            onClick={() => setStatus(s.id, st)}
                            className={
                              "rounded px-2.5 py-1 font-ds-sans text-[11px] font-semibold " +
                              (effectiveStatuses[s.id] === st
                                ? st === "present"
                                  ? "bg-ds-positive text-white"
                                  : st === "absent"
                                    ? "bg-ds-accent text-white"
                                    : "bg-ds-info text-white"
                                : "text-ds-ink/50")
                            }
                          >
                            {st === "present" ? "P" : st === "absent" ? "A" : "L"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-ds-fill px-2 py-0.5 font-ds-mono text-[10px] font-semibold uppercase text-ds-ink/60">
                          {effectiveStatuses[s.id]}
                        </span>
                        <button
                          onClick={() => openCorrectionDialog(s)}
                          className="rounded p-1 text-ds-slate hover:bg-ds-fill"
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </DsCard>

              <DsDetailRail>
                <DsCard className="p-4">
                  <div className="mb-3 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                    This session
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-1 rounded-lg bg-ds-canvas p-3">
                      <div className="font-ds-serif text-[21px] font-semibold leading-none text-ds-ink">
                        {presentCount}
                      </div>
                      <div className="mt-1.5 font-ds-sans text-[10.5px] font-medium text-ds-ink/45">
                        Present
                      </div>
                    </div>
                    <div className="flex-1 rounded-lg bg-ds-accent/10 p-3">
                      <div className="font-ds-serif text-[21px] font-semibold leading-none text-ds-accent">
                        {absentCount}
                      </div>
                      <div className="mt-1.5 font-ds-sans text-[10.5px] font-medium text-ds-accent">
                        Absent
                      </div>
                    </div>
                    <div className="flex-1 rounded-lg bg-ds-canvas p-3">
                      <div className="font-ds-serif text-[21px] font-semibold leading-none text-ds-ink">
                        {lateCount}
                      </div>
                      <div className="mt-1.5 font-ds-sans text-[10.5px] font-medium text-ds-ink/45">
                        Late
                      </div>
                    </div>
                  </div>
                </DsCard>

                {pendingCorrections.length > 0 && (
                  <DsCard className="p-4">
                    <div className="mb-1 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                      Corrections requested
                    </div>
                    <p className="mb-3 font-ds-sans text-[11.5px] text-ds-ink/50">
                      {pendingCorrections.length} pending.
                    </p>
                    {pendingCorrections.map((c) => (
                      <div
                        key={c.id}
                        className="border-b border-ds-ink/[.055] py-2.5 last:border-0"
                      >
                        <div className="flex items-baseline gap-2">
                          <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                            {c.studentName}
                          </div>
                        </div>
                        <div className="mt-0.5 font-ds-sans text-[11.5px] text-ds-ink/50">
                          {c.currentStatus} → {c.requestedStatus}
                          {c.reason ? ` · ${c.reason}` : ""}
                        </div>
                        {isSessionOwner && (
                          <div className="mt-2 flex gap-1.5">
                            <button
                              onClick={() => resolveCorrection(c, true)}
                              className="flex h-[26px] items-center gap-1 rounded-md bg-ds-fill px-2.5 font-ds-sans text-[11px] font-semibold text-ds-ink"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              onClick={() => resolveCorrection(c, false)}
                              className="flex h-[26px] items-center gap-1 rounded-md border border-ds-ink/15 px-2.5 font-ds-sans text-[11px] font-medium text-ds-ink/60"
                            >
                              <X className="h-3 w-3" />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </DsCard>
                )}
              </DsDetailRail>
            </div>
          )}
        </>
      )}

      <Dialog open={!!correctionTarget} onOpenChange={(open) => !open && setCorrectionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Correction — {correctionTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Requested status</p>
              <ToggleGroup
                type="single"
                value={correctionStatus}
                onValueChange={(v) => v && setCorrectionStatus(v as Status)}
              >
                <ToggleGroupItem value="present" className="h-8 px-3 text-xs">
                  Present
                </ToggleGroupItem>
                <ToggleGroupItem value="late" className="h-8 px-3 text-xs">
                  Late
                </ToggleGroupItem>
                <ToggleGroupItem value="absent" className="h-8 px-3 text-xs">
                  Absent
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Reason</p>
              <Textarea
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                rows={3}
                placeholder="Why should this change?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitCorrection} disabled={correctionBusy}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
