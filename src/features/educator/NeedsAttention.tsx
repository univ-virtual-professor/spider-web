import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Search, CheckCircle2, ChevronRight, Filter } from "lucide-react";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";

import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Skeleton } from "@shared/ui/skeleton";
import { cn } from "@shared/lib/utils";

type WeakStudentData = {
  id: string;
  name: string;
  email?: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  attemptsCount: number;
  avatarUrl?: string;
  branchId?: string;
  courseId?: string;
  batchId?: string;
};

type Branch = { id: string; name: string };
type Course = { id: string; name: string; branchId: string };
type Batch = { id: string; name: string; courseId: string; branchId: string };

export default function NeedsAttention() {
  const location = useLocation();
  const navigate = useNavigate();
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";

  const { firebaseUser, profile } = useAuth();
  const { tenant } = useTenant();
  const educatorId = tenant?.educatorId || profile?.educatorId || firebaseUser?.uid || null;

  // Read initial filter values from navigation state if available
  const state = location.state as {
    initialBranch?: string;
    initialCourse?: string;
    initialBatch?: string;
  } | null;

  const [dbStudents, setDbStudents] = useState<any[]>([]);
  const [dbAttempts, setDbAttempts] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  // Active filters
  const [selectedBranch, setSelectedBranch] = useState(state?.initialBranch || "All");
  const [selectedCourse, setSelectedCourse] = useState(state?.initialCourse || "All");
  const [selectedBatch, setSelectedBatch] = useState(state?.initialBatch || "All");
  const [search, setSearch] = useState("");
  const [periodDays, setPeriodDays] = useState<string>("30");

  // Fetch student performance data & course hierarchy
  useEffect(() => {
    if (!educatorId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Students
        const learnersCol = collection(db, "educators", educatorId, "students");
        const studentsSnap = await getDocs(learnersCol);
        const studentsList = studentsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setDbStudents(studentsList);

        // 2. Fetch Attempts
        const attemptsCol = collection(db, "attempts");
        const attemptsSnap = await getDocs(
          query(attemptsCol, where("educatorId", "==", educatorId), limit(5000))
        );
        const attemptsList = attemptsSnap.docs.map((d) => d.data());
        setDbAttempts(attemptsList);

        // 3. Fetch Branches, Courses, and Batches Hierarchy
        const branchSnap = await getDocs(collection(db, "educators", educatorId, "branches"));
        const bs = branchSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || d.id,
        }));
        setBranches(bs);

        const cs: Course[] = [];
        const bts: Batch[] = [];

        for (const b of bs) {
          const courseSnap = await getDocs(
            collection(db, "educators", educatorId, "branches", b.id, "courses")
          );
          for (const c of courseSnap.docs) {
            const cData = c.data();
            cs.push({ id: c.id, name: cData.name || c.id, branchId: b.id });

            const batchSnap = await getDocs(
              collection(db, "educators", educatorId, "branches", b.id, "courses", c.id, "batches")
            );
            for (const bt of batchSnap.docs) {
              bts.push({
                id: bt.id,
                name: bt.data().name || bt.id,
                courseId: c.id,
                branchId: b.id,
              });
            }
          }
        }
        setCourses(cs);
        setBatches(bts);
      } catch (err) {
        console.error("Failed to load weak students: ", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [educatorId]);

  // Handle dependent filter resets when parent dropdowns change
  const handleBranchChange = (value: string) => {
    setSelectedBranch(value);
    setSelectedCourse("All");
    setSelectedBatch("All");
  };

  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
    setSelectedBatch("All");
  };

  // Derived filter options based on active selections
  const availableCourses = useMemo(() => {
    if (selectedBranch === "All") return Array.from(new Set(courses.map((c) => c.name))).sort();
    const branchId = branches.find((b) => b.name === selectedBranch)?.id;
    return Array.from(
      new Set(courses.filter((c) => c.branchId === branchId).map((c) => c.name))
    ).sort();
  }, [courses, branches, selectedBranch]);

  const availableBatches = useMemo(() => {
    let list = batches;
    if (selectedBranch !== "All") {
      const bId = branches.find((b) => b.name === selectedBranch)?.id;
      list = list.filter((b) => b.branchId === bId);
    }
    if (selectedCourse !== "All") {
      const cId = courses.find((c) => c.name === selectedCourse)?.id;
      list = list.filter((b) => b.courseId === cId);
    }
    return Array.from(new Set(list.map((b) => b.name))).sort();
  }, [batches, branches, courses, selectedBranch, selectedCourse]);

  // Compute weak students dynamically based on selected period
  const computedStudents = useMemo(() => {
    if (dbStudents.length === 0 || dbAttempts.length === 0) return [];

    const days = periodDays === "all" ? Infinity : Number(periodDays);
    const limitMs = Date.now() - days * 24 * 60 * 60 * 1000;

    const studentScores: Record<
      string,
      {
        id: string;
        totalScore: number;
        maxScore: number;
        name: string;
        email?: string;
        attemptsCount: number;
        avatarUrl?: string;
        branchId?: string;
        courseId?: string;
        batchId?: string;
      }
    > = {};

    dbAttempts.forEach((a) => {
      const stId = a.studentId;
      if (!stId) return;

      const ms = a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : a.submittedAt?.toMillis
          ? a.submittedAt.toMillis()
          : a.createdAt?.seconds
            ? a.createdAt.seconds * 1000
            : Date.now();

      if (periodDays !== "all" && ms < limitMs) return;

      if (!studentScores[stId]) {
        const student = dbStudents.find((s) => s.id === stId);
        studentScores[stId] = {
          id: stId,
          totalScore: 0,
          maxScore: 0,
          name:
            student?.name ||
            student?.displayName ||
            student?.fullName ||
            a.studentName ||
            "Unknown Student",
          email: student?.email,
          avatarUrl: student?.avatarUrl,
          branchId: student?.branchId,
          courseId: student?.courseId,
          batchId: student?.batchId,
          attemptsCount: 0,
        };
      }
      studentScores[stId].totalScore += Number(a.score || 0);
      studentScores[stId].maxScore += Number(a.maxScore || 0);
      studentScores[stId].attemptsCount += 1;
    });

    const weakList: WeakStudentData[] = [];

    Object.values(studentScores).forEach((st) => {
      if (st.maxScore > 0) {
        const pct = (st.totalScore / st.maxScore) * 100;
        if (pct < 40) {
          weakList.push({
            ...st,
            percentage: Math.round(pct),
          });
        }
      }
    });

    return weakList.sort((a, b) => a.percentage - b.percentage);
  }, [dbStudents, dbAttempts, periodDays]);

  // Apply Branch, Program, Batch, and Search query filters
  const filteredStudents = useMemo(() => {
    return computedStudents.filter((s) => {
      // Branch filter
      if (selectedBranch !== "All") {
        const branchId = branches.find((b) => b.name === selectedBranch)?.id;
        if (s.branchId !== branchId) return false;
      }

      // Program filter
      if (selectedCourse !== "All") {
        const courseId = courses.find((c) => c.name === selectedCourse)?.id;
        if (s.courseId !== courseId) return false;
      }

      // Batch filter
      if (selectedBatch !== "All") {
        const bId = batches.find((b) => b.name === selectedBatch)?.id;
        if (s.batchId !== bId) return false;
      }

      // Search query filter
      if (search) {
        const q = search.trim().toLowerCase();
        return s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
      }

      return true;
    });
  }, [
    computedStudents,
    selectedBranch,
    selectedCourse,
    selectedBatch,
    search,
    branches,
    courses,
    batches,
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6 duration-700 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          {!isApp && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden rounded-full bg-muted/50 hover:bg-primary hover:text-white md:flex"
              onClick={() => navigate("/educator/analytics")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Needs Attention Students
            </h1>
            <p className="hidden text-sm text-muted-foreground md:block">
              Identify and review students whose cumulative test average is under 40%.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        // Loading Skeletons
        <div className="space-y-6">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Global Filter Bar */}
          <Card className="sticky top-0 z-20 border-border/50 bg-card/85 shadow-sm backdrop-blur-md">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex hidden items-center gap-2 px-2 text-muted-foreground md:flex">
                  <Filter className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Filters</span>
                </div>

                {/* Branch Select */}
                <Select value={selectedBranch} onValueChange={handleBranchChange}>
                  <SelectTrigger className="h-9 w-[180px] border-border/50 bg-background">
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Branches</SelectItem>
                    {Array.from(new Set(branches.map((b) => b.name)))
                      .sort()
                      .map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {/* Program Select */}
                <Select value={selectedCourse} onValueChange={handleCourseChange}>
                  <SelectTrigger className="h-9 w-[180px] border-border/50 bg-background">
                    <SelectValue placeholder="Program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Programs</SelectItem>
                    {availableCourses.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Batch Select */}
                <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                  <SelectTrigger className="h-9 w-[180px] border-border/50 bg-background">
                    <SelectValue placeholder="Batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Batches</SelectItem>
                    {availableBatches.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Clear Button */}
                {(selectedBranch !== "All" ||
                  selectedCourse !== "All" ||
                  selectedBatch !== "All") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedBranch("All");
                      setSelectedCourse("All");
                      setSelectedBatch("All");
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {computedStudents.length === 0 ? (
            // Celebratory Empty State (No students under 40% overall)
            <Card className="border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 py-12 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-semibold text-emerald-800 dark:text-emerald-300">
                  Outstanding Progress!
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-emerald-700/80 dark:text-emerald-400/80">
                  No students are currently performing below the 40% threshold for the selected time
                  window. All learners are passing or meeting basic course requirements.
                </p>
                <Button
                  className="mt-6 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => navigate(-1)}
                >
                  Go Back to Dashboard
                </Button>
              </CardContent>
            </Card>
          ) : (
            // List Card
            <Card className="border-border/50 bg-card shadow-sm">
              <CardHeader className="flex flex-col justify-between gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:space-y-0">
                <CardTitle className="text-base font-semibold">Student List</CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="h-9 border-border/50 bg-background pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredStudents.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead className="border-b border-border/50 bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="p-4 pl-6">Student Information</th>
                          <th className="hidden p-4 text-center md:table-cell">Attempts</th>
                          <th className="hidden p-4 sm:table-cell">Average Performance</th>
                          <th className="p-4 pr-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredStudents.map((student) => {
                          const isCritical = student.percentage < 20;

                          return (
                            <tr
                              key={student.id}
                              className="group transition-colors hover:bg-muted/20"
                            >
                              <td className="p-2 pl-2 md:p-4 md:pl-6">
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8 border border-border/50">
                                    <AvatarImage src={student.avatarUrl} />
                                    <AvatarFallback className="bg-primary/5 text-xs font-bold text-primary">
                                      {student.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold leading-none text-foreground transition-colors group-hover:text-primary">
                                      {student.name}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                      {student.email || student.id}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="hidden p-2 text-center text-sm font-medium text-foreground md:table-cell md:p-4">
                                {student.attemptsCount || 0}
                              </td>
                              <td className="hidden p-2 sm:table-cell md:p-4">
                                <div className="flex max-w-[240px] flex-col gap-1.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <span
                                      className={cn(
                                        "font-semibold",
                                        isCritical ? "text-red-600" : "text-amber-600"
                                      )}
                                    >
                                      {student.percentage}% Avg Score
                                    </span>
                                    {isCritical && (
                                      <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/50 dark:text-red-400">
                                        Critical
                                      </span>
                                    )}
                                  </div>
                                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all duration-500",
                                        isCritical ? "bg-red-500" : "bg-amber-500"
                                      )}
                                      style={{ width: `${student.percentage}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="p-4 pr-6 text-right">
                                <Link to={`/educator/students/${student.id}`}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs font-semibold transition-colors hover:bg-primary hover:text-white"
                                  >
                                    View Profile
                                    <ChevronRight className="ml-1 hidden h-3.5 w-3.5 md:flex" />
                                  </Button>
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-16 text-center text-muted-foreground">
                    No students match your selected filters.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
