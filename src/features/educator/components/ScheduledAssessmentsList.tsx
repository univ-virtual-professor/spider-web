import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, getDocs, query, where } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Card } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { CalendarRange, Clock, BookOpen, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AssignmentDoc {
  id: string;
  testId: string;
  testTitle: string;
  batchId: string;
  batchName: string;
  startTime?: any;
  endTime?: any;
  isScheduleActive?: boolean;
}

interface BranchDoc {
  id: string;
  name: string;
}
interface CourseDoc {
  id: string;
  branchId: string;
  name: string;
}
interface BatchDoc {
  id: string;
  branchId: string;
  courseId: string;
  name: string;
}

interface ScheduledAssessmentsListProps {
  type: "tests" | "dpps";
}

export default function ScheduledAssessmentsList({ type }: ScheduledAssessmentsListProps) {
  const navigate = useNavigate();
  const { profile, firebaseUser } = useAuth();
  const educatorId = profile?.educatorId || firebaseUser?.uid || "";

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<AssignmentDoc[]>([]);
  const [activeTab, setActiveTab] = useState<"live" | "upcoming" | "past">("live");

  const [allBranches, setAllBranches] = useState<BranchDoc[]>([]);
  const [allCourses, setAllCourses] = useState<CourseDoc[]>([]);
  const [allBatches, setAllBatches] = useState<BatchDoc[]>([]);

  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedCourse, setSelectedCourse] = useState("All");
  const [selectedBatch, setSelectedBatch] = useState("All");

  useEffect(() => {
    if (!educatorId) return;

    const loadHierarchy = async () => {
      try {
        const branchSnap = await getDocs(collection(db, "educators", educatorId, "branches"));
        const branchesData = branchSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "Unknown Branch",
        }));
        setAllBranches(branchesData);

        const coursesData: CourseDoc[] = [];
        const batchesData: BatchDoc[] = [];

        for (const b of branchesData) {
          const cSnap = await getDocs(
            collection(db, "educators", educatorId, "branches", b.id, "courses")
          );
          for (const c of cSnap.docs) {
            coursesData.push({
              id: c.id,
              branchId: b.id,
              name: c.data().name || "Unknown Program",
            });
            const bSnap = await getDocs(
              collection(db, "educators", educatorId, "branches", b.id, "courses", c.id, "batches")
            );
            for (const batch of bSnap.docs) {
              batchesData.push({
                id: batch.id,
                branchId: b.id,
                courseId: c.id,
                name: batch.data().name || "Unknown Batch",
              });
            }
          }
        }
        setAllCourses(coursesData);
        setAllBatches(batchesData);

        // Auto-select if only one branch
        if (branchesData.length === 1) setSelectedBranch(branchesData[0].name);
      } catch (err) {
        console.error("Failed to load hierarchy", err);
      }
    };
    loadHierarchy();

    // Read from batchAssignments (scheduled only)
    const q = query(
      collection(db, "educators", educatorId, "batchAssignments"),
      where("accessType", "==", "scheduled")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => {
          const dd = d.data() as any;
          return {
            id: d.id,
            testId: String(dd.testId || ""),
            testTitle: String(dd.testTitle || "Untitled"),
            batchId: String(dd.batchId || ""),
            batchName: String(dd.batchName || ""),
            startTime: dd.startTime || null,
            endTime: dd.endTime || null,
            isScheduleActive: Boolean(dd.isScheduleActive),
          } as AssignmentDoc;
        });

        const filtered = data.filter((a) => {
          const title = a.testTitle.toLowerCase();
          const isDpp = title.includes("dpp") || title.includes("practice");
          return type === "dpps" ? isDpp : !isDpp;
        });

        setAssignments(filtered);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [educatorId, type]);

  const uniqueBranches = useMemo(
    () => Array.from(new Set(allBranches.map((b) => b.name))).sort(),
    [allBranches]
  );

  const uniqueCourses = useMemo(() => {
    const courses =
      selectedBranch === "all"
        ? allCourses
        : allCourses.filter((c) => {
            const b = allBranches.find((br) => br.name === selectedBranch);
            return b && c.branchId === b.id;
          });
    return Array.from(new Set(courses.map((c) => c.name))).sort();
  }, [allCourses, allBranches, selectedBranch]);

  const uniqueBatches = useMemo(() => {
    return Array.from(
      new Set(
        allBatches
          .filter((b) => {
            if (selectedBranch && selectedBranch !== "all") {
              const branch = allBranches.find((br) => br.name === selectedBranch);
              if (!branch || b.branchId !== branch.id) return false;
            }
            if (selectedCourse && selectedCourse !== "All") {
              const course = allCourses.find((c) => c.name === selectedCourse);
              if (!course || b.courseId !== course.id) return false;
            }
            return true;
          })
          .map((b) => b.name)
      )
    ).sort();
  }, [allBatches, allBranches, allCourses, selectedBranch, selectedCourse]);

  // Reset child filters when parent changes
  useEffect(() => {
    if (selectedCourse !== "All" && !uniqueCourses.includes(selectedCourse))
      setSelectedCourse("All");
  }, [uniqueCourses, selectedCourse]);
  useEffect(() => {
    if (selectedBatch !== "All" && !uniqueBatches.includes(selectedBatch)) setSelectedBatch("All");
  }, [uniqueBatches, selectedBatch]);

  const displayedAssignments = useMemo(() => {
    const now = Date.now();

    return assignments
      .filter((a) => {
        const startMs = a.startTime?.toMillis?.() ?? 0;
        const endMs = a.endTime?.toMillis?.() ?? 0;

        if (activeTab === "live" && !(startMs <= now && endMs >= now)) return false;
        if (activeTab === "upcoming" && startMs <= now) return false;
        if (activeTab === "past" && endMs > now) return false;

        // Hierarchy filters
        const batch = allBatches.find((b) => b.id === a.batchId);

        if (selectedBranch && selectedBranch !== "all") {
          const branch = allBranches.find((br) => br.name === selectedBranch);
          if (!branch || batch?.branchId !== branch.id) return false;
        }
        if (selectedCourse && selectedCourse !== "All") {
          const course = allCourses.find((c) => c.name === selectedCourse);
          if (!course || batch?.courseId !== course.id) return false;
        }
        if (selectedBatch && selectedBatch !== "All") {
          if (batch?.name !== selectedBatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aStart = a.startTime?.toMillis?.() ?? 0;
        const bStart = b.startTime?.toMillis?.() ?? 0;
        if (activeTab === "upcoming") return aStart - bStart;
        if (activeTab === "live")
          return (a.endTime?.toMillis?.() ?? 0) - (b.endTime?.toMillis?.() ?? 0);
        return bStart - aStart;
      });
  }, [
    assignments,
    activeTab,
    selectedBranch,
    selectedCourse,
    selectedBatch,
    allBranches,
    allCourses,
    allBatches,
  ]);

  const formatTime = (ts: any) => {
    if (!ts) return "—";
    const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };

  const getStatusBadge = (a: AssignmentDoc) => {
    const now = Date.now();
    const start = a.startTime?.toMillis?.() ?? 0;
    const end = a.endTime?.toMillis?.() ?? 0;
    if (end < now && end !== 0)
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground">
          Completed
        </Badge>
      );
    if (start <= now && (end === 0 || end >= now))
      return (
        <Badge className="border-green-500/20 bg-green-500/10 text-green-500 hover:bg-green-500/20">
          Live
        </Badge>
      );
    return (
      <Badge variant="outline" className="border-primary/30 text-primary">
        Upcoming
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Filter by branch and program to see scheduled {type === "tests" ? "tests" : "DPPs"}.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/educator/batches")}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Manage by Batch
          </Button>
        </div>
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="h-9 w-[140px] bg-background">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {uniqueBranches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedCourse} onValueChange={setSelectedCourse}>
              <SelectTrigger className="h-9 w-[140px] bg-background">
                <SelectValue placeholder="All Programs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Programs</SelectItem>
                {uniqueCourses.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedBatch} onValueChange={setSelectedBatch}>
              <SelectTrigger className="h-9 w-[140px] bg-background">
                <SelectValue placeholder="All Batches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Batches</SelectItem>
                {uniqueBatches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            className="w-full md:w-auto"
          >
            <TabsList className="grid h-10 w-full grid-cols-3 border bg-background p-1 md:w-auto">
              <TabsTrigger value="live" className="text-xs">
                Live
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="text-xs">
                Upcoming
              </TabsTrigger>
              <TabsTrigger value="past" className="text-xs">
                Past
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Card className="overflow-hidden border-border/50 shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-semibold">
                  {type === "tests" ? "Test Name" : "DPP Title"}
                </TableHead>
                <TableHead className="font-semibold">Batch</TableHead>
                <TableHead className="font-semibold">Schedule</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-[200px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[120px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[150px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-[80px] rounded-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : displayedAssignments.length > 0 ? (
                displayedAssignments.map((a) => (
                  <TableRow key={a.id} className="transition-colors hover:bg-muted/10">
                    <TableCell>
                      <div className="font-medium text-foreground">{a.testTitle}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.batchName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center gap-1.5">
                          <CalendarRange className="h-3 w-3 text-muted-foreground" />
                          {formatTime(a.startTime)}
                        </span>
                        {a.endTime && (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" /> Until {formatTime(a.endTime)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(a)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 text-muted-foreground">
                      {type === "tests" ? (
                        <CalendarRange className="h-10 w-10 opacity-20" />
                      ) : (
                        <BookOpen className="h-10 w-10 opacity-20" />
                      )}
                      <p className="text-base font-medium">
                        {activeTab === "live"
                          ? `No ${type} live right now.`
                          : activeTab === "upcoming"
                            ? `No upcoming ${type} scheduled.`
                            : `No past ${type} found.`}
                      </p>
                      <p className="max-w-[300px] text-center text-sm opacity-80">
                        Assign tests to batches from the Test Series section.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
