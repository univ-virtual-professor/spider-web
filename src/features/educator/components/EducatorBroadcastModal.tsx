import { useState, useEffect, useMemo } from "react";
import { Loader2, Megaphone, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Badge } from "@shared/ui/badge";
import { toast } from "@shared/hooks/use-toast";
import { auth, db } from "@shared/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL as string;

interface EducatorBroadcastModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  educatorId: string;
}

type BranchItem = { id: string; name: string };
type CourseItem = { id: string; name: string; branchId: string };
type BatchItem = { id: string; name: string };

const NONE = "__none";

export default function EducatorBroadcastModal({ open, onOpenChange, educatorId }: EducatorBroadcastModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Filter selections
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");

  // Available options
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [allCourses, setAllCourses] = useState<CourseItem[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loadingBase, setLoadingBase] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const reset = () => {
    setTitle("");
    setBody("");
    setSelectedBranchId("");
    setSelectedCourseId("");
    setSelectedBatchId("");
    setBatches([]);
  };

  // Load branches + all courses on open
  useEffect(() => {
    if (!open || !educatorId) return;
    setLoadingBase(true);
    const load = async () => {
      try {
        const branchSnap = await getDocs(collection(db, "educators", educatorId, "branches"));
        const loadedBranches: BranchItem[] = branchSnap.docs.map((d) => ({
          id: d.id,
          name: (d.data() as any)?.name ?? d.id,
        }));
        setBranches(loadedBranches);

        const courseLists = await Promise.all(
          branchSnap.docs.map(async (bd) => {
            const cs = await getDocs(collection(db, "educators", educatorId, "branches", bd.id, "courses"));
            return cs.docs.map((cd) => ({
              id: cd.id,
              name: (cd.data() as any)?.name ?? cd.id,
              branchId: bd.id,
            }));
          })
        );
        setAllCourses(courseLists.flat());
      } catch {
        toast({ title: "Failed to load branches/courses", variant: "destructive" });
      } finally {
        setLoadingBase(false);
      }
    };
    load();
  }, [open, educatorId]);

  // Courses visible in dropdown — filtered by selected branch if one is chosen
  const visibleCourses = useMemo(
    () => selectedBranchId ? allCourses.filter((c) => c.branchId === selectedBranchId) : allCourses,
    [allCourses, selectedBranchId]
  );

  // Load batches when a course is selected (uses its stored branchId)
  useEffect(() => {
    setSelectedBatchId("");
    setBatches([]);
    if (!selectedCourseId) return;

    const course = allCourses.find((c) => c.id === selectedCourseId);
    if (!course) return;

    setLoadingBatches(true);
    getDocs(
      collection(db, "educators", educatorId, "branches", course.branchId, "courses", course.id, "batches")
    )
      .then((snap) => {
        setBatches(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any)?.name ?? d.id })));
      })
      .catch(() => toast({ title: "Failed to load batches", variant: "destructive" }))
      .finally(() => setLoadingBatches(false));
  }, [selectedCourseId, allCourses, educatorId]);

  // When branch changes, clear course+batch if course no longer belongs to new branch
  const handleBranchChange = (val: string) => {
    const newBranchId = val === NONE ? "" : val;
    setSelectedBranchId(newBranchId);
    if (newBranchId && selectedCourseId) {
      const course = allCourses.find((c) => c.id === selectedCourseId);
      if (course && course.branchId !== newBranchId) {
        setSelectedCourseId("");
        setSelectedBatchId("");
        setBatches([]);
      }
    }
  };

  const hasFilters = selectedBranchId || selectedCourseId || selectedBatchId;

  // Summary chips shown above Send button
  const summaryChips = [
    selectedBranchId && { label: "Branch", name: branches.find((b) => b.id === selectedBranchId)?.name ?? selectedBranchId, key: "branch" },
    selectedCourseId && { label: "Course", name: visibleCourses.find((c) => c.id === selectedCourseId)?.name ?? selectedCourseId, key: "course" },
    selectedBatchId && { label: "Batch", name: batches.find((b) => b.id === selectedBatchId)?.name ?? selectedBatchId, key: "batch" },
  ].filter(Boolean) as { label: string; name: string; key: string }[];

  const handleSend = async () => {
    const trimTitle = title.trim();
    const trimBody = body.trim();
    if (!trimTitle) { toast({ title: "Title required", variant: "destructive" }); return; }
    if (!trimBody) { toast({ title: "Message body required", variant: "destructive" }); return; }

    setSending(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${MONKEY_KING}/api/notifications/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: trimTitle,
          body: trimBody,
          target_type: hasFilters ? "educator_filtered" : "educator_all",
          ...(selectedBranchId && { branch_id: selectedBranchId }),
          ...(selectedCourseId && { course_id: selectedCourseId }),
          ...(selectedBatchId && { batch_id: selectedBatchId }),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? data?.error ?? "Failed to send");

      toast({ title: "Notification sent", description: `Delivered to ${data.recipientCount} student(s).` });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast({ title: "Failed to send", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Notify Students
          </DialogTitle>
          <DialogDescription>
            Filter by any combination of branch, course, and batch. Leave all blank to send to everyone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title <span className="text-muted-foreground text-xs">({title.length}/100)</span></Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="e.g. Test scheduled for tomorrow"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Message <span className="text-muted-foreground text-xs">({body.length}/500)</span></Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 500))}
              placeholder="Write your notification message here…"
              rows={3}
              className="rounded-xl resize-none"
            />
          </div>

          {/* Filters */}
          <div className="space-y-3">
            <Label>Filters <span className="text-xs font-normal text-muted-foreground">(optional — combine freely)</span></Label>

            {loadingBase ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {/* Branch */}
                <Select
                  value={selectedBranchId || NONE}
                  onValueChange={handleBranchChange}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="All branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All branches</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Course */}
                <Select
                  value={selectedCourseId || NONE}
                  onValueChange={(v) => setSelectedCourseId(v === NONE ? "" : v)}
                  disabled={visibleCourses.length === 0}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="All courses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All courses</SelectItem>
                    {visibleCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Batch — only when course selected */}
                {selectedCourseId && (
                  <Select
                    value={selectedBatchId || NONE}
                    onValueChange={(v) => setSelectedBatchId(v === NONE ? "" : v)}
                    disabled={loadingBatches || batches.length === 0}
                  >
                    <SelectTrigger className="rounded-xl">
                      {loadingBatches
                        ? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading batches…</span>
                        : <SelectValue placeholder="All batches" />
                      }
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>All batches</SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="flex flex-wrap items-center gap-1.5 min-h-[24px]">
            {summaryChips.length === 0 ? (
              <span className="text-xs text-muted-foreground">Sending to: all enrolled students</span>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">Sending to:</span>
                {summaryChips.map((chip) => (
                  <Badge key={chip.key} variant="secondary" className="text-[11px] gap-1">
                    <span className="text-muted-foreground">{chip.label}:</span> {chip.name}
                  </Badge>
                ))}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !title.trim() || !body.trim()}
            className="rounded-xl gradient-bg text-white"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Megaphone className="h-4 w-4 mr-2" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
