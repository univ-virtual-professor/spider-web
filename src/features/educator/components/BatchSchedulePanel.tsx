import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  arrayRemove,
  Timestamp,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@shared/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import {
  CalendarRange,
  Clock,
  Plus,
  Trash2,
  Key,
  Copy,
  Check,
  BookOpen,
  MoreVertical,
  Edit,
  CalendarDays,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu";
import AssignAndScheduleDialog from "./AssignAndScheduleDialog";

export type PanelBatch = {
  id: string;
  branchId: string;
  courseId: string;
  name: string;
};

type PanelCourse = {
  id: string;
  branchId: string;
  name: string;
};

interface Assignment {
  id: string;
  testId: string;
  testTitle: string;
  batchId: string;
  batchName: string;
  accessType: "scheduled" | "access_code";
  startTime: Timestamp | null;
  endTime: Timestamp | null;
  isScheduleActive: boolean;
  accessCode: string | null;
  maxUses: number | null;
  expiresAt: Timestamp | null;
  windowMinutes: number | null;
  attemptsAllowed: number | null;
  createdAt: Timestamp | null;
}

interface Props {
  batch: PanelBatch | null;
  educatorId: string;
  courses: PanelCourse[];
  onClose: () => void;
}

function fmt(ts: any) {
  if (!ts) return "—";
  const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function toEndOfDay(s: string): Timestamp | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Timestamp.fromDate(new Date(y, m - 1, d, 23, 59, 59, 999));
}

function assignmentStatus(a: Assignment, now: number): "live" | "upcoming" | "past" {
  if (a.accessType !== "scheduled") return "upcoming";
  const start = a.startTime?.toMillis?.() ?? 0;
  const end = a.endTime?.toMillis?.() ?? 0;
  if (!start) return "upcoming";
  if (end > 0 && end < now) return "past";
  if (start <= now && (!end || end >= now)) return "live";
  return "upcoming";
}

export default function BatchSchedulePanel({ batch, educatorId, courses, onClose }: Props) {
  const [activeTab, setActiveTab] = useState("live");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allTests, setAllTests] = useState<
    { id: string; title?: string; attemptsAllowed?: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndTime, setEditEndTime] = useState("23:59");
  const [editMaxUses, setEditMaxUses] = useState("100");
  const [editExpiry, setEditExpiry] = useState("");
  const [editWindow, setEditWindow] = useState("0");
  const [editAttemptsAllowed, setEditAttemptsAllowed] = useState("3");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    if (!batch || !educatorId) return;
    setLoading(true);
    const q = query(
      collection(db, "educators", educatorId, "batchAssignments"),
      where("batchId", "==", batch.id),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setAssignments(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            testId: String(data.testId || ""),
            testTitle: String(data.testTitle || "Untitled"),
            batchId: String(data.batchId || ""),
            batchName: String(data.batchName || ""),
            accessType: data.accessType === "access_code" ? "access_code" : "scheduled",
            startTime: data.startTime || null,
            endTime: data.endTime || null,
            isScheduleActive: Boolean(data.isScheduleActive),
            accessCode: data.accessCode ? String(data.accessCode) : null,
            maxUses: data.maxUses != null ? Number(data.maxUses) : null,
            expiresAt: data.expiresAt || null,
            windowMinutes: data.windowMinutes != null ? Number(data.windowMinutes) : null,
            attemptsAllowed: data.attemptsAllowed != null ? Number(data.attemptsAllowed) : null,
            createdAt: data.createdAt || null,
          } as Assignment;
        })
      );
      setLoading(false);
    });
  }, [batch?.id, educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    const q = query(
      collection(db, "educators", educatorId, "my_tests"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setAllTests(
        snap.docs.map((d) => ({
          id: d.id,
          title: (d.data() as any).title,
          attemptsAllowed: (d.data() as any).attemptsAllowed,
        }))
      );
    });
  }, [educatorId]);

  const now = Date.now();

  const liveAssignments = useMemo(
    () =>
      assignments.filter(
        (a) => a.accessType === "scheduled" && assignmentStatus(a, now) === "live"
      ),
    [assignments, now]
  );
  const upcomingAssignments = useMemo(
    () =>
      assignments.filter(
        (a) => a.accessType === "scheduled" && assignmentStatus(a, now) === "upcoming"
      ),
    [assignments, now]
  );
  const pastAssignments = useMemo(
    () =>
      assignments.filter(
        (a) => a.accessType === "scheduled" && assignmentStatus(a, now) === "past"
      ),
    [assignments, now]
  );
  const codeAssignments = useMemo(
    () => assignments.filter((a) => a.accessType === "access_code"),
    [assignments]
  );

  const course = courses.find((c) => c.id === batch?.courseId);

  function openEdit(a: Assignment) {
    setEditAssignment(a);
    setEditAttemptsAllowed(String(a.attemptsAllowed ?? 3));
    if (a.accessType === "scheduled") {
      const toDateStr = (ts: Timestamp | null) => {
        if (!ts) return "";
        return ts.toDate().toISOString().slice(0, 10);
      };
      const toTimeStr = (ts: Timestamp | null) => {
        if (!ts) return "09:00";
        return ts.toDate().toTimeString().slice(0, 5);
      };
      setEditStartDate(toDateStr(a.startTime));
      setEditStartTime(toTimeStr(a.startTime));
      setEditEndDate(toDateStr(a.endTime));
      setEditEndTime(toTimeStr(a.endTime));
    } else {
      setEditMaxUses(String(a.maxUses ?? 100));
      setEditExpiry(a.expiresAt ? a.expiresAt.toDate().toISOString().slice(0, 10) : "");
      setEditWindow(String(a.windowMinutes ?? 0));
    }
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editAssignment || !batch) return;
    setEditBusy(true);
    try {
      if (editAssignment.accessType === "scheduled") {
        if (!editStartDate || !editEndDate) {
          toast.error("Set start and end date");
          return;
        }
        const start = Timestamp.fromDate(new Date(`${editStartDate}T${editStartTime}`));
        const end = Timestamp.fromDate(new Date(`${editEndDate}T${editEndTime}`));
        if (end.toMillis() <= start.toMillis()) {
          toast.error("End must be after start");
          return;
        }
        await updateDoc(doc(db, "educators", educatorId, "batchAssignments", editAssignment.id), {
          startTime: start,
          endTime: end,
          attemptsAllowed: Number(editAttemptsAllowed) || 3,
          updatedAt: serverTimestamp(),
        });
        toast.success("Schedule updated");
      } else {
        const max = Number(editMaxUses);
        if (!max || max <= 0) {
          toast.error("Max uses must be > 0");
          return;
        }
        const expiresAt = editExpiry ? toEndOfDay(editExpiry) : null;
        const windowMinutes = Number(editWindow) || 0;
        await updateDoc(doc(db, "educators", educatorId, "batchAssignments", editAssignment.id), {
          maxUses: max,
          expiresAt,
          windowMinutes,
          attemptsAllowed: Number(editAttemptsAllowed) || 3,
          updatedAt: serverTimestamp(),
        });
        if (editAssignment.accessCode) {
          await updateDoc(
            doc(db, "educators", educatorId, "accessCodes", editAssignment.accessCode),
            { maxUses: max, expiresAt, windowMinutes, updatedAt: serverTimestamp() }
          );
        }
        toast.success("Access code updated");
      }
      setEditOpen(false);
    } catch {
      toast.error("Failed to update");
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteAssignment(a: Assignment) {
    if (!batch || !confirm(`Remove "${a.testTitle}" from ${batch.name}?`)) return;
    try {
      await deleteDoc(doc(db, "educators", educatorId, "batchAssignments", a.id));
      await updateDoc(doc(db, "educators", educatorId, "my_tests", a.testId), {
        targetBatches: arrayRemove(batch.id),
      });
      if (a.accessType === "access_code" && a.accessCode) {
        await deleteDoc(doc(db, "educators", educatorId, "accessCodes", a.accessCode));
      }
      toast.success("Removed from batch");
    } catch {
      toast.error("Failed to remove");
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Copied!");
    setTimeout(() => setCopiedCode(null), 2000);
  }

  function AssignmentRow({ assignment }: { assignment: Assignment }) {
    const status = assignment.accessType === "scheduled" ? assignmentStatus(assignment, now) : null;
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium">{assignment.testTitle}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {assignment.accessType === "scheduled" ? (
              <>
                <span className="flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" />
                  {fmt(assignment.startTime)}
                </span>
                {assignment.endTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Until {fmt(assignment.endTime)}
                  </span>
                )}
              </>
            ) : (
              <span className="flex items-center gap-1.5">
                <Key className="h-3 w-3" />
                <code className="rounded bg-muted px-1 font-mono">{assignment.accessCode}</code>
                <button
                  onClick={() => assignment.accessCode && copyCode(assignment.accessCode)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {copiedCode === assignment.accessCode ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                {assignment.maxUses != null && <span>{assignment.maxUses} uses</span>}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status === "live" && (
            <Badge className="border-green-500/20 bg-green-500/10 text-xs text-green-600">
              Live
            </Badge>
          )}
          {status === "upcoming" && (
            <Badge variant="outline" className="border-primary/30 text-xs text-primary">
              Upcoming
            </Badge>
          )}
          {assignment.accessType === "access_code" && (
            <Badge variant="outline" className="border-amber-300 text-xs text-amber-700">
              Code
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(assignment)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => deleteAssignment(assignment)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  return (
    <>
      <Sheet open={!!batch} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <SheetHeader className="border-b py-4 pl-6 pr-14">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <SheetTitle className="truncate">{batch?.name}</SheetTitle>
                {course && <p className="text-sm text-muted-foreground">{course.name}</p>}
              </div>
              <Button size="sm" onClick={() => setAssignOpen(true)} className="shrink-0">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Assign Test
              </Button>
            </div>
          </SheetHeader>

          <div className="border-b px-6 pt-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-9 gap-1 bg-transparent p-0">
                <TabsTrigger
                  value="live"
                  className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted"
                >
                  Live
                  {liveAssignments.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                      {liveAssignments.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="upcoming"
                  className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted"
                >
                  Upcoming
                  {upcomingAssignments.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {upcomingAssignments.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="past"
                  className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted"
                >
                  Past
                  {pastAssignments.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {pastAssignments.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="codes"
                  className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted"
                >
                  Codes
                  {codeAssignments.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {codeAssignments.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeTab === "live" && (
              <div className="space-y-2">
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-lg" />
                  ))
                ) : liveAssignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <CalendarDays className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <p className="font-medium text-muted-foreground">No tests live right now</p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      Upcoming tests will appear here when they go live
                    </p>
                  </div>
                ) : (
                  liveAssignments.map((a) => <AssignmentRow key={a.id} assignment={a} />)
                )}
              </div>
            )}

            {activeTab === "upcoming" && (
              <div className="space-y-2">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-lg" />
                  ))
                ) : upcomingAssignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="font-medium text-muted-foreground">No upcoming tests</p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      Assign a test to this batch to get started
                    </p>
                    <Button size="sm" className="mt-4" onClick={() => setAssignOpen(true)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Assign Test
                    </Button>
                  </div>
                ) : (
                  upcomingAssignments.map((a) => <AssignmentRow key={a.id} assignment={a} />)
                )}
              </div>
            )}

            {activeTab === "past" && (
              <div className="space-y-2">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-lg" />
                  ))
                ) : pastAssignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="font-medium text-muted-foreground">No past tests</p>
                  </div>
                ) : (
                  pastAssignments.map((a) => <AssignmentRow key={a.id} assignment={a} />)
                )}
              </div>
            )}

            {activeTab === "codes" && (
              <div className="space-y-2">
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-lg" />
                  ))
                ) : codeAssignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Key className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="font-medium text-muted-foreground">No access code assignments</p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      Assign a test with an access code to see it here
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4"
                      onClick={() => setAssignOpen(true)}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Assign Test
                    </Button>
                  </div>
                ) : (
                  codeAssignments.map((a) => <AssignmentRow key={a.id} assignment={a} />)
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {batch && (
        <AssignAndScheduleDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          test={null}
          allBatches={[
            {
              id: batch.id,
              name: batch.name,
              label: batch.name,
              branchId: batch.branchId,
              courseId: batch.courseId,
            },
          ]}
          educatorId={educatorId}
          preselectedBatchId={batch.id}
          allTests={allTests}
        />
      )}

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditAssignment(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editAssignment?.accessType === "scheduled" ? "Edit Schedule" : "Edit Access Code"}
            </DialogTitle>
          </DialogHeader>
          {editAssignment?.accessType === "scheduled" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    Start date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Start time</Label>
                  <Input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    End date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End time</Label>
                  <Input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Attempts Allowed</Label>
                <Input
                  type="number"
                  min="1"
                  value={editAttemptsAllowed}
                  onChange={(e) => setEditAttemptsAllowed(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEdit} disabled={editBusy || !editStartDate || !editEndDate}>
                  {editBusy ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Max Uses</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editMaxUses}
                    onChange={(e) => setEditMaxUses(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expiry date</Label>
                  <Input
                    type="date"
                    value={editExpiry}
                    onChange={(e) => setEditExpiry(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Window (minutes, 0 = unlimited)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editWindow}
                  onChange={(e) => setEditWindow(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Attempts Allowed</Label>
                <Input
                  type="number"
                  min="1"
                  value={editAttemptsAllowed}
                  onChange={(e) => setEditAttemptsAllowed(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEdit} disabled={editBusy}>
                  {editBusy ? "Saving..." : "Update"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
