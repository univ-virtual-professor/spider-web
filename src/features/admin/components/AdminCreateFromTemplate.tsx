import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Badge } from "@shared/ui/badge";
import { toast } from "@shared/hooks/use-toast";
import { db } from "@shared/lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { logError } from "@shared/lib/errorLogger";

type TemplateDoc = {
  id: string;
  title?: string;
  description?: string;
  subject?: string;
  courseId?: string;
  courseName?: string;
  durationMinutes?: number;
  sections?: any[];
  markingScheme?: { correct: number; incorrect: number; unanswered: number };
  version?: number;
  isPublished?: boolean;
};

interface AdminCreateFromTemplateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (testId: string) => void;
}

export default function AdminCreateFromTemplate({ open, onOpenChange, onCreated }: AdminCreateFromTemplateProps) {
  const [templates, setTemplates] = useState<TemplateDoc[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // Load published templates when dialog opens
  useEffect(() => {
    if (!open) return;
    setSelectedId("");
    setTitle("");
    setLoadingTemplates(true);
    getDocs(query(collection(db, "templates"), where("isPublished", "==", true), orderBy("title")))
      .then((snap) => {
        setTemplates(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      })
      .catch((e) => {
        logError(e, "AdminCreateFromTemplate.loadTemplates");
        toast({ title: "Failed to load templates", variant: "destructive" });
      })
      .finally(() => setLoadingTemplates(false));
  }, [open]);

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!selectedId || !selectedTemplate) {
      toast({ title: "Select a template", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const sections = selectedTemplate.sections ?? [];
      const questionsCount = sections.reduce((acc: number, s: any) => acc + (Number(s.questionsCount) || 0), 0);

      const payload: Record<string, any> = {
        title: trimmedTitle,
        description: selectedTemplate.description || "",
        subject: selectedTemplate.subject || "",
        courseId: selectedTemplate.courseId || "",
        courseName: selectedTemplate.courseName || "",
        sections,
        questionsCount,
        durationMinutes: selectedTemplate.durationMinutes || 60,
        markingScheme: selectedTemplate.markingScheme ?? { correct: 4, incorrect: -1, unanswered: 0 },
        isPublished: false,
        source: "admin_template",
        sourceTemplateId: selectedId,
        sourceTemplateVersion: Number(selectedTemplate.version ?? 0),
        level: "General",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "test_series"), payload);
      toast({ title: "Test created", description: `"${trimmedTitle}" created from template.` });
      onOpenChange(false);
      onCreated(ref.id);
    } catch (e: any) {
      logError(e, "AdminCreateFromTemplate.handleCreate");
      toast({ title: "Failed to create test", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Test from Template
          </DialogTitle>
          <DialogDescription>
            Pre-fill a new test with a template's structure. You can add questions after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template select */}
          <div className="space-y-1.5">
            <Label>Template</Label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published templates found.</p>
            ) : (
              <Select value={selectedId || "__none"} onValueChange={(v) => setSelectedId(v === "__none" ? "" : v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Select —</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title || t.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Template preview */}
          {selectedTemplate && (
            <div className="rounded-xl border bg-muted/30 p-3 space-y-1.5 text-xs text-muted-foreground">
              {selectedTemplate.subject && <p>Subject: <span className="font-medium text-foreground">{selectedTemplate.subject}</span></p>}
              {selectedTemplate.durationMinutes && <p>Duration: <span className="font-medium text-foreground">{selectedTemplate.durationMinutes} min</span></p>}
              {selectedTemplate.sections && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {selectedTemplate.sections.map((s: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{s.name} ({s.questionsCount}Q)</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Test Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. JEE Mock Test 1"
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating || !selectedId || !title.trim()} className="rounded-xl gradient-bg text-white">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Create Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
