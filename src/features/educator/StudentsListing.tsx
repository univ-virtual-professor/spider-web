import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  Filter,
  X,
  ChevronRight,
  GraduationCap,
  Users,
  LayoutGrid,
  ArrowLeft,
} from "lucide-react";
import { collection, getDocs, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";

import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent } from "@shared/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Skeleton } from "@shared/ui/skeleton";
import { cn } from "@shared/lib/utils";

type Student = {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  avatarUrl?: string;
  batchId?: string;
  courseId?: string;
  branchId?: string;
};

type Branch = { id: string; name: string };
type Course = { id: string; name: string; branchId: string };
type Batch = { id: string; name: string; courseId: string; branchId: string };

export default function StudentsListing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { firebaseUser } = useAuth();
  const educatorId = firebaseUser?.uid;

  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Filter States from URL
  const branchFilter = searchParams.get("branch") || "All";
  const programFilter = searchParams.get("program") || "All";
  const batchFilter = searchParams.get("batch") || "All";
  const searchQuery = searchParams.get("q") || "";

  useEffect(() => {
    if (!educatorId) return;

    // Load Students
    const unsubStudents = onSnapshot(
      query(collection(db, "educators", educatorId, "students"), orderBy("joinedAt", "desc")),
      (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setIsDataLoaded(true);
        setIsLoading(false);
      },
      () => {
        setStudents([]);
        setIsLoading(false);
      }
    );

    // Load Hierarchy
    const loadHierarchy = async () => {
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
    };

    loadHierarchy();
    return () => unsubStudents();
  }, [educatorId]);

  const updateFilters = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "All") next.delete(key);
    else next.set(key, value);

    // Reset dependent filters
    if (key === "branch") {
      next.delete("program");
      next.delete("batch");
    } else if (key === "program") {
      next.delete("batch");
    }

    setSearchParams(next);
  };

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Branch filter
      if (branchFilter !== "All") {
        const branchId = branches.find((b) => b.name === branchFilter)?.id;
        if (s.branchId !== branchId) return false;
      }

      // Program filter
      if (programFilter !== "All") {
        const courseId = courses.find((c) => c.name === programFilter)?.id;
        if (s.courseId !== courseId) return false;
      }

      // Batch filter
      if (batchFilter !== "All") {
        const bId = batches.find((b) => b.name === batchFilter)?.id;
        if (s.batchId !== bId) return false;
      }

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const bName = batches.find((b) => b.id === s.batchId)?.name || "";
        return (
          (s.name || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q) ||
          bName.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [students, branchFilter, programFilter, batchFilter, searchQuery, branches, courses, batches]);

  // Derived filter options
  const availableCourses = useMemo(() => {
    if (branchFilter === "All") return Array.from(new Set(courses.map((c) => c.name))).sort();
    const branchId = branches.find((b) => b.name === branchFilter)?.id;
    return Array.from(
      new Set(courses.filter((c) => c.branchId === branchId).map((c) => c.name))
    ).sort();
  }, [courses, branches, branchFilter]);

  const availableBatches = useMemo(() => {
    let list = batches;
    if (branchFilter !== "All") {
      const bId = branches.find((b) => b.name === branchFilter)?.id;
      list = list.filter((b) => b.branchId === bId);
    }
    if (programFilter !== "All") {
      const cId = courses.find((c) => c.name === programFilter)?.id;
      list = list.filter((b) => b.courseId === cId);
    }
    return Array.from(new Set(list.map((b) => b.name))).sort();
  }, [batches, branches, courses, branchFilter, programFilter]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div
            className="flex cursor-pointer items-center gap-2 rounded-full p-2 transition-colors hover:bg-primary hover:text-white"
            onClick={() => navigate("/educator/analytics")}
          >
            <ArrowLeft className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">All Students</h1>
            <p className="mt-1 text-muted-foreground">
              Manage and monitor all enrolled students across branches and programs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email..."
              className="h-10 bg-card pl-9"
              value={searchQuery}
              onChange={(e) => updateFilters("q", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Global Filter Bar */}
      <Card className="sticky top-0 z-20 border-border/50 bg-card/80 shadow-sm backdrop-blur-md">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-2 text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Filters</span>
            </div>

            <Select value={branchFilter} onValueChange={(v) => updateFilters("branch", v)}>
              <SelectTrigger className="h-9 w-[180px] bg-background">
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

            <Select value={programFilter} onValueChange={(v) => updateFilters("program", v)}>
              <SelectTrigger className="h-9 w-[180px] bg-background">
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

            <Select value={batchFilter} onValueChange={(v) => updateFilters("batch", v)}>
              <SelectTrigger className="h-9 w-[180px] bg-background">
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

            {(branchFilter !== "All" ||
              programFilter !== "All" ||
              batchFilter !== "All" ||
              searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSearchParams(new URLSearchParams())}
              >
                <X className="mr-2 h-3 w-3" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Students List Container */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {isLoading || !isDataLoaded ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-3 w-[150px]" />
                </div>
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted/30">
              <Users className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-semibold">No students found</h3>
            <p className="mx-auto mt-2 max-w-xs text-muted-foreground">
              We couldn't find any students matching your current filters or search query.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => setSearchParams(new URLSearchParams())}
            >
              Reset All Filters
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border/50 bg-muted/30">
                <tr>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Student Info
                  </th>
                  <th className="hidden p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground md:table-cell">
                    Academic Info
                  </th>
                  <th className="hidden p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground lg:table-cell">
                    Status
                  </th>
                  <th className="p-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredStudents.map((student) => {
                  const studentBatch = batches.find((b) => b.id === student.batchId);
                  const studentCourse = courses.find((c) => c.id === student.courseId);
                  const isActive = student.status?.toUpperCase() === "ACTIVE";

                  return (
                    <tr key={student.id} className="group transition-colors hover:bg-muted/20">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-border/50">
                            <AvatarImage src={student.avatarUrl} />
                            <AvatarFallback className="bg-primary/5 text-xs font-bold text-primary">
                              {(student.name || "S")
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="mb-1 truncate text-sm font-semibold leading-none transition-colors group-hover:text-primary">
                              {student.name || "Unnamed Student"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {student.email || student.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden p-4 md:table-cell">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-foreground">
                            <GraduationCap className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">
                              {studentCourse?.name || "No Program"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <LayoutGrid className="h-3 w-3" />
                            <span>{studentBatch?.name || "No Batch"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hidden p-4 lg:table-cell">
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 border-none px-2 py-0 text-[10px] font-bold uppercase tracking-wider",
                            isActive
                              ? "bg-green-500/10 text-green-600"
                              : "bg-zinc-500/10 text-zinc-600"
                          )}
                        >
                          {student.status || "Unknown"}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="group/btn h-8 text-xs font-semibold"
                            onClick={() => navigate(`/educator/students/${student.id}`)}
                          >
                            View Details
                            <ChevronRight className="ml-1 h-3 w-3 transition-transform group-hover/btn:translate-x-0.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* List Footer Info */}
      {!isLoading && filteredStudents.length > 0 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-medium text-muted-foreground">
            Showing <span className="text-foreground">{filteredStudents.length}</span> of{" "}
            <span className="text-foreground">{students.length}</span> students
          </p>
        </div>
      )}
    </div>
  );
}
