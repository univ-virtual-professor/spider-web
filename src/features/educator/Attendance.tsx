import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { format } from "date-fns";
import { toast } from "sonner";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/popover";
import { Calendar } from "@shared/ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "@shared/ui/toggle-group";
import { CalendarCheck, CalendarIcon, Loader2, CheckCheck, Users as UsersIcon } from "lucide-react";

type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type Batch = { id: string; courseId: string; branchId: string; name: string };
type Student = { id: string; name: string; email?: string };

type Status = "present" | "absent" | "late";

export default function Attendance() {
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [popoverOpen, setPopoverOpen] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

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

  // Load existing session for this batch+date, if any
  useEffect(() => {
    if (!educatorId || !selectedBatch) return;
    setSessionLoaded(false);
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
      dateStr
    );
    getDoc(ref).then((snap) => {
      const existing = (snap.exists() ? snap.data().attendance : {}) || {};
      setStatuses(existing);
      setSessionLoaded(true);
    });
  }, [educatorId, selectedBatch, dateStr]);

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
    if (!educatorId || !selectedBatch) return;
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
        dateStr
      );
      await setDoc(
        ref,
        {
          date: dateStr,
          batchId: selectedBatch.id,
          batchName: selectedBatch.name,
          attendance: effectiveStatuses,
          markedBy: educatorId,
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarCheck className="h-6 w-6" />
          Attendance
        </h1>
        <p className="text-sm text-muted-foreground">Mark daily attendance for a batch.</p>
      </div>

      {batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No batches yet — create one under Batches first.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {format(date, "MMM d, yyyy")}
                </Button>
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

            <Badge variant="outline" className="gap-1.5 text-xs">
              <UsersIcon className="h-3 w-3" />
              {students.length} students
            </Badge>
          </div>

          {!selectedBatch ? null : students.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No students enrolled in this batch yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {presentCount}/{students.length} marked present
                  </p>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllPresent}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all present
                  </Button>
                </div>

                <div className="divide-y divide-border/50">
                  {students.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        {s.email && (
                          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                        )}
                      </div>
                      <ToggleGroup
                        type="single"
                        value={effectiveStatuses[s.id]}
                        onValueChange={(v) => v && setStatus(s.id, v as Status)}
                        className="shrink-0"
                      >
                        <ToggleGroupItem
                          value="present"
                          className="h-7 px-2.5 text-xs data-[state=on]:bg-green-500/15 data-[state=on]:text-green-700"
                        >
                          Present
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="late"
                          className="h-7 px-2.5 text-xs data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-700"
                        >
                          Late
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="absent"
                          className="h-7 px-2.5 text-xs data-[state=on]:bg-red-500/15 data-[state=on]:text-red-700"
                        >
                          Absent
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full gap-2 sm:w-auto"
                  onClick={saveSession}
                  disabled={saving || !sessionLoaded}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Attendance
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
