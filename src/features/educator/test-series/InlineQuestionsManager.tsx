import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  GripVertical,
  Search,
  Plus,
  Trash2,
  Loader2,
  X,
  CheckCircle2,
  FileUp,
  ChevronDown,
  ChevronRight,
  Flag,
} from "lucide-react";

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Label } from "@shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Switch } from "@shared/ui/switch";
import { toast } from "sonner";
import ReactCrop, { type Crop, type PercentCrop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import AiQuestionImportOverlay from "@features/educator/components/AiQuestionImportOverlay";
import ImageTextarea from "@features/educator/components/ImageTextarea";
import InlineStatusTracker from "@features/educator/components/InlineStatusTracker";
import {
  buildImportedQuestionPayload,
  formatNegativeMarksDisplay,
  importQuestionsFromPdf,
  type AiImportPreviewItem,
  type AiImportSummary,
  type PageProgressUpdate,
} from "@shared/lib/aiQuestionImport";
import { aiFeatureFlags, getAiFeatureDisabledMessage } from "@shared/lib/aiFeatureFlags";
import { HtmlView } from "@shared/lib/safeHtml";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import QuestionActionHoverWrapper from "@shared/components/QuestionActionHoverWrapper";

// Firebase
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  addDoc,
  CollectionReference,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";

// ------------------------------
// Sub-component: Educator Questions Manager (manual only)
// Works for both imported admin tests and educator custom tests.
// IMPORTANT: No question-bank import here.
// ------------------------------

type Difficulty = "easy" | "medium" | "hard";

type TestSection = {
  id: string;
  sectionId?: string;
  name: string;
  title?: string;
  questionsCount?: number | null;
  questionCount?: number | null;
  attemptlimit?: number | null;
  attemptCount?: number | null;
  markingScheme?: {
    correct: number;
    wrong: number;
    unattempted: number;
    partial: number;
  } | null;
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

type TestQuestion = {
  id: string;
  questionOrder?: number;

  // Stored schema (admin-compatible)
  question: string; // can be plain text OR HTML
  options: string[]; // can be plain text OR HTML strings
  correctOption: number; // index
  explanation?: string; // plain/HTML

  difficulty: Difficulty;
  subject?: string;
  topics?: string[];
  topic?: string; // legacy
  chapter?: string;
  examTags?: string[];
  questionType?: string;
  language?: string[];

  marks?: number; // positive marks
  negativeMarks?: number;

  isActive?: boolean;

  // AI import metadata
  source?: "ai_import" | "ai_import_partial" | string;
  importStatus?: "ready" | "partial";
  reviewRequired?: boolean;
  importIssues?: string[];
  importSourceIndex?: number;
  rawImportBlock?: string;
  questionImageUrl?: string;

  // Section support
  sectionId?: string;

  createdAt?: any;
  updatedAt?: any;
};

function normalizeSections(rawSections: any, subjectFallback?: string): TestSection[] {
  const parsed = Array.isArray(rawSections)
    ? rawSections
        .map((section: any, index: number) => ({
          id: String(section?.id || `sec_${index + 1}`).trim(),
          name: String(section?.name || `Section ${index + 1}`).trim(),
          questionsCount:
            section?.questionsCount != null && Number.isFinite(Number(section.questionsCount))
              ? Number(section.questionsCount)
              : null,
        }))
        .filter((section) => section.id)
    : [];

  if (parsed.length > 0) return parsed;

  return [
    {
      id: "main",
      name: String(subjectFallback || "General").trim() || "General",
      questionsCount: null,
    },
  ];
}

function resolveSectionId(sectionId: string | undefined, sections: TestSection[]): string {
  const fallback = sections[0]?.id || "main";
  const normalized = String(sectionId || "").trim();
  if (!normalized) return fallback;
  return sections.some((section) => section.id === normalized) ? normalized : fallback;
}

type EditorDraftSnapshot = {
  question: string;
  options: string[];
  correct: number;
  difficulty: Difficulty;
  subject: string;
  chapter: string;
  topic: string;
  marks: string;
  negativeMarks: string;
  active: boolean;
};

type PendingEditorAction =
  | { type: "close-manager" }
  | { type: "close-editor" }
  | { type: "open-new"; sectionId?: string }
  | { type: "open-edit"; question: TestQuestion };

type PreviewCropTarget =
  | { kind: "question"; imageIndex: number }
  | { kind: "option"; optionIndex: number; imageIndex: number };

function normalizeOptionsForSnapshot(options: string[] = []) {
  const normalized = options.slice(0, 6).map((value) => String(value ?? ""));
  while (normalized.length < 4) normalized.push("");
  return normalized;
}

function buildSnapshotFromQuestion(question?: TestQuestion): EditorDraftSnapshot {
  if (!question) {
    return {
      question: "",
      options: ["", "", "", ""],
      correct: 0,
      difficulty: "medium",
      subject: "",
      chapter: "",
      topic: "",
      marks: "",
      negativeMarks: "",
      active: true,
    };
  }

  const options = normalizeOptionsForSnapshot(question.options || []);
  const parsedCorrect = Number.isFinite(question.correctOption) ? question.correctOption : 0;

  return {
    question: question.question || "",
    options,
    correct: Math.min(Math.max(0, parsedCorrect), options.length - 1),
    difficulty: question.difficulty || "medium",
    subject: question.subject || "",
    chapter: question.chapter || "",
    topic: question.topic || "",
    marks: question.marks != null ? String(question.marks) : "",
    negativeMarks: question.negativeMarks != null ? String(question.negativeMarks) : "",
    active: isQuestionPublished(question.isActive),
  };
}

function areSnapshotsEqual(a: EditorDraftSnapshot, b: EditorDraftSnapshot) {
  if (a.question !== b.question) return false;
  if (a.correct !== b.correct) return false;
  if (a.difficulty !== b.difficulty) return false;
  if (a.subject !== b.subject) return false;
  if (a.chapter !== b.chapter) return false;
  if (a.topic !== b.topic) return false;
  if (a.marks !== b.marks) return false;
  if (a.negativeMarks !== b.negativeMarks) return false;
  if (a.active !== b.active) return false;
  if (a.options.length !== b.options.length) return false;
  for (let i = 0; i < a.options.length; i += 1) {
    if (a.options[i] !== b.options[i]) return false;
  }
  return true;
}

function stripHtml(input: string) {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const IMG_TAG_REGEX = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;

function splitPreviewContent(raw: string): { text: string; imageUrls: string[] } {
  if (!raw) return { text: "", imageUrls: [] };

  const imageUrls: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(IMG_TAG_REGEX.source, "gi");

  while ((match = regex.exec(raw)) !== null) {
    if (match[1]) imageUrls.push(match[1]);
  }

  const text = raw
    .replace(new RegExp(IMG_TAG_REGEX.source, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, imageUrls };
}

function hasPreviewContent(raw: string) {
  if (!raw) return false;
  const imageRegex = new RegExp(IMG_TAG_REGEX.source, "gi");
  if (imageRegex.test(raw)) return true;
  return (
    raw
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim().length > 0
  );
}

function combinePreviewContent(text: string, imageUrls: string[]) {
  if (imageUrls.length === 0) return text;
  const tags = imageUrls.map((url) => `<img src="${url}" alt="" />`).join("\n");
  if (!text) return tags;
  return text.endsWith("\n") ? `${text}${tags}` : `${text}\n${tags}`;
}

function isQuestionPublished(isActive?: boolean) {
  return isActive !== false;
}

function getPublishStatusLabel(isActive?: boolean) {
  return isQuestionPublished(isActive) ? "Published" : "Draft";
}

type SortableQuestionListItemProps = {
  q: TestQuestion;
  displayOrder: number;
  dragDisabled: boolean;
  hideDragHandle?: boolean;
  readOnly: boolean;
  onOpenEdit: (q: TestQuestion) => void;
  onDuplicate: (q: TestQuestion) => void;
  onDelete: (id: string) => void;
  onToggleActive: (q: TestQuestion, next: boolean) => void;
  contextId?: string;
  isReported?: boolean;
};

// Question Card

function SortableQuestionListItem({
  q,
  displayOrder,
  dragDisabled,
  hideDragHandle,
  readOnly,
  onOpenEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
  contextId,
  isReported,
}: SortableQuestionListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isPublished = isQuestionPublished(q.isActive);
  const publishLabel = getPublishStatusLabel(q.isActive);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onOpenEdit(q)}
      className={`cursor-pointer rounded-xl border bg-card p-3 text-sm transition-colors hover:bg-gray-300/10 ${isDragging ? "opacity-70" : ""}`}
    >
      <QuestionActionHoverWrapper
        questionId={q.id}
        contextId="manager"
        questionContent={q.question}
      >
        <div className="flex items-start gap-2">
          {/* Drag Handle */}
          {readOnly || hideDragHandle ? (
            <div className="h-7 w-7 shrink-0" />
          ) : (
            <Button
              data-drag-handle
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 h-7 w-7 shrink-0 cursor-grab rounded-lg text-muted-foreground active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
              disabled={dragDisabled}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
          )}

          {/* Content */}
          <div className="w-full min-w-0">
            {/* Question + Delete */}
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  {/* Q Number */}
                  <span className="shrink-0 text-muted-foreground">Q{displayOrder}:</span>

                  {/* Question */}
                  <div className="min-w-0 flex-1 overflow-hidden">
                    {hasPreviewContent(q.question || "") ? (
                      <HtmlView
                        html={q.question || ""}
                        className="line-clamp-1 break-words text-sm [&_img]:hidden [&_p]:m-0"
                      />
                    ) : (
                      <p className="truncate text-sm text-muted-foreground">(empty)</p>
                    )}
                  </div>
                </div>
              </div>

              {!readOnly ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-xl text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(q.id);
                  }}
                  aria-label="Delete question"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            {/* Meta */}
            <div className="mt-2 flex w-full flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="rounded-full text-[10px]">
                  {(q.difficulty || "medium").toUpperCase()}
                </Badge>

                <Badge variant="outline" className="rounded-full text-[10px]">
                  +{q.marks ?? "-"} / {formatNegativeMarksDisplay(q.negativeMarks)}
                </Badge>

                {q.source === "ai_import" && (
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    AI
                  </Badge>
                )}

                {q.source === "ai_import_partial" && (
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    AI Draft
                  </Badge>
                )}

                {isPublished ? (
                  <Badge className="rounded-full text-[10px]">Published</Badge>
                ) : (
                  <Badge variant="destructive" className="rounded-full text-[10px]">
                    Draft
                  </Badge>
                )}
                {isReported && (
                  <Badge
                    variant="destructive"
                    className="flex items-center gap-1 rounded-full text-[10px]"
                  >
                    <Flag className="h-3 w-3" /> Reported
                  </Badge>
                )}
              </div>

              {!readOnly ? (
                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Switch
                    checked={isPublished}
                    onCheckedChange={(checked) => onToggleActive(q, checked)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </QuestionActionHoverWrapper>
    </div>
  );
}

type SortableSectionCardProps = {
  section: TestSection;
  index: number;
  questions: TestQuestion[];
  collapsed: boolean;
  readOnly: boolean;
  questionDndEnabled: boolean;
  totalQuestionCount: number;
  questionLimit: number | null;
  onToggleCollapse: (sectionId: string) => void;
  onRename: (sectionId: string, name: string) => void;
  onDelete: (sectionId: string) => void;
  onAddQuestion: (sectionId: string) => void;
  onOpenEdit: (q: TestQuestion) => void;
  onDuplicate: (q: TestQuestion) => void;
  onDeleteQuestion: (id: string) => void;
  onToggleActive: (q: TestQuestion, next: boolean) => void;
  contextId?: string;
  reportedQuestionIds?: Set<string>;
};

function SortableSectionCard({
  section,
  index,
  questions,
  collapsed,
  readOnly,
  questionDndEnabled,
  totalQuestionCount,
  questionLimit,
  onToggleCollapse,
  onRename,
  onDelete,
  onAddQuestion,
  onOpenEdit,
  onDuplicate,
  onDeleteQuestion,
  onToggleActive,
  contextId,
  reportedQuestionIds,
}: SortableSectionCardProps) {
  const [draftName, setDraftName] = useState(section.name);

  useEffect(() => {
    setDraftName(section.name);
  }, [section.name]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const sectionDropId = `section-drop:${section.id}`;
  const { setNodeRef: setDropZoneRef, isOver: isDropZoneOver } = useDroppable({
    id: sectionDropId,
    disabled: !questionDndEnabled,
  });
  const isAtCapacity = questionLimit != null && totalQuestionCount >= questionLimit;

  // Section Card
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border bg-background ${isDragging ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {readOnly ? (
            <div className="h-9 w-9 shrink-0" />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 cursor-grab rounded-xl text-muted-foreground active:cursor-grabbing"
              onClick={(event) => event.stopPropagation()}
              aria-label="Drag section"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary"> {section.name} </Badge>
              <div className="flex items-center gap-2">
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => onAddQuestion(section.id)}
                    disabled={isAtCapacity}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3" /> Add Question
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => onToggleCollapse(section.id)}
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-xl text-destructive"
                    onClick={() => onDelete(section.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            {readOnly ? (
              <p className="truncate text-sm font-medium">
                {section.name || `Section ${index + 1}`}
              </p>
            ) : (
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => {
                  const nextName = draftName.trim() || `Section ${index + 1}`;
                  if (nextName !== section.name) {
                    onRename(section.id, nextName);
                  }
                }}
                placeholder={`Section ${index + 1}`}
                className="rounded-xl"
              />
            )}

            <p className="text-xs text-muted-foreground">
              {questionLimit != null
                ? `${totalQuestionCount} / ${questionLimit} questions`
                : `${totalQuestionCount} question${totalQuestionCount === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </div>

      {/* Questions Inside Section Card */}

      {!collapsed ? (
        <div
          ref={setDropZoneRef}
          className={`space-y-2 rounded-b-2xl p-4 transition-colors ${
            isDropZoneOver && questionDndEnabled ? "bg-primary/5" : ""
          }`}
        >
          {questions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
              <p>No questions in this section yet.</p>
              {!readOnly ? (
                <Button
                  type="button"
                  className="mt-3 rounded-xl"
                  onClick={() => onAddQuestion(section.id)}
                  disabled={isAtCapacity}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add first question
                </Button>
              ) : null}
            </div>
          ) : (
            <SortableContext
              items={questions.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {questions.map((question, questionIndex) => (
                  <SortableQuestionListItem
                    key={question.id}
                    q={question}
                    displayOrder={questionIndex + 1}
                    dragDisabled={!questionDndEnabled}
                    readOnly={readOnly}
                    onOpenEdit={onOpenEdit}
                    onDuplicate={onDuplicate}
                    onDelete={onDeleteQuestion}
                    onToggleActive={onToggleActive}
                    contextId={contextId}
                    isReported={reportedQuestionIds?.has(question.id)}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      ) : null}
    </div>
  );
}

const QuestionsManager = ({
  testId,
  testTitle,
  testSubject,
  testSections,
  educatorUid,
  onClose,
  mode = "modal",
  readOnly = false,
  questionSource = "educator",
  questionSourceTestId,
}: {
  testId: string;
  testTitle?: string;
  testSubject?: string;
  testSections?: TestSection[];
  educatorUid: string;
  onClose: () => void;
  mode?: "modal" | "page";
  readOnly?: boolean;
  questionSource?: "educator" | "admin";
  questionSourceTestId?: string;
}) => {
  const isPageMode = mode === "page";
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [reportedQuestionIds, setReportedQuestionIds] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formQuestion, setFormQuestion] = useState("");
  const [formOptions, setFormOptions] = useState<string[]>(["", "", "", ""]);
  const [formCorrect, setFormCorrect] = useState(0);
  const [formDifficulty, setFormDifficulty] = useState<Difficulty>("medium");
  const [formSectionId, setFormSectionId] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formChapter, setFormChapter] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formMarks, setFormMarks] = useState("");
  const [formNegMarks, setFormNegMarks] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [editingOriginalScoring, setEditingOriginalScoring] = useState<{
    correctOption?: number;
    marks?: number;
    negativeMarks?: number;
  } | null>(null);
  const [editorSnapshot, setEditorSnapshot] = useState<EditorDraftSnapshot | null>(null);
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false);
  const [pendingEditorAction, setPendingEditorAction] = useState<PendingEditorAction | null>(null);
  const [previewCropOpen, setPreviewCropOpen] = useState(false);
  const [previewCropTargetUrl, setPreviewCropTargetUrl] = useState<string | null>(null);
  const [previewCropTarget, setPreviewCropTarget] = useState<PreviewCropTarget | null>(null);
  const [previewCropSelection, setPreviewCropSelection] = useState<Crop>({
    unit: "%",
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });
  const [previewCropPixels, setPreviewCropPixels] = useState<PixelCrop | null>(null);
  const [previewCropping, setPreviewCropping] = useState(false);
  const previewCropImageRef = useRef<HTMLImageElement | null>(null);

  const [saving, setSaving] = useState(false);

  // Section-related state
  const [collapsedQSections, setCollapsedQSections] = useState<string[]>([]);
  const [managedSections, setManagedSections] = useState<TestSection[]>(() =>
    normalizeSections(testSections, testSubject)
  );
  const [newSectionName, setNewSectionName] = useState("");

  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [confirmPdfOpen, setConfirmPdfOpen] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [savingImported, setSavingImported] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importSummary, setImportSummary] = useState<AiImportSummary | null>(null);
  const [importItems, setImportItems] = useState<AiImportPreviewItem[]>([]);
  const [importProgressUpdates, setImportProgressUpdates] = useState<PageProgressUpdate[]>([]);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const importAbortControllerRef = useRef<AbortController | null>(null);
  const isAiPdfImportEnabled = aiFeatureFlags.pdfImport;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const resolvedQuestionSourceTestId = questionSourceTestId || testId;
  const qCol = useMemo(() => {
    if (questionSource === "admin") {
      return collection(db, "test_series", resolvedQuestionSourceTestId, "questions");
    }
    return collection(db, "educators", educatorUid, "my_tests", testId, "questions");
  }, [questionSource, resolvedQuestionSourceTestId, educatorUid, testId]);

  const selectedTestSections = useMemo(
    () => normalizeSections(testSections, testSubject),
    [testSections, testSubject]
  );

  async function syncTestQuestionCount() {
    if (readOnly || questionSource === "admin") return;
    try {
      const snap = await getDocs(qCol);
      let activeCount = 0;
      snap.forEach((item) => {
        if (isQuestionPublished(item.data()?.isActive)) activeCount += 1;
      });
      await updateDoc(doc(db, "educators", educatorUid, "my_tests", testId), {
        questionsCount: activeCount,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to sync question count", error);
    }
  }

  useEffect(() => {
    const unsub = onSnapshot(
      qCol,
      (snap) => {
        const rows = snap.docs.map((d) => normalizeQuestionDoc(d.id, d.data()));
        const sorted = sortQuestionsForDisplay(rows);
        setQuestions(sorted);
        setLoading(false);
      },
      () => {
        setLoading(false);
        toast.error("Failed to load questions");
      }
    );
    return () => unsub();
  }, [qCol, readOnly]);

  useEffect(() => {
    if (!importBusy) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!importAbortControllerRef.current) return;
      importAbortControllerRef.current.abort();
      event.preventDefault();
      event.returnValue = "AI import is in progress. Leaving will cancel it.";
    };

    const handlePageHide = () => {
      if (importAbortControllerRef.current) {
        importAbortControllerRef.current.abort();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [importBusy]);

  useEffect(() => {
    if (!editingId) return;
    const current = questions.find((q) => q.id === editingId);
    if (!current) return;
    setFormActive(isQuestionPublished(current.isActive));
  }, [editingId, questions]);

  useEffect(() => {
    setManagedSections(selectedTestSections);
  }, [selectedTestSections]);

  useEffect(() => {
    if (!managedSections.length) return;
    setCollapsedQSections((prev) =>
      prev.filter((sectionId) => managedSections.some((section) => section.id === sectionId))
    );
    setFormSectionId((current) => resolveSectionId(current, managedSections));
  }, [managedSections]);

  const filteredQuestions = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter((row) => {
      const hay =
        `${stripHtml(row.question)} ${stripHtml(row.explanation || "")} ${row.subject || ""} ${row.topic || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [questions, searchQ]);

  // Group filtered questions by section
  const questionsBySection = useMemo(() => {
    const map: Record<string, TestQuestion[]> = {};
    // Initialize all sections with empty arrays
    managedSections.forEach((section) => {
      map[section.id] = [];
    });
    // Distribute filtered questions into sections
    filteredQuestions.forEach((q) => {
      const sid = resolveSectionId(q.sectionId, managedSections);
      if (!map[sid]) map[sid] = [];
      map[sid].push(q);
    });
    return map;
  }, [filteredQuestions, managedSections]);

  const allQuestionsBySection = useMemo(() => {
    const map: Record<string, TestQuestion[]> = {};
    managedSections.forEach((section) => {
      map[section.id] = [];
    });
    questions.forEach((q) => {
      const sid = resolveSectionId(q.sectionId, managedSections);
      if (!map[sid]) map[sid] = [];
      map[sid].push(q);
    });
    return map;
  }, [questions, managedSections]);

  const sectionQuestionCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    managedSections.forEach((section) => {
      counts[section.id] = (allQuestionsBySection[section.id] || []).length;
    });
    return counts;
  }, [managedSections, allQuestionsBySection]);

  const sectionIdSet = useMemo(
    () => new Set(managedSections.map((section) => section.id)),
    [managedSections]
  );

  const previewOptions = useMemo(
    () =>
      formOptions
        .map((option, index) => ({ index, option }))
        .filter(({ option }) => hasPreviewContent(option || "")),
    [formOptions]
  );

  const questionPreviewParts = useMemo(
    () => splitPreviewContent(formQuestion || ""),
    [formQuestion]
  );

  const currentEditorSnapshot = useMemo<EditorDraftSnapshot>(
    () => ({
      question: formQuestion,
      options: normalizeOptionsForSnapshot(formOptions),
      correct: Number(formCorrect) || 0,
      difficulty: formDifficulty || "medium",
      subject: formSubject || "",
      chapter: formChapter || "",
      topic: formTopic || "",
      marks: formMarks,
      negativeMarks: formNegMarks,
      active: !!formActive,
    }),
    [
      formQuestion,
      formOptions,
      formCorrect,
      formDifficulty,
      formSubject,
      formChapter,
      formTopic,
      formMarks,
      formNegMarks,
      formActive,
    ]
  );

  const hasUnsavedQuestionChanges = useMemo(() => {
    if (!editorOpen || !editorSnapshot) return false;
    return !areSnapshotsEqual(editorSnapshot, currentEditorSnapshot);
  }, [editorOpen, editorSnapshot, currentEditorSnapshot]);

  const dndEnabled = !readOnly && searchQ.trim().length === 0;

  const questionNumberById = useMemo(() => {
    const numberMap = new Map<string, number>();
    questions.forEach((q, index) => {
      const persistedOrder = Number(q.questionOrder);
      const displayOrder =
        Number.isFinite(persistedOrder) && persistedOrder > 0 ? persistedOrder : index + 1;
      numberMap.set(q.id, displayOrder);
    });
    return numberMap;
  }, [questions]);

  function getNextQuestionOrder() {
    const maxOrder = questions.reduce((max, q) => {
      const n = Number(q.questionOrder);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    return maxOrder + 1;
  }

  function timestampToMillis(value: any) {
    if (!value) return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    return 0;
  }

  function sortQuestionsForDisplay(rows: TestQuestion[]) {
    return [...rows].sort((a, b) => {
      const aOrder = Number.isFinite(Number(a.questionOrder)) ? Number(a.questionOrder) : null;
      const bOrder = Number.isFinite(Number(b.questionOrder)) ? Number(b.questionOrder) : null;
      if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
      if (aOrder != null && bOrder == null) return -1;
      if (aOrder == null && bOrder != null) return 1;

      const aImportIndex = Number.isFinite(Number(a.importSourceIndex))
        ? Number(a.importSourceIndex)
        : null;
      const bImportIndex = Number.isFinite(Number(b.importSourceIndex))
        ? Number(b.importSourceIndex)
        : null;
      if (aImportIndex != null && bImportIndex != null && aImportIndex !== bImportIndex) {
        return aImportIndex - bImportIndex;
      }

      const aCreated = timestampToMillis(a.createdAt) || timestampToMillis(a.updatedAt);
      const bCreated = timestampToMillis(b.createdAt) || timestampToMillis(b.updatedAt);
      if (aCreated !== bCreated) return aCreated - bCreated;

      return a.id.localeCompare(b.id);
    });
  }

  function getSectionQuestionLimit(sectionId: string): number | null {
    const section = managedSections.find((item) => item.id === sectionId);
    const parsed = Number(section?.questionsCount);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  }

  function getSectionLabel(sectionId: string) {
    return managedSections.find((section) => section.id === sectionId)?.name || "Selected section";
  }

  function getSectionQuestionCount(
    sectionId: string,
    sourceQuestions: TestQuestion[],
    excludeQuestionId?: string
  ): number {
    return sourceQuestions.filter((question) => {
      if (excludeQuestionId && question.id === excludeQuestionId) return false;
      return resolveSectionId(question.sectionId, managedSections) === sectionId;
    }).length;
  }

  function getSectionCapacityError(
    sectionId: string,
    sourceQuestions: TestQuestion[],
    extraQuestions = 1,
    excludeQuestionId?: string
  ): string | null {
    const limit = getSectionQuestionLimit(sectionId);
    if (limit == null) return null;

    const currentCount = getSectionQuestionCount(sectionId, sourceQuestions, excludeQuestionId);
    if (currentCount + extraQuestions <= limit) return null;

    return `${getSectionLabel(sectionId)} already has ${limit} questions (limit reached).`;
  }

  async function resequenceQuestionOrders(remainingQuestions: TestQuestion[]) {
    const ordered = sortQuestionsForDisplay(remainingQuestions);
    const updates = ordered
      .map((q, index) => {
        const nextOrder = index + 1;
        const currentOrder = Number(q.questionOrder);
        return {
          id: q.id,
          nextOrder,
          currentOrder: Number.isFinite(currentOrder) ? currentOrder : null,
        };
      })
      .filter((item) => item.currentOrder !== item.nextOrder);

    if (!updates.length) return;

    const CHUNK_SIZE = 450;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      chunk.forEach((item) => {
        batch.update(doc(qCol, item.id), {
          questionOrder: item.nextOrder,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  }

  async function persistDraggedOrder(reordered: TestQuestion[], previousQuestions: TestQuestion[]) {
    try {
      setReordering(true);

      const previousById = new Map(previousQuestions.map((question) => [question.id, question]));

      const updates = reordered
        .map((q, index) => {
          const nextOrder = index + 1;
          const previous = previousById.get(q.id);
          const currentOrder = Number(previous?.questionOrder);
          const previousSectionId = resolveSectionId(previous?.sectionId, managedSections);
          const nextSectionId = resolveSectionId(q.sectionId, managedSections);
          return {
            id: q.id,
            nextOrder,
            currentOrder: Number.isFinite(currentOrder) ? currentOrder : null,
            nextSectionId,
            previousSectionId,
          };
        })
        .filter(
          (item) =>
            item.currentOrder !== item.nextOrder || item.previousSectionId !== item.nextSectionId
        );

      if (!updates.length) return;

      const CHUNK_SIZE = 450;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        chunk.forEach((item) => {
          batch.update(doc(qCol, item.id), {
            questionOrder: item.nextOrder,
            sectionId: item.nextSectionId,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to save question order");
    } finally {
      setReordering(false);
    }
  }

  async function handleQuestionDragEnd(event: DragEndEvent) {
    if (!dndEnabled || reordering) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (sectionIdSet.has(activeId)) return;

    const activeQuestion = questions.find((question) => question.id === activeId);
    if (!activeQuestion) return;

    let targetSectionId: string | null = null;
    if (overId.startsWith("section-drop:")) {
      targetSectionId = overId.slice("section-drop:".length);
    } else if (sectionIdSet.has(overId)) {
      targetSectionId = overId;
    } else {
      const overQuestion = questions.find((question) => question.id === overId);
      if (overQuestion) {
        targetSectionId = resolveSectionId(overQuestion.sectionId, managedSections);
      }
    }

    if (!targetSectionId || !sectionIdSet.has(targetSectionId)) return;

    const sourceSectionId = resolveSectionId(activeQuestion.sectionId, managedSections);
    if (sourceSectionId !== targetSectionId) {
      const capacityError = getSectionCapacityError(targetSectionId, questions, 1, activeId);
      if (capacityError) {
        toast.error(capacityError);
        return;
      }
    }

    const nextBySection: Record<string, TestQuestion[]> = {};
    managedSections.forEach((section) => {
      nextBySection[section.id] = [...(allQuestionsBySection[section.id] || [])];
    });

    const sourceList = nextBySection[sourceSectionId] || [];
    const sourceIndex = sourceList.findIndex((question) => question.id === activeId);
    if (sourceIndex < 0) return;

    const [movingQuestion] = sourceList.splice(sourceIndex, 1);
    const movedQuestion: TestQuestion = {
      ...movingQuestion,
      sectionId: targetSectionId,
    };

    const isOverQuestion = questions.some((question) => question.id === overId);

    if (sourceSectionId === targetSectionId) {
      if (isOverQuestion) {
        const overIndex = sourceList.findIndex((question) => question.id === overId);
        const insertIndex = overIndex >= 0 ? overIndex : sourceList.length;
        sourceList.splice(insertIndex, 0, movedQuestion);
      } else {
        sourceList.push(movedQuestion);
      }
      nextBySection[sourceSectionId] = sourceList;
    } else {
      const targetList = nextBySection[targetSectionId] || [];
      if (isOverQuestion) {
        const overIndex = targetList.findIndex((question) => question.id === overId);
        const insertIndex = overIndex >= 0 ? overIndex : targetList.length;
        targetList.splice(insertIndex, 0, movedQuestion);
      } else {
        targetList.push(movedQuestion);
      }
      nextBySection[sourceSectionId] = sourceList;
      nextBySection[targetSectionId] = targetList;
    }

    const finalOrdered = managedSections
      .flatMap((section) => nextBySection[section.id] || [])
      .map((question, index) => ({
        ...question,
        questionOrder: index + 1,
      }));

    setQuestions(finalOrdered);
    await persistDraggedOrder(finalOrdered, questions);
  }

  function handleCombinedDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (sectionIdSet.has(activeId)) {
      if (!sectionIdSet.has(overId)) return;
      handleSectionDragEnd(event);
      return;
    }

    void handleQuestionDragEnd(event);
  }

  function resetEditor(preferredSectionId?: string) {
    setEditingId(null);
    setFormQuestion("");
    setFormOptions(["", "", "", ""]);
    setFormCorrect(0);
    setFormDifficulty("medium");
    setFormSectionId(
      resolveSectionId(preferredSectionId || managedSections[0]?.id, managedSections)
    );
    setFormSubject("");
    setFormChapter("");
    setFormTopic("");
    setFormMarks("");
    setFormNegMarks("");
    setFormActive(true);
    setEditingOriginalScoring(null);
    setEditorSnapshot(null);
  }

  function addOptionField() {
    setFormOptions((prev) => (prev.length >= 6 ? prev : [...prev, ""]));
  }

  function removeOptionField(index: number) {
    setFormOptions((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, i) => i !== index);
      setFormCorrect((current) => {
        if (current === index) return 0;
        if (current > index) return current - 1;
        return Math.min(current, next.length - 1);
      });
      return next;
    });
  }

  function openNewDirect(sectionId?: string) {
    const resolvedSectionId = resolveSectionId(
      sectionId || managedSections[0]?.id,
      managedSections
    );
    resetEditor(resolvedSectionId);
    setEditorSnapshot(buildSnapshotFromQuestion());
    setEditorOpen(true);
  }

  function openEditDirect(q: TestQuestion) {
    setEditingId(q.id);
    setFormQuestion(q.question || "");
    const existingOptions = normalizeOptionsForSnapshot(q.options || []);
    setFormOptions(existingOptions);
    const parsedCorrect = Number.isFinite(q.correctOption) ? q.correctOption : 0;
    setFormCorrect(Math.min(Math.max(0, parsedCorrect), existingOptions.length - 1));
    setFormDifficulty(q.difficulty || "medium");
    setFormSectionId(resolveSectionId(q.sectionId, managedSections));
    setFormSubject(q.subject || "");
    setFormChapter(q.chapter || "");
    setFormTopic(q.topic || "");
    setFormMarks(q.marks != null ? String(q.marks) : "");
    setFormNegMarks(q.negativeMarks != null ? String(q.negativeMarks) : "");
    setFormActive(isQuestionPublished(q.isActive));
    setEditingOriginalScoring({
      correctOption: q.correctOption,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
    });
    setEditorSnapshot(buildSnapshotFromQuestion(q));
    setEditorOpen(true);
  }

  function runEditorAction(action: PendingEditorAction) {
    if (action.type === "close-manager") {
      onClose();
      return;
    }
    if (action.type === "close-editor") {
      setEditorOpen(false);
      resetEditor();
      return;
    }
    if (action.type === "open-new") {
      openNewDirect(action.sectionId);
      return;
    }
    if (action.type === "open-edit") {
      openEditDirect(action.question);
    }
  }

  function requestEditorAction(action: PendingEditorAction) {
    if (editorOpen && hasUnsavedQuestionChanges) {
      setPendingEditorAction(action);
      setUnsavedConfirmOpen(true);
      return;
    }
    runEditorAction(action);
  }

  function openNew() {
    if (readOnly) return;
    requestEditorAction({ type: "open-new", sectionId: managedSections[0]?.id || "main" });
  }

  async function addSection() {
    if (readOnly) return;

    const name = newSectionName.trim();
    if (!name) {
      toast.error("Section name is required");
      return;
    }

    const nextSections = [...managedSections, { id: uid("section"), name }];
    setManagedSections(nextSections);
    setNewSectionName("");

    try {
      await updateTestSections(nextSections);
      toast.success("Section added");
    } catch (error) {
      console.error(error);
      toast.error("Failed to add section");
    }
  }

  async function renameSection(sectionId: string, name: string) {
    if (readOnly) return;
    const nextSections = managedSections.map((section) =>
      section.id === sectionId ? { ...section, name } : section
    );
    setManagedSections(nextSections);
    try {
      await updateTestSections(nextSections);
    } catch (error) {
      console.error(error);
      toast.error("Failed to rename section");
    }
  }

  async function removeSection(sectionId: string) {
    if (readOnly) return;
    if (managedSections.length <= 1) {
      toast.error("At least one section is required");
      return;
    }

    if (!window.confirm("Delete this section? Questions in it will move to the first section."))
      return;

    const fallbackSectionId =
      managedSections.find((section) => section.id !== sectionId)?.id ||
      managedSections[0]?.id ||
      "main";
    const nextSections = managedSections.filter((section) => section.id !== sectionId);
    const nextQuestions = questions.map((question) =>
      resolveSectionId(question.sectionId, managedSections) === sectionId
        ? { ...question, sectionId: fallbackSectionId }
        : question
    );

    setManagedSections(nextSections);
    setQuestions(nextQuestions);

    try {
      await updateTestSections(nextSections);

      const batch = writeBatch(db);
      nextQuestions.forEach((question) => {
        batch.update(doc(qCol, question.id), {
          sectionId: question.sectionId || fallbackSectionId,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();

      await resequenceQuestionsForSections(nextSections, nextQuestions);
      toast.success("Section deleted");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete section");
    }
  }

  async function reorderSections(nextSections: TestSection[]) {
    if (readOnly) return;
    setManagedSections(nextSections);
    try {
      await updateTestSections(nextSections);
      await resequenceQuestionsForSections(nextSections, questions);
    } catch (error) {
      console.error(error);
      toast.error("Failed to reorder sections");
    }
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (!sectionIdSet.has(String(active.id)) || !sectionIdSet.has(String(over.id))) return;

    const oldIndex = managedSections.findIndex((section) => section.id === String(active.id));
    const newIndex = managedSections.findIndex((section) => section.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const nextSections = arrayMove(managedSections, oldIndex, newIndex);
    void reorderSections(nextSections);
  }

  function openNewInSection(sectionId: string) {
    if (readOnly) return;

    const capacityError = getSectionCapacityError(
      resolveSectionId(sectionId, managedSections),
      questions
    );
    if (capacityError) {
      toast.error(capacityError);
      return;
    }

    requestEditorAction({ type: "open-new", sectionId });
  }

  function openEdit(q: TestQuestion) {
    requestEditorAction({ type: "open-edit", question: q });
  }

  function requestCloseEditor() {
    requestEditorAction({ type: "close-editor" });
  }

  function requestCloseManager() {
    requestEditorAction({ type: "close-manager" });
  }

  function openPreviewCrop(target: PreviewCropTarget, imageUrl: string) {
    setPreviewCropTarget(target);
    setPreviewCropTargetUrl(imageUrl);
    setPreviewCropSelection({ unit: "%", x: 10, y: 10, width: 80, height: 80 });
    setPreviewCropPixels(null);
    setPreviewCropOpen(true);
  }

  function closePreviewCrop() {
    setPreviewCropOpen(false);
    setPreviewCropTarget(null);
    setPreviewCropTargetUrl(null);
    setPreviewCropPixels(null);
  }

  function handleQuestionPreviewImageClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target || target.tagName !== "IMG") return;
    const src = (target as HTMLImageElement).getAttribute("src") || "";
    if (!src) return;

    const imageIndex = questionPreviewParts.imageUrls.indexOf(src);
    if (imageIndex < 0) return;

    openPreviewCrop({ kind: "question", imageIndex }, src);
  }

  function handleOptionPreviewImageClick(
    optionIndex: number,
    optionRaw: string,
    event: React.MouseEvent<HTMLDivElement>
  ) {
    const target = event.target as HTMLElement;
    if (!target || target.tagName !== "IMG") return;
    const src = (target as HTMLImageElement).getAttribute("src") || "";
    if (!src) return;

    const optionParts = splitPreviewContent(optionRaw || "");
    const imageIndex = optionParts.imageUrls.indexOf(src);
    if (imageIndex < 0) return;

    openPreviewCrop({ kind: "option", optionIndex, imageIndex }, src);
  }

  async function createPreviewCroppedBlob(
    image: HTMLImageElement,
    pixelCrop: PixelCrop
  ): Promise<Blob> {
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const outWidth = Math.max(1, Math.floor(pixelCrop.width * scaleX));
    const outHeight = Math.max(1, Math.floor(pixelCrop.height * scaleY));

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create crop canvas");

    ctx.drawImage(
      image,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0,
      0,
      outWidth,
      outHeight
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((output) => resolve(output), "image/png", 1);
    });

    if (!blob) throw new Error("Failed to generate cropped image");
    return blob;
  }

  async function applyPreviewCrop() {
    if (
      !previewCropTarget ||
      !previewCropTargetUrl ||
      !previewCropPixels ||
      !previewCropImageRef.current
    ) {
      toast.error("Select a crop area first");
      return;
    }

    setPreviewCropping(true);
    try {
      const croppedBlob = await createPreviewCroppedBlob(
        previewCropImageRef.current,
        previewCropPixels
      );
      const folder = previewCropTarget.kind === "question" ? "/test-questions" : "/test-options";
      const fileName = `preview-crop-${Date.now()}.png`;
      const { url } = await uploadToImageKit(croppedBlob, fileName, folder, "website");

      if (previewCropTarget.kind === "question") {
        const current = splitPreviewContent(formQuestion || "");
        if (
          previewCropTarget.imageIndex < 0 ||
          previewCropTarget.imageIndex >= current.imageUrls.length
        ) {
          closePreviewCrop();
          return;
        }
        const nextUrls = [...current.imageUrls];
        nextUrls[previewCropTarget.imageIndex] = url;
        setFormQuestion(combinePreviewContent(current.text, nextUrls));
      } else {
        const optionValue = formOptions[previewCropTarget.optionIndex] || "";
        const current = splitPreviewContent(optionValue);
        if (
          previewCropTarget.imageIndex < 0 ||
          previewCropTarget.imageIndex >= current.imageUrls.length
        ) {
          closePreviewCrop();
          return;
        }
        const nextUrls = [...current.imageUrls];
        nextUrls[previewCropTarget.imageIndex] = url;
        const nextValue = combinePreviewContent(current.text, nextUrls);
        setFormOptions((prev) =>
          prev.map((opt, i) => (i === previewCropTarget.optionIndex ? nextValue : opt))
        );
      }

      toast.success("Image cropped");
      closePreviewCrop();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Image crop failed";
      console.error("[QuestionsManager preview crop error]", msg);
      toast.error(msg);
    } finally {
      setPreviewCropping(false);
    }
  }

  function safeNum(v: any, fb = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  function scoreResponses(
    qs: {
      correctOption?: number;
      correctAnswer?: any;
      marks?: number;
      positiveMarks?: number;
      negativeMarks?: number;
      type?: string;
    }[],
    responses: Record<string, { answer?: string | null }>
  ) {
    let score = 0,
      maxScore = 0,
      correctCount = 0,
      incorrectCount = 0;
    for (const q of qs) {
      const pos = safeNum((q as any).marks ?? (q as any).positiveMarks, 5);
      const neg = Math.abs(safeNum((q as any).negativeMarks, 1));
      maxScore += pos;
      const userAnswer = (responses[(q as any).id] as any)?.answer ?? null;
      if (userAnswer === null || userAnswer === undefined || String(userAnswer).trim() === "")
        continue;
      const isCorrect =
        (q as any).type === "integer"
          ? String(userAnswer).trim() === String((q as any).correctAnswer ?? "").trim()
          : String(userAnswer) === String(q.correctOption ?? 0);
      if (isCorrect) {
        score += pos;
        correctCount += 1;
      } else {
        score -= neg;
        incorrectCount += 1;
      }
    }
    const attempted = correctCount + incorrectCount;
    return {
      score,
      maxScore,
      accuracy: attempted > 0 ? correctCount / attempted : 0,
      correctCount,
      incorrectCount,
    };
  }

  async function recalculateAttemptsForTest(tid: string, questionsCol: CollectionReference) {
    const qSnap = await getDocs(questionsCol);
    const qs = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (!qs.length) return;

    const aSnap = await getDocs(query(collection(db, "attempts"), where("testId", "==", tid)));
    const submittedDocs = aSnap.docs.filter((d) => {
      const s = String(d.data().status || "").toLowerCase();
      return ["submitted", "completed", "finished", "done"].includes(s);
    });
    if (!submittedDocs.length) return;

    const chunks: (typeof aSnap.docs)[] = [];
    for (let i = 0; i < submittedDocs.length; i += 490)
      chunks.push(submittedDocs.slice(i, i + 490));

    for (const chunk of chunks) {
      const b = writeBatch(db);
      for (const aDoc of chunk) {
        const responses =
          (aDoc.data().responses as Record<string, { answer?: string | null }>) || {};
        const { score, maxScore, accuracy, correctCount, incorrectCount } = scoreResponses(
          qs,
          responses
        );
        b.update(aDoc.ref, {
          score,
          maxScore,
          accuracy,
          correctCount,
          incorrectCount,
          marksRecalculatedAt: serverTimestamp(),
        });
      }
      await b.commit();
    }
  }

  async function saveQuestion(): Promise<boolean> {
    if (readOnly) {
      toast.info("This test is read-only.");
      return false;
    }
    if (saving) return false;

    const trimmedQuestion = formQuestion.trim();
    const normalizedOptions = formOptions.slice(0, 6).map((value) => value ?? "");
    const nonEmptyOptions = normalizedOptions.filter((value) => value.trim() !== "");

    if (!trimmedQuestion) {
      toast.error("Question is required");
      return false;
    }
    if (nonEmptyOptions.length < 2) {
      toast.error("At least two options are required");
      return false;
    }
    if (!normalizedOptions[formCorrect] || normalizedOptions[formCorrect].trim() === "") {
      toast.error("Correct option cannot be empty");
      return false;
    }

    const targetSectionId = resolveSectionId(formSectionId, managedSections);
    if (!editingId) {
      const capacityError = getSectionCapacityError(targetSectionId, questions);
      if (capacityError) {
        toast.error(capacityError);
        return false;
      }
    } else {
      const editingQuestion = questions.find((question) => question.id === editingId);
      const existingSectionId = resolveSectionId(editingQuestion?.sectionId, managedSections);
      if (existingSectionId !== targetSectionId) {
        const capacityError = getSectionCapacityError(targetSectionId, questions, 1, editingId);
        if (capacityError) {
          toast.error(capacityError);
          return false;
        }
      }
    }

    const payload: any = {
      question: formQuestion,
      options: normalizedOptions,
      correctOption: Number(formCorrect) || 0,
      explanation: "",
      difficulty: formDifficulty || "medium",
      sectionId: targetSectionId,
      subject: formSubject || "",
      chapter: formChapter || "",
      topic: formTopic || "",
      isActive: !!formActive,
      updatedAt: serverTimestamp(),
    };

    if (formMarks.trim() !== "") payload.marks = Number(formMarks);
    else payload.marks = null;

    if (formNegMarks.trim() !== "") payload.negativeMarks = Number(formNegMarks);
    else payload.negativeMarks = null;

    setSaving(true);
    try {
      if (!editingId) {
        const newRef = await addDoc(qCol, {
          ...payload,
          questionOrder: getNextQuestionOrder(),
          createdAt: serverTimestamp(),
          source: "manual",
        });

        await resequenceQuestionsForSections(managedSections, [
          ...questions,
          {
            id: newRef.id,
            question: formQuestion,
            options: normalizedOptions,
            correctOption: Number(formCorrect) || 0,
            explanation: "",
            difficulty: formDifficulty || "medium",
            sectionId: targetSectionId,
            subject: formSubject || "",
            chapter: formChapter || "",
            topic: formTopic || "",
            marks: formMarks.trim() !== "" ? Number(formMarks) : undefined,
            negativeMarks: formNegMarks.trim() !== "" ? Number(formNegMarks) : undefined,
            isActive: !!formActive,
            questionOrder: getNextQuestionOrder(),
          } as TestQuestion,
        ]);

        toast.success("Question added");
      } else {
        await updateDoc(doc(qCol, editingId), payload);

        await resequenceQuestionsForSections(
          managedSections,
          questions.map((question) =>
            question.id === editingId
              ? {
                  ...question,
                  ...payload,
                }
              : question
          )
        );

        toast.success("Question updated");

        const scoringChanged =
          formCorrect !== editingOriginalScoring?.correctOption ||
          safeNum(formMarks, -1) !== safeNum(String(editingOriginalScoring?.marks ?? ""), -1) ||
          safeNum(formNegMarks, -1) !==
            safeNum(String(editingOriginalScoring?.negativeMarks ?? ""), -1);

        if (scoringChanged) {
          recalculateAttemptsForTest(testId, qCol).catch((err) => {
            console.error("Recalculation failed:", err);
            toast.error(`Score recalculation failed: ${err?.message || err}`);
          });
        }
      }
      await syncTestQuestionCount();
      setEditorOpen(false);
      resetEditor();
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndContinue() {
    if (!pendingEditorAction) {
      setUnsavedConfirmOpen(false);
      return;
    }

    const actionToRun = pendingEditorAction;
    const saved = await saveQuestion();
    if (!saved) return;

    setUnsavedConfirmOpen(false);
    setPendingEditorAction(null);
    runEditorAction(actionToRun);
  }

  function handleExitWithoutSaving() {
    if (!pendingEditorAction) {
      setUnsavedConfirmOpen(false);
      return;
    }
    const actionToRun = pendingEditorAction;
    setUnsavedConfirmOpen(false);
    setPendingEditorAction(null);
    runEditorAction(actionToRun);
  }

  async function deleteQuestion(id: string) {
    if (readOnly) {
      toast.info("This test is read-only.");
      return;
    }
    if (!confirm("Delete this question?")) return;
    try {
      await deleteDoc(doc(qCol, id));
      const remaining = questions.filter((q) => q.id !== id);
      await resequenceQuestionOrders(remaining);
      setQuestions(
        sortQuestionsForDisplay(remaining).map((q, index) => ({
          ...q,
          questionOrder: index + 1,
        }))
      );
      await syncTestQuestionCount();
      toast.success("Deleted");
      if (editingId === id) {
        setEditorOpen(false);
        resetEditor();
      }
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  }

  async function duplicateQuestion(q: TestQuestion) {
    if (readOnly) {
      toast.info("This test is read-only.");
      return;
    }

    const targetSectionId = resolveSectionId(q.sectionId, managedSections);
    const capacityError = getSectionCapacityError(targetSectionId, questions);
    if (capacityError) {
      toast.error(capacityError);
      return;
    }

    try {
      const newDocRef = await addDoc(qCol, {
        questionOrder: getNextQuestionOrder(),
        question: q.question,
        options: q.options || ["", "", "", ""],
        correctOption: q.correctOption ?? 0,
        explanation: q.explanation || "",
        difficulty: q.difficulty || "medium",
        sectionId: targetSectionId,
        subject: q.subject || "",
        chapter: q.chapter || "",
        topic: q.topic || "",
        marks: q.marks ?? 1,
        negativeMarks: q.negativeMarks ?? 0,
        isActive: isQuestionPublished(q.isActive),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: "manual",
        duplicatedAt: serverTimestamp(),
      });
      await resequenceQuestionsForSections(managedSections, [
        ...questions,
        {
          ...q,
          id: newDocRef.id,
          sectionId: targetSectionId,
          questionOrder: getNextQuestionOrder(),
        },
      ]);
      await syncTestQuestionCount();
      toast.success("Duplicated");
    } catch (e) {
      console.error(e);
      toast.error("Duplicate failed");
    }
  }

  async function updateQuestionPublishState(
    questionId: string,
    next: boolean,
    previous: boolean,
    showToast = true
  ) {
    setQuestions((prev) =>
      prev.map((item) => (item.id === questionId ? { ...item, isActive: next } : item))
    );
    if (editingId === questionId) setFormActive(next);

    try {
      await updateDoc(doc(qCol, questionId), { isActive: next, updatedAt: serverTimestamp() });
      await syncTestQuestionCount();
      if (showToast) {
        toast.success(next ? "Question published" : "Question moved to draft");
      }
    } catch (e) {
      setQuestions((prev) =>
        prev.map((item) => (item.id === questionId ? { ...item, isActive: previous } : item))
      );
      if (editingId === questionId) setFormActive(previous);
      console.error(e);
      toast.error("Failed to update publish status");
    }
  }

  async function toggleActive(q: TestQuestion, next: boolean) {
    if (readOnly) {
      toast.info("This test is read-only.");
      return;
    }
    const previous = isQuestionPublished(q.isActive);
    await updateQuestionPublishState(q.id, next, previous, true);
  }

  function handleEditorPublishChange(next: boolean) {
    if (readOnly) return;
    const previous = formActive;
    setFormActive(next);

    if (!editingId) return;
    void updateQuestionPublishState(editingId, next, previous, false);
  }

  // Upload pdf starts here....
  async function handlePdfSelected(file: File | null) {
    if (readOnly) {
      toast.info("This test is read-only.");
      return;
    }
    if (!isAiPdfImportEnabled) {
      toast.error(getAiFeatureDisabledMessage("pdfImport"));
      return;
    }

    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file only");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Please upload a PDF up to 15 MB for AI import");
      return;
    }

    // Create a new abort controller for this import
    importAbortControllerRef.current = new AbortController();

    setImportBusy(true);
    setImportFileName(file.name);
    setImportPreviewOpen(true);
    setImportItems([]);
    setImportSummary(null);
    setImportProgressUpdates([]);
    toast.info("AI import started. Please do not close this tab while processing.", {
      duration: 3500,
    });

    try {
      const result = await importQuestionsFromPdf(
        file,
        { testTitle, subject: testSubject, educatorId: educatorUid },
        (update) => {
          setImportProgressUpdates((prev) => [...prev, update]);
        },
        importAbortControllerRef.current.signal,
        // Callback to add questions in real-time as they're detected
        (newQuestions, pageNum) => {
          setImportItems((prev) => sortImportItemsBySourceIndex([...prev, ...newQuestions]));
        }
      );
      // Update summary at the end (questions already added via callback)
      setImportSummary(result.summary || null);
      setImportItems(
        sortImportItemsBySourceIndex(
          (result.items || []).map((item) => ({
            ...item,
            include: item.status !== "rejected",
          }))
        )
      );
      setImportProgressUpdates([]);
      toast.success("AI import preview is ready");
    } catch (error) {
      console.error(error);
      const errorMsg = error instanceof Error ? error.message : "Failed to import PDF with AI";
      // Don't show error toast if it was cancelled
      if (!errorMsg.includes("cancelled")) {
        toast.error(errorMsg);
      }
      setImportPreviewOpen(false);
      setImportProgressUpdates([]);
    } finally {
      setImportBusy(false);
      importAbortControllerRef.current = null;
    }
  }

  async function confirmAndStartPdfImport() {
    if (!pendingPdfFile) {
      setConfirmPdfOpen(false);
      return;
    }

    const selectedFile = pendingPdfFile;
    setConfirmPdfOpen(false);
    setPendingPdfFile(null);
    await handlePdfSelected(selectedFile);
  }

  function cancelPdfImport() {
    if (importAbortControllerRef.current) {
      importAbortControllerRef.current.abort();
      setImportBusy(false);
      setImportPreviewOpen(false);
      setImportProgressUpdates([]); // Clear progress tracker
      toast.info("PDF import cancelled");
    }
  }

  function sortImportItemsBySourceIndex(items: AiImportPreviewItem[]) {
    return [...items].sort((a, b) => {
      const aIdx = Number.isFinite(Number(a.sourceIndex))
        ? Number(a.sourceIndex)
        : Number.MAX_SAFE_INTEGER;
      const bIdx = Number.isFinite(Number(b.sourceIndex))
        ? Number(b.sourceIndex)
        : Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });
  }

  function updateImportItemInclude(sourceIndex: number, include: boolean) {
    setImportItems((prev) =>
      prev.map((item) => (item.sourceIndex === sourceIndex ? { ...item, include } : item))
    );
  }

  function updateImportItemContent(
    sourceIndex: number,
    patch: Partial<Pick<AiImportPreviewItem, "question" | "options" | "correctOption">>
  ) {
    setImportItems((prev) =>
      prev.map((item) => {
        if (item.sourceIndex !== sourceIndex) return item;

        const nextQuestion = typeof patch.question === "string" ? patch.question : item.question;
        const nextOptions = Array.isArray(patch.options)
          ? patch.options.map((value) => String(value ?? ""))
          : item.options;

        let nextCorrectOption =
          patch.correctOption !== undefined ? patch.correctOption : item.correctOption;

        if (
          typeof nextCorrectOption === "number" &&
          (nextCorrectOption < 0 || nextCorrectOption >= nextOptions.length)
        ) {
          nextCorrectOption = nextOptions.length ? 0 : null;
        }

        return {
          ...item,
          question: nextQuestion,
          options: nextOptions,
          correctOption: nextCorrectOption,
          manualEdited: true,
        };
      })
    );
  }

  function selectAllImportItems() {
    setImportItems((prev) =>
      prev.map((item) => ({
        ...item,
        include: true,
      }))
    );
  }

  function selectOnlyReadyImportItems() {
    setImportItems((prev) =>
      prev.map((item) => ({
        ...item,
        include: item.status === "ready",
      }))
    );
  }

  function selectOnlyPartialImportItems() {
    setImportItems((prev) =>
      prev.map((item) => ({
        ...item,
        include: item.status === "partial",
      }))
    );
  }

  function selectOnlyRejectedImportItems() {
    setImportItems((prev) =>
      prev.map((item) => ({ ...item, include: item.status === "rejected" }))
    );
  }

  function normalizeQuestionDoc(id: string, data: any): TestQuestion {
    const question = String(data?.question ?? data?.text ?? "");
    const optionsRaw = Array.isArray(data?.options) ? data.options : [];
    const options = optionsRaw.map((x: any) => String(x ?? ""));

    const correctOption = Number(
      data?.correctOption ?? data?.correctOptionIndex ?? data?.correctOptionIndex ?? 0
    );

    // Always normalize to +5 marks and -1 negative marks
    const marks = 5;
    const negativeMarks = -1;

    const difficulty = (data?.difficulty as Difficulty) || "medium";

    return {
      id,
      questionOrder: Number.isFinite(Number(data?.questionOrder))
        ? Number(data.questionOrder)
        : undefined,
      question,
      options,
      correctOption: Number.isFinite(correctOption) ? correctOption : 0,
      explanation: data?.explanation ? String(data.explanation) : "",
      difficulty,
      subject: data?.subject ? String(data.subject) : "",
      chapter: data?.chapter ? String(data.chapter) : "",
      topic: data?.topic ? String(data.topic) : "",
      sectionId: data?.sectionId ? String(data.sectionId) : "",
      marks: marks,
      negativeMarks: negativeMarks,
      isActive: isQuestionPublished(data?.isActive),
      createdAt: data?.createdAt,
      updatedAt: data?.updatedAt,
    };
  }

  async function updateTestSections(nextSections: TestSection[]) {
    if (readOnly || questionSource === "admin") return;
    await updateDoc(doc(db, "educators", educatorUid, "my_tests", testId), {
      sections: nextSections,
      updatedAt: serverTimestamp(),
    });
  }

  async function resequenceQuestionsForSections(
    nextSections: TestSection[],
    nextQuestions: TestQuestion[]
  ) {
    if (readOnly || questionSource === "admin") return;

    const ordered: TestQuestion[] = [];
    nextSections.forEach((section) => {
      const sectionQuestions = nextQuestions.filter(
        (question) => resolveSectionId(question.sectionId, nextSections) === section.id
      );
      ordered.push(...sortQuestionsForDisplay(sectionQuestions));
    });

    const updates = ordered
      .map((question, index) => ({
        id: question.id,
        nextOrder: index + 1,
        currentOrder: Number.isFinite(Number(question.questionOrder))
          ? Number(question.questionOrder)
          : null,
      }))
      .filter((item) => item.currentOrder !== item.nextOrder);

    if (!updates.length) return;

    const CHUNK_SIZE = 450;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      chunk.forEach((item) => {
        batch.update(doc(qCol, item.id), {
          questionOrder: item.nextOrder,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  }

  async function saveImportedQuestions() {
    const selected = importItems.filter((item) => item.include);
    if (!selected.length) {
      toast.error("No questions selected to save");
      return;
    }

    setSavingImported(true);
    try {
      const baseOrder = questions.reduce((max, q) => {
        const n = Number(q.questionOrder);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0);

      for (let i = 0; i < selected.length; i += 200) {
        const batch = writeBatch(db);
        const chunk = selected.slice(i, i + 200);
        for (let j = 0; j < chunk.length; j += 1) {
          const item = chunk[j];
          const payload = buildImportedQuestionPayload(item);
          const newRef = doc(qCol);
          batch.set(newRef, {
            ...payload,
            questionOrder: baseOrder + i + j + 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }

      await syncTestQuestionCount();
      toast.success(
        `${selected.length} imported question${selected.length === 1 ? "" : "s"} saved`
      );
      setImportPreviewOpen(false);
      setImportItems([]);
      setImportSummary(null);
      setImportProgressUpdates([]); // Clear progress tracker
      if (!editorOpen) openNew();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save imported questions");
    } finally {
      setSavingImported(false);
    }
  }

  return (
    <div
      className={
        isPageMode
          ? "w-full bg-gradient-to-b from-background to-muted/10"
          : "fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      }
    >
      <div
        className={
          isPageMode
            ? "relative flex h-[calc(100vh-8rem)] w-full flex-col overflow-hidden bg-background"
            : "relative flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl"
        }
      >
        <div className="flex items-center justify-between border-b p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">
              {readOnly ? "View Questions" : "Manage Questions"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? "Read-only mode for admin-imported test."
                : "Add questions manually or import them from a PDF with AI. Saved questions stay in the same Firestore path."}
            </p>
          </div>
          {isPageMode ? (
            !isApp ? (
              <Button variant="outline" onClick={requestCloseManager} className="rounded-xl">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            ) : null
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={requestCloseManager}
              className="rounded-xl"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <div className="order-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <div className="p-6 lg:p-8">
              <div className="mx-auto max-w-4xl space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold">
                      {editingId
                        ? readOnly
                          ? "Question Preview"
                          : "Edit Question"
                        : "Question Workspace"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {readOnly
                        ? "Preview only. Changes are not allowed."
                        : "Basic text editor for quick question entry."}
                    </p>
                  </div>

                  {!readOnly ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="rounded-xl" onClick={openNew}>
                        <Plus className="mr-2 h-4 w-4" /> New
                      </Button>
                      {editorOpen ? (
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={requestCloseEditor}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {!editorOpen ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/15 px-6 py-12 text-center">
                    <p className="text-base font-medium">
                      {readOnly
                        ? "Select a question from the list"
                        : "Select a question from the list or create a new one"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {readOnly
                        ? "You can view imported admin questions here."
                        : "Compose questions with plain text and keep editing simple."}
                    </p>
                    {!readOnly ? (
                      <Button className="mt-4 rounded-xl" onClick={openNew}>
                        <Plus className="mr-2 h-4 w-4" /> Start Writing
                      </Button>
                    ) : null}
                  </div>
                ) : readOnly ? (
                  /* ── Read-only view for admin-imported tests ── */
                  <div className="space-y-5">
                    {/* Read-only banner */}
                    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 text-amber-600"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                          Admin-imported test — View only
                        </p>
                        <p className="text-xs text-muted-foreground">
                          This question was imported from admin and cannot be edited.
                        </p>
                      </div>
                    </div>

                    {/* Question content */}
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Question</Label>
                      <div className="rounded-xl border border-border bg-muted/10 p-4">
                        {hasPreviewContent(formQuestion) ? (
                          <HtmlView html={formQuestion} className="break-words text-sm" />
                        ) : (
                          <p className="text-sm italic text-muted-foreground">
                            (No question content)
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Options */}
                    <div className="space-y-3">
                      <Label className="text-muted-foreground">Answer Choices</Label>
                      <div className="space-y-2">
                        {formOptions.map((opt, idx) => {
                          const isCorrect = formCorrect === idx;
                          const hasContent = hasPreviewContent(opt || "");
                          if (!hasContent && !opt?.trim()) return null;
                          return (
                            <div
                              key={idx}
                              className={`flex items-start gap-3 rounded-xl border p-3 ${
                                isCorrect
                                  ? "border-green-500/40 bg-green-500/5"
                                  : "border-border bg-muted/10"
                              }`}
                            >
                              <span
                                className={`mt-0.5 shrink-0 text-xs font-bold ${isCorrect ? "text-green-600" : "text-muted-foreground"}`}
                              >
                                {String.fromCharCode(65 + idx)}.
                              </span>
                              <div className="min-w-0 flex-1">
                                {hasContent ? (
                                  <HtmlView html={opt} className="break-words text-sm" />
                                ) : (
                                  <span className="text-sm">{opt}</span>
                                )}
                              </div>
                              {isCorrect ? (
                                <Badge className="shrink-0 rounded-full bg-green-600 text-[10px]">
                                  <CheckCircle2 className="mr-1 h-3 w-3" /> Correct
                                </Badge>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Settings summary */}
                    <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-4">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Question Details
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border border-border bg-background p-3 text-center">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Difficulty
                          </p>
                          <p className="mt-1 text-sm font-semibold capitalize">
                            {formDifficulty || "medium"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3 text-center">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Marks
                          </p>
                          <p className="mt-1 text-sm font-semibold">{formMarks || "—"}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3 text-center">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Negative
                          </p>
                          <p className="mt-1 text-sm font-semibold">{formNegMarks || "—"}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3 text-center">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Status
                          </p>
                          <p
                            className={`mt-1 text-sm font-semibold ${formActive ? "text-green-600" : "text-amber-600"}`}
                          >
                            {getPublishStatusLabel(formActive)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label>Question Content</Label>
                        <ImageTextarea
                          value={formQuestion}
                          onChange={setFormQuestion}
                          folder="/test-questions"
                          placeholder="Type your question here..."
                          minHeight="140px"
                          className="rounded-xl"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Answers</Label>
                          <span className="text-xs text-muted-foreground">
                            {formOptions.length} / 6 options
                          </span>
                        </div>

                        <div className="space-y-3">
                          {formOptions.map((opt, idx) => (
                            <div key={idx} className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <Label>
                                  Choice {String.fromCharCode(65 + idx)}
                                  {formCorrect === idx ? (
                                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600">
                                      <CheckCircle2 className="h-3 w-3" /> Correct
                                    </span>
                                  ) : null}
                                </Label>
                                {formOptions.length > 2 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                                    onClick={() => removeOptionField(idx)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </div>
                              <ImageTextarea
                                value={opt || ""}
                                onChange={(value) => {
                                  setFormOptions((prev) =>
                                    prev.map((x, i) => (i === idx ? value : x))
                                  );
                                }}
                                folder="/test-options"
                                placeholder={`Type choice ${String.fromCharCode(65 + idx)}...`}
                                minHeight="50px"
                                className="rounded-xl"
                                hideControls
                              />
                            </div>
                          ))}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-xl"
                          onClick={addOptionField}
                          disabled={formOptions.length >= 6}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Add Option
                        </Button>
                      </div>

                      <div className="space-y-4 rounded-xl border border-border bg-muted/15 p-4">
                        <p className="text-sm font-semibold">Question Settings</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                          <div className="space-y-2">
                            <Label>Mark as Correct Option</Label>
                            <Select
                              value={String(formCorrect)}
                              onValueChange={(v) => setFormCorrect(Number(v))}
                            >
                              <SelectTrigger className="rounded-xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {formOptions.map((_, i) => (
                                  <SelectItem key={i} value={String(i)}>
                                    Choice {String.fromCharCode(65 + i)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Difficulty</Label>
                            <Select
                              value={formDifficulty}
                              onValueChange={(v: any) => setFormDifficulty(v)}
                            >
                              <SelectTrigger className="rounded-xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="easy">Easy</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="hard">Hard</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Section</Label>
                            <Select value={formSectionId} onValueChange={setFormSectionId}>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Select section" />
                              </SelectTrigger>
                              <SelectContent>
                                {managedSections.map((section) => (
                                  <SelectItem key={section.id} value={section.id}>
                                    {section.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {getPublishStatusLabel(formActive)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formActive
                                ? "Visible in published list"
                                : "Saved as draft until published"}
                            </p>
                          </div>
                          <Switch
                            checked={formActive}
                            onCheckedChange={handleEditorPublishChange}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {/* <div className="space-y-2">
                                                        <Label>Subject</Label>
                                                        <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} className="rounded-xl" placeholder="e.g. Physics" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Topic</Label>
                                                        <Input value={formTopic} onChange={(e) => setFormTopic(e.target.value)} className="rounded-xl" placeholder="e.g. Kinematics" />
                                                    </div> */}
                          <div className="space-y-2">
                            <Label>Chapter</Label>
                            <Input
                              value={formChapter}
                              onChange={(e) => setFormChapter(e.target.value)}
                              className="rounded-xl"
                              placeholder="e.g. Optics"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Topic</Label>
                            <Input
                              value={formTopic}
                              onChange={(e) => setFormTopic(e.target.value)}
                              className="rounded-xl"
                              placeholder="e.g. Kinematics"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Marks</Label>
                            <Input
                              value={formMarks}
                              onChange={(e) => setFormMarks(e.target.value)}
                              className="rounded-xl"
                              placeholder="e.g. 5"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Negative Marks</Label>
                            <Input
                              value={formNegMarks}
                              onChange={(e) => setFormNegMarks(e.target.value)}
                              className="rounded-xl"
                              placeholder="e.g. -1"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Question Preview
                      </p>
                      {hasPreviewContent(formQuestion) ? (
                        <div className="space-y-3">
                          <div
                            className="rounded-lg border border-border/60 bg-background p-3"
                            onClick={handleQuestionPreviewImageClick}
                          >
                            <HtmlView
                              html={formQuestion}
                              className="break-words text-sm [&_img]:cursor-pointer"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Options Preview
                            </p>
                            {previewOptions.length ? (
                              previewOptions.map(({ index, option }) => (
                                <div
                                  key={index}
                                  className="rounded-lg border border-border/60 bg-background p-3"
                                  onClick={(event) =>
                                    handleOptionPreviewImageClick(index, option, event)
                                  }
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="mt-1 text-xs font-semibold text-muted-foreground">
                                      {String.fromCharCode(65 + index)}.
                                    </span>
                                    <HtmlView
                                      html={option}
                                      className="flex-1 break-words text-sm [&_img]:cursor-pointer"
                                    />
                                    {formCorrect === index ? (
                                      <Badge className="rounded-full text-[10px]">Correct</Badge>
                                    ) : null}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Add options to preview formatted answers.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Start typing to preview question content.
                        </p>
                      )}
                    </div>

                    {!readOnly ? (
                      <div className="flex items-center justify-end">
                        <Button
                          className="min-w-[160px] rounded-xl"
                          disabled={saving}
                          onClick={saveQuestion}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : editingId ? (
                            "Update Question"
                          ) : (
                            "Save Question"
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="order-2 flex min-h-0 w-full shrink-0 flex-col border-t bg-muted/10 md:w-[480px] md:border-l md:border-t-0">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain p-4">
              <div className="space-y-3 border-b p-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sections
                  </p>
                </div>

                {!readOnly ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={newSectionName}
                        onChange={(event) => setNewSectionName(event.target.value)}
                        placeholder="New section name"
                        className="rounded-xl"
                      />
                      <Button className="shrink-0 rounded-xl" onClick={addSection} type="button">
                        <Plus className="mr-2 h-4 w-4" /> Add Section
                      </Button>
                    </div>
                    <Button
                      className="w-full rounded-xl"
                      onClick={() => openNewInSection(managedSections[0]?.id || "main")}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add Question
                    </Button>
                  </div>
                ) : null}

                {!readOnly ? (
                  <>
                    <Button
                      variant="outline"
                      className="w-full rounded-xl"
                      onClick={() => pdfInputRef.current?.click()}
                      disabled={importBusy || !isAiPdfImportEnabled}
                      title={
                        !isAiPdfImportEnabled ? getAiFeatureDisabledMessage("pdfImport") : undefined
                      }
                    >
                      {importBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileUp className="mr-2 h-4 w-4" />
                      )}
                      Import PDF with AI
                    </Button>
                    {!isAiPdfImportEnabled ? (
                      <p className="text-xs text-muted-foreground">
                        {getAiFeatureDisabledMessage("pdfImport")}
                      </p>
                    ) : null}
                  </>
                ) : null}
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0] || null;
                    event.currentTarget.value = "";
                    if (!file) return;
                    setPendingPdfFile(file);
                    setConfirmPdfOpen(true);
                  }}
                />

                {!readOnly && importBusy && importProgressUpdates.length > 0 && (
                  <InlineStatusTracker updates={importProgressUpdates} isProcessing={importBusy} />
                )}

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Search questions..."
                    className="rounded-xl pl-9"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pb-1 text-xs text-muted-foreground">
                <span>{readOnly ? "Read-only sections" : "Drag sections to reorder"}</span>
                {reordering ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving order...
                  </span>
                ) : null}
              </div>
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="animate-spin text-muted-foreground" />
                </div>
              ) : managedSections.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No sections yet.</p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleCombinedDragEnd}
                >
                  <SortableContext
                    items={managedSections.map((section) => section.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-4">
                      {managedSections.map((section, index) => {
                        const sectionQuestions = questionsBySection[section.id] || [];
                        const collapsed = collapsedQSections.includes(section.id);

                        return (
                          <SortableSectionCard
                            key={section.id}
                            section={section}
                            index={index}
                            questions={sectionQuestions}
                            collapsed={collapsed}
                            readOnly={readOnly}
                            questionDndEnabled={dndEnabled}
                            totalQuestionCount={sectionQuestionCountById[section.id] || 0}
                            questionLimit={getSectionQuestionLimit(section.id)}
                            onToggleCollapse={(sectionId) => {
                              setCollapsedQSections((prev) =>
                                prev.includes(sectionId)
                                  ? prev.filter((id) => id !== sectionId)
                                  : [...prev, sectionId]
                              );
                            }}
                            onRename={renameSection}
                            onDelete={removeSection}
                            onAddQuestion={openNewInSection}
                            onOpenEdit={openEdit}
                            onDuplicate={duplicateQuestion}
                            onDeleteQuestion={deleteQuestion}
                            onToggleActive={toggleActive}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {/* <div className="p-3 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-end">
                    <span className="flex items-center gap-2">
                        <FileUp className="h-4 w-4" />
                        Manual + AI PDF Import
                    </span>
                </div> */}

        <AiQuestionImportOverlay
          open={importPreviewOpen}
          fileName={importFileName}
          summary={importSummary}
          items={importItems}
          importing={importBusy}
          saving={savingImported}
          onClose={() => {
            if (!savingImported && !importBusy) {
              setImportPreviewOpen(false);
              setImportProgressUpdates([]); // Clear progress tracker
            }
          }}
          onCancel={cancelPdfImport}
          onItemIncludeChange={updateImportItemInclude}
          onItemEdit={updateImportItemContent}
          onSelectAll={selectAllImportItems}
          onSelectOnlyReady={selectOnlyReadyImportItems}
          onSelectOnlyPartial={selectOnlyPartialImportItems}
          onSelectOnlyRejected={selectOnlyRejectedImportItems}
          onSaveSelected={saveImportedQuestions}
        />

        <Dialog
          open={previewCropOpen}
          onOpenChange={(open) => {
            if (!open && !previewCropping) closePreviewCrop();
          }}
        >
          <DialogContent className="rounded-2xl sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Crop Preview Image</DialogTitle>
              <DialogDescription>
                Click on an image in preview and crop the exact region to keep.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[68vh] overflow-auto rounded-xl border bg-black/70 p-2">
              {previewCropTargetUrl ? (
                <ReactCrop
                  crop={previewCropSelection}
                  onChange={(_px: PixelCrop, percentCrop: PercentCrop) =>
                    setPreviewCropSelection(percentCrop)
                  }
                  onComplete={(pixelCrop) => setPreviewCropPixels(pixelCrop)}
                  keepSelection
                  minWidth={20}
                  minHeight={20}
                >
                  <img
                    ref={previewCropImageRef}
                    src={previewCropTargetUrl}
                    alt="Preview crop"
                    crossOrigin="anonymous"
                    className="mx-auto max-h-[60vh] w-auto"
                  />
                </ReactCrop>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                  No image selected
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closePreviewCrop}
                disabled={previewCropping}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={applyPreviewCrop}
                disabled={
                  previewCropping ||
                  !previewCropPixels ||
                  previewCropPixels.width < 2 ||
                  previewCropPixels.height < 2
                }
              >
                {previewCropping ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply Crop"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={unsavedConfirmOpen}
          onOpenChange={(open) => {
            if (!open) {
              setUnsavedConfirmOpen(false);
              setPendingEditorAction(null);
            }
          }}
        >
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Save Question Changes?</DialogTitle>
              <DialogDescription>
                You made changes in this question. Do you want to save and update before exiting?
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="outline" onClick={handleExitWithoutSaving}>
                No, Exit
              </Button>
              <Button onClick={handleSaveAndContinue} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={confirmPdfOpen}
          onOpenChange={(open) => {
            setConfirmPdfOpen(open);
            if (!open) {
              setPendingPdfFile(null);
            }
          }}
        >
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Confirm PDF Import</DialogTitle>
              <DialogDescription>
                Please confirm this is the correct file to import with AI.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <p className="truncate font-medium">{pendingPdfFile?.name || "No file selected"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Size:{" "}
                {pendingPdfFile ? `${(pendingPdfFile.size / (1024 * 1024)).toFixed(2)} MB` : "-"}
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmPdfOpen(false);
                  setPendingPdfFile(null);
                }}
              >
                Cancel
              </Button>
              <Button className="gradient-bg text-white" onClick={confirmAndStartPdfImport}>
                Confirm & Start Import
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default QuestionsManager;
