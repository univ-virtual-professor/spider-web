import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  Timestamp,
  orderBy,
  serverTimestamp,
  setDoc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@shared/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
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

interface TestDoc {
  id: string;
  title?: string;
  subject?: string;
  durationMinutes?: number;
  startTime?: any;
  endTime?: any;
  targetBatches?: string[];
}

interface AccessCode {
  id: string;
  code: string;
  testSeriesId: string;
  testSeriesTitle: string;
  maxUses: number;
  usesUsed: number;
  expiresAt: Timestamp | null;
  windowMinutes: number;
  status: "active" | "expired" | "exhausted" | "window_expired";
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

function testStatus(t: TestDoc): "live" | "upcoming" | "past" {
  const now = Date.now();
  const start = t.startTime?.toMillis?.() ?? 0;
  const end = t.endTime?.toMillis?.() ?? 0;
  if (!start) return "upcoming";
  if (end > 0 && end < now) return "past";
  if (start <= now && (!end || end >= now)) return "live";
  return "upcoming";
}

function codeStatus(data: any): AccessCode["status"] {
  const max = Number(data.maxUses || 0);
  const used = Number(data.usesUsed || 0);
  const expiresAt = data.expiresAt as Timestamp | null;
  const createdAt = data.createdAt as Timestamp | null;
  const windowMins = Number(data.windowMinutes ?? 0);
  if (max > 0 && used >= max) return "exhausted";
  if (expiresAt && expiresAt.toDate().getTime() < Date.now()) return "expired";
  if (windowMins > 0 && createdAt) {
    if (Date.now() > createdAt.toMillis() + windowMins * 60 * 1000) return "window_expired";
  }
  return "active";
}

function toEndOfDay(s: string): Timestamp | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Timestamp.fromDate(new Date(y, m - 1, d, 23, 59, 59, 999));
}

function genCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function StatusBadge({ status }: { status: AccessCode["status"] }) {
  const cls = {
    active: "bg-green-100 text-green-700",
    expired: "bg-red-100 text-red-700",
    exhausted: "bg-gray-100 text-gray-600",
    window_expired: "bg-orange-100 text-orange-700",
  }[status];
  return (
    <Badge variant="secondary" className={`text-[10px] ${cls}`}>
      {status === "window_expired" ? "window expired" : status}
    </Badge>
  );
}

export default function BatchSchedulePanel({ batch, educatorId, courses, onClose }: Props) {
  const [activeTab, setActiveTab] = useState("live");

  const [tests, setTests] = useState<TestDoc[]>([]);
  const [allTests, setAllTests] = useState<TestDoc[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);

  // Quick assign state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTestId, setAssignTestId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignStartTime, setAssignStartTime] = useState("09:00");
  const [assignEndDate, setAssignEndDate] = useState("");
  const [assignEndTime, setAssignEndTime] = useState("10:00");
  const [assignBusy, setAssignBusy] = useState(false);

  // Access code state
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeEditId, setCodeEditId] = useState<string | null>(null);
  const [codeTestId, setCodeTestId] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [codeMaxUses, setCodeMaxUses] = useState("100");
  const [codeExpiry, setCodeExpiry] = useState("");
  const [codeWindow, setCodeWindow] = useState("0");
  const [codeBusy, setCodeBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Load tests for this batch
  useEffect(() => {
    if (!batch || !educatorId) return;
    setLoadingTests(true);
    const q = query(
      collection(db, "educators", educatorId, "my_tests"),
      where("targetBatches", "array-contains", batch.id)
    );
    return onSnapshot(q, (snap) => {
      setTests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TestDoc));
      setLoadingTests(false);
    });
  }, [batch?.id, educatorId]);

  // Load all tests for assign dropdown
  useEffect(() => {
    if (!educatorId) return;
    const q = query(
      collection(db, "educators", educatorId, "my_tests"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setAllTests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TestDoc));
    });
  }, [educatorId]);

  // Load access codes
  useEffect(() => {
    if (!educatorId) return;
    const q = query(
      collection(db, "educators", educatorId, "accessCodes"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setAccessCodes(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            code: String(data.code || d.id),
            testSeriesId: String(data.testSeriesId || ""),
            testSeriesTitle: String(data.testSeriesTitle || "—"),
            maxUses: Number(data.maxUses || 0),
            usesUsed: Number(data.usesUsed || 0),
            expiresAt: (data.expiresAt as Timestamp) || null,
            windowMinutes: Number(data.windowMinutes || 0),
            status: codeStatus(data),
          };
        })
      );
    });
  }, [educatorId]);

  const batchTestIds = useMemo(() => new Set(tests.map((t) => t.id)), [tests]);
  const batchCodes = useMemo(
    () => accessCodes.filter((c) => batchTestIds.has(c.testSeriesId)),
    [accessCodes, batchTestIds]
  );

  const now = Date.now();
  const liveTestIds = useMemo(() => new Set(batchCodes.map((c) => c.testSeriesId)), [batchCodes]);
  const liveTests = useMemo(
    () =>
      tests
        .filter((t) => {
          const start = t.startTime?.toMillis?.() || 0;
          const end = t.endTime?.toMillis?.() || 0;
          const isScheduledLive = start > 0 && start <= now && end >= now;
          const hasCode = liveTestIds.has(t.id);
          return isScheduledLive || hasCode;
        })
        .sort((a, b) => (a.startTime?.toMillis?.() || 0) - (b.startTime?.toMillis?.() || 0)),
    [tests, liveTestIds, now]
  );
  const upcomingTests = useMemo(
    () =>
      tests
        .filter((t) => {
          const start = t.startTime?.toMillis?.() || 0;
          return (!t.startTime || start > now) && !liveTestIds.has(t.id);
        })
        .sort((a, b) => (a.startTime?.toMillis?.() || 0) - (b.startTime?.toMillis?.() || 0)),
    [tests, liveTestIds, now]
  );
  const pastTests = useMemo(
    () =>
      tests
        .filter((t) => {
          const end = t.endTime?.toMillis?.() || 0;
          return !!t.endTime && end < now;
        })
        .sort((a, b) => (b.startTime?.toMillis?.() || 0) - (a.startTime?.toMillis?.() || 0)),
    [tests, now]
  );

  async function removeFromBatch(testId: string) {
    if (!batch || !confirm("Remove this test from the batch?")) return;
    try {
      await updateDoc(doc(db, "educators", educatorId, "my_tests", testId), {
        targetBatches: arrayRemove(batch.id),
      });
      toast.success("Removed from batch");
    } catch {
      toast.error("Failed to remove");
    }
  }

  function openAssign() {
    setAssignTestId("");
    setAssignStartDate("");
    setAssignStartTime("09:00");
    setAssignEndDate("");
    setAssignEndTime("10:00");
    setAssignOpen(true);
  }

  async function handleAssign() {
    if (!batch || !assignTestId || !assignStartDate || !assignEndDate) {
      toast.error("Fill all required fields");
      return;
    }
    const start = new Date(`${assignStartDate}T${assignStartTime}`);
    const end = new Date(`${assignEndDate}T${assignEndTime}`);
    if (end <= start) {
      toast.error("End time must be after start time");
      return;
    }
    setAssignBusy(true);
    try {
      await updateDoc(doc(db, "educators", educatorId, "my_tests", assignTestId), {
        targetBatches: arrayUnion(batch.id),
        startTime: Timestamp.fromDate(start),
        endTime: Timestamp.fromDate(end),
        isScheduleActive: true,
      });
      toast.success("Test assigned to batch");
      setAssignOpen(false);
    } catch {
      toast.error("Failed to assign");
    } finally {
      setAssignBusy(false);
    }
  }

  function openCreateCode(testId?: string) {
    setCodeEditId(null);
    setCodeTestId(testId || "");
    setCodeValue(genCode());
    setCodeMaxUses("100");
    setCodeExpiry("");
    setCodeWindow("0");
    setCodeOpen(true);
  }

  function openEditCode(code: AccessCode) {
    setCodeEditId(code.id);
    setCodeTestId(code.testSeriesId);
    setCodeValue(code.code);
    setCodeMaxUses(String(code.maxUses));
    setCodeExpiry(code.expiresAt ? code.expiresAt.toDate().toISOString().slice(0, 10) : "");
    setCodeWindow(String(code.windowMinutes));
    setCodeOpen(true);
  }

  async function handleSaveCode() {
    if (!codeTestId || !codeValue.trim()) {
      toast.error("Select a test and enter a code");
      return;
    }
    const max = Number(codeMaxUses);
    if (!max || max <= 0) {
      toast.error("Max uses must be greater than 0");
      return;
    }
    const codeUpper = codeValue.trim().toUpperCase();
    const testTitle = allTests.find((t) => t.id === codeTestId)?.title || "Test";
    const expiresAt = codeExpiry ? toEndOfDay(codeExpiry) : null;

    setCodeBusy(true);
    try {
      if (!codeEditId) {
        const ref = doc(db, "educators", educatorId, "accessCodes", codeUpper);
        if ((await getDoc(ref)).exists()) {
          toast.error("Code already exists, generate a new one");
          return;
        }
        await setDoc(ref, {
          code: codeUpper,
          testSeriesId: codeTestId,
          testSeriesTitle: testTitle,
          maxUses: max,
          usesUsed: 0,
          expiresAt,
          windowMinutes: Number(codeWindow) || 0,
          createdAt: serverTimestamp(),
        });
        toast.success("Access code created");
      } else {
        await updateDoc(doc(db, "educators", educatorId, "accessCodes", codeEditId), {
          testSeriesId: codeTestId,
          testSeriesTitle: testTitle,
          maxUses: max,
          expiresAt,
          windowMinutes: Number(codeWindow) || 0,
          updatedAt: serverTimestamp(),
        });
        toast.success("Access code updated");
      }
      setCodeOpen(false);
    } catch {
      toast.error("Failed to save code");
    } finally {
      setCodeBusy(false);
    }
  }

  async function deleteCode(code: AccessCode) {
    if (!confirm(`Delete code "${code.code}"?`)) return;
    try {
      await deleteDoc(doc(db, "educators", educatorId, "accessCodes", code.id));
      toast.success("Code deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Copied!");
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const course = courses.find((c) => c.id === batch?.courseId);

  // Unassigned tests for quick assign dropdown (not yet in this batch)
  const unassignedTests = useMemo(
    () => allTests.filter((t) => !t.targetBatches?.includes(batch?.id || "")),
    [allTests, batch?.id]
  );

  function TestCard({ test }: { test: TestDoc }) {
    const status = testStatus(test);
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium">{test.title || "Untitled"}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarRange className="h-3 w-3" />
              {test.startTime ? fmt(test.startTime) : "No start time"}
            </span>
            {test.endTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Until {fmt(test.endTime)}
              </span>
            )}
            {test.durationMinutes && <span>{test.durationMinutes} min</span>}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openCreateCode(test.id)}>
                <Key className="mr-2 h-4 w-4" />
                Create Access Code
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => removeFromBatch(test.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove from Batch
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
          {/* Header */}
          <SheetHeader className="border-b py-4 pl-6 pr-14">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="truncate">{batch?.name}</SheetTitle>
                {course && <p className="text-sm text-muted-foreground">{course.name}</p>}
              </div>
              <Button size="sm" onClick={openAssign} className="shrink-0">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Assign Test
              </Button>
            </div>
          </SheetHeader>

          {/* Tabs */}
          <div className="border-b px-6 pt-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-9 gap-1 bg-transparent p-0">
                <TabsTrigger
                  value="live"
                  className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted"
                >
                  Live
                  {liveTests.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                      {liveTests.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="upcoming"
                  className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted"
                >
                  Upcoming
                  {upcomingTests.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {upcomingTests.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="past"
                  className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted"
                >
                  Past
                  {pastTests.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {pastTests.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="codes"
                  className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-muted"
                >
                  Codes
                  {batchCodes.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {batchCodes.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Live Tests */}
            {activeTab === "live" && (
              <div className="space-y-2">
                {loadingTests ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-lg" />
                  ))
                ) : liveTests.length === 0 ? (
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
                  liveTests.map((t) => <TestCard key={t.id} test={t} />)
                )}
              </div>
            )}

            {/* Upcoming Tests */}
            {activeTab === "upcoming" && (
              <div className="space-y-2">
                {loadingTests ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-lg" />
                  ))
                ) : upcomingTests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="font-medium text-muted-foreground">No upcoming tests</p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      Assign a test to this batch to get started
                    </p>
                    <Button size="sm" className="mt-4" onClick={openAssign}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Assign Test
                    </Button>
                  </div>
                ) : (
                  upcomingTests.map((t) => <TestCard key={t.id} test={t} />)
                )}
              </div>
            )}

            {/* Past Tests */}
            {activeTab === "past" && (
              <div className="space-y-2">
                {loadingTests ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-lg" />
                  ))
                ) : pastTests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="font-medium text-muted-foreground">No past tests</p>
                  </div>
                ) : (
                  pastTests.map((t) => <TestCard key={t.id} test={t} />)
                )}
              </div>
            )}

            {/* Access Codes */}
            {activeTab === "codes" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Codes for tests in this batch</p>
                  <Button size="sm" variant="outline" onClick={() => openCreateCode()}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New Code
                  </Button>
                </div>

                {batchCodes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Key className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="font-medium text-muted-foreground">No access codes</p>
                    <p className="mt-1 text-sm text-muted-foreground/70">
                      Create codes to give students access to specific tests
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4"
                      onClick={() => openCreateCode()}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Create Code
                    </Button>
                  </div>
                ) : (
                  batchCodes.map((code) => (
                    <div
                      key={code.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                            {code.code}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyCode(code.code)}
                          >
                            {copiedCode === code.code ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {code.testSeriesTitle}
                        </p>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={code.status} />
                          <span className="text-xs text-muted-foreground">
                            {code.usesUsed}/{code.maxUses} uses
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditCode(code)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyCode(code.code)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Code
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteCode(code)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Quick Assign Dialog */}
      <Dialog
        open={assignOpen}
        onOpenChange={(o) => {
          setAssignOpen(o);
          if (!o) setAssignTestId("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Test — {batch?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>
                Test <span className="text-destructive">*</span>
              </Label>
              <Select value={assignTestId} onValueChange={setAssignTestId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a test" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedTests.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      All tests already assigned
                    </SelectItem>
                  ) : (
                    unassignedTests.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title || "Untitled"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>
                  Start date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={assignStartDate}
                  onChange={(e) => setAssignStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={assignStartTime}
                  onChange={(e) => setAssignStartTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>
                  End date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={assignEndDate}
                  onChange={(e) => setAssignEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>End time</Label>
                <Input
                  type="time"
                  value={assignEndTime}
                  onChange={(e) => setAssignEndTime(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This sets when students in this batch can access the test.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={assignBusy || !assignTestId || !assignStartDate || !assignEndDate}
              >
                {assignBusy ? "Assigning..." : "Assign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Access Code Dialog */}
      <Dialog
        open={codeOpen}
        onOpenChange={(o) => {
          setCodeOpen(o);
          if (!o) setCodeEditId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{codeEditId ? "Edit Access Code" : "Create Access Code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>
                Test <span className="text-destructive">*</span>
              </Label>
              <Select value={codeTestId} onValueChange={setCodeTestId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select test" />
                </SelectTrigger>
                <SelectContent>
                  {tests.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title || "Untitled"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Code</Label>
              <div className="flex gap-2">
                <Input
                  value={codeValue}
                  onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                  disabled={!!codeEditId}
                />
                {!codeEditId && (
                  <Button variant="outline" onClick={() => setCodeValue(genCode())}>
                    Generate
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Max Uses</Label>
                <Input
                  type="number"
                  min="1"
                  value={codeMaxUses}
                  onChange={(e) => setCodeMaxUses(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Expiry date</Label>
                <Input
                  type="date"
                  value={codeExpiry}
                  onChange={(e) => setCodeExpiry(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>
                Access window{" "}
                <span className="font-normal text-muted-foreground">(minutes, 0 = no limit)</span>
              </Label>
              <Input
                type="number"
                min="0"
                value={codeWindow}
                onChange={(e) => setCodeWindow(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCodeOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveCode} disabled={codeBusy || !codeTestId}>
                {codeBusy ? "Saving..." : codeEditId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
