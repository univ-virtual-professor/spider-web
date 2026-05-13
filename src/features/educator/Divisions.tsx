import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch as firestoreBatch,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Label } from "@shared/ui/label";
import { Checkbox } from "@shared/ui/checkbox";
import { Badge } from "@shared/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Users, UserCheck, UserX } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";

type Branch = { id: string; name: string; location: string };
type Course = {
  id: string;
  branchId: string;
  name: string;
  subjectIds: string[];
  subjectName?: string;
};
type Batch = {
  id: string;
  branchId: string;
  courseId: string;
  name: string;
  planId: string;
  planName?: string;
  seatLimit: number;
  usedSeats: number;
  startDate: string;
  endDate: string;
};
type Subject = { id: string; name: string; courseId?: string };
type TopLevelCourse = { id: string; name: string };
type Plan = { id: string; name: string; pricePerSeat: number };

const API = import.meta.env.VITE_MONKEY_KING_API_URL;

export default function Divisions() {
  const { profile, firebaseUser } = useAuth();
  const navigate = useNavigate();
  const educatorId = profile?.uid || "";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topLevelCourses, setTopLevelCourses] = useState<TopLevelCourse[]>([]);
  const [allowedCourseIds, setAllowedCourseIds] = useState<string[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<string[]>([]);
  const [maxBranches, setMaxBranches] = useState<number>(5);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [branchDialog, setBranchDialog] = useState(false);
  const [courseDialog, setCourseDialog] = useState(false);
  const [batchDialog, setBatchDialog] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);

  // Form state
  const [branchName, setBranchName] = useState("");
  const [branchLocation, setBranchLocation] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseBranchId, setCourseBranchId] = useState("");
  const [courseCourseId, setCourseCourseId] = useState("");
  const [courseSubjectIds, setCourseSubjectIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState("");
  const [batchBranchId, setBatchBranchId] = useState("");
  const [batchCourseId, setBatchCourseId] = useState("");
  const [batchStartDate, setBatchStartDate] = useState("");
  const [batchEndDate, setBatchEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("branches");

  // Learners tab state
  const [lBranchId, setLBranchId] = useState("");
  const [lCourseId, setLCourseId] = useState("");
  const [lBatchId, setLBatchId] = useState("");
  const [learners, setLearners] = useState<
    { id: string; name: string; email: string; status: string; joinedAt: any }[]
  >([]);
  const [loadingLearners, setLoadingLearners] = useState(false);

  // Seat management
  const [seatMap, setSeatMap] = useState<Record<string, boolean>>({});
  const [seatLimit, setSeatLimit] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Per-batch enrolled student count (computed from live students snapshot)
  const [batchStudentCounts, setBatchStudentCounts] = useState<Record<string, number>>({});

  // Assign-batch dialog
  const [assignTarget, setAssignTarget] = useState<{
    id: string;
    name?: string;
    branchId?: string;
    courseId?: string;
    batchId?: string;
  } | null>(null);
  const [assignBranch, setAssignBranch] = useState("");
  const [assignCourse, setAssignCourse] = useState("");
  const [assignBatch, setAssignBatch] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!educatorId) return;

    // Load educator limits
    getDoc(doc(db, "educators", educatorId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaxBranches(data.maxBranches ?? 5);
        setAllowedSubjectIds(data.allowedSubjectIds ?? []);
        setAllowedCourseIds(data.allowedCourseIds ?? []);
        setSeatLimit(data.seatLimit ?? 0);
      }
    });

    // Billing seats (for grant/revoke)
    const unsubSeats = onSnapshot(
      collection(db, "educators", educatorId, "billingSeats"),
      (snap) => {
        const map: Record<string, boolean> = {};
        snap.docs.forEach((d) => {
          map[d.id] = String((d.data() as any)?.status || "").toLowerCase() === "active";
        });
        setSeatMap(map);
      }
    );

    // Count enrolled students per batch from live snapshot
    const unsubStudents = onSnapshot(
      collection(db, "educators", educatorId, "students"),
      (snap) => {
        const counts: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const bid = String((d.data() as any)?.batchId || "");
          if (bid) counts[bid] = (counts[bid] || 0) + 1;
        });
        setBatchStudentCounts(counts);
      }
    );

    // Load branches
    const branchUnsub = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, "id">) })))
    );

    // Load subjects (filtered by allowed)
    getDocs(collection(db, "subjects")).then((snap) => {
      setSubjects(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          courseId: d.data().courseId as string | undefined,
        }))
      );
    });

    // Load top-level courses
    getDocs(collection(db, "courses")).then((snap) => {
      setTopLevelCourses(
        snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id }))
      );
    });

    // Load plans
    getDocs(collection(db, "plans")).then((snap) => {
      setPlans(
        snap.docs
          .filter((d) => d.data().isActive)
          .map((d) => ({ id: d.id, name: d.data().name, pricePerSeat: d.data().pricePerSeat }))
      );
    });

    setLoading(false);
    return () => {
      branchUnsub();
      unsubSeats();
      unsubStudents();
    };
  }, [educatorId]);

  // Load courses when branches change
  useEffect(() => {
    if (!educatorId || branches.length === 0) {
      setCourses([]);
      return;
    }
    const unsubs = branches.map((branch) =>
      onSnapshot(
        collection(db, "educators", educatorId, "branches", branch.id, "courses"),
        (snap) => {
          const branchCourses = snap.docs.map((d) => {
            const data = d.data() as any;
            const subjectIds: string[] = Array.isArray(data.subjectIds)
              ? data.subjectIds
              : data.subjectId
                ? [data.subjectId]
                : [];
            return { id: d.id, branchId: branch.id, name: data.name, subjectIds };
          });
          setCourses((prev) => [...prev.filter((c) => c.branchId !== branch.id), ...branchCourses]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [branches, educatorId]);

  // Load batches when courses change
  useEffect(() => {
    if (!educatorId || courses.length === 0) {
      setBatches([]);
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
          const courseBatches = snap.docs.map((d) => ({
            id: d.id,
            branchId: course.branchId,
            courseId: course.id,
            ...(d.data() as Omit<Batch, "id" | "branchId" | "courseId">),
          }));
          setBatches((prev) => [...prev.filter((b) => b.courseId !== course.id), ...courseBatches]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [courses, educatorId]);

  // Auto-select single options in Learners dropdowns
  useEffect(() => {
    if (branches.length === 1 && !lBranchId) setLBranchId(branches[0].id);
  }, [branches]);

  useEffect(() => {
    const filtered = courses.filter((c) => c.branchId === lBranchId);
    if (filtered.length === 1 && !lCourseId) setLCourseId(filtered[0].id);
    else if (lBranchId) setLCourseId("");
  }, [lBranchId, courses]);

  useEffect(() => {
    const filtered = batches.filter((b) => b.courseId === lCourseId);
    if (filtered.length === 1 && !lBatchId) setLBatchId(filtered[0].id);
    else if (lCourseId) setLBatchId("");
  }, [lCourseId, batches]);

  useEffect(() => {
    if (!educatorId || !lBatchId) {
      setLearners([]);
      return;
    }
    setLoadingLearners(true);
    const q = query(
      collection(db, "educators", educatorId, "students"),
      where("batchId", "==", lBatchId)
    );
    const unsub = onSnapshot(q, (snap) => {
      setLearners(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLoadingLearners(false);
    });
    return () => unsub();
  }, [educatorId, lBatchId]);

  const usedSeats = Object.values(seatMap).filter(Boolean).length;
  const canAssign = seatLimit > 0 && usedSeats < seatLimit;

  async function postWithToken(path: string, body: any) {
    const token = await firebaseUser?.getIdToken();
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || "Request failed");
    return data;
  }

  async function grantSeat(studentId: string) {
    setBusyId(studentId);
    try {
      await postWithToken("/api/billing/assign-seat", { studentId });
      toast.success("Seat granted");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeSeat(studentId: string) {
    setBusyId(studentId);
    try {
      await postWithToken("/api/billing/revoke-seat", { studentId });
      toast.success("Seat revoked");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(studentId: string, next: "ACTIVE" | "INACTIVE") {
    try {
      await updateDoc(doc(db, "educators", educatorId, "students", studentId), { status: next });
      toast.success(`Set to ${next}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }

  function openAssignBatch(l: {
    id: string;
    name?: string;
    branchId?: string;
    courseId?: string;
    batchId?: string;
  }) {
    setAssignTarget(l);
    setAssignBranch(l.branchId || "");
    setAssignCourse(l.courseId || "");
    setAssignBatch(l.batchId || "");
  }

  async function saveAssignBatch() {
    if (!assignTarget || !assignBranch || !assignCourse || !assignBatch) return;
    const batchInfo = batches.find((b) => b.id === assignBatch);
    setAssigning(true);
    try {
      const batch = firestoreBatch(db);
      batch.set(
        doc(db, "educators", educatorId, "students", assignTarget.id),
        { branchId: assignBranch, courseId: assignCourse, batchId: assignBatch },
        { merge: true }
      );
      batch.set(
        doc(db, "users", assignTarget.id),
        { branchId: assignBranch, courseId: assignCourse, batchId: assignBatch },
        { merge: true }
      );
      batch.set(
        doc(db, "educators", educatorId, "billingSeats", assignTarget.id),
        { branchId: assignBranch, courseId: assignCourse, batchId: assignBatch },
        { merge: true }
      );
      await batch.commit();
      toast.success(`Assigned to ${batchInfo?.name || assignBatch}`);
      setAssignTarget(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setAssigning(false);
    }
  }

  // ── Branch CRUD ─────────────────────────────────────────────────────────
  function openCreateBranch() {
    if (branches.length >= maxBranches) {
      toast.error(`Branch limit reached (max ${maxBranches})`);
      return;
    }
    setEditingBranch(null);
    setBranchName("");
    setBranchLocation("");
    setBranchDialog(true);
  }

  function openEditBranch(b: Branch) {
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchLocation(b.location);
    setBranchDialog(true);
  }

  async function saveBranch() {
    if (!branchName.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      const ref = collection(db, "educators", educatorId, "branches");
      if (editingBranch) {
        await updateDoc(doc(db, "educators", educatorId, "branches", editingBranch.id), {
          name: branchName,
          location: branchLocation,
        });
      } else {
        await addDoc(ref, {
          name: branchName,
          location: branchLocation,
          createdAt: Timestamp.now(),
        });
      }
      setBranchDialog(false);
      toast.success(editingBranch ? "Branch updated" : "Branch created");
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBranch(b: Branch) {
    if (
      !confirm(`Delete branch "${b.name}"? All programs and batches under it will also be removed.`)
    )
      return;
    await deleteDoc(doc(db, "educators", educatorId, "branches", b.id));
    toast.success("Branch deleted");
  }

  // ── Course CRUD ──────────────────────────────────────────────────────────
  function openCreateCourse() {
    setEditingCourse(null);
    setCourseName("");
    setCourseBranchId(branches[0]?.id || "");
    setCourseCourseId("");
    setCourseSubjectIds([]);
    setCourseDialog(true);
  }

  function openEditCourse(c: Course) {
    setEditingCourse(c);
    setCourseName(c.name);
    setCourseBranchId(c.branchId);
    const parentCourseId = subjects.find((s) => c.subjectIds.includes(s.id))?.courseId || "";
    setCourseCourseId(parentCourseId);
    setCourseSubjectIds(c.subjectIds);
    setCourseDialog(true);
  }

  async function saveCourse() {
    if (!courseName.trim() || !courseBranchId || courseSubjectIds.length === 0) {
      toast.error("All fields required");
      return;
    }
    setBusy(true);
    try {
      const ref = collection(db, "educators", educatorId, "branches", courseBranchId, "courses");
      if (editingCourse) {
        await updateDoc(
          doc(db, "educators", educatorId, "branches", courseBranchId, "courses", editingCourse.id),
          { name: courseName, subjectIds: courseSubjectIds }
        );
      } else {
        await addDoc(ref, {
          name: courseName,
          subjectIds: courseSubjectIds,
          createdAt: Timestamp.now(),
        });
      }
      setCourseDialog(false);
      toast.success(editingCourse ? "Program updated" : "Program created");
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCourse(c: Course) {
    if (!confirm(`Delete program "${c.name}"?`)) return;
    await deleteDoc(doc(db, "educators", educatorId, "branches", c.branchId, "courses", c.id));
    toast.success("Program deleted");
  }

  // ── Batch CRUD ───────────────────────────────────────────────────────────
  function openCreateBatch() {
    setEditingBatch(null);
    setBatchName("");
    setBatchBranchId(branches[0]?.id || "");
    setBatchCourseId("");
    setBatchStartDate("");
    setBatchEndDate("");
    setBatchDialog(true);
  }

  function openEditBatch(b: Batch) {
    setEditingBatch(b);
    setBatchName(b.name);
    setBatchBranchId(b.branchId);
    setBatchCourseId(b.courseId);
    setBatchStartDate(b.startDate);
    setBatchEndDate(b.endDate);
    setBatchDialog(true);
  }

  async function saveBatch() {
    if (!batchName.trim() || !batchBranchId || !batchCourseId) {
      toast.error("All fields required");
      return;
    }
    setBusy(true);
    try {
      const ref = collection(
        db,
        "educators",
        educatorId,
        "branches",
        batchBranchId,
        "courses",
        batchCourseId,
        "batches"
      );
      if (editingBatch) {
        await updateDoc(
          doc(
            db,
            "educators",
            educatorId,
            "branches",
            batchBranchId,
            "courses",
            batchCourseId,
            "batches",
            editingBatch.id
          ),
          { name: batchName, startDate: batchStartDate, endDate: batchEndDate }
        );
      } else {
        await addDoc(ref, {
          name: batchName,
          seatLimit: 0,
          usedSeats: 0,
          startDate: batchStartDate,
          endDate: batchEndDate,
          createdAt: Timestamp.now(),
        });
      }
      setBatchDialog(false);
      toast.success(editingBatch ? "Batch updated" : "Batch created");
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBatch(b: Batch) {
    if (!confirm(`Delete batch "${b.name}"?`)) return;
    await deleteDoc(
      doc(
        db,
        "educators",
        educatorId,
        "branches",
        b.branchId,
        "courses",
        b.courseId,
        "batches",
        b.id
      )
    );
    toast.success("Batch deleted");
  }

  const allowedSubjects = subjects.filter(
    (s) => allowedSubjectIds.length === 0 || allowedSubjectIds.includes(s.id)
  );
  const allowedCourses = topLevelCourses.filter(
    (c) => allowedCourseIds.length === 0 || allowedCourseIds.includes(c.id)
  );
  const subjectsForCourse = allowedSubjects.filter(
    (s) => !courseCourseId || s.courseId === courseCourseId
  );
  const coursesForBranch = (branchId: string) => courses.filter((c) => c.branchId === branchId);

  if (loading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Student Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage branches, courses, batches, and enrolled learners
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="w-full overflow-x-auto">
          <TabsList className="inline-flex min-w-max">
            <TabsTrigger value="branches">
              Branches ({branches.length}/{maxBranches})
            </TabsTrigger>
            <TabsTrigger value="courses">Programs ({courses.length})</TabsTrigger>
            <TabsTrigger value="batches">Batches ({batches.length})</TabsTrigger>
            <TabsTrigger value="learners" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              Learners
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Branches Tab */}
        <TabsContent value="branches" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreateBranch} disabled={branches.length >= maxBranches}>
              <Plus className="mr-2 h-4 w-4" />
              Add Branch
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <Card key={b.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  {b.location && <p className="text-sm text-muted-foreground">{b.location}</p>}
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {coursesForBranch(b.id).length} program(s)
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditBranch(b)}>
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteBranch(b)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {branches.length === 0 && (
              <p className="col-span-3 py-8 text-center text-muted-foreground">No branches yet.</p>
            )}
          </div>
        </TabsContent>

        {/* Courses Tab */}
        <TabsContent value="courses" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreateCourse} disabled={branches.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add Program
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Program</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead>Batches</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courses.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          {branches.find((b) => b.id === c.branchId)?.name || c.branchId}
                        </TableCell>
                        <TableCell>
                          {c.subjectIds
                            .map((id) => subjects.find((s) => s.id === id)?.name || id)
                            .join(", ")}
                        </TableCell>
                        <TableCell>{batches.filter((b) => b.courseId === c.id).length}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => openEditCourse(c)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteCourse(c)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {courses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          No programs yet. Create a branch first.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Batches Tab */}
        <TabsContent value="batches" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreateBatch} disabled={courses.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add Batch
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Seats</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell>{branches.find((br) => br.id === b.branchId)?.name}</TableCell>
                        <TableCell>{courses.find((c) => c.id === b.courseId)?.name}</TableCell>
                        <TableCell>
                          {plans.find((p) => p.id === b.planId)?.name || b.planId}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              (batchStudentCounts[b.id] ?? 0) >= b.seatLimit && b.seatLimit > 0
                                ? "font-medium text-destructive"
                                : ""
                            }
                          >
                            {batchStudentCounts[b.id] ?? 0}/{b.seatLimit}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {b.startDate} — {b.endDate}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setLBranchId(b.branchId);
                                setLCourseId(b.courseId);
                                setLBatchId(b.id);
                                setActiveTab("learners");
                              }}
                            >
                              <Users className="mr-1 h-3 w-3" />
                              {batchStudentCounts[b.id] ?? 0}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openEditBatch(b)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteBatch(b)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {batches.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No batches yet. Create a course first.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Learners Tab */}
        <TabsContent value="learners" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {branches.length !== 1 && (
              <div className="min-w-[160px] space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Branch</p>
                <Select
                  value={lBranchId}
                  onValueChange={(v) => {
                    setLBranchId(v);
                    setLCourseId("");
                    setLBatchId("");
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {lBranchId && courses.filter((c) => c.branchId === lBranchId).length !== 1 && (
              <div className="min-w-[160px] space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Program</p>
                <Select
                  value={lCourseId}
                  onValueChange={(v) => {
                    setLCourseId(v);
                    setLBatchId("");
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses
                      .filter((c) => c.branchId === lBranchId)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {lCourseId && batches.filter((b) => b.courseId === lCourseId).length !== 1 && (
              <div className="min-w-[160px] space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Batch</p>
                <Select value={lBatchId} onValueChange={setLBatchId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches
                      .filter((b) => b.courseId === lCourseId)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {lBatchId && (
              <Badge variant="secondary" className="h-8 px-3 text-sm">
                {batchStudentCounts[lBatchId] ?? 0} /{" "}
                {batches.find((b) => b.id === lBatchId)?.seatLimit ?? 0} seats
              </Badge>
            )}
          </div>

          {!lBatchId ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Select a batch above to see enrolled learners.
            </p>
          ) : loadingLearners ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Seat</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="w-36">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {learners.map((l) => {
                        const seatOn = Boolean(seatMap[l.id]);
                        const inactive = l.status === "INACTIVE";
                        const busy = busyId === l.id;
                        return (
                          <TableRow key={l.id}>
                            <TableCell>
                              <button
                                className="text-left font-medium hover:underline"
                                onClick={() => navigate(`/educator/learners/${l.id}`)}
                              >
                                {l.name || l.id}
                                <div className="text-xs font-normal text-muted-foreground">
                                  {l.email}
                                </div>
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={inactive ? "secondary" : "default"}
                                className="text-xs"
                              >
                                {l.status || "ACTIVE"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`text-xs font-medium ${seatOn ? "text-green-600" : "text-orange-500"}`}
                              >
                                {seatOn ? "Granted" : "None"}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {l.joinedAt?.toDate ? l.joinedAt.toDate().toLocaleDateString() : "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => openAssignBatch(l)}
                                  title={l.batchId ? "Change batch" : "Assign batch"}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {!seatOn ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2"
                                    disabled={!canAssign || busy || inactive}
                                    onClick={() => grantSeat(l.id)}
                                    title="Grant seat"
                                  >
                                    {busy ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <UserCheck className="h-3 w-3" />
                                    )}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2"
                                    disabled={busy}
                                    onClick={() => revokeSeat(l.id)}
                                    title="Revoke seat"
                                  >
                                    {busy ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <UserX className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() =>
                                    toggleActive(l.id, inactive ? "ACTIVE" : "INACTIVE")
                                  }
                                >
                                  {inactive ? "Activate" : "Deactivate"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {learners.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            No learners enrolled in this batch yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Branch Dialog */}
      <Dialog open={branchDialog} onOpenChange={setBranchDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Edit Branch" : "New Branch"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Branch Name</Label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Sector 18, Noida"
              />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                value={branchLocation}
                onChange={(e) => setBranchLocation(e.target.value)}
                placeholder="City / Area"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBranchDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveBranch} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Program Dialog */}
      <Dialog open={courseDialog} onOpenChange={setCourseDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCourse ? "Edit Program" : "New Program"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Program Name</Label>
              <Input
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g. JEE Mains 2026"
              />
            </div>
            <div className="space-y-1">
              <Label>Branch</Label>
              <Select value={courseBranchId} onValueChange={setCourseBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Course</Label>
              <Select
                value={courseCourseId}
                onValueChange={(v) => {
                  setCourseCourseId(v);
                  setCourseSubjectIds([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {allowedCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {courseCourseId && (
              <div className="space-y-2">
                <Label>Subjects</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {subjectsForCourse.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No subjects available</p>
                  ) : (
                    subjectsForCourse.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`subj-${s.id}`}
                          checked={courseSubjectIds.includes(s.id)}
                          onCheckedChange={(checked) =>
                            setCourseSubjectIds((prev) =>
                              checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                            )
                          }
                        />
                        <label
                          htmlFor={`subj-${s.id}`}
                          className="cursor-pointer select-none text-sm"
                        >
                          {s.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCourseDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveCourse} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign / Change Batch Dialog */}
      <Dialog
        open={!!assignTarget}
        onOpenChange={(o) => {
          if (!o) setAssignTarget(null);
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {assignTarget?.batchId ? "Change Batch" : "Assign Batch"} — {assignTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Branch</Label>
              <Select
                value={assignBranch}
                onValueChange={(v) => {
                  setAssignBranch(v);
                  setAssignCourse("");
                  setAssignBatch("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Program</Label>
              <Select
                value={assignCourse}
                onValueChange={(v) => {
                  setAssignCourse(v);
                  setAssignBatch("");
                }}
                disabled={!assignBranch}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  {courses
                    .filter((c) => c.branchId === assignBranch)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Batch</Label>
              <Select value={assignBatch} onValueChange={setAssignBatch} disabled={!assignCourse}>
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches
                    .filter((b) => b.courseId === assignCourse && b.branchId === assignBranch)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button disabled={!assignBatch || assigning} onClick={saveAssignBatch}>
              {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Dialog */}
      <Dialog open={batchDialog} onOpenChange={setBatchDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBatch ? "Edit Batch" : "New Batch"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Batch Name</Label>
              <Input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. Morning Batch A"
              />
            </div>
            <div className="space-y-1">
              <Label>Branch</Label>
              <Select
                value={batchBranchId}
                onValueChange={(v) => {
                  setBatchBranchId(v);
                  setBatchCourseId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Program</Label>
              <Select value={batchCourseId} onValueChange={setBatchCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  {courses
                    .filter((c) => c.branchId === batchBranchId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={batchStartDate}
                  onChange={(e) => setBatchStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={batchEndDate}
                  onChange={(e) => setBatchEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBatchDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveBatch} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
