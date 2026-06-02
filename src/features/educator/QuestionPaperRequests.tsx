import { useEffect, useRef, useState, useMemo } from "react";
import {
  FileUp,
  Loader2,
  Pencil,
  Trash2,
  UploadCloud,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { doc, getDoc, collection, onSnapshot } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;
const ACCEPTED = ".pdf,image/jpeg,image/png";

type RequestStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "CANCELLED";

type QPRequest = {
  id: number;
  title: string;
  description: string;
  file_url: string;
  file_name: string;
  status: RequestStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type Batch = { id: string; branchId: string; courseId: string; name: string };

const STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
};

const STATUS_CLASS: Record<RequestStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200",
  COMPLETE: "bg-green-100 text-green-800 border-green-200",
  CANCELLED: "bg-red-100 text-red-800 border-red-200",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function MonthlyUsage({ requests, limit }: { requests: QPRequest[]; limit: number }) {
  const now = new Date();
  const used = requests.filter((r) => {
    if (r.status === "CANCELLED") return false;
    const d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const full = used >= limit;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-sm">
      <span className="text-muted-foreground">This month:</span>
      <span className={`font-semibold ${full ? "text-destructive" : "text-foreground"}`}>
        {used}
      </span>
      <span className="text-muted-foreground">/ {limit}</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all ${full ? "bg-destructive" : pct >= 80 ? "bg-yellow-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function QuestionPaperRequests() {
  const { profile, firebaseUser } = useAuth();
  const educatorId = profile?.uid || firebaseUser?.uid || "";
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";

  async function apiFetch(path: string, options: RequestInit = {}) {
    const token = await firebaseUser?.getIdToken();
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

  async function apiUpload(path: string, formData: FormData, method = "POST") {
    const token = await firebaseUser?.getIdToken();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  }

  const [requests, setRequests] = useState<QPRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyLimit, setMonthlyLimit] = useState<number>(5);

  // Audience State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  // Create dialog form variables
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const createFileRef = useRef<HTMLInputElement>(null);

  // New form fields
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [subTopic, setSubTopic] = useState("");
  const [marks, setMarks] = useState("");
  const [questionsCount, setQuestionsCount] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [additionalRequirements, setAdditionalRequirements] = useState("");
  const [hasAccessCode, setHasAccessCode] = useState<"yes" | "no">("no");
  const [accessCode, setAccessCode] = useState("");

  // Edit dialog
  const [editTarget, setEditTarget] = useState<QPRequest | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // Re-upload dialog
  const [reuploadTarget, setReuploadTarget] = useState<QPRequest | null>(null);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadBusy, setReuploadBusy] = useState(false);
  const reuploadFileRef = useRef<HTMLInputElement>(null);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<QPRequest | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const navigate = useNavigate();

  // Load branches & requests
  useEffect(() => {
    if (!educatorId) return;
    fetchRequests();
    getDoc(doc(db, "educators", educatorId)).then((snap) => {
      const limit = snap.data()?.maxQuestionPaperRequests;
      if (typeof limit === "number") setMonthlyLimit(limit);
    });

    const unsubBranches = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name })))
    );

    return () => unsubBranches();
  }, [educatorId]);

  // Load programs/courses
  useEffect(() => {
    if (!educatorId || branches.length === 0) {
      setCourses([]);
      return;
    }
    const unsubs = branches.map((branch) =>
      onSnapshot(
        collection(db, "educators", educatorId, "branches", branch.id, "courses"),
        (snap) => {
          const branchCourses = snap.docs.map((d) => ({
            id: d.id,
            branchId: branch.id,
            name: d.data().name,
          }));
          setCourses((prev) => [...prev.filter((c) => c.branchId !== branch.id), ...branchCourses]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [branches, educatorId]);

  // Load batches
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
            name: d.data().name,
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

  // Auto-select branch if only one exists
  useEffect(() => {
    if (branches.length === 1 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  // Filter batches by branch
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => b.branchId === selectedBranchId);
  }, [batches, selectedBranchId]);

  // Auto-select batch if only one exists for the selected branch
  useEffect(() => {
    if (filteredBatches.length === 1 && selectedBatchId !== filteredBatches[0].id) {
      setSelectedBranchId(filteredBatches[0].branchId);
      setSelectedBatchId(filteredBatches[0].id);
    } else if (filteredBatches.length === 0 && selectedBatchId) {
      setSelectedBatchId("");
    }
  }, [filteredBatches, selectedBatchId]);

  async function fetchRequests() {
    setLoading(true);
    try {
      const data = await apiFetch("/api/question-upload/");
      setRequests(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!createTitle.trim()) return toast.error("Title is required");
    if (!selectedBranchId) return toast.error("Please select a branch");
    if (!selectedBatchId) return toast.error("Please select a batch");
    if (hasAccessCode === "yes" && !accessCode.trim())
      return toast.error("Please provide an access code");

    setCreateBusy(true);
    try {
      const branchName = branches.find((b) => b.id === selectedBranchId)?.name || "—";
      const batchName = batches.find((b) => b.id === selectedBatchId)?.name || "—";

      // Build structured markdown description containing all custom form attributes
      const formattedDescription = [
        `Branch: ${branchName}`,
        `Batch: ${batchName}`,
        `Subject: ${subject.trim() || "—"}`,
        `Topic: ${topic.trim() || "—"}`,
        `Sub-Topic: ${subTopic.trim() || "—"}`,
        `Total Marks: ${marks.trim() || "—"}`,
        `No of Questions: ${questionsCount.trim() || "—"}`,
        `Schedule Time: ${scheduleTime || "—"}`,
        `Access Code Protection: ${hasAccessCode === "yes" ? `Yes (${accessCode.trim()})` : "No"}`,
        additionalRequirements.trim()
          ? `Additional Requirements: ${additionalRequirements.trim()}`
          : null,
        createDesc.trim() ? `Note: ${createDesc.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const fd = new FormData();
      fd.append("title", createTitle.trim());
      fd.append("description", formattedDescription);

      // Question paper file is optional
      if (createFile) {
        fd.append("file", createFile);
      }

      const newReq = await apiUpload("/api/question-upload/", fd);
      setRequests((prev) => [newReq, ...prev]);

      // Reset form variables
      setCreateOpen(false);
      setCreateTitle("");
      setCreateDesc("");
      setCreateFile(null);
      setSelectedBranchId("");
      setSelectedBatchId("");
      setSubject("");
      setTopic("");
      setSubTopic("");
      setMarks("");
      setQuestionsCount("");
      setScheduleTime("");
      setAdditionalRequirements("");
      setHasAccessCode("no");
      setAccessCode("");

      toast.success("Request submitted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editTitle.trim() && !editDesc.trim()) return toast.error("Nothing to update");
    setEditBusy(true);
    try {
      const updated = await apiFetch(`/api/question-upload/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim() || null,
          description: editDesc.trim() || null,
        }),
      });
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditTarget(null);
      toast.success("Updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleReupload() {
    if (!reuploadTarget || !reuploadFile) return toast.error("Select a file");
    setReuploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", reuploadFile);
      const updated = await apiUpload(
        `/api/question-upload/${reuploadTarget.id}/file`,
        fd,
        "PATCH"
      );
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setReuploadTarget(null);
      setReuploadFile(null);
      toast.success("File updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReuploadBusy(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      const updated = await apiFetch(`/api/question-upload/${cancelTarget.id}`, {
        method: "DELETE",
      });
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setCancelTarget(null);
      toast.success("Request cancelled");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCancelBusy(false);
    }
  }

  function openEdit(req: QPRequest) {
    setEditTitle(req.title);
    setEditDesc(req.description);
    setEditTarget(req);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center">
          {!isApp && (
            <div
              className="flex hidden cursor-pointer items-center gap-2 rounded-full p-2 transition-colors hover:bg-primary hover:text-white md:block"
              onClick={() => navigate("/educator/test-series")}
            >
              <ArrowLeft className="h-4 w-4" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold">Question Paper Requests</h1>
            <p className="mt-1 hidden text-sm text-muted-foreground md:block">
              Upload a question paper and request admin to add it to your panel.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
          <MonthlyUsage requests={requests} limit={monthlyLimit} />
          <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
            <FileUp className="mr-2 h-4 w-4" />
            New Request
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <UploadCloud className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">No requests yet. Click "New Request" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin Note</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {req.title}
                    </TableCell>
                    <TableCell>
                      {req.file_url ? (
                        <a
                          href={req.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex max-w-[140px] items-center gap-1 truncate text-xs text-primary hover:underline"
                        >
                          {req.file_name || "View Paper"}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No file attached</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[req.status]}`}
                      >
                        {STATUS_LABEL[req.status]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                      {req.admin_note || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {fmtDate(req.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === "PENDING" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Edit"
                            onClick={() => openEdit(req)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Replace file"
                            onClick={() => {
                              setReuploadTarget(req);
                              setReuploadFile(null);
                            }}
                          >
                            <UploadCloud className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Cancel"
                            onClick={() => setCancelTarget(req)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">New Question Paper Request</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-5 overflow-y-auto p-2 py-4">
            <div className="space-y-2">
              <Label htmlFor="createTitle" className="text-sm font-semibold">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="createTitle"
                placeholder="e.g. Class 10 Maths Term 2 2024"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="rounded-lg"
              />
            </div>

            {/* Audience Section */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Branch <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={(val) => {
                    setSelectedBranchId(val);
                    setSelectedBatchId("");
                  }}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Select Branch" />
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

              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Batch <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedBatchId}
                  onValueChange={setSelectedBatchId}
                  disabled={!selectedBranchId}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Select Batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBatches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Subject and Topic Section */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-2">
                <Label htmlFor="subject" className="text-sm font-semibold">
                  Subject
                </Label>
                <Input
                  id="subject"
                  placeholder="e.g. Mathematics"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="col-span-1 space-y-2">
                <Label htmlFor="topic" className="text-sm font-semibold">
                  Topic
                </Label>
                <Input
                  id="topic"
                  placeholder="e.g. Trigonometry"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="col-span-1 space-y-2">
                <Label htmlFor="subTopic" className="text-sm font-semibold">
                  Sub Topic
                </Label>
                <Input
                  id="subTopic"
                  placeholder="e.g. Identities"
                  value={subTopic}
                  onChange={(e) => setSubTopic(e.target.value)}
                  className="rounded-lg"
                />
              </div>
            </div>

            {/* Marks & Questions Count Section */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marks" className="text-sm font-semibold">
                  Marks
                </Label>
                <Input
                  id="marks"
                  type="number"
                  placeholder="e.g. 100"
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="questionsCount" className="text-sm font-semibold">
                  No of Questions
                </Label>
                <Input
                  id="questionsCount"
                  type="number"
                  placeholder="e.g. 30"
                  value={questionsCount}
                  onChange={(e) => setQuestionsCount(e.target.value)}
                  className="rounded-lg"
                />
              </div>
            </div>

            {/* When to Schedule */}
            <div className="space-y-2">
              <Label htmlFor="scheduleTime" className="text-sm font-semibold">
                When to Schedule
              </Label>
              <Input
                id="scheduleTime"
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-lg"
              />
            </div>

            {/* Access Code Selection & Input in One Row */}
            <div className="grid grid-cols-2 items-end gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Access Code Required?</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={hasAccessCode === "yes" ? "default" : "outline"}
                    onClick={() => setHasAccessCode("yes")}
                    className="flex-1 rounded-lg text-xs"
                  >
                    Yes
                  </Button>
                  <Button
                    type="button"
                    variant={hasAccessCode === "no" ? "default" : "outline"}
                    onClick={() => {
                      setHasAccessCode("no");
                      setAccessCode("");
                    }}
                    className="flex-1 rounded-lg text-xs"
                  >
                    No
                  </Button>
                </div>
              </div>

              {hasAccessCode === "yes" ? (
                <div className="space-y-2">
                  <Label htmlFor="accessCode" className="text-sm font-semibold">
                    Enter Access Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="accessCode"
                    placeholder="e.g. MATH10"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    className="rounded-lg"
                  />
                </div>
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalRequirements" className="text-sm font-semibold">
                Additional Requirement
              </Label>
              <Textarea
                id="additionalRequirements"
                placeholder="Any special instructions (optional)"
                rows={2}
                value={additionalRequirements}
                onChange={(e) => setAdditionalRequirements(e.target.value)}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Description / General Note</Label>
              <Textarea
                placeholder="Any notes for admin (optional)"
                rows={2}
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Question Paper File (Optional)</Label>
              <input
                ref={createFileRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => setCreateFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => createFileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-sm text-muted-foreground transition-colors duration-200 animate-in fade-in-50 hover:border-primary hover:text-primary"
              >
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                {createFile ? (
                  <span className="max-w-[240px] truncate text-xs font-medium text-foreground">
                    {createFile.name}
                  </span>
                ) : (
                  <span className="text-xs">Click to select PDF or image</span>
                )}
              </button>
            </div>
          </div>
          <DialogFooter className="mt-2 flex flex-col gap-4 border-t pt-4 md:flex-row">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="w-full md:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createBusy} className="w-full md:w-auto">
              {createBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={editBusy}>
              {editBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Re-upload dialog ── */}
      <Dialog open={!!reuploadTarget} onOpenChange={(o) => !o && setReuploadTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Replace File</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <input
              ref={reuploadFileRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => setReuploadFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => reuploadFileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <UploadCloud className="h-6 w-6" />
              {reuploadFile ? (
                <span className="max-w-[220px] truncate font-medium text-foreground">
                  {reuploadFile.name}
                </span>
              ) : (
                <span>Click to select new file</span>
              )}
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReuploadTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleReupload} disabled={reuploadBusy || !reuploadFile}>
              {reuploadBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel confirmation ── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
            <AlertDialogDescription>
              "{cancelTarget?.title}" will be marked as cancelled and cannot be reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancel}
              disabled={cancelBusy}
            >
              {cancelBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
