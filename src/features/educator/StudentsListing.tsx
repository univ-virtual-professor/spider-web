import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, X, ChevronRight, Users, ArrowLeft, ArrowLeftRight } from "lucide-react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, orderBy, writeBatch } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { PERMISSIONS } from "@shared/lib/rolesConfig";
import { toast } from "sonner";

import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Checkbox } from "@shared/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
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
  // Not written anywhere in this app yet (no enrolment flow captures a guardian today — see
  // docs/agents/risks.md): shown only if some other process has set them on the doc.
  guardianName?: string;
  guardianPhone?: string;
  joinedAt?: any;
};

type Branch = { id: string; name: string };
type Course = { id: string; name: string; branchId: string };
type Batch = { id: string; name: string; courseId: string; branchId: string };

// Bounded per-student readiness lookup — only fetched once a single batch is selected, so this
// stays a few dozen reads at most, not one per student in the whole institute.
type ReadinessInfo = { weakTopics: string[]; weakCount: number; strongCount: number };
const MAX_READINESS_LOOKUPS = 150;

export default function StudentsListing() {
  const navigate = useNavigate();
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const [searchParams, setSearchParams] = useSearchParams();
  const { firebaseUser } = useAuth();
  const { hasPermission } = useEmployee();
  const canManage = hasPermission(PERMISSIONS.STUDENTS_MANAGE);
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
  const atRiskOnly = searchParams.get("atRisk") === "1";

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferBranchId, setTransferBranchId] = useState("");
  const [transferCourseId, setTransferCourseId] = useState("");
  const [transferBatchId, setTransferBatchId] = useState("");
  const [transferring, setTransferring] = useState(false);

  const [readiness, setReadiness] = useState<Record<string, ReadinessInfo>>({});
  const [readinessLoading, setReadinessLoading] = useState(false);

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
    if (value === "All" || !value) next.delete(key);
    else next.set(key, value);

    // Reset dependent filters
    if (key === "branch") {
      next.delete("program");
      next.delete("batch");
    } else if (key === "program") {
      next.delete("batch");
    }
    if (key === "batch") next.delete("atRisk");

    setSearchParams(next);
    setSelectedIds(new Set());
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

  // Readiness/weakest-topics lookup — only when a single batch is selected, so the read count
  // stays bounded to that batch's roster (BUILD-NOTES' fa_students: "weakest first, at risk").
  useEffect(() => {
    if (batchFilter === "All" || filteredStudents.length === 0 || filteredStudents.length > MAX_READINESS_LOOKUPS) {
      setReadiness({});
      return;
    }
    let cancelled = false;
    setReadinessLoading(true);
    Promise.all(
      filteredStudents.map(async (s) => {
        try {
          const snap = await getDoc(doc(db, "users", s.id, "reports", "summary"));
          if (!snap.exists()) return [s.id, null] as const;
          const d = snap.data() as any;
          const weak = (d.weakAreasFull || d.weakAreas || []) as any[];
          const strong = (d.strongHoldsFull || d.strongHolds || []) as any[];
          const weakTopics = weak
            .slice(0, 2)
            .map((w) => String(w.topic || w.chapter || w.subject || "").trim())
            .filter(Boolean);
          return [s.id, { weakTopics, weakCount: weak.length, strongCount: strong.length }] as const;
        } catch {
          return [s.id, null] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, ReadinessInfo> = {};
      pairs.forEach(([id, info]) => {
        if (info) next[id] = info;
      });
      setReadiness(next);
      setReadinessLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [batchFilter, filteredStudents]);

  const hasReadiness = batchFilter !== "All" && Object.keys(readiness).length > 0;

  const visibleStudents = useMemo(() => {
    let list = filteredStudents;
    if (atRiskOnly && hasReadiness) {
      list = list.filter((s) => (readiness[s.id]?.weakCount || 0) >= 3);
    }
    if (hasReadiness) {
      list = [...list].sort((a, b) => {
        const ra = readiness[a.id];
        const rb = readiness[b.id];
        const scoreA = ra ? ra.weakCount - ra.strongCount : 0;
        const scoreB = rb ? rb.weakCount - rb.strongCount : 0;
        return scoreB - scoreA; // weakest first
      });
    }
    return list;
  }, [filteredStudents, atRiskOnly, hasReadiness, readiness]);

  const atRiskCount = useMemo(
    () => filteredStudents.filter((s) => (readiness[s.id]?.weakCount || 0) >= 3).length,
    [filteredStudents, readiness]
  );

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

  const transferCourses = useMemo(
    () => courses.filter((c) => c.branchId === transferBranchId),
    [courses, transferBranchId]
  );
  const transferBatches = useMemo(
    () => batches.filter((b) => b.courseId === transferCourseId),
    [batches, transferCourseId]
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === visibleStudents.length ? new Set() : new Set(visibleStudents.map((s) => s.id))
    );
  };

  const openTransfer = () => {
    setTransferBranchId("");
    setTransferCourseId("");
    setTransferBatchId("");
    setTransferOpen(true);
  };

  const runTransfer = async () => {
    if (!educatorId || !transferBatchId || selectedIds.size === 0) return;
    setTransferring(true);
    try {
      const batchWrite = writeBatch(db);
      selectedIds.forEach((id) => {
        batchWrite.update(doc(db, "educators", educatorId, "students", id), {
          branchId: transferBranchId,
          courseId: transferCourseId,
          batchId: transferBatchId,
        });
      });
      await batchWrite.commit();
      toast.success(`Moved ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"}.`);
      setSelectedIds(new Set());
      setTransferOpen(false);
    } catch {
      toast.error("Transfer failed. Try again.");
    } finally {
      setTransferring(false);
    }
  };

  const handleExport = () => {
    const header = "Name,Email,Batch,Status,Guardian,Guardian phone";
    const rows = visibleStudents.map((s) => {
      const batchName = batches.find((b) => b.id === s.batchId)?.name || "";
      return [s.name || "", s.email || "", batchName, s.status || "", s.guardianName || "", s.guardianPhone || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
          subtitle={
            batchFilter !== "All"
              ? `Your students in ${batchFilter}, weakest first.`
              : `The full directory. Transfers and enrolment status · ${students.length} enrolled`
          }
          primary={{ label: "Generate practice", onClick: () => navigate("/educator/dpp") }}
          secondary={{ label: "Export", onClick: handleExport }}
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
          {hasReadiness && (
            <button
              onClick={() => updateFilters("atRisk", atRiskOnly ? "" : "1")}
              className={
                atRiskOnly
                  ? "flex h-9 items-center gap-1.5 rounded-md bg-ds-accent/15 px-2.5 font-ds-sans text-[12px] font-semibold text-ds-accent"
                  : "flex h-9 items-center gap-1.5 rounded-md bg-ds-fill px-2.5 font-ds-sans text-[12px] font-semibold text-ds-ink/70"
              }
            >
              At risk · {atRiskCount}
            </button>
          )}
          {canManage && selectedIds.size > 0 && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={openTransfer}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Bulk transfer ({selectedIds.size})
            </Button>
          )}
          {hasFilters && (
            <button
              onClick={() => {
                setSearchParams(new URLSearchParams());
                setSelectedIds(new Set());
              }}
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
        ) : visibleStudents.length === 0 ? (
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
              columns={
                canManage
                  ? ["", "Student", "Batch", "Guardian", hasReadiness ? "Weakest topics" : "Status", ""]
                  : ["Student", "Batch", "Guardian", hasReadiness ? "Weakest topics" : "Status", ""]
              }
              cols={canManage ? "32px 1.4fr 1.1fr 1.2fr 1.3fr .6fr" : "1.5fr 1.1fr 1.2fr 1.3fr .6fr"}
            />
            {visibleStudents.map((student) => {
              const studentBatch = batches.find((b) => b.id === student.batchId);
              const studentCourse = courses.find((c) => c.id === student.courseId);
              const isActive = student.status?.toUpperCase() === "ACTIVE";
              const info = readiness[student.id];
              const initials = (student.name || "S")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase();

              return (
                <DsTableRow
                  key={student.id}
                  cols={canManage ? "32px 1.4fr 1.1fr 1.2fr 1.3fr .6fr" : "1.5fr 1.1fr 1.2fr 1.3fr .6fr"}
                  height={56}
                >
                  {canManage && (
                    <Checkbox
                      checked={selectedIds.has(student.id)}
                      onCheckedChange={() => toggleSelected(student.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
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
                  <div className="min-w-0 text-ds-ink/70">
                    <div className="truncate">{student.guardianName || "—"}</div>
                    {student.guardianPhone && (
                      <div className="truncate font-ds-mono text-[10.5px] text-ds-ink/45">
                        {student.guardianPhone}
                      </div>
                    )}
                  </div>
                  {hasReadiness ? (
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {info?.weakTopics.length ? (
                        info.weakTopics.map((t) => (
                          <span
                            key={t}
                            className="truncate rounded-md bg-ds-fill px-1.5 py-0.5 font-ds-sans text-[10.5px] text-ds-ink/60"
                          >
                            {t}
                          </span>
                        ))
                      ) : readinessLoading ? (
                        <Skeleton className="h-4 w-20" />
                      ) : (
                        <span className="font-ds-sans text-[11px] text-ds-ink/35">—</span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <DsStatusPill tone={isActive ? "positive" : "slate"}>
                        {student.status || "Unknown"}
                      </DsStatusPill>
                    </div>
                  )}
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

      {!isLoading && visibleStudents.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="font-ds-sans text-[11.5px] text-ds-ink/45">
            Showing {visibleStudents.length} of {students.length} students
          </p>
          {canManage && visibleStudents.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="font-ds-sans text-[11.5px] font-medium text-ds-ink/50 hover:text-ds-ink"
            >
              {selectedIds.size === visibleStudents.length ? "Clear selection" : "Select all"}
            </button>
          )}
        </div>
      )}

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer {selectedIds.size} student{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={transferBranchId}
              onValueChange={(v) => {
                setTransferBranchId(v);
                setTransferCourseId("");
                setTransferBatchId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Target branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={transferCourseId}
              onValueChange={(v) => {
                setTransferCourseId(v);
                setTransferBatchId("");
              }}
              disabled={!transferBranchId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Target program" />
              </SelectTrigger>
              <SelectContent>
                {transferCourses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={transferBatchId} onValueChange={setTransferBatchId} disabled={!transferCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Target batch" />
              </SelectTrigger>
              <SelectContent>
                {transferBatches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runTransfer} disabled={!transferBatchId || transferring}>
              {transferring ? "Moving…" : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
