import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useAccessibleCourses } from "@shared/hooks/useAccessibleCourses";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Users,
  UserPlus,
  Copy,
  Check,
  Building2,
  CreditCard,
  ArrowRight,
  ArrowLeftRight,
  PlusCircle,
  CalendarDays,
  ArrowLeft,
} from "lucide-react";
import BatchSchedulePanel, { type PanelBatch } from "./components/BatchSchedulePanel";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;

type Branch = { id: string; name: string; location?: string };
type Course = { id: string; branchId: string; name: string; subjectIds: string[] };
type Batch = {
  id: string;
  branchId: string;
  courseId: string;
  name: string;
  planId?: string;
  seatLimit: number;
  usedSeats: number;
  poolAllocatedSeats?: number;
  startDate?: string;
  endDate?: string;
};
type Plan = { id: string; name: string; pricePerSeat: number };
type SeatPool = {
  planId: string;
  planName: string;
  totalSeats: number;
  availableSeats: number;
  allocatedSeats: number;
};
type Subject = { id: string; name: string; courseId?: string };

export default function BatchesListing() {
  const navigate = useNavigate();
  const { profile, firebaseUser, loading: authLoading } = useAuth();
  const educatorId = profile?.uid || firebaseUser?.uid || "";

  const { courses: globalCourses } = useAccessibleCourses(educatorId);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pools, setPools] = useState<SeatPool[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wName, setWName] = useState("");
  const [wBranchId, setWBranchId] = useState("");
  const [wCourseId, setWCourseId] = useState("");
  const [wStartDate, setWStartDate] = useState("");
  const [wEndDate, setWEndDate] = useState("");
  const [wCapacity, setWCapacity] = useState("30");
  const [wPlanId, setWPlanId] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // Manage seats (pool ↔ batch)
  const [seatsBatch, setSeatsBatch] = useState<Batch | null>(null);
  const [seatsAction, setSeatsAction] = useState<"return" | "add">("return");
  const [seatsCount, setSeatsCount] = useState("1");
  const [seatsBusy, setSeatsBusy] = useState(false);

  // Schedule panel
  const [scheduleBatch, setScheduleBatch] = useState<PanelBatch | null>(null);

  // Per-batch test counts
  const [batchLiveCounts, setBatchLiveCounts] = useState<Record<string, number>>({});

  // Invite
  const [inviteBatch, setInviteBatch] = useState<Batch | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteGlobalCourseId, setInviteGlobalCourseId] = useState("");
  const [inviteTimeoutMinutes, setInviteTimeoutMinutes] = useState(15);

  useEffect(() => {
    if (!educatorId) return;

    const unsubBranches = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, "id">) })))
    );

    getDocs(collection(db, "plans")).then((snap) =>
      setPlans(
        snap.docs
          .filter((d) => d.data().isActive)
          .map((d) => ({ id: d.id, name: d.data().name, pricePerSeat: d.data().pricePerSeat }))
      )
    );

    getDocs(collection(db, "subjects")).then((snap) =>
      setSubjects(
        snap.docs.map((d) => ({ id: d.id, name: d.data().name, courseId: d.data().courseId }))
      )
    );

    const unsubPools = onSnapshot(collection(db, "educators", educatorId, "seatPools"), (snap) =>
      setPools(
        snap.docs.map((d) => ({
          planId: d.id,
          planName: d.data().planName || d.id,
          totalSeats: d.data().totalSeats || 0,
          availableSeats: d.data().availableSeats || 0,
          allocatedSeats: d.data().allocatedSeats || 0,
        }))
      )
    );

    const unsubStudents = onSnapshot(
      collection(db, "educators", educatorId, "students"),
      (snap) => {
        const counts: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const bid = String((d.data() as any)?.batchId || "");
          if (bid) counts[bid] = (counts[bid] || 0) + 1;
        });
        setStudentCounts(counts);
        setLoading(false);
      }
    );

    const unsubTests = onSnapshot(collection(db, "educators", educatorId, "my_tests"), (snap) => {
      const live: Record<string, number> = {};
      const now = Date.now();
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        const batches: string[] = Array.isArray(data.targetBatches) ? data.targetBatches : [];
        const start = data.startTime?.toMillis?.() || 0;
        const end = data.endTime?.toMillis?.() || 0;
        if (start > 0 && start <= now && end >= now) {
          batches.forEach((bid) => {
            live[bid] = (live[bid] || 0) + 1;
          });
        }
      });
      setBatchLiveCounts(live);
    });

    return () => {
      unsubBranches();
      unsubPools();
      unsubStudents();
      unsubTests();
    };
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
          setBatches((prev) => [
            ...prev.filter((b) => !(b.courseId === course.id && b.branchId === course.branchId)),
            ...courseBatches,
          ]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [courses, educatorId]);

  useEffect(() => {
    if (pools.length === 1 && !wPlanId) setWPlanId(pools[0].planId);
  }, [pools]);

  const totalAvailableSeats = pools.reduce((sum, p) => sum + p.availableSeats, 0);
  const totalInUse = pools.reduce((sum, p) => sum + p.allocatedSeats, 0);
  const wizardCourses = useMemo(
    () => courses.filter((c) => c.branchId === wBranchId),
    [courses, wBranchId]
  );
  const wCapacityNum = Math.max(0, parseInt(wCapacity) || 0);
  const selectedPool = pools.find((p) => p.planId === wPlanId);
  const hasSufficientSeats =
    wCapacityNum === 0 || (selectedPool?.availableSeats ?? totalAvailableSeats) >= wCapacityNum;

  async function apiFetch(path: string, opts: RequestInit = {}) {
    const token = await firebaseUser?.getIdToken();
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.error || "Request failed");
    }
    return res.json().catch(() => ({}));
  }

  function openWizard() {
    setWizardStep(1);
    setWName("");
    setWBranchId(branches.length === 1 ? branches[0].id : "");
    setWCourseId("");
    setWStartDate("");
    setWEndDate("");
    setWCapacity("30");
    setWPlanId(pools.length === 1 ? pools[0].planId : "");
    setWizardOpen(true);
  }

  async function handleCreate() {
    if (!wName.trim() || !wBranchId || !wCourseId) {
      toast.error("Fill in all required fields");
      return;
    }
    setCreating(true);
    try {
      const ref = collection(
        db,
        "educators",
        educatorId,
        "branches",
        wBranchId,
        "courses",
        wCourseId,
        "batches"
      );
      const newDoc = await addDoc(ref, {
        name: wName.trim(),
        seatLimit: 0,
        usedSeats: 0,
        startDate: wStartDate,
        endDate: wEndDate,
        createdAt: Timestamp.now(),
      });

      const effectivePlanId = wPlanId || pools[0]?.planId;
      if (wCapacityNum > 0 && effectivePlanId && hasSufficientSeats) {
        try {
          await apiFetch("/api/payment/allocate", {
            method: "POST",
            body: JSON.stringify({
              branch_id: wBranchId,
              course_id: wCourseId,
              batch_id: newDoc.id,
              plan_id: effectivePlanId,
              seats: wCapacityNum,
            }),
          });
        } catch (e: any) {
          toast.warning(`Batch created, but seat allocation failed: ${e.message}`);
        }
      }

      toast.success("Batch created");
      setWizardOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create batch");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(batch: Batch) {
    setEditBatch(batch);
    setEditName(batch.name);
    setEditStartDate(batch.startDate || "");
    setEditEndDate(batch.endDate || "");
    setEditBusy(false);
  }

  async function saveEdit() {
    if (!editBatch || !editName.trim()) return;
    setEditBusy(true);
    try {
      await updateDoc(
        doc(
          db,
          "educators",
          educatorId,
          "branches",
          editBatch.branchId,
          "courses",
          editBatch.courseId,
          "batches",
          editBatch.id
        ),
        { name: editName.trim(), startDate: editStartDate, endDate: editEndDate }
      );
      toast.success("Batch updated");
      setEditBatch(null);
    } catch {
      toast.error("Update failed");
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteBatch(batch: Batch) {
    const count = studentCounts[batch.id] ?? 0;
    if (count > 0) {
      toast.error(`Cannot delete — ${count} student(s) are enrolled`);
      return;
    }
    if (!confirm(`Delete "${batch.name}"?`)) return;
    await deleteDoc(
      doc(
        db,
        "educators",
        educatorId,
        "branches",
        batch.branchId,
        "courses",
        batch.courseId,
        "batches",
        batch.id
      )
    );
    toast.success("Batch deleted");
  }

  function openSeatsDialog(batch: Batch, action: "return" | "add") {
    setSeatsBatch(batch);
    setSeatsAction(action);
    setSeatsCount("1");
    setSeatsBusy(false);
  }

  async function handleSeatsUpdate() {
    if (!seatsBatch) return;
    const seats = Math.max(1, parseInt(seatsCount) || 0);
    const planId = seatsBatch.planId || pools[0]?.planId;
    setSeatsBusy(true);
    try {
      const endpoint =
        seatsAction === "return" ? "/api/payment/reallocate" : "/api/payment/allocate";
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          branch_id: seatsBatch.branchId,
          course_id: seatsBatch.courseId,
          batch_id: seatsBatch.id,
          plan_id: planId,
          seats,
        }),
      });
      toast.success(
        seatsAction === "return"
          ? `${seats} seat${seats !== 1 ? "s" : ""} returned to pool`
          : `${seats} seat${seats !== 1 ? "s" : ""} added from pool`
      );
      setSeatsBatch(null);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSeatsBusy(false);
    }
  }

  function openInvite(batch: Batch) {
    setInviteBatch(batch);
    setInviteLink("");
    setCopied(false);
    setInviteTimeoutMinutes(15);
    const course = courses.find((c) => c.id === batch.courseId);
    const firstSubjectId = course?.subjectIds[0];
    const globalCourseId = firstSubjectId
      ? (subjects.find((s) => s.id === firstSubjectId)?.courseId ?? "")
      : "";
    setInviteGlobalCourseId(globalCourseId);
  }

  async function generateInviteLink() {
    if (!inviteBatch) return;
    const course = courses.find((c) => c.id === inviteBatch.courseId);
    const globalCourse = globalCourses.find((c) => c.id === inviteGlobalCourseId);
    setInviteLoading(true);
    try {
      const data = await apiFetch("/api/invites/create", {
        method: "POST",
        body: JSON.stringify({
          branch_id: inviteBatch.branchId,
          course_id: inviteBatch.courseId,
          batch_id: inviteBatch.id,
          global_course_id: inviteGlobalCourseId,
          global_course_name: globalCourse?.name ?? "",
          subject_ids: course?.subjectIds ?? [],
          expires_in_minutes: inviteTimeoutMinutes,
        }),
      });
      setInviteLink(`${window.location.origin}/join/${data.token}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate link");
    } finally {
      setInviteLoading(false);
    }
  }

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">No branches set up yet</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Set up your organization structure before creating batches.
        </p>
        <Button className="mt-6" onClick={() => navigate("/educator/organization")}>
          Set up Organization
        </Button>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">No programs set up yet</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Create at least one program before adding batches.
        </p>
        <Button className="mt-6" onClick={() => navigate("/educator/organization")}>
          Set up Programs
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex cursor-pointer items-center gap-2 rounded-full p-2 transition-colors hover:bg-primary hover:text-white"
            onClick={() => navigate("/educator")}
          >
            <ArrowLeft className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Batches</h1>
            <p className="text-sm text-muted-foreground">
              Manage your teaching batches and invite students
            </p>
          </div>
        </div>
        <Button onClick={openWizard}>
          <Plus className="mr-2 h-4 w-4" />
          New Batch
        </Button>
      </div>

      {/* Seat Balance Widget */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex items-center gap-2 pt-1">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Seats</span>
            </div>

            {/* Single plan: compact inline display */}
            {pools.length <= 1 && (
              <div className="flex gap-6">
                <div>
                  <p className="text-2xl font-bold text-primary">{totalAvailableSeats}</p>
                  <p className="text-xs text-muted-foreground">Available</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalInUse}</p>
                  <p className="text-xs text-muted-foreground">In use</p>
                </div>
                {pools[0] && (
                  <div>
                    <p className="text-2xl font-bold text-muted-foreground">
                      {pools[0].totalSeats}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {plans.find((p) => p.id === pools[0].planId)?.name ?? "Plan"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Multiple plans: one row per plan */}
            {pools.length > 1 && (
              <div className="flex flex-wrap gap-4">
                {pools.map((pool) => {
                  const plan = plans.find((p) => p.id === pool.planId);
                  return (
                    <div
                      key={pool.planId}
                      className="rounded-lg border border-primary/10 bg-background px-4 py-2"
                    >
                      <p className="mb-1 text-xs font-semibold text-primary">
                        {plan?.name ?? pool.planName}
                      </p>
                      <div className="flex gap-4 text-sm">
                        <span>
                          <span className="font-bold">{pool.availableSeats}</span>{" "}
                          <span className="text-xs text-muted-foreground">avail</span>
                        </span>
                        <span>
                          <span className="font-bold">{pool.allocatedSeats}</span>{" "}
                          <span className="text-xs text-muted-foreground">in use</span>
                        </span>
                        <span>
                          <span className="font-bold text-muted-foreground">{pool.totalSeats}</span>{" "}
                          <span className="text-xs text-muted-foreground">total</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {totalAvailableSeats > 0 && totalAvailableSeats <= 10 && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                  Running low
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate("/educator/billing")}>
                {totalAvailableSeats === 0 ? "Buy Seats" : "Buy More"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Batches grouped by branch */}
      {batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">No batches yet</h2>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Create your first batch to start inviting students.
          </p>
          <Button className="mt-6" onClick={openWizard}>
            <Plus className="mr-2 h-4 w-4" />
            New Batch
          </Button>
        </div>
      ) : (
        branches.map((branch) => {
          const branchBatches = batches.filter((b) => b.branchId === branch.id);
          if (branchBatches.length === 0) return null;
          return (
            <div key={branch.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">{branch.name}</h2>
                {branch.location && (
                  <span className="text-sm text-muted-foreground">— {branch.location}</span>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {branchBatches.map((batch) => {
                  const course = courses.find((c) => c.id === batch.courseId);
                  const plan = plans.find((p) => p.id === batch.planId);
                  const count = studentCounts[batch.id] ?? 0;
                  const limit = batch.seatLimit;
                  const pct = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;
                  const isFull = limit > 0 && count >= limit;
                  const isWarning = pct >= 80 && !isFull;

                  return (
                    <Card key={batch.id} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <CardTitle className="truncate text-base">{batch.name}</CardTitle>
                            {course && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {course.name}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {plan && (
                              <Badge variant="outline" className="text-xs">
                                {plan.name}
                              </Badge>
                            )}
                            {isFull && (
                              <Badge variant="destructive" className="text-xs">
                                Full
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-0">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {count} / {limit > 0 ? limit : "∞"} students
                            </span>
                            {limit > 0 && (
                              <span
                                className={
                                  isFull
                                    ? "font-medium text-destructive"
                                    : isWarning
                                      ? "font-medium text-orange-500"
                                      : "text-muted-foreground"
                                }
                              >
                                {pct}%
                              </span>
                            )}
                          </div>
                          {limit > 0 && (
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full transition-all ${isFull ? "bg-destructive" : isWarning ? "bg-orange-400" : "bg-primary"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>

                        {(batch.startDate || batch.endDate) && (
                          <p className="text-xs text-muted-foreground">
                            {batch.startDate}
                            {batch.endDate ? ` — ${batch.endDate}` : ""}
                          </p>
                        )}

                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1" onClick={() => openInvite(batch)}>
                              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                              Invite
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => setScheduleBatch(batch)}
                            >
                              <CalendarDays className="mr-1 h-3.5 w-3.5" />
                              Schedule
                              {batchLiveCounts[batch.id] > 0 && (
                                <span className="ml-1.5 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                                  {batchLiveCounts[batch.id]} live
                                </span>
                              )}
                            </Button>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="View students"
                              onClick={() =>
                                navigate(
                                  `/educator/students?branch=${branch.name}&batch=${batch.name}`
                                )
                              }
                            >
                              <Users className="mr-1 h-3.5 w-3.5" />
                              {count}
                            </Button>
                            {limit > 0 && count < limit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title={`Return ${limit - count} unused seat${limit - count !== 1 ? "s" : ""} to pool`}
                                onClick={() => openSeatsDialog(batch, "return")}
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {totalAvailableSeats > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title={`Add seats from pool (${totalAvailableSeats} available)`}
                                onClick={() => openSeatsDialog(batch, "add")}
                              >
                                <PlusCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Edit"
                              onClick={() => openEdit(batch)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteBatch(batch)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* New Batch Wizard */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              New Batch{" "}
              <span className="font-normal text-muted-foreground">— Step {wizardStep} of 2</span>
            </DialogTitle>
          </DialogHeader>

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>
                  Batch name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={wName}
                  onChange={(e) => setWName(e.target.value)}
                  placeholder="e.g. JEE Morning Batch A"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>
                    Branch <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={wBranchId}
                    onValueChange={(v) => {
                      setWBranchId(v);
                      setWCourseId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
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
                  <Label>
                    Program <span className="text-destructive">*</span>
                  </Label>
                  <Select value={wCourseId} onValueChange={setWCourseId} disabled={!wBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {wizardCourses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={wStartDate}
                    onChange={(e) => setWStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={wEndDate}
                    onChange={(e) => setWEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={!wName.trim() || !wBranchId || !wCourseId}
                  onClick={() => setWizardStep(2)}
                >
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>
                  Student capacity{" "}
                  <span className="text-xs font-normal text-muted-foreground">(max students)</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={wCapacity}
                  onChange={(e) => setWCapacity(e.target.value)}
                  placeholder="e.g. 30"
                />
              </div>

              {plans.length > 1 && pools.length > 1 && (
                <div className="space-y-1">
                  <Label>Plan</Label>
                  <Select value={wPlanId} onValueChange={setWPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {pools.map((pool) => {
                        const plan = plans.find((p) => p.id === pool.planId);
                        return (
                          <SelectItem key={pool.planId} value={pool.planId}>
                            {plan?.name || pool.planName} — {pool.availableSeats} available
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {pools.length > 0 ? (
                <div
                  className={`rounded-lg border p-3 text-sm ${!hasSufficientSeats && wCapacityNum > 0 ? "border-orange-200 bg-orange-50 text-orange-800" : "border-muted bg-muted/30 text-muted-foreground"}`}
                >
                  <div className="flex items-center justify-between">
                    <span>
                      {totalAvailableSeats} seat{totalAvailableSeats !== 1 ? "s" : ""} available in
                      pool
                    </span>
                    {!hasSufficientSeats && wCapacityNum > 0 && (
                      <button
                        className="text-xs font-medium underline"
                        onClick={() => {
                          setWizardOpen(false);
                          navigate("/educator/billing");
                        }}
                      >
                        Buy more
                      </button>
                    )}
                  </div>
                  {!hasSufficientSeats && wCapacityNum > 0 && (
                    <p className="mt-1 text-xs">
                      Need {wCapacityNum}, have {totalAvailableSeats}. Batch will be created without
                      seat allocation.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
                  No seats purchased yet.{" "}
                  <button
                    className="text-primary underline"
                    onClick={() => {
                      setWizardOpen(false);
                      navigate("/educator/billing");
                    }}
                  >
                    Buy seats
                  </button>{" "}
                  to set student capacity.
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setWizardStep(1)}>
                  Back
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Batch
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={!!editBatch} onOpenChange={(o) => !o && setEditBatch(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditBatch(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={editBusy || !editName.trim()}>
                {editBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Seats Dialog (pool ↔ batch) */}
      <Dialog open={!!seatsBatch} onOpenChange={(o) => !o && setSeatsBatch(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {seatsAction === "return" ? "Return Seats to Pool" : "Add Seats from Pool"} —{" "}
              {seatsBatch?.name}
            </DialogTitle>
          </DialogHeader>
          {seatsBatch &&
            (() => {
              const enrolled = studentCounts[seatsBatch.id] ?? 0;
              const unused = seatsBatch.seatLimit - enrolled;
              const pool = pools.find((p) => p.planId === (seatsBatch.planId || pools[0]?.planId));
              const poolAvailable = pool?.availableSeats ?? 0;
              const max = seatsAction === "return" ? unused : poolAvailable;
              const n = Math.min(max, Math.max(1, parseInt(seatsCount) || 0));
              return (
                <div className="space-y-4">
                  {/* Batch info */}
                  <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Allocated to batch</span>
                      <span className="font-medium">{seatsBatch.seatLimit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Students enrolled</span>
                      <span className="font-medium">{enrolled}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">Unused (returnable)</span>
                      <span className="font-medium text-primary">{unused}</span>
                    </div>
                  </div>

                  {/* Pool info */}
                  <div className="flex justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                    <span className="text-muted-foreground">
                      Pool available{pool ? ` (${pool.planName})` : ""}
                    </span>
                    <span className="font-medium">{poolAvailable}</span>
                  </div>

                  <div className="space-y-1">
                    <Label>
                      Seats to {seatsAction === "return" ? "return" : "add"}{" "}
                      <span className="text-xs font-normal text-muted-foreground">(max {max})</span>
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max={max}
                      value={seatsCount}
                      onChange={(e) => setSeatsCount(e.target.value)}
                    />
                  </div>

                  {seatsAction === "add" && poolAvailable === 0 && (
                    <p className="text-sm text-orange-600">
                      No seats available in pool.{" "}
                      <button
                        className="underline"
                        onClick={() => {
                          setSeatsBatch(null);
                          navigate("/educator/billing");
                        }}
                      >
                        Buy more
                      </button>
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setSeatsBatch(null)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSeatsUpdate} disabled={seatsBusy || n < 1 || n > max}>
                      {seatsBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {seatsAction === "return" ? `Return ${n} to Pool` : `Add ${n} from Pool`}
                    </Button>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>

      {/* Batch Schedule Panel */}
      <BatchSchedulePanel
        batch={scheduleBatch}
        educatorId={educatorId}
        courses={courses}
        onClose={() => setScheduleBatch(null)}
      />

      {/* Invite Dialog */}
      <Dialog open={!!inviteBatch} onOpenChange={(o) => !o && setInviteBatch(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Students — {inviteBatch?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!inviteGlobalCourseId && globalCourses.length > 1 && (
              <div className="space-y-1">
                <Label>Content access</Label>
                <Select value={inviteGlobalCourseId} onValueChange={setInviteGlobalCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select course content" />
                  </SelectTrigger>
                  <SelectContent>
                    {globalCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-sm">Link expires after</Label>
              <Select
                value={String(inviteTimeoutMinutes)}
                onValueChange={(v) => setInviteTimeoutMinutes(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="360">6 hours</SelectItem>
                  <SelectItem value="1440">24 hours</SelectItem>
                  <SelectItem value="10080">7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!inviteLink ? (
              <Button className="w-full" onClick={generateInviteLink} disabled={inviteLoading}>
                {inviteLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Generate Invite Link
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Share this link with students</Label>
                  <div className="flex gap-2">
                    <Input value={inviteLink} readOnly className="text-xs" />
                    <Button size="icon" variant="outline" onClick={copyLink}>
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Students who open this link are enrolled directly into {inviteBatch?.name}.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={generateInviteLink}
                  disabled={inviteLoading}
                >
                  {inviteLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Generate New Link
                </Button>
              </div>
            )}

            <div className="border-t pt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Need to invite many students at once?
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setInviteBatch(null);
                  navigate("/educator/learners");
                }}
              >
                Bulk CSV Upload <ArrowRight className="ml-2 h-3 w-3" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
