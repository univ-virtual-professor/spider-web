import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  X,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Textarea } from "@shared/ui/textarea";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;
const ACCEPTED = ".pdf,image/jpeg,image/png";

type RequestStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "CANCELLED";
type RequestType = "file" | "syllabus";

type QPRequest = {
  id: number;
  title: string;
  description: string;
  request_type: RequestType;
  file_url: string | null;
  file_name: string | null;
  subject: string | null;
  chapter: string | null;
  topics: string[] | null;
  status: RequestStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type SubjectOption = { id: string; name: string };

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
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<RequestType>("file");
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  // file mode
  const [createFile, setCreateFile] = useState<File | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);
  // syllabus mode
  const [createSubject, setCreateSubject] = useState("");
  const [createChapter, setCreateChapter] = useState("");
  const [createTopics, setCreateTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");

  const [createBusy, setCreateBusy] = useState(false);

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

  useEffect(() => {
    if (!profile?.uid) return;
    fetchRequests();
    getDoc(doc(db, "educators", profile.uid)).then((snap) => {
      const data = snap.data();
      if (typeof data?.maxQuestionPaperRequests === "number") {
        setMonthlyLimit(data.maxQuestionPaperRequests);
      }
      const allowedSubjectIds: string[] = data?.allowedSubjectIds || [];
      if (allowedSubjectIds.length > 0) {
        loadSubjects(allowedSubjectIds);
      }
    });
  }, [profile?.uid]);

  async function loadSubjects(ids: string[]) {
    try {
      // Firestore `in` supports up to 30 items per query
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
      const results: SubjectOption[] = [];
      for (const chunk of chunks) {
        const snap = await getDocs(
          query(collection(db, "subjects"), where("__name__", "in", chunk))
        );
        snap.forEach((d) => results.push({ id: d.id, name: d.data().name }));
      }
      results.sort((a, b) => a.name.localeCompare(b.name));
      setSubjects(results);
    } catch {
      // non-fatal
    }
  }

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

  function resetCreateForm() {
    setCreateTitle("");
    setCreateDesc("");
    setCreateFile(null);
    setCreateSubject("");
    setCreateChapter("");
    setCreateTopics([]);
    setTopicInput("");
    setCreateMode("file");
  }

  async function handleCreate() {
    if (!createTitle.trim()) return toast.error("Title is required");

    setCreateBusy(true);
    try {
      let newReq: QPRequest;
      if (createMode === "file") {
        if (!createFile) return toast.error("Please select a file");
        const fd = new FormData();
        fd.append("title", createTitle.trim());
        fd.append("description", createDesc.trim());
        fd.append("file", createFile);
        newReq = await apiUpload("/api/question-upload/", fd);
      } else {
        if (!createSubject) return toast.error("Please select a subject");
        const token = await firebaseUser?.getIdToken();
        const res = await fetch(`${API}/api/question-upload/syllabus`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: createTitle.trim(),
            description: createDesc.trim(),
            subject: createSubject,
            chapter: createChapter.trim(),
            topics: createTopics,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Request failed");
        }
        newReq = await res.json();
      }

      setRequests((prev) => [newReq, ...prev]);
      setCreateOpen(false);
      resetCreateForm();
      toast.success("Request submitted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreateBusy(false);
    }
  }

  function addTopic() {
    const t = topicInput.trim();
    if (!t) return;
    if (!createTopics.includes(t)) setCreateTopics((prev) => [...prev, t]);
    setTopicInput("");
  }

  function removeTopic(t: string) {
    setCreateTopics((prev) => prev.filter((x) => x !== t));
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
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {!isApp && (
            <div
              className="flex cursor-pointer items-center gap-2 rounded-full p-2 transition-colors hover:bg-primary hover:text-white"
              onClick={() => navigate("/educator/test-series")}
            >
              <ArrowLeft className="h-4 w-4" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold">Question Paper Requests</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a paper or specify subject/topics for admin to create one.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <MonthlyUsage requests={requests} limit={monthlyLimit} />
          <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
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
                  <TableHead>Type / Details</TableHead>
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
                      {req.request_type === "syllabus" ? (
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3 flex-shrink-0" />
                            <span className="font-medium text-foreground">{req.subject}</span>
                          </div>
                          {req.chapter && <div>Ch: {req.chapter}</div>}
                          {Array.isArray(req.topics) && req.topics.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {req.topics.slice(0, 3).map((t) => (
                                <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{t}</span>
                              ))}
                              {req.topics.length > 3 && (
                                <span className="text-[10px]">+{req.topics.length - 3} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        req.file_url ? (
                          <a
                            href={req.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex max-w-[140px] items-center gap-1 truncate text-xs text-primary hover:underline"
                          >
                            {req.file_name}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )
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
                          {req.request_type === "file" && (
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
                          )}
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
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) resetCreateForm(); setCreateOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Question Paper Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Mode tabs */}
            <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as RequestType)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file">
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Upload Paper
                </TabsTrigger>
                <TabsTrigger value="syllabus">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Specify Details
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                placeholder="e.g. Class 10 Maths Term 2 2024"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Any notes for admin (optional)"
                rows={2}
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
              />
            </div>

            {createMode === "file" ? (
              <div className="space-y-1.5">
                <Label>Question Paper *</Label>
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
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <UploadCloud className="h-6 w-6" />
                  {createFile ? (
                    <span className="max-w-[280px] truncate font-medium text-foreground">
                      {createFile.name}
                    </span>
                  ) : (
                    <span>Click to select PDF or image</span>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Subject *</Label>
                  {subjects.length > 0 ? (
                    <Select value={createSubject} onValueChange={setCreateSubject}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.name}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="e.g. Physics"
                      value={createSubject}
                      onChange={(e) => setCreateSubject(e.target.value)}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Chapter</Label>
                  <Input
                    placeholder="e.g. Laws of Motion"
                    value={createChapter}
                    onChange={(e) => setCreateChapter(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Topics</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a topic and press Enter"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(); } }}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addTopic}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {createTopics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {createTopics.map((t) => (
                        <Badge key={t} variant="secondary" className="gap-1 pr-1">
                          {t}
                          <button
                            type="button"
                            onClick={() => removeTopic(t)}
                            className="ml-0.5 rounded hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetCreateForm(); setCreateOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createBusy}>
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
