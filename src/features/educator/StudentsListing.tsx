import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, X, ChevronRight, Users, ArrowLeft } from "lucide-react";
import { collection, getDocs, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";

import { Input } from "@shared/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Skeleton } from "@shared/ui/skeleton";
import { DsPageHeader, DsCard, DsTableHead, DsTableRow, DsStatusPill } from "@shared/ui/ds";

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
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
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

  const hasFilters =
    branchFilter !== "All" || programFilter !== "All" || batchFilter !== "All" || !!searchQuery;

  return (
    <div className="space-y-5 font-ds-sans">
      <div className="flex items-center gap-3">
        {!isApp && (
          <button
            onClick={() => navigate("/educator")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ds-slate hover:bg-ds-fill"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <DsPageHeader
          title="Students"
          subtitle={`Directory across branches and programs · ${students.length} enrolled`}
        />
      </div>

      <DsCard className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ds-ink/[.08] px-4 py-3">
          <Select value={branchFilter} onValueChange={(v) => updateFilters("branch", v)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All branches</SelectItem>
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
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Program" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All programs</SelectItem>
              {availableCourses.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={batchFilter} onValueChange={(v) => updateFilters("batch", v)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Batch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All batches</SelectItem>
              {availableBatches.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <button
              onClick={() => setSearchParams(new URLSearchParams())}
              className="flex h-9 items-center gap-1.5 rounded-md px-2.5 font-ds-sans text-[12px] font-medium text-ds-slate hover:bg-ds-fill"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
          <div className="flex-1" />
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ds-ink/40" />
            <Input
              placeholder="Search students…"
              className="h-9 border-ds-ink/15 pl-8 font-ds-sans text-[12.5px]"
              value={searchQuery}
              onChange={(e) => updateFilters("q", e.target.value)}
            />
          </div>
        </div>

        {isLoading || !isDataLoaded ? (
          <div className="divide-y divide-ds-ink/[.055]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-3 w-[150px]" />
                </div>
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-3 h-8 w-8 text-ds-ink/25" />
            <p className="font-ds-sans text-[13px] font-semibold text-ds-ink">No students found</p>
            <p className="mt-1 max-w-xs font-ds-sans text-[12px] text-ds-ink/45">
              No students match your current filters or search.
            </p>
            {hasFilters && (
              <button
                onClick={() => setSearchParams(new URLSearchParams())}
                className="mt-4 rounded-md border border-ds-ink/15 px-3 py-1.5 font-ds-sans text-[12px] font-medium text-ds-ink hover:bg-ds-fill"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <>
            <DsTableHead
              columns={["Student", "Batch", "Status", ""]}
              cols="1.5fr 1.2fr .8fr .8fr"
            />
            {filteredStudents.map((student) => {
              const studentBatch = batches.find((b) => b.id === student.batchId);
              const studentCourse = courses.find((c) => c.id === student.courseId);
              const isActive = student.status?.toUpperCase() === "ACTIVE";
              const initials = (student.name || "S")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase();

              return (
                <DsTableRow key={student.id} cols="1.5fr 1.2fr .8fr .8fr" height={56}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="h-8 w-8 shrink-0 border border-ds-ink/10">
                      <AvatarImage src={student.avatarUrl} />
                      <AvatarFallback className="bg-ds-fill font-ds-sans text-[10px] font-semibold text-ds-ink">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{student.name || "Unnamed"}</div>
                      <div className="truncate font-ds-mono text-[10.5px] text-ds-ink/45">
                        {student.email || student.id}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 text-ds-ink/70">
                    <div className="truncate">{studentCourse?.name || "—"}</div>
                    <div className="truncate font-ds-sans text-[11px] text-ds-ink/45">
                      {studentBatch?.name || "No batch"}
                    </div>
                  </div>
                  <div>
                    <DsStatusPill tone={isActive ? "positive" : "slate"}>
                      {student.status || "Unknown"}
                    </DsStatusPill>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => navigate(`/educator/students/${student.id}`)}
                      className="flex items-center gap-1 font-ds-sans text-[12px] font-semibold text-ds-accent hover:underline"
                    >
                      View
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </DsTableRow>
              );
            })}
          </>
        )}
      </DsCard>

      {!isLoading && filteredStudents.length > 0 && (
        <p className="px-1 font-ds-sans text-[11.5px] text-ds-ink/45">
          Showing {filteredStudents.length} of {students.length} students
        </p>
      )}
    </div>
  );
}
