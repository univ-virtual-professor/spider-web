import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Card } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { CalendarRange, Clock, BookOpen, AlertCircle, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AssessmentDoc {
  id: string;
  title?: string;
  subject?: string;
  courseId?: string;
  targetBatches?: string[];
  durationMinutes?: number;
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
  const [assessments, setAssessments] = useState<AssessmentDoc[]>([]);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  // Hierarchy Data
  const [allBranches, setAllBranches] = useState<BranchDoc[]>([]);
  const [allCourses, setAllCourses] = useState<CourseDoc[]>([]);
  const [allBatches, setAllBatches] = useState<BatchDoc[]>([]);

  // Filter State
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("All");
  const [selectedBatch, setSelectedBatch] = useState("All");

  useEffect(() => {
    if (!educatorId) return;

    // Fetch Hierarchy
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
      } catch (err) {
        console.error("Failed to load hierarchy", err);
      }
    };
    loadHierarchy();

    // Fetch Assessments
    const q = collection(db, "educators", educatorId, "my_tests");
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AssessmentDoc);

        const scheduledOnly = data.filter((a) => !!a.startTime);

        const filteredByType = scheduledOnly.filter((a) => {
          const title = (a.title || "").toLowerCase();
          const isDpp = title.includes("dpp") || title.includes("practice");
          return type === "dpps" ? isDpp : !isDpp;
        });

        setAssessments(filteredByType);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [educatorId, type]);

  // Derived Filter Options
  const uniqueBranches = useMemo(
    () => Array.from(new Set(allBranches.map((b) => b.name))).sort(),
    [allBranches]
  );

  const uniqueCourses = useMemo(() => {
    if (!selectedBranch) return [];
    return Array.from(
      new Set(
        allCourses
          .filter((c) => {
            const b = allBranches.find((br) => br.name === selectedBranch);
            return b && c.branchId === b.id;
          })
          .map((c) => c.name)
      )
    ).sort();
  }, [allCourses, allBranches, selectedBranch]);

  const uniqueBatches = useMemo(() => {
    if (!selectedCourse) return [];
    return Array.from(
      new Set(
        allBatches
          .filter((b) => {
            let valid = true;
            if (selectedBranch) {
              const branch = allBranches.find((br) => br.name === selectedBranch);
              if (!branch || b.branchId !== branch.id) valid = false;
            }
            if (selectedCourse && selectedCourse !== "All") {
              const course = allCourses.find((c) => c.name === selectedCourse);
              if (!course || b.courseId !== course.id) valid = false;
            }
            return valid;
          })
          .map((b) => b.name)
      )
    ).sort();
  }, [allBatches, allBranches, allCourses, selectedBranch, selectedCourse]);

  // Reset dependent filters when parent changes
  useEffect(() => {
    if (uniqueBranches.length === 1 && !selectedBranch) {
      setSelectedBranch(uniqueBranches[0]);
    }
  }, [uniqueBranches, selectedBranch]);
  useEffect(() => {
    if (uniqueCourses.length === 1) {
      if (selectedCourse !== uniqueCourses[0]) setSelectedCourse(uniqueCourses[0]);
    } else if (
      selectedCourse &&
      selectedCourse !== "All" &&
      !uniqueCourses.includes(selectedCourse)
    ) {
      setSelectedCourse("All");
    }
  }, [uniqueCourses, selectedCourse]);

  useEffect(() => {
    if (uniqueBatches.length === 1) {
      if (selectedBatch !== uniqueBatches[0]) setSelectedBatch(uniqueBatches[0]);
    } else if (selectedBatch !== "All" && !uniqueBatches.includes(selectedBatch)) {
      setSelectedBatch("All");
    }
  }, [uniqueBatches, selectedBatch]);

  // Filter + Sort Data
  const displayedAssessments = useMemo(() => {
    if (!selectedBranch) return [];

    const now = new Date().getTime();

    return assessments
      .filter((a) => {
        const startTime = a.startTime?.toMillis?.() ?? 0;
        // Fallback to startTime if endTime is missing
        const endTime = a.endTime?.toMillis?.() ?? startTime;

        // Upcoming: only tests whose startTime is strictly in the future (not yet started)
        if (activeTab === "upcoming" && startTime <= now) return false;

        // Past: only tests that have fully ended
        if (activeTab === "past" && endTime > now) return false;

        // Hierarchy filters
        const aCourse = allCourses.find((c) => c.id === a.courseId);
        const aBranch = allBranches.find((b) => b.id === aCourse?.branchId);
        const aBatches = allBatches.filter((b) => (a.targetBatches || []).includes(b.id));

        // Branch filter
        if (selectedBranch) {
          const matchesCourseBranch = aBranch?.name === selectedBranch;
          const matchesAnyBatchBranch = aBatches.some((b) => {
            const br = allBranches.find((brn) => brn.id === b.branchId);
            return br?.name === selectedBranch;
          });
          if (!matchesCourseBranch && !matchesAnyBatchBranch) return false;
        }

        // Course filter
        if (selectedCourse && selectedCourse !== "All") {
          const matchesCourse = aCourse?.name === selectedCourse;
          const matchesAnyBatchCourse = aBatches.some((b) => {
            const c = allCourses.find((crs) => crs.id === b.courseId);
            return c?.name === selectedCourse;
          });
          if (!matchesCourse && !matchesAnyBatchCourse) return false;
        }

        // Batch filter
        if (selectedBatch && selectedBatch !== "All") {
          const matchesBatch = aBatches.some((b) => b.name === selectedBatch);
          if (!matchesBatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = a.startTime?.toMillis?.() ?? 0;
        const timeB = b.startTime?.toMillis?.() ?? 0;
        return activeTab === "upcoming" ? timeA - timeB : timeB - timeA;
      });
  }, [
    assessments,
    activeTab,
    selectedBranch,
    selectedCourse,
    selectedBatch,
    allCourses,
    allBranches,
    allBatches,
  ]);

  // Helpers
  const formatTime = (ts: any) => {
    if (!ts) return "—";
    const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };

  const getStatusBadge = (a: AssessmentDoc) => {
    const now = new Date().getTime();
    const end = a.endTime?.toMillis?.() ?? 0;
    const start = a.startTime?.toMillis?.() ?? 0;

    if (end < now && end !== 0)
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground">
          Completed
        </Badge>
      );
    if (start <= now && (end === 0 || end >= now))
      return (
        <Badge className="border-green-500/20 bg-green-500/10 text-green-500 hover:bg-green-500/20">
          Active Now
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
          {/* Global Filters */}
          <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="h-9 w-[140px] bg-background">
                <SelectValue placeholder="Select Branch" />
              </SelectTrigger>
              <SelectContent>
                {uniqueBranches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedCourse} onValueChange={setSelectedCourse}>
              <SelectTrigger className="h-9 w-[140px] bg-background">
                <SelectValue placeholder="Select Program" />
              </SelectTrigger>
              <SelectContent>
                {uniqueCourses.length !== 1 && <SelectItem value="All">All Programs</SelectItem>}
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

          {/* Time Filter */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="w-full md:w-auto"
          >
            <TabsList className="grid h-10 w-full grid-cols-2 border bg-background p-1 md:w-auto">
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
                <TableHead className="font-semibold">Subject</TableHead>
                <TableHead className="font-semibold">Schedule</TableHead>
                <TableHead className="font-semibold">Duration</TableHead>
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
                      <Skeleton className="h-4 w-[100px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[150px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[60px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-[80px] rounded-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !selectedBranch ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 text-muted-foreground">
                      <AlertCircle className="h-10 w-10 opacity-20" />
                      <p className="text-base font-medium">Select a Branch</p>
                      <p className="max-w-[300px] text-center text-sm opacity-80">
                        Please select a specific Branch from the filters above to view{" "}
                        {type === "tests" ? "scheduled tests" : "scheduled DPPs"}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : displayedAssessments.length > 0 ? (
                displayedAssessments.map((a) => (
                  <TableRow key={a.id} className="group transition-colors hover:bg-muted/10">
                    <TableCell>
                      <div className="font-medium text-foreground">{a.title || "Untitled"}</div>
                      <div className="mt-1 max-w-[200px] truncate text-xs text-muted-foreground">
                        {a.targetBatches && a.targetBatches.length > 0
                          ? allBatches
                              .filter((b) => a.targetBatches!.includes(b.id))
                              .map((b) => b.name)
                              .join(", ") || `${a.targetBatches.length} batch(es)`
                          : "All Students"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.subject || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center gap-1.5">
                          <CalendarRange className="h-3 w-3 text-muted-foreground" />{" "}
                          {formatTime(a.startTime)}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> Until {formatTime(a.endTime)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.durationMinutes ? `${a.durationMinutes} min` : "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(a)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 text-muted-foreground">
                      {type === "tests" ? (
                        <CalendarRange className="h-10 w-10 opacity-20" />
                      ) : (
                        <BookOpen className="h-10 w-10 opacity-20" />
                      )}
                      <p className="text-base font-medium">
                        {activeTab === "upcoming"
                          ? `No upcoming ${type} scheduled.`
                          : `No past ${type} found.`}
                      </p>
                      <p className="max-w-[300px] text-center text-sm opacity-80">
                        Adjust your filters or head to the Test Series section to schedule new
                        assessments.
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
