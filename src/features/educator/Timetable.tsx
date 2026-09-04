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
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
import { CalendarClock, Plus, Pencil, Trash2, Loader2, Video, MapPin } from "lucide-react";

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
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarClock className="h-6 w-6" />
            Timetable
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up each batch's weekly class schedule — attendance is marked against these.
          </p>
        </div>
        {batches.length > 0 && (
          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
            <SelectTrigger className="w-full sm:w-72">
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
        )}
      </div>

      {batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No batches yet — create one under Batches first.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={openNewSlot}>
              <Plus className="h-4 w-4" />
              Add Class
            </Button>
          </div>

          {slots.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No classes scheduled for this batch yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {DAY_LABELS.map((label, dow) => {
                const daySlots = slots
                  .filter((s) => s.dayOfWeek === dow)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                if (daySlots.length === 0) return null;
                return (
                  <Card key={dow}>
                    <CardContent className="pt-5">
                      <p className="mb-3 text-sm font-semibold">{label}</p>
                      <div className="space-y-2">
                        {daySlots.map((slot) => (
                          <div
                            key={slot.id}
                            className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{slot.subject}</p>
                              <p className="text-xs text-muted-foreground">
                                {slot.startTime}–{slot.endTime} · {slot.teacherName}
                              </p>
                            </div>
                            <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                              {slot.mode === "online" ? (
                                <Video className="h-3 w-3" />
                              ) : (
                                <MapPin className="h-3 w-3" />
                              )}
                              {slot.mode}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEditSlot(slot)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteSlot(slot)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
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
