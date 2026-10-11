import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { Link } from "react-router-dom";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
import { DsPageHeader, DsCard, DsEmpty, DsSkeletonRows } from "@shared/ui/ds";
import { Plus, Trash2 } from "lucide-react";

// BUILD-NOTES' op_timetable gap list (rooms filter, room-conflict detection, room
// utilisation, unscheduled-this-week) is intentionally not built here: this schema has no
// "room" concept at all — a timetable Slot only carries subject/teacher/day/time/mode, and
// there's no rooms collection anywhere in the app to filter or measure utilisation against.
// Adding one would mean inventing a new piece of data model, not filling a UI gap against an
// existing source — out of scope for this ticket (see the Sheet review ticket's rule about
// omitting gaps with no real data source).

type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type Batch = { id: string; courseId: string; branchId: string; name: string };
type Employee = {
  id: string;
  uid: string;
  name: string;
  status: string;
  scope?: { branchIds?: string[] };
};
type ModuleDoc = { id: string; title: string; order: number };
type LessonDoc = { id: string; title: string; order: number };
type Slot = {
  id: string;
  subject: string;
  teacherUid: string;
  teacherName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  moduleId?: string;
  lessonId?: string;
  mode: "offline" | "online";
  meetingLink?: string;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_PX = 56;

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export default function Timetable() {
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";
  const educatorName: string = profile?.displayName || profile?.email || "You";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [modules, setModules] = useState<ModuleDoc[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, LessonDoc[]>>({});
  const [loading, setLoading] = useState(true);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId) || null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [subject, setSubject] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [teacherUid, setTeacherUid] = useState("");
  const [mode, setMode] = useState<"offline" | "online">("offline");
  const [meetingLink, setMeetingLink] = useState("");
  const [moduleId, setModuleId] = useState<string>("none");
  const [lessonId, setLessonId] = useState<string>("none");

  // Branches
  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
    });
    return () => unsub();
  }, [educatorId]);

  // Courses per branch
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

  // Batches per course
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

  // Employees (for teacher picker)
  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "employees"), (snap) => {
      setEmployees(
        snap.docs.map((d) => ({
          id: d.id,
          uid: String(d.data().uid || d.id),
          name: String(d.data().name || d.data().email || "Unnamed"),
          status: String(d.data().status || ""),
          scope: d.data().scope,
        }))
      );
    });
    return () => unsub();
  }, [educatorId]);

  const eligibleTeachers = selectedBatch
    ? employees.filter(
        (e) =>
          e.status === "ACTIVE" &&
          (!e.scope?.branchIds?.length || e.scope.branchIds.includes(selectedBatch.branchId))
      )
    : [];

  // Slots for selected batch
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
      (snap) => {
        setSlots(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }
    );
    return () => unsub();
  }, [educatorId, selectedBatch]);

  // Modules for the derived course (for the topic picker)
  useEffect(() => {
    if (!educatorId || !selectedBatch) {
      setModules([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          selectedBatch.branchId,
          "courses",
          selectedBatch.courseId,
          "modules"
        ),
        orderBy("order", "asc")
      ),
      (snap) =>
        setModules(snap.docs.map((d) => ({ id: d.id, order: 0, title: "", ...(d.data() as any) })))
    );
    return () => unsub();
  }, [educatorId, selectedBatch]);

  useEffect(() => {
    if (!educatorId || !selectedBatch || modules.length === 0) {
      setLessonsByModule({});
      return;
    }
    const unsubs = modules.map((mod) =>
      onSnapshot(
        query(
          collection(
            db,
            "educators",
            educatorId,
            "branches",
            selectedBatch.branchId,
            "courses",
            selectedBatch.courseId,
            "modules",
            mod.id,
            "lessons"
          ),
          orderBy("order", "asc")
        ),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            order: 0,
            title: "",
            ...(d.data() as any),
          }));
          setLessonsByModule((prev) => ({ ...prev, [mod.id]: rows }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [educatorId, selectedBatch, modules]);

  function slotsRef() {
    if (!selectedBatch) return null;
    return collection(
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
    );
  }

  function resetForm() {
    setSubject("");
    setDayOfWeek("1");
    setStartTime("09:00");
    setEndTime("10:00");
    setTeacherUid(educatorId);
    setMode("offline");
    setMeetingLink("");
    setModuleId("none");
    setLessonId("none");
  }

  function openNewSlot() {
    setEditingSlot(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEditSlot(slot: Slot) {
    setEditingSlot(slot);
    setSubject(slot.subject);
    setDayOfWeek(String(slot.dayOfWeek));
    setStartTime(slot.startTime);
    setEndTime(slot.endTime);
    setTeacherUid(slot.teacherUid);
    setMode(slot.mode || "offline");
    setMeetingLink(slot.meetingLink || "");
    setModuleId(slot.moduleId || "none");
    setLessonId(slot.lessonId || "none");
    setDialogOpen(true);
  }

  async function saveSlot() {
    const ref = slotsRef();
    if (!ref || !subject.trim() || !teacherUid) return;
    const teacher =
      teacherUid === educatorId
        ? { name: educatorName }
        : employees.find((e) => e.uid === teacherUid);
    const payload = {
      subject: subject.trim(),
      dayOfWeek: Number(dayOfWeek),
      startTime,
      endTime,
      teacherUid,
      teacherName: teacher?.name || "Unknown",
      mode,
      meetingLink: mode === "online" ? meetingLink.trim() : null,
      moduleId: moduleId !== "none" ? moduleId : null,
      lessonId: moduleId !== "none" && lessonId !== "none" ? lessonId : null,
      updatedAt: Timestamp.now(),
    };
    try {
      if (editingSlot) {
        await updateDoc(doc(ref, editingSlot.id), payload);
      } else {
        await addDoc(ref, { ...payload, createdAt: Timestamp.now() });
      }
      setDialogOpen(false);
      toast.success("Class saved");
    } catch {
      toast.error("Failed to save class");
    }
  }

  async function deleteSlot(slot: Slot) {
    const ref = slotsRef();
    if (!ref) return;
    if (!window.confirm(`Remove "${slot.subject}" from the timetable?`)) return;
    try {
      await deleteDoc(doc(ref, slot.id));
      toast.success("Class removed");
    } catch {
      toast.error("Failed to remove class");
    }
  }

  const lessonOptions = moduleId !== "none" ? lessonsByModule[moduleId] || [] : [];

  if (loading) {
    return (
      <div className="space-y-3.5 font-ds-sans">
        <DsSkeletonRows rows={1} rowHeight={36} />
        <DsSkeletonRows rows={6} rowHeight={74} />
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

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Timetable"
        subtitle="Set up each batch's weekly class schedule — attendance is marked against these."
        primary={
          batches.length > 0
            ? {
                label: "Add class",
                icon: <Plus className="mr-1 h-3.5 w-3.5" />,
                onClick: openNewSlot,
              }
            : undefined
        }
      />

      {batches.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
            <SelectTrigger className="h-9 w-full border-ds-ink/15 sm:w-72">
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
          <div className="flex items-center gap-4 font-ds-sans text-[11.5px] text-ds-ink/50">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-ds-info" />
              Offline
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-ds-positive" />
              Online
            </div>
          </div>
        </div>
      )}

      {batches.length === 0 ? (
        <DsEmpty title="No batches yet" body="Create one under Batches first." />
      ) : slots.length === 0 ? (
        <DsEmpty
          title="No classes scheduled"
          body="Add a class to this batch's weekly schedule — attendance is marked against these."
          action={{ label: "Add class", onClick: openNewSlot }}
        />
      ) : (
        <DsCard className="overflow-hidden">
          <div
            className="grid border-b border-ds-ink/[.08] bg-ds-canvas"
            style={{ gridTemplateColumns: `52px repeat(7,1fr)` }}
          >
            <div />
            {DAY_SHORT.map((label, dow) => (
              <div key={dow} className="border-l border-ds-ink/[.06] py-2 text-center">
                <div className="font-ds-sans text-[12px] font-semibold text-ds-ink">{label}</div>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `52px repeat(7,1fr)` }}>
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
            {DAY_SHORT.map((_, dow) => {
              const daySlots = slots.filter((s) => s.dayOfWeek === dow);
              return (
                <div
                  key={dow}
                  className="relative border-l border-ds-ink/[.06]"
                  style={{
                    height: hours.length * HOUR_PX,
                    background: `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_PX - 1}px, hsl(var(--ds-ink) / .06) ${HOUR_PX - 1}px ${HOUR_PX}px)`,
                  }}
                >
                  {daySlots.map((slot) => {
                    const top = (toMinutes(slot.startTime) / 60 - startHour) * HOUR_PX;
                    const height = Math.max(
                      22,
                      ((toMinutes(slot.endTime) - toMinutes(slot.startTime)) / 60) * HOUR_PX
                    );
                    const tone = slot.mode === "online" ? "positive" : "info";
                    return (
                      <div
                        key={slot.id}
                        onClick={() => openEditSlot(slot)}
                        className={
                          "group absolute left-1 right-1 cursor-pointer overflow-hidden rounded-md border-l-[3px] p-1.5 text-left " +
                          (tone === "positive"
                            ? "border-ds-positive bg-ds-positive/10"
                            : "border-ds-info bg-ds-info/10")
                        }
                        style={{ top, height }}
                      >
                        <div className="line-clamp-2 font-ds-sans text-[10.5px] font-semibold leading-tight text-ds-ink">
                          {slot.subject}
                        </div>
                        <div className="mt-0.5 truncate font-ds-sans text-[9.5px] text-ds-ink/55">
                          {slot.teacherName}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSlot(slot);
                          }}
                          className="absolute right-1 top-1 hidden rounded bg-white/80 p-0.5 text-ds-ink/50 hover:text-red-600 group-hover:block"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </DsCard>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSlot ? "Edit Class" : "Add Class"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Physics"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Day</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_LABELS.map((label, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Teacher</Label>
              <Select value={teacherUid} onValueChange={setTeacherUid}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a teacher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={educatorId}>You ({educatorName})</SelectItem>
                  {eligibleTeachers.map((e) => (
                    <SelectItem key={e.uid} value={e.uid}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as "offline" | "online")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === "online" && (
                <div>
                  <Label className="text-xs">Meeting link</Label>
                  <Input
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Topic — module (optional)</Label>
                <Select
                  value={moduleId}
                  onValueChange={(v) => {
                    setModuleId(v);
                    setLessonId("none");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {modules.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Lesson (optional)</Label>
                <Select value={lessonId} onValueChange={setLessonId} disabled={moduleId === "none"}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {lessonOptions.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSlot} disabled={!subject.trim() || !teacherUid}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Missing a batch? Create one from{" "}
        <Link to="/educator/batches" className="underline">
          Batches
        </Link>
        .
      </p>
    </div>
  );
}
