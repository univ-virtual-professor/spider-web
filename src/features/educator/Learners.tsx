import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  Pencil,
  ArrowLeft,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "@shared/lib/firebase";
import { useAccessibleCourses } from "@shared/hooks/useAccessibleCourses";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { toast } from "sonner";
import { useAuth } from "@app/providers/AuthProvider";
import { Badge } from "@shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;

type Learner = {
  id: string;
  name?: string;
  email?: string;
  status?: "ACTIVE" | "INACTIVE";
  joinedAt?: any;
  batchId?: string;
  courseId?: string;
  branchId?: string;
};

type Branch = { id: string; name: string };
type Course = { id: string; name: string; branchId: string };
type Batch = {
  id: string;
  name: string;
  seatLimit: number;
  usedSeats: number;
  courseId: string;
  branchId: string;
};

type BulkRow = {
  row: number;
  name: string;
  email: string;
  branch_name: string;
  course_name: string;
  batch_name: string;
  token: string | null;
  invite_url: string | null;
  error: string | null;
};

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export default function Learners() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const isInviteMode = searchParams.get("invite") === "1";
  const { firebaseUser, role, loading: authLoading } = useAuth();
  const educatorId = firebaseUser?.uid || "";

  const [learners, setLearners] = useState<Learner[]>([]);
  const [seatMap, setSeatMap] = useState<Record<string, boolean>>({});
  const [educator, setEducator] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Division selectors (shared for invite link + bulk)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selBranch, setSelBranch] = useState("");
  const [selCourse, setSelCourse] = useState("");
  const [selBatch, setSelBatch] = useState("");

  // Full hierarchy for name resolution and assign-batch dialog
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [allBatches, setAllBatches] = useState<Batch[]>([]);

  // Assign-batch dialog
  const [assignTarget, setAssignTarget] = useState<Learner | null>(null);
  const [assignBranch, setAssignBranch] = useState("");
  const [assignCourse, setAssignCourse] = useState("");
  const [assignBatch, setAssignBatch] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Global course + subject selection for invite
  const { courses: globalCourses, subjects: globalSubjects } = useAccessibleCourses(educatorId);
  const [selGlobalCourse, setSelGlobalCourse] = useState("");
  const [selSubjectIds, setSelSubjectIds] = useState<string[]>([]);

  // Invite link
  const [inviteOpen, setInviteOpen] = useState(isInviteMode);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteTimeoutMinutes, setInviteTimeoutMinutes] = useState(15);
  const [firstPoolPlanId, setFirstPoolPlanId] = useState<string | null>(null);
  const [poolSeatTotal, setPoolSeatTotal] = useState(0);

  // Bulk upload
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && role && role !== "EDUCATOR" && role !== "ADMIN")
      nav("/login?role=educator");
  }, [authLoading, role, nav]);

  useEffect(() => {
    if (!educatorId) return;

    const qLearners = query(
      collection(db, "educators", educatorId, "students"),
      orderBy("joinedAt", "desc")
    );
    const unsubL = onSnapshot(qLearners, (snap) => {
      setLearners(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
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
    const unsubEdu = onSnapshot(doc(db, "educators", educatorId), (snap) => {
      setEducator(snap.exists() ? snap.data() : null);
    });

    // Load branches (for invite form)
    getDocs(collection(db, "educators", educatorId, "branches")).then((snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id })))
    );

    // Subscribe to seat pools for total capacity + first plan ID
    const unsubPools = onSnapshot(collection(db, "educators", educatorId, "seatPools"), (snap) => {
      if (!snap.empty) setFirstPoolPlanId(snap.docs[0].id);
      setPoolSeatTotal(snap.docs.reduce((s, d) => s + (Number(d.data().totalSeats) || 0), 0));
    });

    // Load full hierarchy for name resolution + assign-batch dialog
    async function loadFullHierarchy() {
      const branchSnap = await getDocs(collection(db, "educators", educatorId, "branches"));
      const bs: Branch[] = branchSnap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id }));
      setAllBranches(bs);

      const cs: Course[] = [];
      const bts: Batch[] = [];
      for (const b of branchSnap.docs) {
        const courseSnap = await getDocs(
          collection(db, "educators", educatorId, "branches", b.id, "courses")
        );
        for (const c of courseSnap.docs) {
          cs.push({ id: c.id, name: c.data().name || c.id, branchId: b.id });
          const batchSnap = await getDocs(
            collection(db, "educators", educatorId, "branches", b.id, "courses", c.id, "batches")
          );
          for (const bt of batchSnap.docs) {
            bts.push({
              id: bt.id,
              name: bt.data().name || bt.id,
              seatLimit: bt.data().seatLimit || 0,
              usedSeats: bt.data().usedSeats || 0,
              courseId: c.id,
              branchId: b.id,
            });
          }
        }
      }
      setAllCourses(cs);
      setAllBatches(bts);
    }
    loadFullHierarchy();

    return () => {
      unsubL();
      unsubSeats();
      unsubEdu();
      unsubPools();
    };
  }, [educatorId, refreshTick]);

  // Load courses when branch changes
  useEffect(() => {
    if (!educatorId || !selBranch) {
      setCourses([]);
      setSelCourse("");
      return;
    }
    getDocs(collection(db, "educators", educatorId, "branches", selBranch, "courses")).then(
      (snap) =>
        setCourses(
          snap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id, branchId: selBranch }))
        )
    );
  }, [educatorId, selBranch]);

  // Load batches when course changes
  useEffect(() => {
    if (!educatorId || !selBranch || !selCourse) {
      setBatches([]);
      setSelBatch("");
      return;
    }
    getDocs(
      collection(
        db,
        "educators",
        educatorId,
        "branches",
        selBranch,
        "courses",
        selCourse,
        "batches"
      )
    ).then((snap) =>
      setBatches(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || d.id,
          seatLimit: d.data().seatLimit || 0,
          usedSeats: d.data().usedSeats || 0,
          courseId: selCourse,
          branchId: selBranch,
        }))
      )
    );
  }, [educatorId, selBranch, selCourse]);

  const selectedBatch = batches.find((b) => b.id === selBatch);

  const seatLimit = poolSeatTotal;
  const usedSeats = useMemo(() => Object.values(seatMap).filter(Boolean).length, [seatMap]);
  const canAssign = seatLimit > 0 && usedSeats < seatLimit;

  // When a batch has no explicit seatLimit set (trial/global-pool seats),
  // fall back to the educator's global remaining pool.
  const availableSeats = selectedBatch
    ? selectedBatch.seatLimit > 0
      ? selectedBatch.seatLimit - selectedBatch.usedSeats
      : seatLimit - usedSeats
    : 0;

  const filtered = useMemo(() => {
    let list = learners;
    if (isInviteMode) list = list.filter((l) => !l.batchId || !seatMap[l.id]);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (l) => (l.name || "").toLowerCase().includes(q) || (l.email || "").toLowerCase().includes(q)
    );
  }, [learners, search, isInviteMode, seatMap]);

  async function postWithToken(path: string, body: any) {
    if (!firebaseUser) throw new Error("Not logged in");
    const token = await firebaseUser.getIdToken();
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Request failed");
    return data;
  }

  const grantSeat = async (studentId: string) => {
    setBusyId(studentId);
    try {
      await postWithToken("/api/billing/assign-seat", { studentId });
      toast.success("Seat granted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to grant seat");
    } finally {
      setBusyId(null);
    }
  };

  const revokeSeat = async (studentId: string) => {
    setBusyId(studentId);
    try {
      await postWithToken("/api/billing/revoke-seat", { studentId });
      toast.success("Seat revoked");
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke seat");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (studentId: string, next: "ACTIVE" | "INACTIVE") => {
    try {
      await updateDoc(doc(db, "educators", educatorId, "students", studentId), { status: next });
      toast.success(`Learner set to ${next}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update learner");
    }
  };

  function openAssignBatch(learner: Learner) {
    setAssignTarget(learner);
    setAssignBranch(learner.branchId || "");
    setAssignCourse(learner.courseId || "");
    setAssignBatch(learner.batchId || "");
  }

  async function saveAssignBatch() {
    if (!assignTarget || !assignBranch || !assignCourse || !assignBatch) return;
    const batchInfo = allBatches.find((b) => b.id === assignBatch);
    setAssigning(true);
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, "educators", educatorId, "students", assignTarget.id),
        {
          branchId: assignBranch,
          courseId: assignCourse,
          batchId: assignBatch,
        },
        { merge: true }
      );
      batch.update(doc(db, "users", assignTarget.id), {
        branchId: assignBranch,
        courseId: assignCourse,
        batchId: assignBatch,
      });
      batch.set(
        doc(db, "educators", educatorId, "billingSeats", assignTarget.id),
        { branchId: assignBranch, courseId: assignCourse, batchId: assignBatch },
        { merge: true }
      );
      await batch.commit();
      toast.success(`Assigned to ${batchInfo?.name || assignBatch}`);
      setAssignTarget(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to assign batch");
    } finally {
      setAssigning(false);
    }
  }

  async function generateInviteLink() {
    if (!selBranch || !selCourse || !selBatch) {
      toast.error("Select branch, program and batch");
      return;
    }
    if (availableSeats <= 0) {
      toast.error("No available seats in this batch");
      return;
    }
    const globalCourse = globalCourses.find((c) => c.id === selGlobalCourse);
    setGeneratingLink(true);
    const payload = {
      branch_id: selBranch,
      course_id: selCourse,
      batch_id: selBatch,
      global_course_id: selGlobalCourse,
      global_course_name: globalCourse?.name ?? "",
      subject_ids: selSubjectIds,
      expires_in_minutes: inviteTimeoutMinutes,
    };
    try {
      let data: any;
      try {
        data = await apiFetch("/api/invites/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (e: any) {
        if (e.message === "Batch not found" && firstPoolPlanId) {
          // Batch not registered in monkey-king yet — register it then retry
          await apiFetch("/api/payment/allocate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branch_id: selBranch,
              course_id: selCourse,
              batch_id: selBatch,
              plan_id: firstPoolPlanId,
              seats: 0,
            }),
          });
          data = await apiFetch("/api/invites/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          throw e;
        }
      }
      setInviteUrl(`${window.location.origin}/join/${data.token}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate link");
    } finally {
      setGeneratingLink(false);
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadTemplate() {
    const csv =
      "name,email,branch_name,program_name,batch_name\nJohn Doe,john@example.com,Branch Name,Program Name,Batch Name\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "student_invite_template.csv";
    a.click();
  }

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setBulkRows([]);
    try {
      const token = await auth.currentUser?.getIdToken();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API}/api/invites/bulk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      // Rewrite invite_url to use the current origin (backend doesn't know the frontend URL)
      const rows = (data.rows || []).map((r: any) =>
        r.token ? { ...r, invite_url: `${window.location.origin}/join/${r.token}` } : r
      );
      setBulkRows(rows);
      toast.success(`${data.success} invite(s) generated, ${data.failed} failed`);
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function copyAllLinks() {
    const links = bulkRows
      .filter((r) => r.invite_url)
      .map((r) => `${r.name} <${r.email}>: ${r.invite_url}`)
      .join("\n");
    navigator.clipboard.writeText(links).then(() => toast.success("All links copied"));
  }

  if (authLoading || !role) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className="flex cursor-pointer items-center gap-2 rounded-full p-2 transition-colors hover:bg-primary hover:text-white"
            onClick={() => nav("/educator")}
          >
            <ArrowLeft className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Learners</h1>
            <p className="text-sm text-muted-foreground">
              Seats used: <b>{usedSeats}</b> / <b>{seatLimit}</b>
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setRefreshTick((x) => x + 1)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Invite via Link */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none rounded-t-lg transition-colors hover:bg-muted/30"
          onClick={() => setInviteOpen((o) => !o)}
        >
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite via Link
            </span>
            {inviteOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {inviteOpen && (
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Branch</Label>
                <Select
                  value={selBranch}
                  onValueChange={(v) => {
                    setSelBranch(v);
                    setSelCourse("");
                    setSelBatch("");
                    setInviteUrl("");
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
                  value={selCourse}
                  onValueChange={(v) => {
                    setSelCourse(v);
                    setSelBatch("");
                    setInviteUrl("");
                  }}
                  disabled={!selBranch}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Batch</Label>
                <Select
                  value={selBatch}
                  onValueChange={(v) => {
                    setSelBatch(v);
                    setInviteUrl("");
                  }}
                  disabled={!selCourse}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} (
                        {b.seatLimit > 0 ? b.seatLimit - b.usedSeats : seatLimit - usedSeats} free)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {globalCourses.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Course</Label>
                  <Select
                    value={selGlobalCourse}
                    onValueChange={(v) => {
                      setSelGlobalCourse(v);
                      setSelSubjectIds([]);
                      setInviteUrl("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select course (JEE / NEET…)" />
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
                {selGlobalCourse && (
                  <div className="space-y-1">
                    <Label>Subjects</Label>
                    <div className="flex min-h-[40px] flex-wrap gap-1.5 rounded-md border px-3 py-2">
                      {globalSubjects
                        .filter((s) => s.courseId === selGlobalCourse)
                        .map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setSelSubjectIds((prev) =>
                                prev.includes(s.id)
                                  ? prev.filter((x) => x !== s.id)
                                  : [...prev, s.id]
                              )
                            }
                            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                              selSubjectIds.includes(s.id)
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-muted text-muted-foreground hover:border-primary"
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedBatch &&
              (availableSeats > 0 ? (
                <p className="text-sm text-muted-foreground">
                  <b>{availableSeats}</b> seats available in {selectedBatch.name}
                </p>
              ) : (
                <p className="text-sm text-destructive">
                  No seats available — all {seatLimit} institute seats are in use
                </p>
              ))}

            <div className="space-y-2">
              <Label className="text-sm">Link expires after</Label>
              <Select
                value={String(inviteTimeoutMinutes)}
                onValueChange={(v) => setInviteTimeoutMinutes(Number(v))}
              >
                <SelectTrigger className="w-40">
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

            <div className="flex gap-2">
              <Button
                onClick={generateInviteLink}
                disabled={!selBatch || generatingLink || availableSeats <= 0}
              >
                {generatingLink ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Generate Link
              </Button>
            </div>

            {inviteUrl && (
              <div className="flex gap-2">
                <Input value={inviteUrl} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copyLink(inviteUrl)}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Bulk CSV Upload */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none rounded-t-lg transition-colors hover:bg-muted/30"
          onClick={() => setBulkOpen((o) => !o)}
        >
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Bulk Upload via CSV
            </span>
            {bulkOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {bulkOpen && (
          <CardContent className="space-y-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with columns:{" "}
              <code className="rounded bg-muted px-1 text-xs">
                name, email, branch_name, program_name, batch_name
              </code>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleBulkUpload}
              />
            </div>

            {bulkRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Results</p>
                  <Button variant="outline" size="sm" onClick={copyAllLinks}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy All Links
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">Batch</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Invite Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((r) => (
                        <tr key={r.row} className="border-t">
                          <td className="px-3 py-2">{r.row}</td>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2">{r.email}</td>
                          <td className="px-3 py-2">{r.batch_name}</td>
                          <td className="px-3 py-2">
                            {r.error ? (
                              <Badge variant="destructive">Error: {r.error}</Badge>
                            ) : (
                              <Badge variant="default">Generated</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {r.invite_url && (
                              <button
                                className="flex items-center gap-1 font-mono text-primary hover:underline"
                                onClick={() =>
                                  navigator.clipboard
                                    .writeText(r.invite_url!)
                                    .then(() => toast.success("Copied"))
                                }
                              >
                                <Copy className="h-3 w-3" />
                                Copy
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search learners..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((l) => {
          const seatOn = Boolean(seatMap[l.id]);
          const inactive = l.status === "INACTIVE";
          const batchName = allBatches.find((b) => b.id === l.batchId)?.name;
          const courseName = allCourses.find((c) => c.id === l.courseId)?.name;
          const branchName = allBranches.find((b) => b.id === l.branchId)?.name;
          return (
            <div
              key={l.id}
              className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
            >
              <button
                type="button"
                onClick={() => nav(`/educator/learners/${l.id}`)}
                className="group text-left"
              >
                <div className="font-semibold">
                  {l.name || "Student"}
                  {inactive && <span className="ml-2 text-xs text-red-500">(INACTIVE)</span>}
                </div>
                <div className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                  {l.email || l.id}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    Seat:{" "}
                    {seatOn ? (
                      <span className="font-medium text-green-600">GRANTED</span>
                    ) : (
                      <span className="font-medium text-orange-600">NOT GRANTED</span>
                    )}
                  </span>
                  {batchName ? (
                    <span>
                      Batch:{" "}
                      <span className="font-medium text-foreground">
                        {branchName && `${branchName} › `}
                        {courseName && `${courseName} › `}
                        {batchName}
                      </span>
                    </span>
                  ) : (
                    <span className="text-orange-500">No batch assigned</span>
                  )}
                </div>
              </button>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => nav(`/educator/students/${l.id}`)}>
                  View Details <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => openAssignBatch(l)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {l.batchId ? "Change Batch" : "Assign Batch"}
                </Button>
                {!seatOn ? (
                  <Button
                    disabled={!canAssign || busyId === l.id || inactive}
                    onClick={() => grantSeat(l.id)}
                  >
                    {busyId === l.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="mr-2 h-4 w-4" />
                    )}
                    Grant Seat
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busyId === l.id}
                    onClick={() => revokeSeat(l.id)}
                  >
                    {busyId === l.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserX className="mr-2 h-4 w-4" />
                    )}
                    Revoke Seat
                  </Button>
                )}
                {inactive ? (
                  <Button variant="outline" onClick={() => toggleActive(l.id, "ACTIVE")}>
                    Set ACTIVE
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => toggleActive(l.id, "INACTIVE")}>
                    Set INACTIVE
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Assign / Change Batch Dialog */}
      <Dialog
        open={!!assignTarget}
        onOpenChange={(o) => {
          if (!o) setAssignTarget(null);
        }}
      >
        <DialogContent>
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
                  {allBranches.map((b) => (
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
                value={assignCourse}
                onValueChange={(v) => {
                  setAssignCourse(v);
                  setAssignBatch("");
                }}
                disabled={!assignBranch}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {allCourses
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
                  {allBatches
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button disabled={!assignBatch || assigning} onClick={saveAssignBatch}>
              {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {seatLimit <= 0 && (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No seats are assigned to your coaching yet. Purchase seats in Billing to get started.
        </div>
      )}
    </div>
  );
}
