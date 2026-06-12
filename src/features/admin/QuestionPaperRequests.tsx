import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { db } from "@shared/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;
const ADMIN_KEY = import.meta.env.VITE_MONKEY_KING_ADMIN_KEY;

type RequestStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "CANCELLED";

type QPRequest = {
  id: number;
  educator_id: string;
  title: string;
  description: string;
  request_type: "file" | "syllabus";
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

const STATUS_OPTIONS: RequestStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETE", "CANCELLED"];

const STATUS_BADGE: Record<RequestStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200",
  COMPLETE: "bg-green-100 text-green-800 border-green-200",
  CANCELLED: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
};

async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_KEY}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminQuestionPaperRequests() {
  const [requests, setRequests] = useState<QPRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Status update dialog
  const [updateTarget, setUpdateTarget] = useState<QPRequest | null>(null);
  const [newStatus, setNewStatus] = useState<RequestStatus>("IN_PROGRESS");
  const [adminNote, setAdminNote] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  async function fetchRequests() {
    setLoading(true);
    try {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await adminFetch(`/api/question-upload/admin/requests${params}`);
      setRequests(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openUpdateDialog(req: QPRequest) {
    setUpdateTarget(req);
    setNewStatus(req.status === "PENDING" ? "IN_PROGRESS" : "COMPLETE");
    setAdminNote(req.admin_note || "");
  }

  async function handleUpdateStatus() {
    if (!updateTarget) return;
    setUpdateBusy(true);
    try {
      const updated = await adminFetch(
        `/api/question-upload/admin/requests/${updateTarget.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: newStatus,
            admin_note: adminNote.trim() || null,
          }),
        }
      );
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));

      // Notify Educator
      try {
        if (updateTarget.educator_id) {
          await addDoc(collection(db, "users", updateTarget.educator_id, "notifications"), {
            title: `🔄 Question Paper Status: ${STATUS_LABEL[newStatus]}`,
            body: `Your request "${updateTarget.title}" is now ${STATUS_LABEL[newStatus]}.${adminNote.trim() ? ` Note: ${adminNote.trim()}` : ""}`,
            read: false,
            type: "qp_status_update",
            createdAt: serverTimestamp(),
            createdByRole: "ADMIN",
          });
        }
      } catch (err) {
        console.error("Error creating educator notification for QP status update:", err);
      }

      setUpdateTarget(null);
      toast.success("Status updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUpdateBusy(false);
    }
  }

  const nextStatuses = (current: RequestStatus): RequestStatus[] => {
    if (current === "PENDING") return ["IN_PROGRESS", "CANCELLED"];
    if (current === "IN_PROGRESS") return ["COMPLETE", "CANCELLED"];
    return [];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Question Paper Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage educator requests to upload question papers.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {requests.length} request{requests.length !== 1 ? "s" : ""}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <ClipboardList className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">No requests found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Educator ID</TableHead>
                  <TableHead>File / Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin Note</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => {
                  const canUpdate = nextStatuses(req.status).length > 0;
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="max-w-[180px] font-medium">
                        <div className="truncate">{req.title}</div>
                        {req.description && (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {req.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate font-mono text-xs text-muted-foreground">
                        {req.educator_id}
                      </TableCell>
                      <TableCell>
                        {req.request_type === "syllabus" ? (
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            <div className="font-medium text-foreground">{req.subject}</div>
                            {req.chapter && <div>Ch: {req.chapter}</div>}
                            {Array.isArray(req.topics) && req.topics.length > 0 && (
                              <div>
                                {req.topics.slice(0, 3).join(", ")}
                                {req.topics.length > 3 ? ` +${req.topics.length - 3}` : ""}
                              </div>
                            )}
                          </div>
                        ) : req.file_url ? (
                          <a
                            href={req.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex max-w-[130px] items-center gap-1 truncate text-xs text-primary hover:underline"
                          >
                            {req.file_name}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[req.status]}`}
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
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => openUpdateDialog(req)}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Update
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Status update dialog ── */}
      <Dialog open={!!updateTarget} onOpenChange={(o) => !o && setUpdateTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Request Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as RequestStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {updateTarget &&
                    nextStatuses(updateTarget.status).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note for Educator</Label>
              <Textarea
                placeholder="e.g. Uploaded to Physics section, Class 10 batch"
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateStatus} disabled={updateBusy}>
              {updateBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
