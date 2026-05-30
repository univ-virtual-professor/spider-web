import { useEffect, useRef, useState } from "react";
import {
  FileUp,
  Loader2,
  Pencil,
  Trash2,
  UploadCloud,
  ExternalLink,
  ArrowLeft,
  FileText,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { cn } from "@shared/lib/utils";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
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

function parseRequestDetails(title: string, description: string) {
  const parts = title.split(" - ");
  const subject = parts[0] || "";
  const chapterName = parts[1] || "";
  const topic = parts[2] || "";

  let subtopic = "";
  let noOfQuestions = "";
  let instructions = "";

  if (description) {
    const subtopicMatch = description.match(/Subtopic:\s*([^|\n]+)/);
    const questionsMatch = description.match(/Questions:\s*([^|\n]+)/);
    const instructionsMatch = description.match(/Instructions:\s*([\s\S]+)$/);

    if (subtopicMatch) subtopic = subtopicMatch[1].trim();
    if (questionsMatch) noOfQuestions = questionsMatch[1].trim();
    if (instructionsMatch) instructions = instructionsMatch[1].trim();
  }

  // Fallback to legacy formats
  if (!subject && !chapterName && !topic) {
    return {
      subject: title,
      chapterName: "",
      topic: "",
      subtopic: "",
      noOfQuestions: "",
      instructions: description,
    };
  }

  return {
    subject,
    chapterName,
    topic,
    subtopic: subtopic === "—" || subtopic === "None" ? "" : subtopic,
    noOfQuestions: noOfQuestions === "—" || noOfQuestions === "Not specified" ? "" : noOfQuestions,
    instructions: instructions === "—" || instructions === "None" ? "" : instructions,
  };
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
    <div className="flex w-full items-center justify-between gap-2.5 rounded-lg bg-muted/60 px-3 py-1.5 text-sm sm:w-auto sm:justify-start">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">This month:</span>
        <span className={`font-semibold ${full ? "text-destructive" : "text-foreground"}`}>
          {used}
        </span>
        <span className="text-muted-foreground">/ {limit}</span>
      </div>
      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-border sm:w-20">
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

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [chapterName, setChapterName] = useState("");
  const [topic, setTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [noOfQuestions, setNoOfQuestions] = useState("");
  const [instructions, setInstructions] = useState("");
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const createFileRef = useRef<HTMLInputElement>(null);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<QPRequest | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editChapterName, setEditChapterName] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editSubtopic, setEditSubtopic] = useState("");
  const [editNoOfQuestions, setEditNoOfQuestions] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
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
      const limit = snap.data()?.maxQuestionPaperRequests;
      if (typeof limit === "number") setMonthlyLimit(limit);
    });
  }, [profile?.uid]);

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
    if (!subject.trim()) return toast.error("Subject is required");
    if (!chapterName.trim()) return toast.error("Chapter Name is required");
    if (!topic.trim()) return toast.error("Topic is required");
    if (!createFile) return toast.error("Please select a file");
    setCreateBusy(true);
    try {
      const title = `${subject.trim()} - ${chapterName.trim()} - ${topic.trim()}`;
      const description = `Subtopic: ${subtopic.trim() || "—"} | Questions: ${noOfQuestions.trim() || "—"}\nInstructions: ${instructions.trim() || "None"}`;

      const fd = new FormData();
      fd.append("title", title);
      fd.append("description", description);
      fd.append("file", createFile);
      fd.append("subject", subject.trim());
      fd.append("chapter_name", chapterName.trim());
      fd.append("topic", topic.trim());
      if (subtopic.trim()) fd.append("subtopic", subtopic.trim());
      if (noOfQuestions.trim()) fd.append("no_of_questions", noOfQuestions.trim());
      if (instructions.trim()) fd.append("instructions", instructions.trim());

      const newReq = await apiUpload("/api/question-upload/", fd);
      setRequests((prev) => [newReq, ...prev]);

      // Notify Admin
      try {
        const adminsSnap = await getDocs(
          query(collection(db, "users"), where("role", "==", "ADMIN"))
        );
        if (!adminsSnap.empty) {
          const batch = writeBatch(db);
          adminsSnap.forEach((adminDoc) => {
            const notifRef = doc(collection(db, "users", adminDoc.id, "notifications"));
            batch.set(notifRef, {
              title: "📄 New Question Paper Request",
              body: `${profile?.displayName || profile?.fullName || "An educator"} requested upload of "${title}"`,
              read: false,
              type: "qp_request",
              createdAt: serverTimestamp(),
              createdByRole: "EDUCATOR",
            });
          });
          await batch.commit();
        }
      } catch (err) {
        console.error("Error creating admin notifications for QP request:", err);
      }

      setCreateOpen(false);
      setSubject("");
      setChapterName("");
      setTopic("");
      setSubtopic("");
      setNoOfQuestions("");
      setInstructions("");
      setCreateFile(null);
      toast.success("Request submitted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editSubject.trim()) return toast.error("Subject is required");
    if (!editChapterName.trim()) return toast.error("Chapter Name is required");
    if (!editTopic.trim()) return toast.error("Topic is required");

    setEditBusy(true);
    try {
      const title = `${editSubject.trim()} - ${editChapterName.trim()} - ${editTopic.trim()}`;
      const description = `Subtopic: ${editSubtopic.trim() || "—"} | Questions: ${editNoOfQuestions.trim() || "—"}\nInstructions: ${editInstructions.trim() || "None"}`;

      const updated = await apiFetch(`/api/question-upload/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          subject: editSubject.trim(),
          chapter_name: editChapterName.trim(),
          topic: editTopic.trim(),
          subtopic: editSubtopic.trim() || null,
          no_of_questions: editNoOfQuestions.trim() || null,
          instructions: editInstructions.trim() || null,
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

  function openEdit(req: QPRequest) {
    const details = parseRequestDetails(req.title, req.description);
    setEditSubject(details.subject);
    setEditChapterName(details.chapterName);
    setEditTopic(details.topic);
    setEditSubtopic(details.subtopic);
    setEditNoOfQuestions(details.noOfQuestions);
    setEditInstructions(details.instructions);
    setEditTarget(req);
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
            <p className="mt-1 text-sm text-muted-foreground">
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
            <>
              {/* Desktop View (Table) */}
              <div className="hidden md:block">
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
                        <TableCell className="max-w-[200px] font-medium">
                          <div className="truncate">{req.title}</div>
                          {req.description && (
                            <div
                              className="mt-0.5 truncate text-xs text-muted-foreground"
                              title={req.description}
                            >
                              {req.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <a
                            href={req.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex max-w-[140px] items-center gap-1 truncate text-xs text-primary hover:underline"
                          >
                            {req.file_name}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
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
              </div>

              {/* Mobile View (Cards) */}
              <div className="space-y-4 md:hidden">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all hover:border-primary/20"
                  >
                    {/* Header: Title + Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="break-words text-sm font-semibold text-foreground">
                          {req.title}
                        </h4>
                        {req.description && (
                          <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                            {req.description}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          STATUS_CLASS[req.status]
                        )}
                      >
                        {STATUS_LABEL[req.status]}
                      </span>
                    </div>

                    {/* Meta info (File + Date) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {/* File Link */}
                      <a
                        href={req.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-[180px] items-center gap-1.5 rounded-lg border border-border/80 bg-muted/20 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted/40"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{req.file_name}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>

                      {/* Date */}
                      <div className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {fmtDate(req.created_at)}
                      </div>
                    </div>

                    {/* Admin Note if exists */}
                    {req.admin_note && (
                      <div className="rounded-lg border border-border/40 bg-muted/50 p-2.5 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Admin Note: </span>
                        {req.admin_note}
                      </div>
                    )}

                    {/* Actions if Pending */}
                    {req.status === "PENDING" && (
                      <div className="flex items-center gap-2 border-t border-border/40 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 gap-1 text-xs"
                          onClick={() => openEdit(req)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 gap-1 text-xs"
                          onClick={() => {
                            setReuploadTarget(req);
                            setReuploadFile(null);
                          }}
                        >
                          <UploadCloud className="h-3.5 w-3.5" />
                          Replace File
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 gap-1 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                          onClick={() => setCancelTarget(req)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Question Paper Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Subject </Label>
                <Input
                  placeholder="e.g. Physics"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Chapter Name </Label>
                <Input
                  placeholder="e.g. Thermodynamics"
                  value={chapterName}
                  onChange={(e) => setChapterName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Topic </Label>
                <Input
                  placeholder="e.g. Heat Engines"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Subtopic (If Any)</Label>
                <Input
                  placeholder="e.g. Carnot Cycle"
                  value={subtopic}
                  onChange={(e) => setSubtopic(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>No. of Questions</Label>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={noOfQuestions}
                onChange={(e) => setNoOfQuestions(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Any Instructions</Label>
              <Textarea
                placeholder="Specific instructions or formatting notes..."
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Upload Attachment </Label>
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
                  <span className="max-w-[240px] truncate font-medium text-foreground">
                    {createFile.name}
                  </span>
                ) : (
                  <span>Click to select PDF or image</span>
                )}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Subject *</Label>
                <Input
                  placeholder="e.g. Physics"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Chapter Name *</Label>
                <Input
                  placeholder="e.g. Thermodynamics"
                  value={editChapterName}
                  onChange={(e) => setEditChapterName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Topic *</Label>
                <Input
                  placeholder="e.g. Heat Engines"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Subtopic (If Any)</Label>
                <Input
                  placeholder="e.g. Carnot Cycle"
                  value={editSubtopic}
                  onChange={(e) => setEditSubtopic(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>No. of Questions</Label>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={editNoOfQuestions}
                onChange={(e) => setEditNoOfQuestions(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Any Instructions</Label>
              <Textarea
                placeholder="Specific instructions or formatting notes..."
                rows={2}
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
              />
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
