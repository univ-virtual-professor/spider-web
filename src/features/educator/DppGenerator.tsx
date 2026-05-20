import { useEffect, useState, useRef } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useEducatorFeatures } from "@shared/hooks/useEducatorFeatures";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import { Input } from "@shared/ui/input";
import { Checkbox } from "@shared/ui/checkbox";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Zap,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentItem = {
  id: string;
  title: string;
  type: string;
  courseId: string;
  courseName: string;
  branchId: string;
  branchName: string;
};

type DppRecord = {
  id: string;
  title: string;
  difficulty: string;
  contentTitles: string[];
  generatedAt: string;
  status: "generating" | "ready" | "failed";
  testId: string | null;
  errorMessage?: string;
  sourceMode?: string;
};

type ScheduleRecord = {
  id: string;
  contentTitles: string[];
  difficulty: string;
  startDate: string;
  endDate: string;
  timeOfDay: string;
  targetBatches: string[];
  isActive: boolean;
  lastRunDate: string | null;
  sourceMode?: string;
  topicRotation?: string[];
  topicFilters?: string[];
  subjectFilter?: string;
  chapterFilter?: string;
};

type Batch = { id: string; name: string };

type SourceMode = "ai_only" | "qb_only" | "hybrid";

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL || "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(firebaseUser: any, path: string, opts: RequestInit = {}) {
  const token = await firebaseUser.getIdToken();
  return fetch(`${MONKEY_KING}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DppRecord["status"] }) {
  if (status === "generating")
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Generating
      </Badge>
    );
  if (status === "ready")
    return (
      <Badge variant="default" className="shrink-0 gap-1 bg-green-600">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </Badge>
    );
  return (
    <Badge variant="destructive" className="shrink-0 gap-1">
      <AlertCircle className="h-3 w-3" /> Failed
    </Badge>
  );
}

function SourceLabel({ mode }: { mode?: string }) {
  if (mode === "qb_only") return <span className="text-xs text-muted-foreground">QB only</span>;
  if (mode === "hybrid") return <span className="text-xs text-muted-foreground">QB + AI</span>;
  return <span className="text-xs text-muted-foreground">AI</span>;
}

// ─── Content Picker (shared between generate-now and schedule) ────────────────

function ContentPicker({
  content,
  loading,
  selectedIds,
  onToggle,
  singleCourseOnly,
  coursesList,
  educatorUid,
  onUploadSuccess,
}: {
  content: ContentItem[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  singleCourseOnly?: boolean;
  coursesList: { courseId: string; courseName: string; branchId: string; branchName: string }[];
  educatorUid: string;
  onUploadSuccess: (item: ContentItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedCourseIdx, setSelectedCourseIdx] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const grouped: Record<string, { courseName: string; items: ContentItem[] }> = {};
  for (const item of content) {
    const key = `${item.branchId}::${item.courseId}`;
    if (!grouped[key])
      grouped[key] = { courseName: `${item.branchName} / ${item.courseName}`, items: [] };
    grouped[key].items.push(item);
  }
  const selectedContent = content.filter((c) => selectedIds.has(c.id));
  const courseIds = [...new Set(selectedContent.map((c) => c.courseId))];

  const handleUploadClick = async () => {
    if (!file) return toast.error("Please select a file first");
    if (!title.trim()) return toast.error("Please enter a file title");
    if (!selectedCourseIdx) return toast.error("Please select a target course");

    const courseObj = coursesList[parseInt(selectedCourseIdx)];
    if (!courseObj) return toast.error("Invalid course selected");

    setUploading(true);
    try {
      const result = await uploadToImageKit(
        file,
        file.name,
        `/content/educator/${educatorUid}`,
        "content"
      );

      const docRef = await addDoc(
        collection(
          db,
          "educators",
          educatorUid,
          "branches",
          courseObj.branchId,
          "courses",
          courseObj.courseId,
          "content"
        ),
        {
          type: "note",
          title: title.trim(),
          fileUrl: result.url,
          fileId: result.fileId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          source: "educator",
          addedBy: educatorUid,
          createdAt: serverTimestamp(),
        }
      );

      const newItem: ContentItem = {
        id: docRef.id,
        title: title.trim(),
        type: "note",
        courseId: courseObj.courseId,
        courseName: courseObj.courseName,
        branchId: courseObj.branchId,
        branchName: courseObj.branchName,
      };

      onUploadSuccess(newItem);
      onToggle(newItem.id);

      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setOpen(false);
      toast.success("Content uploaded and selected!");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to upload content");
    } finally {
      setUploading(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{selectedIds.size} file(s) selected</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            if (coursesList.length === 0) {
              toast.error("No active courses found to upload content to.");
              return;
            }
            setSelectedCourseIdx("0");
            setOpen(true);
          }}
        >
          <Upload className="h-3 w-3" /> Direct Upload File
        </Button>
      </div>

      {singleCourseOnly && selectedContent.length > 0 && courseIds.length > 1 && (
        <p className="text-xs text-destructive">Select content from the same course only</p>
      )}

      {content.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No content uploaded yet.</p>
      ) : (
        <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
          {Object.entries(grouped).map(([key, group]) => (
            <div key={key} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.courseName}
              </p>
              {group.items.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => onToggle(item.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs capitalize text-muted-foreground">{item.type}</p>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Quick Upload Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Target Course</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedCourseIdx}
                onChange={(e) => setSelectedCourseIdx(e.target.value)}
              >
                {coursesList.map((c, idx) => (
                  <option key={`${c.branchId}::${c.courseId}`} value={idx.toString()}>
                    {c.branchName} / {c.courseName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>File Title</Label>
              <Input
                placeholder="e.g. Electric Charges and Fields Notes"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Select Document / PDF File</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title) {
                    setTitle(f.name.replace(/\.[^/.]+$/, ""));
                  }
                }}
              />
            </div>

            <Button className="mt-2 w-full" onClick={handleUploadClick} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading &amp; Ingesting…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Upload &amp; Select File
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Schedule Wizard ──────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

function ScheduleWizard({
  content,
  loadingContent,
  firebaseUser,
  educatorUid,
  onCreated,
  coursesList,
  onUploadSuccess,
}: {
  content: ContentItem[];
  loadingContent: boolean;
  firebaseUser: any;
  educatorUid: string;
  onCreated: (schedule: ScheduleRecord) => void;
  coursesList: { courseId: string; courseName: string; branchId: string; branchName: string }[];
  onUploadSuccess: (item: ContentItem) => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Source
  const [sourceMode, setSourceMode] = useState<SourceMode>("hybrid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [topicFilters, setTopicFilters] = useState<string[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [numQuestions, setNumQuestions] = useState<number>(10);

  // Step 2: Template summary + difficulty
  const [difficulty, setDifficulty] = useState("medium");
  const [templateInfo, setTemplateInfo] = useState<any>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Step 3: When
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [schedTime, setSchedTime] = useState("08:00");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [topicRotation, setTopicRotation] = useState<string[]>([]);
  const [rotationInput, setRotationInput] = useState("");

  const selectedContent = content.filter((c) => selectedIds.has(c.id));
  const courseIds = [...new Set(selectedContent.map((c) => c.courseId))];
  const courseId = courseIds.length === 1 ? courseIds[0] : "";
  const branchId = selectedContent[0]?.branchId || "";

  // Load educator template on step 2
  useEffect(() => {
    if (step !== 2 || templateInfo) return;
    setLoadingTemplate(true);
    apiFetch(firebaseUser, "/api/dpp/template/my")
      .then((r) => r.json())
      .then((d) => setTemplateInfo(d))
      .catch(() => {})
      .finally(() => setLoadingTemplate(false));
  }, [step]);

  // Load batches when course is determined
  useEffect(() => {
    if (!educatorUid || !courseId || !branchId) {
      setBatches([]);
      return;
    }
    getDocs(
      collection(db, "educators", educatorUid, "branches", branchId, "courses", courseId, "batches")
    )
      .then((snap) =>
        setBatches(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id })))
      )
      .catch(() => {});
  }, [educatorUid, courseId, branchId]);

  const toggleId = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleBatch = (id: string) =>
    setSelectedBatchIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const step1Valid =
    (sourceMode === "ai_only" && selectedIds.size > 0 && courseIds.length === 1) ||
    (sourceMode === "qb_only" && (topicFilters.length > 0 || subjectFilter)) ||
    (sourceMode === "hybrid" && (selectedIds.size > 0 || topicFilters.length > 0 || subjectFilter));

  const step3Valid = startDate && endDate && startDate <= endDate && selectedBatchIds.size > 0;

  const tmpl = templateInfo?.template;

  const handleSave = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const res = await apiFetch(firebaseUser, "/api/dpp/schedules", {
        method: "POST",
        body: JSON.stringify({
          content_ids: [...selectedIds],
          content_titles: selectedContent.map((c) => c.title),
          course_id: courseId,
          source_mode: sourceMode,
          topic_filters: topicFilters,
          subject_filter: subjectFilter,
          chapter_filter: chapterFilter,
          difficulty,
          target_batches: [...selectedBatchIds],
          start_date: startDate,
          end_date: endDate,
          time_of_day: schedTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          topic_rotation: topicRotation,
          question_count: numQuestions,
          num_questions: numQuestions,
          questionCount: numQuestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Failed to save schedule");
      toast.success("Schedule activated!");
      onCreated({
        id: data.scheduleId,
        contentTitles: selectedContent.map((c) => c.title),
        difficulty,
        startDate,
        endDate,
        timeOfDay: schedTime,
        targetBatches: [...selectedBatchIds],
        isActive: true,
        lastRunDate: null,
        sourceMode,
        topicRotation,
        topicFilters,
        subjectFilter,
        chapterFilter,
      });
      // Reset
      setStep(1);
      setSelectedIds(new Set());
      setTopicFilters([]);
      setSubjectFilter("");
      setChapterFilter("");
      setStartDate("");
      setEndDate("");
      setTopicRotation([]);
      setSelectedBatchIds(new Set());
    } catch (e: any) {
      toast.error(e?.message || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as WizardStep[]).map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : step > s
                    ? "bg-green-600 text-white"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {s === 1 ? "Source" : s === 2 ? "Template" : "Schedule"}
            </span>
            {s < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Source ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What should generate the DPP?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              {(
                [
                  {
                    value: "ai_only",
                    label: "AI from uploaded content",
                    icon: <Zap className="h-4 w-4" />,
                    desc: "AI generates questions from your course files",
                  },
                  {
                    value: "qb_only",
                    label: "Question Bank only",
                    icon: <BookOpen className="h-4 w-4" />,
                    desc: "Questions pulled from your QB — no AI generation",
                  },
                  {
                    value: "hybrid",
                    label: "Hybrid (QB + AI)",
                    icon: (
                      <>
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>+</span>
                        <Zap className="h-3.5 w-3.5" />
                      </>
                    ),
                    desc: "QB fills what it can; AI covers the rest (recommended)",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSourceMode(opt.value)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    sourceMode === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <div className="mt-0.5 flex items-center gap-0.5 text-primary">{opt.icon}</div>
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {(sourceMode === "ai_only" || sourceMode === "hybrid") && (
              <div className="space-y-1.5">
                <Label>Select content files</Label>
                <ContentPicker
                  content={content}
                  loading={loadingContent}
                  selectedIds={selectedIds}
                  onToggle={toggleId}
                  singleCourseOnly
                  coursesList={coursesList}
                  educatorUid={educatorUid}
                  onUploadSuccess={onUploadSuccess}
                />
              </div>
            )}

            {(sourceMode === "qb_only" || sourceMode === "hybrid") && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>
                    Subject filter{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    placeholder="e.g. Physics"
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Chapter filter{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    placeholder="e.g. Optics"
                    value={chapterFilter}
                    onChange={(e) => setChapterFilter(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Topic filters</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. Thermodynamics"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && topicInput.trim()) {
                          setTopicFilters((p) => [...p, topicInput.trim()]);
                          setTopicInput("");
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (topicInput.trim()) {
                          setTopicFilters((p) => [...p, topicInput.trim()]);
                          setTopicInput("");
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {topicFilters.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {topicFilters.map((t) => (
                        <Badge key={t} variant="secondary" className="gap-1 text-xs">
                          {t}
                          <button
                            onClick={() => setTopicFilters((p) => p.filter((x) => x !== t))}
                            className="ml-0.5 hover:text-destructive"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button className="w-full" disabled={!step1Valid} onClick={() => setStep(2)}>
              Continue <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Template + Difficulty ── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DPP Template &amp; Difficulty</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingTemplate ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tmpl ? (
              <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
                <p className="text-sm font-medium">{tmpl.title || "Standard DPP"}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{(tmpl.sections || []).length} section(s)</span>
                  <span>·</span>
                  <span>
                    {(tmpl.sections || []).reduce(
                      (a: number, s: any) => a + (s.questionCount || 0),
                      0
                    )}{" "}
                    questions
                  </span>
                  <span>·</span>
                  <span>{tmpl.durationMinutes || 30} min</span>
                  <span>·</span>
                  <span>
                    +{tmpl.positiveMarks ?? 4}/{tmpl.negativeMarks ?? -1} marks
                  </span>
                </div>
                {templateInfo?.hasCustom && (
                  <Badge variant="outline" className="text-xs">
                    Your custom template
                  </Badge>
                )}
              </div>
            ) : null}

            <Link
              to="/educator/dpp/template"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Settings className="h-3 w-3" /> Edit my DPP template
            </Link>

            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <div className="flex gap-2">
                {["easy", "medium", "hard"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 rounded-md border py-2 text-sm font-medium capitalize transition-colors ${
                      difficulty === d
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Number of Questions</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={5}
                  max={50}
                  value={numQuestions}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) setNumQuestions(val);
                  }}
                  className="w-24 bg-background text-foreground"
                />
                <span className="text-xs text-muted-foreground">
                  Specify how many questions to generate (5 - 50)
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: When ── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule Timing &amp; Batches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Time of Day</Label>
              <Input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                DPP generated daily at this time (your timezone)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Target Batches</Label>
              {batches.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {courseId
                    ? "No batches found for selected course"
                    : "Select content from a single course to see batches"}
                </p>
              ) : (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                  {batches.map((b) => (
                    <label
                      key={b.id}
                      className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-muted"
                    >
                      <Checkbox
                        checked={selectedBatchIds.has(b.id)}
                        onCheckedChange={() => toggleBatch(b.id)}
                      />
                      <span className="text-sm">{b.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Topic Rotation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>
                  Topic Rotation{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                {topicRotation.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Rotates every {topicRotation.length} day(s)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add topic to rotation..."
                  value={rotationInput}
                  onChange={(e) => setRotationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && rotationInput.trim()) {
                      setTopicRotation((p) => [...p, rotationInput.trim()]);
                      setRotationInput("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (rotationInput.trim()) {
                      setTopicRotation((p) => [...p, rotationInput.trim()]);
                      setRotationInput("");
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {topicRotation.length > 0 && (
                <div className="space-y-1">
                  {topicRotation.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1 text-sm"
                    >
                      <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                      <span className="flex-1">{t}</span>
                      <button
                        onClick={() => setTopicRotation((p) => p.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {topicRotation.length === 0
                  ? "If left empty, AI picks the topic each day from your content"
                  : `Day 1 → ${topicRotation[0]}, Day 2 → ${topicRotation[1] ?? topicRotation[0]}, …`}
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" disabled={!step3Valid || saving} onClick={handleSave}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <CalendarClock className="mr-2 h-4 w-4" /> Activate Schedule
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DppGenerator() {
  const { firebaseUser } = useAuth();
  const educatorUid = firebaseUser?.uid || "";
  const { features, loading: featuresLoading } = useEducatorFeatures(educatorUid);

  const [content, setContent] = useState<ContentItem[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);
  const [dpps, setDpps] = useState<DppRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [usageToday, setUsageToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(3);

  // Courses List for direct upload dropdown
  type CourseOption = {
    courseId: string;
    courseName: string;
    branchId: string;
    branchName: string;
  };
  const [coursesList, setCoursesList] = useState<CourseOption[]>([]);

  // Generate-now state
  const [genSource, setGenSource] = useState<SourceMode>("hybrid");
  const [genSelectedIds, setGenSelectedIds] = useState<Set<string>>(new Set());
  const [genTopicFilters, setGenTopicFilters] = useState<string[]>([]);
  const [genSubject, setGenSubject] = useState("");
  const [genChapter, setGenChapter] = useState("");
  const [genTopicInput, setGenTopicInput] = useState("");
  const [genDifficulty, setGenDifficulty] = useState("medium");
  const [genTopicHint, setGenTopicHint] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genNumQuestions, setGenNumQuestions] = useState<number>(10);

  const [view, setView] = useState<"generate" | "schedule">("generate");

  // ── Load content ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!educatorUid) return;
    setLoadingContent(true);
    const items: ContentItem[] = [];
    const uniqueCourses: CourseOption[] = [];
    const seenCourseKeys = new Set<string>();

    getDocs(collection(db, "educators", educatorUid, "branches"))
      .then(async (branchSnap) => {
        for (const bDoc of branchSnap.docs) {
          const branchName = (bDoc.data() as any).name || bDoc.id;
          const courseSnap = await getDocs(
            collection(db, "educators", educatorUid, "branches", bDoc.id, "courses")
          );
          for (const cDoc of courseSnap.docs) {
            const courseName = (cDoc.data() as any).name || cDoc.id;
            const courseKey = `${bDoc.id}::${cDoc.id}`;
            if (!seenCourseKeys.has(courseKey)) {
              seenCourseKeys.add(courseKey);
              uniqueCourses.push({
                courseId: cDoc.id,
                courseName,
                branchId: bDoc.id,
                branchName,
              });
            }

            const contentSnap = await getDocs(
              collection(
                db,
                "educators",
                educatorUid,
                "branches",
                bDoc.id,
                "courses",
                cDoc.id,
                "content"
              )
            );
            for (const ctDoc of contentSnap.docs) {
              const d = ctDoc.data() as any;
              items.push({
                id: ctDoc.id,
                title: d.title || ctDoc.id,
                type: d.type || "book",
                courseId: cDoc.id,
                courseName,
                branchId: bDoc.id,
                branchName,
              });
            }
          }
        }
      })
      .catch(() => toast.error("Failed to load content"))
      .finally(() => {
        setContent(items);
        setCoursesList(uniqueCourses);
        setLoadingContent(false);
      });
  }, [educatorUid]);

  // ── Realtime DPP listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!educatorUid) return;
    return onSnapshot(
      query(
        collection(db, "educators", educatorUid, "dpps"),
        orderBy("generatedAt", "desc"),
        limit(10)
      ),
      (snap) => setDpps(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, [educatorUid]);

  // ── Load usage + schedules ─────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then((token: string) => {
      fetch(`${MONKEY_KING}/api/dpp/usage`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          setUsageToday(d.usedToday ?? 0);
          setDailyLimit(d.dailyLimit ?? 3);
        })
        .catch(() => {});
    });
  }, [firebaseUser, dpps.length]);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoadingSchedules(true);
    firebaseUser.getIdToken().then((token: string) => {
      fetch(`${MONKEY_KING}/api/dpp/schedules`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setSchedules(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setLoadingSchedules(false));
    });
  }, [firebaseUser]);

  // ── Generate-now helpers ───────────────────────────────────────────────────
  const genSelectedContent = content.filter((c) => genSelectedIds.has(c.id));
  const genCourseIds = [...new Set(genSelectedContent.map((c) => c.courseId))];
  const genCourseId = genCourseIds.length === 1 ? genCourseIds[0] : "";

  const canGenerate =
    !generating &&
    usageToday < dailyLimit &&
    ((genSource === "ai_only" && genSelectedIds.size > 0 && genCourseIds.length === 1) ||
      (genSource === "qb_only" && (genTopicFilters.length > 0 || genSubject)) ||
      (genSource === "hybrid" &&
        (genSelectedIds.size > 0 || genTopicFilters.length > 0 || genSubject)));

  const handleGenerate = async () => {
    if (!canGenerate || !firebaseUser) return;
    setGenerating(true);
    console.log("Generating DPP with payload:", {
      content_ids: [...genSelectedIds],
      content_titles: genSelectedContent.map((c) => c.title),
      difficulty: genDifficulty,
      course_id: genCourseId,
      topic_hint: genTopicHint.trim(),
      source_mode: genSource,
      topic_filters: genTopicFilters,
      subject_filter: genSubject,
      chapter_filter: genChapter,
      question_count: genNumQuestions,
      num_questions: genNumQuestions,
      questionCount: genNumQuestions,
    });
    try {
      const res = await apiFetch(firebaseUser, "/api/dpp/generate", {
        method: "POST",
        body: JSON.stringify({
          content_ids: [...genSelectedIds],
          content_titles: genSelectedContent.map((c) => c.title),
          difficulty: genDifficulty,
          course_id: genCourseId,
          topic_hint: genTopicHint.trim(),
          source_mode: genSource,
          topic_filters: genTopicFilters,
          subject_filter: genSubject,
          chapter_filter: genChapter,
          question_count: genNumQuestions,
          num_questions: genNumQuestions,
          questionCount: genNumQuestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Generation failed");
      toast.success("DPP generation started — check the list below");
      setGenSelectedIds(new Set());
      setGenTopicHint("");
      setUsageToday((p) => p + 1);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate DPP");
    } finally {
      setGenerating(false);
    }
  };

  const toggleScheduleActive = async (schedId: string, current: boolean) => {
    if (!firebaseUser) return;
    try {
      const res = await apiFetch(firebaseUser, `/api/dpp/schedules/${schedId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !current }),
      });
      if (!res.ok) throw new Error();
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedId ? { ...s, isActive: !current } : s))
      );
    } catch {
      toast.error("Failed to update schedule");
    }
  };

  const deleteSchedule = async (schedId: string) => {
    if (!firebaseUser) return;
    try {
      const res = await apiFetch(firebaseUser, `/api/dpp/schedules/${schedId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setSchedules((prev) => prev.filter((s) => s.id !== schedId));
      toast.success("Schedule deleted");
    } catch {
      toast.error("Failed to delete schedule");
    }
  };

  // ── Plan gate ──────────────────────────────────────────────────────────────
  if (!featuresLoading && !features.dpp) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">DPP Generator not included in your plan</h2>
        <p className="max-w-sm text-muted-foreground">
          Upgrade to generate AI-powered daily practice papers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Zap className="h-6 w-6 text-primary" /> DPP Generator
          </h1>
          <p className="text-sm text-muted-foreground">Daily practice papers for your students</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === "generate" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("generate")}
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Generate Now
          </Button>
          <Button
            variant={view === "schedule" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("schedule")}
          >
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Schedule
            {schedules.filter((s) => s.isActive).length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {schedules.filter((s) => s.isActive).length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* ── Generate Now ── */}
      {view === "generate" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Source</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {usageToday}/{dailyLimit} used today
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {(["ai_only", "qb_only", "hybrid"] as SourceMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setGenSource(m)}
                      className={`flex-1 rounded-md border py-2 text-xs font-medium transition-colors ${
                        genSource === m
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {m === "ai_only" ? "AI" : m === "qb_only" ? "QB" : "Hybrid"}
                    </button>
                  ))}
                </div>

                {(genSource === "ai_only" || genSource === "hybrid") && (
                  <ContentPicker
                    content={content}
                    loading={loadingContent}
                    selectedIds={genSelectedIds}
                    onToggle={(id) =>
                      setGenSelectedIds((p) => {
                        const n = new Set(p);
                        if (n.has(id)) n.delete(id);
                        else n.add(id);
                        return n;
                      })
                    }
                    singleCourseOnly
                    coursesList={coursesList}
                    educatorUid={educatorUid}
                    onUploadSuccess={(newItem) => setContent((prev) => [newItem, ...prev])}
                  />
                )}

                {(genSource === "qb_only" || genSource === "hybrid") && (
                  <div className="space-y-2">
                    <Input
                      placeholder="Subject (optional)"
                      value={genSubject}
                      onChange={(e) => setGenSubject(e.target.value)}
                    />
                    <Input
                      placeholder="Chapter (optional)"
                      value={genChapter}
                      onChange={(e) => setGenChapter(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Topic filter (Enter to add)"
                        value={genTopicInput}
                        onChange={(e) => setGenTopicInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && genTopicInput.trim()) {
                            setGenTopicFilters((p) => [...p, genTopicInput.trim()]);
                            setGenTopicInput("");
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (genTopicInput.trim()) {
                            setGenTopicFilters((p) => [...p, genTopicInput.trim()]);
                            setGenTopicInput("");
                          }
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    {genTopicFilters.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {genTopicFilters.map((t) => (
                          <Badge key={t} variant="secondary" className="gap-1 text-xs">
                            {t}
                            <button
                              onClick={() => setGenTopicFilters((p) => p.filter((x) => x !== t))}
                              className="hover:text-destructive"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <div className="flex gap-2">
                    {["easy", "medium", "hard"].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setGenDifficulty(d)}
                        className={`flex-1 rounded-md border py-1.5 text-xs font-medium capitalize transition-colors ${
                          genDifficulty === d
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Number of Questions</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={5}
                      max={50}
                      value={genNumQuestions}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) setGenNumQuestions(val);
                      }}
                      className="w-24 bg-background text-foreground"
                    />
                    <span className="text-xs text-muted-foreground">
                      Specify how many questions to generate (5 - 50)
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>
                    Topic hint <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    placeholder="e.g. Newton's Laws, Chapter 3"
                    value={genTopicHint}
                    onChange={(e) => setGenTopicHint(e.target.value)}
                  />
                </div>

                {usageToday >= dailyLimit && (
                  <p className="text-sm text-destructive">
                    Daily limit reached ({dailyLimit}/day). Try again tomorrow.
                  </p>
                )}

                <Button className="w-full" onClick={handleGenerate} disabled={!canGenerate}>
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" /> Generate DPP
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Link
              to="/educator/dpp/template"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" /> Edit my DPP template
            </Link>
          </div>

          {/* DPP history */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Recent DPPs</h2>
            {dpps.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No DPPs generated yet.
                </CardContent>
              </Card>
            ) : (
              dpps.map((dpp) => (
                <Card key={dpp.id}>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{dpp.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {dpp.contentTitles?.join(", ") || ""}
                        </p>
                      </div>
                      <StatusBadge status={dpp.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs capitalize">
                        {dpp.difficulty}
                      </Badge>
                      <SourceLabel mode={dpp.sourceMode} />
                      <span>{new Date(dpp.generatedAt).toLocaleString()}</span>
                    </div>
                    {dpp.status === "failed" && dpp.errorMessage && (
                      <p className="text-xs text-destructive">{dpp.errorMessage}</p>
                    )}
                    {dpp.status === "ready" && dpp.testId && (
                      <Link
                        to={`/educator/test-series/${dpp.testId}/questions`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> View &amp; Edit Questions
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Schedule View ── */}
      {view === "schedule" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ScheduleWizard
            content={content}
            loadingContent={loadingContent}
            firebaseUser={firebaseUser}
            educatorUid={educatorUid}
            onCreated={(s) => setSchedules((prev) => [s, ...prev])}
            coursesList={coursesList}
            onUploadSuccess={(newItem) => setContent((prev) => [newItem, ...prev])}
          />

          <div className="space-y-3">
            <h2 className="text-base font-semibold">
              Active Schedules
              {schedules.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({schedules.length})
                </span>
              )}
            </h2>
            {loadingSchedules ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : schedules.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No schedules yet. Create one to auto-publish DPPs daily.
                </CardContent>
              </Card>
            ) : (
              schedules.map((s) => (
                <Card key={s.id}>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {s.topicFilters?.length
                            ? s.topicFilters.join(", ")
                            : s.contentTitles?.join(", ") || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.startDate} → {s.endDate} at {s.timeOfDay}
                        </p>
                      </div>
                      <Badge
                        variant={s.isActive ? "default" : "secondary"}
                        className="shrink-0 text-xs"
                      >
                        {s.isActive ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs capitalize">
                        {s.difficulty}
                      </Badge>
                      <SourceLabel mode={s.sourceMode} />
                      <span>{s.targetBatches?.length ?? 0} batch(es)</span>
                      {s.topicRotation?.length ? (
                        <span>
                          <RotateCcw className="mr-0.5 inline h-3 w-3" />
                          {s.topicRotation.length} topics
                        </span>
                      ) : null}
                      {s.lastRunDate && <span>Last: {s.lastRunDate}</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toggleScheduleActive(s.id, s.isActive)}
                      >
                        {s.isActive ? (
                          <>
                            <Pause className="mr-1 h-3 w-3" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="mr-1 h-3 w-3" /> Resume
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => deleteSchedule(s.id)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
