import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search, Loader2, CheckCircle2, FileUp } from "lucide-react";

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

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
import { Slider } from "@shared/ui/slider";
import { MultiSelect } from "@shared/ui/MultiSelect";
import { toast } from "sonner";
import ReactCrop, { type Crop, type PercentCrop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import AiQuestionImportOverlay from "@features/educator/components/AiQuestionImportOverlay";
import InlineStatusTracker from "@features/educator/components/InlineStatusTracker";
import QuestionEditor from "../QuestionEditor";
import SortableSectionCard from "../SortableSectionCard";
import {
  buildImportedQuestionPayload,
  importQuestionsFromPdf,
  type AiImportPreviewItem,
  type AiImportSummary,
  type PageProgressUpdate,
} from "@shared/lib/aiQuestionImport";
import { aiFeatureFlags, getAiFeatureDisabledMessage } from "@shared/lib/aiFeatureFlags";
import { HtmlView } from "@shared/lib/safeHtml";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import {
  normalizeQuestionType,
  isSubjectiveType,
  type QuestionType,
} from "@shared/lib/questionTypes";
import { buildAutoFillSelection } from "@shared/lib/autoFillEngine";

import {
  uid,
  buildSnapshotFromQuestion,
  areSnapshotsEqual,
  stripHtml,
  splitPreviewContent,
  isQuestionPublished,
  hasPreviewContent,
  combinePreviewContent,
  normalizeOptionsForSnapshot,
  normalizeSections,
  resolveSectionId,
} from "./QuestionManagerUtils";

import type {
  Difficulty,
  TestSection,
  TestQuestion,
  QuestionBankQuestion,
  DifficultyMix,
  EditorDraftSnapshot,
  PendingEditorAction,
  PreviewCropTarget,
} from "./QuestionManagerTypes";

// Firebase
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
  query,
  where,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";

type AutoImportSection = {
  id: string;
  name: string;
  topics: string[];
  subjects: string[];
  chapters: string[];
  tags: string[];
  questionCount: number;
  difficulty: number;
  format?: string;
  markingScheme?: { correct?: number; incorrect?: number } | null;
};

// ------------------------------
// Sub-component: Educator Questions Manager (manual only)
// Works for both imported admin tests and educator custom tests.
// IMPORTANT: No question-bank import here.
// ------------------------------

const QuestionsManager = ({
  testId,
  testTitle,
  testSubject,
  testSections,
  useSections = true,
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
  useSections?: boolean;
  educatorUid: string;
  onClose: () => void;
  mode?: "modal" | "page";
  readOnly?: boolean;
  questionSource?: "educator" | "admin";
  questionSourceTestId?: string;
}) => {
  const isPageMode = mode === "page";
  const isApp = new URLSearchParams(window.location.search).get("_app") === "1" || window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportedQuestionIds, setReportedQuestionIds] = useState<Set<string>>(new Set());
  const [reordering, setReordering] = useState(false);

  const [searchQ, setSearchQ] = useState("");
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
  const [formQuestionType, setFormQuestionType] = useState<QuestionType>("MCQ_SINGLE");
  const [formReferenceAnswer, setFormReferenceAnswer] = useState("");
  const [formReferenceKeywords, setFormReferenceKeywords] = useState("");
  const [formReferenceAnswerFileUrls, setFormReferenceAnswerFileUrls] = useState<string[]>([]);
  const [formEvaluationInstructions, setFormEvaluationInstructions] = useState("");
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
  const [insertAfterQuestionId, setInsertAfterQuestionId] = useState<string | null>(null);

  // Section-related state
  const [collapsedQSections, setCollapsedQSections] = useState<string[]>([]);
  const [managedSections, setManagedSections] = useState<TestSection[]>(() =>
    normalizeSections(testSections, testSubject)
  );
  const [addSectionDialogOpen, setAddSectionDialogOpen] = useState(false);
  const [addSectionDialogAfterSectionId, setAddSectionDialogAfterSectionId] = useState<
    string | null
  >(null);
  const [pendingSectionName, setPendingSectionName] = useState("");
  const [pendingSectionQuestionsLimit, setPendingSectionQuestionsLimit] = useState("");
  const [pendingSectionAttemptsLimit, setPendingSectionAttemptsLimit] = useState("");
  const [pendingSectionTimeLimit, setPendingSectionTimeLimit] = useState("");
  const [ischecked, setIsChecked] = useState(false);
  const [markingScheme, setMarkingScheme] = useState({
    correct: 4,
    incorrect: -1,
    unattempted: 0,
  });

  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [confirmPdfOpen, setConfirmPdfOpen] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [savingImported, setSavingImported] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importSummary, setImportSummary] = useState<AiImportSummary | null>(null);
  const [importItems, setImportItems] = useState<AiImportPreviewItem[]>([]);
  const [importProgressUpdates, setImportProgressUpdates] = useState<PageProgressUpdate[]>([]);
  const [questionBankOpen, setQuestionBankOpen] = useState(false);
  const [questionBankLoading, setQuestionBankLoading] = useState(false);
  const [questionBankImporting, setQuestionBankImporting] = useState(false);
  const [questionBankRows, setQuestionBankRows] = useState<QuestionBankQuestion[]>([]);
  const [questionBankSelected, setQuestionBankSelected] = useState<Record<string, boolean>>({});
  const [questionBankSearch, setQuestionBankSearch] = useState("");
  const [questionBankSubject, setQuestionBankSubject] = useState("all");
  const [questionBankChapter, setQuestionBankChapter] = useState("all");
  const [questionBankTopic, setQuestionBankTopic] = useState("all");
  const [questionBankDifficulty, setQuestionBankDifficulty] = useState<"all" | Difficulty>("all");
  const [questionBankSectionId, setQuestionBankSectionId] = useState("");
  const [questionBankInsertAfterId, setQuestionBankInsertAfterId] = useState<string | null>(null);
  const [adminQuestionBankRows, setAdminQuestionBankRows] = useState<QuestionBankQuestion[]>([]);
  const [adminQuestionBankLoading, setAdminQuestionBankLoading] = useState(false);
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [autoFillGenerating, setAutoFillGenerating] = useState(false);
  const [autoFillApplying, setAutoFillApplying] = useState(false);
  const [autoFillTotalQuestions, setAutoFillTotalQuestions] = useState<number>(20);
  const [autoFillSectionId, setAutoFillSectionId] = useState("");
  const [autoFillDifficultyMix, setAutoFillDifficultyMix] = useState<DifficultyMix>({
    easy: 40,
    medium: 40,
    hard: 20,
  });
  const [autoFillAvoidUsed, setAutoFillAvoidUsed] = useState(true);
  const [autoFillTopicSelected, setAutoFillTopicSelected] = useState<Record<string, boolean>>({});
  const [autoFillSubjectWeight, setAutoFillSubjectWeight] = useState<Record<string, number>>({});
  const [autoFillDraftRows, setAutoFillDraftRows] = useState<QuestionBankQuestion[]>([]);
  const [autoFillDraftSelected, setAutoFillDraftSelected] = useState<Record<string, boolean>>({});
  const [autoImportSections, setAutoImportSections] = useState<AutoImportSection[]>([]);
  const [autoImportIncludeAdmin, setAutoImportIncludeAdmin] = useState(false);
  const [autoImportApplying, setAutoImportApplying] = useState(false);
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

  // Real-time listener for reported questions
  useEffect(() => {
    if (!testId) return;
    const qReports = query(
      collection(db, "question_reports"),
      where("contextId", "==", testId),
      where("status", "==", "Open")
    );
    const unsub = onSnapshot(qReports, (snap) => {
      const reported = new Set<string>();
      snap.forEach((doc) => reported.add(doc.data().questionId));
      setReportedQuestionIds(reported);
    });
    return () => unsub();
  }, [testId]);

  const selectedTestSections = useMemo(
    () => normalizeSections(testSections, testSubject),
    [testSections, testSubject]
  );

  async function syncTestQuestionCount() {
    if (readOnly || questionSource === "admin") return;
    try {
      // Use local cache so recently-written docs (addDoc/updateDoc) are included
      // without racing against the Firestore server confirming those writes.
      const snap = await getDocsFromCache(qCol).catch(() => getDocs(qCol));
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

  useEffect(() => {
    if (!(questionBankOpen || autoFillOpen) || !educatorUid) return;

    let active = true;
    (async () => {
      try {
        setQuestionBankLoading(true);
        const bankSnap = await getDocs(collection(db, "educators", educatorUid, "question_bank"));
        if (!active) return;

        const rows: QuestionBankQuestion[] = bankSnap.docs
          .map(mapQuestionBankDoc)
          .sort((a, b) => timestampToMillis(b.updatedAt) - timestampToMillis(a.updatedAt));

        setQuestionBankRows(rows);
        setQuestionBankSelected({});
        setQuestionBankSearch("");
        setQuestionBankSubject("all");
        setQuestionBankTopic("all");
        setQuestionBankDifficulty("all");
        setQuestionBankSectionId((current) =>
          resolveSectionId(current || managedSections[0]?.id, managedSections)
        );
      } catch (error) {
        console.error(error);
        toast.error("Failed to load educator question bank");
      } finally {
        if (active) setQuestionBankLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [questionBankOpen, autoFillOpen, educatorUid, managedSections]);

  useEffect(() => {
    if (!autoFillOpen || !autoImportIncludeAdmin) return;
    if (adminQuestionBankRows.length > 0) return;

    let active = true;
    (async () => {
      try {
        setAdminQuestionBankLoading(true);
        const bankSnap = await getDocs(collection(db, "question_bank"));
        if (!active) return;

        const rows: QuestionBankQuestion[] = bankSnap.docs
          .map(mapQuestionBankDoc)
          .sort((a, b) => timestampToMillis(b.updatedAt) - timestampToMillis(a.updatedAt));

        setAdminQuestionBankRows(rows);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load admin question bank");
      } finally {
        if (active) setAdminQuestionBankLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [autoFillOpen, autoImportIncludeAdmin, adminQuestionBankRows.length]);

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

  const existingBankQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    questions.forEach((question) => {
      const bankId = String(question.bankQuestionId || "").trim();
      if (bankId) ids.add(bankId);
    });
    return ids;
  }, [questions]);

  const questionBankSubjects = useMemo(() => {
    const subjects = new Set<string>();
    questionBankRows.forEach((question) => {
      if (question.subject) subjects.add(question.subject);
    });
    return ["all", ...Array.from(subjects).sort((a, b) => a.localeCompare(b))];
  }, [questionBankRows]);

  const questionBankChapters = useMemo(() => {
    const chapters = new Set<string>();
    questionBankRows.forEach((question) => {
      if (questionBankSubject !== "all" && question.subject !== questionBankSubject) return;
      if (question.chapter) chapters.add(question.chapter);
    });
    return ["all", ...Array.from(chapters).sort((a, b) => a.localeCompare(b))];
  }, [questionBankRows, questionBankSubject]);

  const questionBankTopics = useMemo(() => {
    const topics = new Set<string>();
    questionBankRows.forEach((question) => {
      if (questionBankSubject !== "all" && question.subject !== questionBankSubject) return;
      if (questionBankChapter !== "all" && (question.chapter || "") !== questionBankChapter) return;
      if (question.topic) topics.add(question.topic);
    });
    return ["all", ...Array.from(topics).sort((a, b) => a.localeCompare(b))];
  }, [questionBankRows, questionBankSubject, questionBankChapter]);

  const filteredQuestionBankRows = useMemo(() => {
    const searchText = questionBankSearch.trim().toLowerCase();
    return questionBankRows.filter((question) => {
      if (questionBankDifficulty !== "all" && question.difficulty !== questionBankDifficulty)
        return false;
      if (questionBankSubject !== "all" && (question.subject || "") !== questionBankSubject)
        return false;
      if (questionBankChapter !== "all" && (question.chapter || "") !== questionBankChapter)
        return false;
      if (questionBankTopic !== "all" && (question.topic || "") !== questionBankTopic) return false;
      if (!searchText) return true;

      const haystack = [
        stripHtml(question.question),
        question.subject || "",
        question.chapter || "",
        question.topic || "",
        ...(question.options || []).map(stripHtml),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchText);
    });
  }, [
    questionBankRows,
    questionBankSearch,
    questionBankDifficulty,
    questionBankSubject,
    questionBankChapter,
    questionBankTopic,
  ]);

  const selectedQuestionBankIds = useMemo(
    () => Object.keys(questionBankSelected).filter((id) => questionBankSelected[id]),
    [questionBankSelected]
  );

  const autoFillTopics = useMemo(() => {
    const topics = new Set<string>();
    questionBankRows.forEach((question) => {
      if (question.topic) topics.add(question.topic);
    });
    return Array.from(topics).sort((a, b) => a.localeCompare(b));
  }, [questionBankRows]);

  // Combined topics from both educator and admin question banks for the Auto Import dialog
  const allAvailableTopics = useMemo(() => {
    const topics = new Set<string>();
    questionBankRows.forEach((q) => {
      if (q.topic && q.topic.trim()) topics.add(q.topic.trim());
    });
    adminQuestionBankRows.forEach((q) => {
      if (q.topic && q.topic.trim()) topics.add(q.topic.trim());
    });
    return Array.from(topics).sort((a, b) => a.localeCompare(b));
  }, [questionBankRows, adminQuestionBankRows]);

  const allAvailableSubjects = useMemo(() => {
    const set = new Set<string>();
    [...questionBankRows, ...adminQuestionBankRows].forEach((q) => {
      const s = (q as any).subjectName || q.subject;
      if (s?.trim()) set.add(s.trim());
    });
    return Array.from(set).sort();
  }, [questionBankRows, adminQuestionBankRows]);

  const allAvailableChapters = useMemo(() => {
    const set = new Set<string>();
    [...questionBankRows, ...adminQuestionBankRows].forEach((q) => {
      if ((q as any).chapter?.trim()) set.add((q as any).chapter.trim());
    });
    return Array.from(set).sort();
  }, [questionBankRows, adminQuestionBankRows]);

  const allAvailableTags = useMemo(() => {
    const set = new Set<string>();
    [...questionBankRows, ...adminQuestionBankRows].forEach((q) => {
      if (Array.isArray((q as any).tags)) {
        (q as any).tags.forEach((t: string) => {
          if (t?.trim()) set.add(t.trim());
        });
      }
    });
    return Array.from(set).sort();
  }, [questionBankRows, adminQuestionBankRows]);

  const autoFillSubjects = useMemo(() => {
    const subjects = new Set<string>();
    questionBankRows.forEach((question) => {
      if (question.subject) subjects.add(question.subject);
    });
    return Array.from(subjects).sort((a, b) => a.localeCompare(b));
  }, [questionBankRows]);

  const autoFillSelectedDraftIds = useMemo(
    () => Object.keys(autoFillDraftSelected).filter((id) => autoFillDraftSelected[id]),
    [autoFillDraftSelected]
  );

  useEffect(() => {
    if (!autoFillOpen || autoFillSubjects.length === 0) return;
    if (Object.keys(autoFillSubjectWeight).length > 0) return;

    const equal = Math.round((100 / autoFillSubjects.length) * 100) / 100;
    const nextWeights: Record<string, number> = {};
    autoFillSubjects.forEach((subject) => {
      nextWeights[subject] = equal;
    });
    setAutoFillSubjectWeight(nextWeights);
  }, [autoFillOpen, autoFillSubjects, autoFillSubjectWeight]);

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
      questionType: formQuestionType,
      referenceAnswer: formReferenceAnswer,
      referenceKeywords: formReferenceKeywords,
      referenceAnswerFileUrls: formReferenceAnswerFileUrls,
      evaluationInstructions: formEvaluationInstructions,
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
      formQuestionType,
      formReferenceAnswer,
      formReferenceKeywords,
      formReferenceAnswerFileUrls,
      formEvaluationInstructions,
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

  function clampDifficulty(level?: number) {
    if (!Number.isFinite(Number(level))) return 0.5;
    return Math.min(1, Math.max(0, Number(level)));
  }

  function getDifficultyLabel(level: number) {
    if (level <= 0.3) return "Easy";
    if (level <= 0.7) return "Medium";
    return "Hard";
  }

  function normalizeDifficulty(value?: string) {
    const raw = String(value || "medium")
      .toLowerCase()
      .trim();
    if (raw === "easy" || raw === "medium" || raw === "hard") return raw as Difficulty;
    return "medium";
  }

  function difficultyToValue(value?: string | number) {
    if (typeof value === "number") return clampDifficulty(value);
    const normalized = normalizeDifficulty(value);
    if (normalized === "easy") return 0.15;
    if (normalized === "hard") return 0.85;
    return 0.5;
  }

  function normalizeTopicValue(topic?: string) {
    return String(topic || "")
      .trim()
      .toLowerCase();
  }

  function shuffleList<T>(items: T[]) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function mapQuestionBankDoc(docSnap: any): QuestionBankQuestion {
    const data = docSnap.data ? docSnap.data() : docSnap;
    const optionsRaw = Array.isArray(data?.options) ? data.options : [];
    return {
      id: String(docSnap.id || data?.id || ""),
      question: String(data?.question ?? data?.text ?? ""),
      options: optionsRaw.map((value: any) => String(value ?? "")),
      correctOption: Number.isFinite(Number(data?.correctOption)) ? Number(data.correctOption) : 0,
      explanation: data?.explanation ? String(data.explanation) : "",
      difficulty: normalizeDifficulty(data?.difficulty),
      subject: data?.subject ? String(data.subject) : "",
      chapter: data?.chapter ? String(data.chapter) : "",
      topic: data?.topic ? String(data.topic) : "",
      marks: data?.marks != null ? Number(data.marks) : undefined,
      negativeMarks: data?.negativeMarks != null ? Number(data.negativeMarks) : undefined,
      questionType: data?.format
        ? String(data.format)
        : data?.questionType
          ? String(data.questionType)
          : undefined,
      referenceAnswer: data?.referenceAnswer ? String(data.referenceAnswer) : undefined,
      referenceKeywords: Array.isArray(data?.referenceKeywords)
        ? data.referenceKeywords.map(String).filter(Boolean)
        : undefined,
      evaluationInstructions: data?.evaluationInstructions
        ? String(data.evaluationInstructions)
        : undefined,
      updatedAt: data?.updatedAt,
    };
  }

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

  function allocateByWeight<T extends string>(
    total: number,
    entries: Array<{ key: T; weight: number }>
  ): Record<T, number> {
    const positive = entries.map((entry) => ({
      ...entry,
      weight: Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 0,
    }));

    let weightSum = positive.reduce((sum, entry) => sum + entry.weight, 0);
    const normalized =
      weightSum > 0 ? positive : positive.map((entry) => ({ ...entry, weight: 1 }));

    weightSum = normalized.reduce((sum, entry) => sum + entry.weight, 0);
    const raw = normalized.map((entry) => ({
      key: entry.key,
      exact: (total * entry.weight) / weightSum,
    }));

    const result = {} as Record<T, number>;
    let used = 0;
    raw.forEach((item) => {
      const base = Math.floor(item.exact);
      result[item.key] = base;
      used += base;
    });

    let remaining = Math.max(0, total - used);
    const byFraction = raw
      .map((item) => ({ key: item.key, fraction: item.exact - Math.floor(item.exact) }))
      .sort((a, b) => b.fraction - a.fraction);

    let pointer = 0;
    while (remaining > 0 && byFraction.length) {
      const item = byFraction[pointer % byFraction.length];
      result[item.key] += 1;
      pointer += 1;
      remaining -= 1;
    }

    return result;
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
    setFormQuestionType("MCQ_SINGLE");
    setFormReferenceAnswer("");
    setFormReferenceKeywords("");
    setFormReferenceAnswerFileUrls([]);
    setFormEvaluationInstructions("");
    setInsertAfterQuestionId(null);
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

  function openNewDirect(sectionId?: string, nextInsertAfterQuestionId?: string) {
    const resolvedSectionId = resolveSectionId(
      sectionId || managedSections[0]?.id,
      managedSections
    );
    resetEditor(resolvedSectionId);
    setInsertAfterQuestionId(nextInsertAfterQuestionId || null);
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
    setFormQuestionType(normalizeQuestionType(q.questionType || "MCQ_SINGLE"));
    setFormReferenceAnswer(q.referenceAnswer || "");
    setFormReferenceKeywords(
      Array.isArray(q.referenceKeywords) ? q.referenceKeywords.join(", ") : ""
    );
    setFormReferenceAnswerFileUrls(
      Array.isArray(q.referenceAnswerFileUrls)
        ? q.referenceAnswerFileUrls.filter(Boolean)
        : q.referenceAnswerFileUrl
          ? [q.referenceAnswerFileUrl]
          : []
    );
    setFormEvaluationInstructions(q.evaluationInstructions || "");
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
      openNewDirect(action.sectionId, action.insertAfterQuestionId);
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

  function handleAddSectionClick(afterSectionId: string) {
    if (readOnly) return;
    setAddSectionDialogAfterSectionId(afterSectionId);
    setPendingSectionName("");
    setPendingSectionQuestionsLimit("");
    setPendingSectionAttemptsLimit("");
    setPendingSectionTimeLimit("");
    setIsChecked(false);
    setMarkingScheme({
      correct: 4,
      incorrect: -1,
      unattempted: 0,
    });
    setAddSectionDialogOpen(true);
  }

  async function handleCreateSection(name: string) {
    if (readOnly || !name.trim()) return;

    const sectionName = name.trim();
    const newSection: TestSection = {
      id: uid("section"),
      name: sectionName,
      questionsCount: null,
      questionsLimit: pendingSectionQuestionsLimit
        ? parseInt(pendingSectionQuestionsLimit, 10) || null
        : null,
      attemptsLimit: pendingSectionAttemptsLimit
        ? parseInt(pendingSectionAttemptsLimit, 10) || null
        : null,
      timeLimit: pendingSectionTimeLimit ? parseInt(pendingSectionTimeLimit, 10) || null : null,
      markingScheme: ischecked
        ? {
            correct: Number(markingScheme.correct),
            incorrect: Number(markingScheme.incorrect),
            unattempted: Number(markingScheme.unattempted),
          }
        : null,
    };

    // Insert new section after the specified section
    const insertIndex = managedSections.findIndex((s) => s.id === addSectionDialogAfterSectionId);
    const nextSections =
      insertIndex >= 0
        ? [
            ...managedSections.slice(0, insertIndex + 1),
            newSection,
            ...managedSections.slice(insertIndex + 1),
          ]
        : [...managedSections, newSection];

    setManagedSections(nextSections);
    setAddSectionDialogOpen(false);
    setPendingSectionName("");
    setPendingSectionQuestionsLimit("");
    setPendingSectionAttemptsLimit("");
    setPendingSectionTimeLimit("");
    setIsChecked(false);
    setMarkingScheme({
      correct: 4,
      incorrect: -1,
      unattempted: 0,
    });

    try {
      await updateTestSections(nextSections);
      toast.success("Section created");
    } catch (error) {
      console.error(error);
      toast.error("Failed to create section");
      // Revert on error
      setManagedSections(managedSections);
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

  function openAutoFillDialog() {
    if (readOnly || questionSource === "admin") {
      toast.info("This test is read-only.");
      return;
    }

    const draftSections: AutoImportSection[] = managedSections.map((section) => {
      const currentCount = getSectionQuestionCount(section.id, questions);
      const remaining =
        section.questionsCount != null
          ? Math.max(0, Number(section.questionsCount) - currentCount)
          : null; // null = no hard limit
      return {
        id: section.id,
        name: section.name,
        topics: Array.isArray(section.topics) ? section.topics : [],
        subjects: [],
        chapters: [],
        tags: [],
        questionCount: remaining !== null ? remaining : 20,
        difficulty: clampDifficulty(section.difficultyLevel ?? 0.5),
        format: section.format ?? undefined,
        markingScheme: section.markingScheme ?? null,
      };
    });

    // If every section with a hard limit is already full, show a message and bail
    const sectionsWithLimit = managedSections.filter((s) => s.questionsCount != null);
    const allFull =
      sectionsWithLimit.length > 0 &&
      sectionsWithLimit.every(
        (s) => getSectionQuestionCount(s.id, questions) >= Number(s.questionsCount)
      );
    if (allFull) {
      toast.info("All sections are already at their question limit.");
      return;
    }

    setAutoImportSections(draftSections);
    setAutoImportIncludeAdmin(false);

    const fallbackSectionId = resolveSectionId(
      autoFillSectionId || managedSections[0]?.id,
      managedSections
    );
    setAutoFillSectionId(fallbackSectionId);
    setAutoFillDraftRows([]);
    setAutoFillDraftSelected({});
    setAutoFillTopicSelected({});
    setAutoFillSubjectWeight({});

    setAutoFillOpen(true);
  }

  function openQuestionBankInSection(sectionId: string) {
    if (readOnly) return;
    const resolvedSectionId = resolveSectionId(sectionId, managedSections);
    setQuestionBankSectionId(resolvedSectionId);
    setQuestionBankInsertAfterId(null);
    setQuestionBankOpen(true);
  }

  function openNewAfterQuestion(question: TestQuestion) {
    if (readOnly) return;

    const targetSectionId = resolveSectionId(question.sectionId, managedSections);
    const capacityError = getSectionCapacityError(targetSectionId, questions);
    if (capacityError) {
      toast.error(capacityError);
      return;
    }

    requestEditorAction({
      type: "open-new",
      sectionId: targetSectionId,
      insertAfterQuestionId: question.id,
    });
  }

  function openQuestionBankAfterQuestion(question: TestQuestion) {
    if (readOnly) return;
    const targetSectionId = resolveSectionId(question.sectionId, managedSections);
    setQuestionBankSectionId(targetSectionId);
    setQuestionBankInsertAfterId(question.id);
    setQuestionBankOpen(true);
  }

  async function getPreviouslyUsedBankIds() {
    const usedIds = new Set<string>();
    if (!educatorUid) return usedIds;

    try {
      const testsSnap = await getDocs(collection(db, "educators", educatorUid, "my_tests"));
      for (const testDoc of testsSnap.docs) {
        const qSnap = await getDocs(
          collection(db, "educators", educatorUid, "my_tests", testDoc.id, "questions")
        );
        qSnap.docs.forEach((qDoc) => {
          const bankId = String((qDoc.data() as any)?.bankQuestionId || "").trim();
          if (bankId) usedIds.add(bankId);
        });
      }
    } catch (error) {
      console.error(error);
    }

    return usedIds;
  }

  async function generateAutoFillDraft() {
    if (readOnly || questionSource === "admin") return;

    const totalQuestions = Math.max(1, Number(autoFillTotalQuestions) || 0);
    if (!totalQuestions) {
      toast.error("Set total questions greater than 0");
      return;
    }

    const targetSectionId = resolveSectionId(
      autoFillSectionId || managedSections[0]?.id,
      managedSections
    );
    const capacityError = getSectionCapacityError(targetSectionId, questions, totalQuestions);
    if (capacityError) {
      toast.error(capacityError);
      return;
    }

    if (!questionBankRows.length) {
      toast.error("No questions found in educator question bank");
      return;
    }

    setAutoFillGenerating(true);
    try {
      const selectedTopics = Object.keys(autoFillTopicSelected).filter(
        (key) => autoFillTopicSelected[key]
      );
      const topicSet = selectedTopics.length ? new Set(selectedTopics) : undefined;

      const activeSubjectWeights = Object.entries(autoFillSubjectWeight)
        .filter(([, weight]) => Number(weight) > 0)
        .map(([subject, weight]) => ({ subject, weight: Number(weight) }));
      const subjectSet = activeSubjectWeights.length
        ? new Set(activeSubjectWeights.map((e) => e.subject))
        : undefined;

      const excludedIds = new Set(existingBankQuestionIds);
      if (autoFillAvoidUsed) {
        const usedIds = await getPreviouslyUsedBankIds();
        usedIds.forEach((id) => excludedIds.add(id));
      }

      // Load group manifests for group-aware selection
      const groupsSnap = await getDocs(collection(db, "question_groups"));
      const groupManifests = new Map(
        groupsSnap.docs.map((d) => [
          d.id,
          {
            groupId: d.id,
            type: d.data().type as "comprehension" | "case_study",
            questionCount: Number(d.data().questionCount || 0),
          },
        ])
      );

      // Single virtual section representing this fill target
      const targetSection = managedSections.find((s) => s.id === targetSectionId);
      const sectionConstraint = {
        id: targetSectionId,
        name: targetSection?.name || "Section",
        questionsCount: totalQuestions,
        ...(targetSection?.format ? { format: targetSection.format } : {}),
      };

      const { chosen, coverage } = buildAutoFillSelection(
        questionBankRows as any[],
        groupManifests,
        [sectionConstraint],
        {
          topicFilter: topicSet,
          subjectFilter: subjectSet,
          excludeIds: excludedIds,
          difficultyMix: autoFillDifficultyMix,
        }
      );

      const chosenAsBank = chosen as unknown as QuestionBankQuestion[];

      if (!chosenAsBank.length) {
        toast.error("No eligible questions found for auto-fill");
        setAutoFillDraftRows([]);
        setAutoFillDraftSelected({});
        return;
      }

      const selectedMap: Record<string, boolean> = {};
      chosenAsBank.forEach((q) => {
        selectedMap[q.id] = true;
      });

      setAutoFillSectionId(targetSectionId);
      setAutoFillDraftRows(chosenAsBank);
      setAutoFillDraftSelected(selectedMap);

      const found = coverage[0]?.found ?? chosenAsBank.length;
      if (found < totalQuestions) {
        toast.info(
          `Generated ${found}/${totalQuestions} questions — pool may be insufficient for remaining slots`
        );
      } else {
        toast.success("Auto-fill draft generated. Review and add to test.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate auto-fill draft");
    } finally {
      setAutoFillGenerating(false);
    }
  }

  async function applyAutoFillDraft() {
    if (readOnly || questionSource === "admin") return;
    if (autoFillApplying) return;

    const selectedIds = autoFillSelectedDraftIds;
    if (!selectedIds.length) {
      toast.error("Select at least one generated question");
      return;
    }

    const targetSectionId = resolveSectionId(
      autoFillSectionId || managedSections[0]?.id,
      managedSections
    );
    const capacityError = getSectionCapacityError(targetSectionId, questions, selectedIds.length);
    if (capacityError) {
      toast.error(capacityError);
      return;
    }

    const selectedRows = selectedIds
      .map((id) => autoFillDraftRows.find((row) => row.id === id))
      .filter(Boolean) as QuestionBankQuestion[];

    if (!selectedRows.length) {
      toast.error("No selected draft questions found");
      return;
    }

    setAutoFillApplying(true);
    try {
      const baseOrder = getNextQuestionOrder();
      const importedRows: TestQuestion[] = [];
      const targetSection = managedSections.find((s) => s.id === targetSectionId);

      for (let index = 0; index < selectedRows.length; index += 1) {
        const question = selectedRows[index];
        const questionOrder = baseOrder + index;

        const qAny = question as any;
        const payload: any = {
          question: question.question,
          options: Array.isArray(question.options) ? question.options : ["", "", "", ""],
          correctOption: Number.isFinite(Number(question.correctOption))
            ? Number(question.correctOption)
            : 0,
          explanation: question.explanation || "",
          difficulty: question.difficulty || "medium",
          sectionId: targetSectionId,
          subject: question.subject || "",
          chapter: question.chapter || "",
          topic: question.topic || "",
          marks:
            targetSection?.markingScheme?.correct != null
              ? Number(targetSection.markingScheme.correct)
              : (question.marks ?? null),
          negativeMarks:
            targetSection?.markingScheme?.incorrect != null
              ? Number(targetSection.markingScheme.incorrect)
              : (question.negativeMarks ?? null),
          isActive: false,
          source: "question_bank_auto",
          bankQuestionId: question.id,
          questionOrder,
          questionType: normalizeQuestionType(
            qAny.questionType || targetSection?.format || "MCQ_SINGLE"
          ),
          ...(qAny.referenceAnswer ? { referenceAnswer: qAny.referenceAnswer } : {}),
          ...(qAny.referenceKeywords?.length ? { referenceKeywords: qAny.referenceKeywords } : {}),
          ...(qAny.evaluationInstructions
            ? { evaluationInstructions: qAny.evaluationInstructions }
            : {}),
          // Preserve group linkage so CBT can load passage
          ...(qAny.groupId ? { groupId: qAny.groupId, groupOrder: qAny.groupOrder ?? null } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const newRef = await addDoc(qCol, payload);
        importedRows.push({
          id: newRef.id,
          questionOrder,
          question: payload.question,
          options: payload.options,
          correctOption: payload.correctOption,
          explanation: payload.explanation,
          difficulty: payload.difficulty,
          subject: payload.subject,
          topic: payload.topic,
          marks: payload.marks,
          negativeMarks: payload.negativeMarks,
          isActive: false,
          source: "question_bank_auto",
          bankQuestionId: question.id,
          sectionId: targetSectionId,
          questionType: payload.questionType,
        });
      }

      await resequenceQuestionsForSections(managedSections, [...questions, ...importedRows]);
      await syncTestQuestionCount();

      toast.success(
        `Added ${importedRows.length} draft question${importedRows.length === 1 ? "" : "s"} to test`
      );
      setAutoFillOpen(false);
      setAutoFillDraftRows([]);
      setAutoFillDraftSelected({});
    } catch (error) {
      console.error(error);
      toast.error("Failed to add auto-fill draft questions");
    } finally {
      setAutoFillApplying(false);
    }
  }

  async function handleAutoImportConfirm() {
    if (readOnly || questionSource === "admin") return;
    if (autoImportApplying) return;

    const sections = autoImportSections;
    if (!sections.length) {
      toast.error("No sections to import into");
      return;
    }

    setAutoImportApplying(true);
    try {
      // Build educator pool
      const educatorPool: QuestionBankQuestion[] = [...questionBankRows];

      // Build admin pool (if enabled)
      const adminPool: QuestionBankQuestion[] = autoImportIncludeAdmin
        ? [...adminQuestionBankRows]
        : [];

      // Track globally used IDs to prevent cross-section repetition
      const globalUsedIds = new Set<string>(Array.from(existingBankQuestionIds));

      const allImportedRows: TestQuestion[] = [];
      const baseOrder = getNextQuestionOrder();
      let skippedFullCount = 0;

      for (const section of sections) {
        const sectionTopics = section.topics.map(normalizeTopicValue).filter(Boolean);
        const topicSet = new Set(sectionTopics);

        const sectionSubjects = section.subjects.map((s) => s.trim().toLowerCase()).filter(Boolean);
        const subjectSet = new Set(sectionSubjects);

        const sectionChapters = section.chapters.map((c) => c.trim().toLowerCase()).filter(Boolean);
        const chapterSet = new Set(sectionChapters);

        const sectionTags = section.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
        const tagSet = new Set(sectionTags);

        const matchesFilters = (q: QuestionBankQuestion): boolean => {
          if (topicSet.size > 0 && !topicSet.has(normalizeTopicValue(q.topic))) return false;
          if (subjectSet.size > 0) {
            const qs = ((q as any).subjectName || q.subject || "").trim().toLowerCase();
            if (!subjectSet.has(qs)) return false;
          }
          if (chapterSet.size > 0) {
            const qc = ((q as any).chapter || "").trim().toLowerCase();
            if (!chapterSet.has(qc)) return false;
          }
          if (tagSet.size > 0) {
            const qTags: string[] = Array.isArray((q as any).tags)
              ? (q as any).tags.map((t: string) => t.trim().toLowerCase())
              : [];
            if (!qTags.some((t) => tagSet.has(t))) return false;
          }
          return true;
        };

        const matchesFormat = (q: QuestionBankQuestion) => {
          if (!section.format) return true;
          // Default typeless bank questions to MCQ_SINGLE — don't bypass
          const qType = normalizeQuestionType((q as any).questionType || "MCQ_SINGLE");
          return qType === normalizeQuestionType(section.format);
        };

        // Enforce remaining capacity so re-running the dialog never overfills
        const sectionMeta = managedSections.find((s) => s.id === section.id);
        const currentInSection = getSectionQuestionCount(section.id, questions);
        const cap =
          sectionMeta?.questionsCount != null
            ? Math.max(0, sectionMeta.questionsCount - currentInSection)
            : section.questionCount;
        const needed = Math.max(0, Math.min(section.questionCount, cap));
        if (needed === 0) {
          skippedFullCount += 1;
          continue;
        }

        // Filter by all active filters and question format
        const educatorMatches = educatorPool.filter(
          (q) => !globalUsedIds.has(q.id) && matchesFormat(q) && matchesFilters(q)
        );
        const adminMatches = adminPool.filter(
          (q) => !globalUsedIds.has(q.id) && matchesFormat(q) && matchesFilters(q)
        );

        // Score by difficulty proximity
        const scoreDifficulty = (q: QuestionBankQuestion, targetDifficulty: number): number => {
          const qVal = difficultyToValue(q.difficulty);
          return 1 - Math.abs(qVal - targetDifficulty);
        };

        // Sort educator matches by difficulty score (best first)
        const sortedEducator = [...educatorMatches].sort(
          (a, b) => scoreDifficulty(b, section.difficulty) - scoreDifficulty(a, section.difficulty)
        );
        const sortedAdmin = [...adminMatches].sort(
          (a, b) => scoreDifficulty(b, section.difficulty) - scoreDifficulty(a, section.difficulty)
        );

        // Pick questions: educator first, then admin
        const picked: QuestionBankQuestion[] = [];
        const pickedIds = new Set<string>();

        // Phase 1: pick with difficulty preference
        for (const q of sortedEducator) {
          if (picked.length >= needed) break;
          if (pickedIds.has(q.id)) continue;
          picked.push(q);
          pickedIds.add(q.id);
        }
        for (const q of sortedAdmin) {
          if (picked.length >= needed) break;
          if (pickedIds.has(q.id)) continue;
          picked.push(q);
          pickedIds.add(q.id);
        }

        // Phase 2 (fallback): if not enough, relax difficulty — just pick any remaining topic-matched
        if (picked.length < needed) {
          const remainingEducator = educatorMatches.filter((q) => !pickedIds.has(q.id));
          const remainingAdmin = adminMatches.filter((q) => !pickedIds.has(q.id));
          for (const q of shuffleList(remainingEducator)) {
            if (picked.length >= needed) break;
            picked.push(q);
            pickedIds.add(q.id);
          }
          for (const q of shuffleList(remainingAdmin)) {
            if (picked.length >= needed) break;
            picked.push(q);
            pickedIds.add(q.id);
          }
        }

        // Shuffle the final selection
        const shuffled = shuffleList(picked);

        // Mark as globally used
        shuffled.forEach((q) => globalUsedIds.add(q.id));

        // Write to Firestore
        for (let i = 0; i < shuffled.length; i++) {
          const question = shuffled[i];
          const questionOrder = baseOrder + allImportedRows.length;

          const payload: any = {
            question: question.question,
            options: Array.isArray(question.options) ? question.options : ["", "", "", ""],
            correctOption: Number.isFinite(Number(question.correctOption))
              ? Number(question.correctOption)
              : 0,
            explanation: question.explanation || "",
            difficulty: question.difficulty || "medium",
            sectionId: section.id,
            subject: question.subject || "",
            chapter: question.chapter || "",
            topic: question.topic || "",
            marks:
              section.markingScheme?.correct != null
                ? Number(section.markingScheme.correct)
                : (question.marks ?? null),
            negativeMarks:
              section.markingScheme?.incorrect != null
                ? Number(section.markingScheme.incorrect)
                : (question.negativeMarks ?? null),
            isActive: true,
            source: "auto_import",
            bankQuestionId: question.id,
            questionOrder,
            questionType: normalizeQuestionType(
              (question as any).questionType || section.format || "MCQ_SINGLE"
            ),
            ...((question as any).referenceAnswer
              ? { referenceAnswer: (question as any).referenceAnswer }
              : {}),
            ...((question as any).referenceKeywords?.length
              ? { referenceKeywords: (question as any).referenceKeywords }
              : {}),
            ...((question as any).evaluationInstructions
              ? { evaluationInstructions: (question as any).evaluationInstructions }
              : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          const newRef = await addDoc(qCol, payload);
          allImportedRows.push({
            id: newRef.id,
            questionOrder,
            question: payload.question,
            options: payload.options,
            correctOption: payload.correctOption,
            explanation: payload.explanation,
            difficulty: payload.difficulty,
            subject: payload.subject,
            topic: payload.topic,
            marks: payload.marks,
            negativeMarks: payload.negativeMarks,
            isActive: true,
            source: "auto_import",
            bankQuestionId: question.id,
            sectionId: section.id,
            questionType: payload.questionType,
          });
        }
      }

      if (!allImportedRows.length) {
        if (
          skippedFullCount > 0 &&
          skippedFullCount === sections.filter((s) => s.topics.length > 0).length
        ) {
          toast.info("All sections are already at their question limit.");
        } else {
          toast.error("No matching questions found for any section. Check topics.");
        }
        return;
      }

      await resequenceQuestionsForSections(managedSections, [...questions, ...allImportedRows]);
      await syncTestQuestionCount();

      const sectionSummary = sections
        .map((s) => {
          const added = allImportedRows.filter((r) => r.sectionId === s.id).length;
          return `${s.name}: ${added}/${s.questionCount}`;
        })
        .join(", ");

      toast.success(`Auto Import complete — ${sectionSummary}`);
      setAutoFillOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Auto Import failed");
    } finally {
      setAutoImportApplying(false);
    }
  }

  async function importSelectedFromQuestionBank() {
    if (readOnly || questionSource === "admin") {
      toast.info("This test is read-only.");
      return;
    }
    if (questionBankLoading || questionBankImporting) return;

    const selectedIds = selectedQuestionBankIds.filter((id) => !existingBankQuestionIds.has(id));
    if (!selectedIds.length) {
      toast.info("No new questions selected to import");
      return;
    }

    const targetSectionId = resolveSectionId(questionBankSectionId, managedSections);
    const selectedRows = selectedIds
      .map((id) => questionBankRows.find((row) => row.id === id))
      .filter(Boolean) as QuestionBankQuestion[];

    if (!selectedRows.length) {
      toast.error("Selected question bank entries were not found");
      return;
    }

    const sectionLimit = getSectionQuestionLimit(targetSectionId);
    const currentSectionCount = getSectionQuestionCount(targetSectionId, questions);
    if (sectionLimit != null && currentSectionCount + selectedRows.length > sectionLimit) {
      toast.error(`${getSectionLabel(targetSectionId)} allows only ${sectionLimit} questions`);
      return;
    }

    const defaultOrder = getNextQuestionOrder();
    const anchorQuestion = questionBankInsertAfterId
      ? questions.find((question) => question.id === questionBankInsertAfterId)
      : null;
    const anchorOrder = Number(anchorQuestion?.questionOrder);
    const anchorSectionId = resolveSectionId(anchorQuestion?.sectionId, managedSections);
    const useAnchoredOrder = Boolean(
      anchorQuestion && anchorSectionId === targetSectionId && Number.isFinite(anchorOrder)
    );

    setQuestionBankImporting(true);
    try {
      const importedRows: TestQuestion[] = [];

      for (let index = 0; index < selectedRows.length; index += 1) {
        const bankQuestion = selectedRows[index];
        const questionOrder = useAnchoredOrder
          ? anchorOrder + (index + 1) / 1000
          : defaultOrder + index;

        const payload: any = {
          question: bankQuestion.question,
          options: Array.isArray(bankQuestion.options) ? bankQuestion.options : ["", "", "", ""],
          correctOption: Number.isFinite(Number(bankQuestion.correctOption))
            ? Number(bankQuestion.correctOption)
            : 0,
          explanation: bankQuestion.explanation || "",
          difficulty: bankQuestion.difficulty || "medium",
          sectionId: targetSectionId,
          subject: bankQuestion.subject || "",
          chapter: bankQuestion.chapter || "",
          topic: bankQuestion.topic || "",
          marks: bankQuestion.marks != null ? Number(bankQuestion.marks) : null,
          negativeMarks:
            bankQuestion.negativeMarks != null ? Number(bankQuestion.negativeMarks) : null,
          isActive: true,
          source: "question_bank",
          bankQuestionId: bankQuestion.id,
          questionOrder,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const newRef = await addDoc(qCol, payload);
        importedRows.push({
          id: newRef.id,
          questionOrder,
          question: payload.question,
          options: payload.options,
          correctOption: payload.correctOption,
          explanation: payload.explanation,
          difficulty: payload.difficulty,
          subject: payload.subject,
          topic: payload.topic,
          marks: payload.marks,
          negativeMarks: payload.negativeMarks,
          isActive: true,
          source: "question_bank",
          bankQuestionId: bankQuestion.id,
          sectionId: targetSectionId,
        });
      }

      await resequenceQuestionsForSections(managedSections, [...questions, ...importedRows]);
      await syncTestQuestionCount();

      toast.success(
        `Imported ${importedRows.length} question${importedRows.length === 1 ? "" : "s"} from question bank`
      );
      setQuestionBankOpen(false);
      setQuestionBankSelected({});
      setQuestionBankInsertAfterId(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to import from question bank");
    } finally {
      setQuestionBankImporting(false);
    }
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

  async function saveQuestion(): Promise<boolean> {
    if (readOnly) {
      toast.info("This test is read-only.");
      return false;
    }
    if (saving) return false;

    const trimmedQuestion = formQuestion.trim();
    const normalizedOptions = formOptions.slice(0, 6).map((value) => value ?? "");
    const nonEmptyOptions = normalizedOptions.filter((value) => value.trim() !== "");
    const isSubjective = isSubjectiveType(formQuestionType);

    if (!trimmedQuestion) {
      toast.error("Question is required");
      return false;
    }
    if (!isSubjective && nonEmptyOptions.length < 2) {
      toast.error("At least two options are required");
      return false;
    }
    if (
      !isSubjective &&
      (!normalizedOptions[formCorrect] || normalizedOptions[formCorrect].trim() === "")
    ) {
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
      questionType: formQuestionType || "MCQ",
    };

    if (formMarks.trim() !== "") payload.marks = Number(formMarks);
    else payload.marks = null;

    if (formNegMarks.trim() !== "") payload.negativeMarks = Number(formNegMarks);
    else payload.negativeMarks = null;

    if (isSubjective) {
      payload.referenceAnswer = formReferenceAnswer || "";
      payload.referenceKeywords = formReferenceKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      payload.referenceAnswerFileUrls = formReferenceAnswerFileUrls;
      payload.evaluationInstructions = formEvaluationInstructions || "";
    }

    const defaultOrder = getNextQuestionOrder();
    const insertAfterQuestion = insertAfterQuestionId
      ? questions.find((question) => question.id === insertAfterQuestionId)
      : null;
    const anchorOrder = Number(insertAfterQuestion?.questionOrder);
    const anchorSectionId = resolveSectionId(insertAfterQuestion?.sectionId, managedSections);
    const insertedAfterAnchorOrder =
      insertAfterQuestion && anchorSectionId === targetSectionId && Number.isFinite(anchorOrder)
        ? anchorOrder + 0.5
        : defaultOrder;

    setSaving(true);
    try {
      if (!editingId) {
        const newRef = await addDoc(qCol, {
          ...payload,
          questionOrder: insertedAfterAnchorOrder,
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
            questionOrder: insertedAfterAnchorOrder,
            questionType: formQuestionType || "MCQ",
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
        topic: q.topic || "",
        marks: q.marks ?? null,
        negativeMarks: q.negativeMarks ?? null,
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

    const marks = data?.marks != null ? Number(data.marks) : null;
    const negativeMarks = data?.negativeMarks != null ? Number(data.negativeMarks) : null;

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
      marks,
      negativeMarks,
      questionType: data?.questionType ? String(data.questionType) : undefined,
      referenceAnswer: data?.referenceAnswer ? String(data.referenceAnswer) : undefined,
      referenceKeywords: Array.isArray(data?.referenceKeywords)
        ? data.referenceKeywords.map(String).filter(Boolean)
        : undefined,
      referenceAnswerFileUrls: Array.isArray(data?.referenceAnswerFileUrls)
        ? data.referenceAnswerFileUrls.map(String).filter(Boolean)
        : data?.referenceAnswerFileUrl
          ? [String(data.referenceAnswerFileUrl)]
          : undefined,
      evaluationInstructions: data?.evaluationInstructions
        ? String(data.evaluationInstructions)
        : undefined,
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
            <h2 className="text-sm font-bold md:text-lg">
              {readOnly ? "View Questions" : "Manage Questions"}
            </h2>
            <p className="text-[10px] text-muted-foreground md:text-xs">
              {readOnly
                ? "Read-only mode for admin-imported test."
                : "Add questions manually or import them from a PDF with AI. Saved questions stay in the same Firestore path."}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 lg:justify-start">
            {(!isPageMode || !isApp) && (
              <Button variant="outline" onClick={requestCloseManager} className="rounded-xl">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            )}
            {!readOnly ? (
              <>
                <Button
                  variant="outline"
                  className="rounded-xl"
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
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={openAutoFillDialog}
              disabled={readOnly || questionSource === "admin"}
            >
              Auto Import
            </Button>
          </div>
        </div>

        {/* Manage Question Container */}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* Question List starts here */}
          <div className="order-2 flex min-h-0 w-full shrink-0 flex-col bg-muted/10">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain p-3">
              <div className="space-y-3 p-4">
                {useSections && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sections
                    </p>
                  </div>
                )}
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
                        const editorSectionId = resolveSectionId(formSectionId, managedSections);
                        const showInlineEditor = editorOpen && editorSectionId === section.id;
                        const preferredAnchorId = editingId || insertAfterQuestionId || null;
                        const anchorInSection =
                          preferredAnchorId != null &&
                          sectionQuestions.some((question) => question.id === preferredAnchorId);
                        const inlineEditorAfterQuestionId =
                          showInlineEditor && anchorInSection ? preferredAnchorId : null;
                        const inlineEditorAtEnd =
                          showInlineEditor && sectionQuestions.length > 0 && !anchorInSection;
                        const inlineEditor = showInlineEditor ? (
                          <QuestionEditor
                            inlineMode
                            editingId={editingId}
                            readOnly={readOnly}
                            editorOpen={editorOpen}
                            openNew={openNew}
                            requestCloseEditor={requestCloseEditor}
                            formQuestion={formQuestion}
                            setFormQuestion={setFormQuestion}
                            formOptions={formOptions}
                            setFormOptions={setFormOptions}
                            formCorrect={formCorrect}
                            setFormCorrect={setFormCorrect}
                            formDifficulty={formDifficulty}
                            setFormDifficulty={(value) => setFormDifficulty(value as Difficulty)}
                            formSectionId={formSectionId}
                            setFormSectionId={setFormSectionId}
                            managedSections={managedSections}
                            formMarks={formMarks}
                            setFormMarks={setFormMarks}
                            formNegMarks={formNegMarks}
                            setFormNegMarks={setFormNegMarks}
                            formActive={formActive}
                            handleEditorPublishChange={handleEditorPublishChange}
                            removeOptionField={removeOptionField}
                            addOptionField={addOptionField}
                            handleQuestionPreviewImageClick={handleQuestionPreviewImageClick}
                            previewOptions={previewOptions}
                            handleOptionPreviewImageClick={handleOptionPreviewImageClick}
                            saving={saving}
                            saveQuestion={() => {
                              void saveQuestion();
                            }}
                            formQuestionType={formQuestionType}
                            setFormQuestionType={setFormQuestionType}
                            formReferenceAnswer={formReferenceAnswer}
                            setFormReferenceAnswer={setFormReferenceAnswer}
                            formReferenceKeywords={formReferenceKeywords}
                            setFormReferenceKeywords={setFormReferenceKeywords}
                            formReferenceAnswerFileUrls={formReferenceAnswerFileUrls}
                            setFormReferenceAnswerFileUrls={setFormReferenceAnswerFileUrls}
                            formEvaluationInstructions={formEvaluationInstructions}
                            setFormEvaluationInstructions={setFormEvaluationInstructions}
                          />
                        ) : null;

                        return (
                          <SortableSectionCard
                            key={section.id}
                            section={section}
                            index={index}
                            questions={sectionQuestions}
                            collapsed={collapsed}
                            readOnly={readOnly}
                            canManageSection={useSections}
                            editingId={editingId}
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
                            onImportFromBank={openQuestionBankInSection}
                            onAddAfterQuestion={openNewAfterQuestion}
                            onImportAfterQuestion={openQuestionBankAfterQuestion}
                            onOpenEdit={openEdit}
                            onDuplicate={duplicateQuestion}
                            onDeleteQuestion={deleteQuestion}
                            onToggleActive={toggleActive}
                            onAddSection={handleAddSectionClick}
                            inlineEditor={inlineEditor}
                            inlineEditorAfterQuestionId={inlineEditorAfterQuestionId}
                            inlineEditorAtEnd={inlineEditorAtEnd}
                            contextId={testId}
                            reportedQuestionIds={reportedQuestionIds}
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

        <Dialog
          open={autoFillOpen}
          onOpenChange={(open) => {
            setAutoFillOpen(open);
            if (!open) {
              setAutoFillDraftRows([]);
              setAutoFillDraftSelected({});
            }
          }}
        >
          <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden rounded-2xl">
            <DialogHeader>
              <DialogTitle>Auto Import Questions</DialogTitle>
              <DialogDescription>
                Configure each section's topics, question count, and difficulty. Questions are
                matched strictly by topic from your question bank.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {/* Sections overview */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sections
                </p>
                {autoImportSections.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No sections found in this test.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {autoImportSections.map((section, sectionIndex) => (
                      <div
                        key={section.id}
                        className="space-y-3 rounded-xl border border-border bg-card p-4"
                      >
                        {/* Section name header */}
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="px-3 py-1 text-sm font-semibold">
                            {section.name}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Section {sectionIndex + 1} of {autoImportSections.length}
                          </span>
                        </div>

                        {/* Filters grid */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">
                              Subject
                            </Label>
                            <MultiSelect
                              options={allAvailableSubjects}
                              selected={section.subjects}
                              onChange={(vals) =>
                                setAutoImportSections((prev) =>
                                  prev.map((s) =>
                                    s.id === section.id ? { ...s, subjects: vals } : s
                                  )
                                )
                              }
                              placeholder="Any subject"
                            />
                          </div>
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">
                              Chapter
                            </Label>
                            <MultiSelect
                              options={allAvailableChapters}
                              selected={section.chapters}
                              onChange={(vals) =>
                                setAutoImportSections((prev) =>
                                  prev.map((s) =>
                                    s.id === section.id ? { ...s, chapters: vals } : s
                                  )
                                )
                              }
                              placeholder="Any chapter"
                            />
                          </div>
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">
                              Topic
                            </Label>
                            <MultiSelect
                              options={allAvailableTopics}
                              selected={section.topics}
                              onChange={(vals) =>
                                setAutoImportSections((prev) =>
                                  prev.map((s) =>
                                    s.id === section.id ? { ...s, topics: vals } : s
                                  )
                                )
                              }
                              placeholder="Any topic"
                            />
                          </div>
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">Tags</Label>
                            <MultiSelect
                              options={allAvailableTags}
                              selected={section.tags}
                              onChange={(vals) =>
                                setAutoImportSections((prev) =>
                                  prev.map((s) => (s.id === section.id ? { ...s, tags: vals } : s))
                                )
                              }
                              placeholder="Any tag"
                            />
                          </div>
                        </div>

                        {/* Question count + Difficulty row */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">
                              Question Count
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              value={section.questionCount}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setAutoImportSections((prev) =>
                                  prev.map((s) =>
                                    s.id === section.id ? { ...s, questionCount: val } : s
                                  )
                                );
                              }}
                              className="rounded-xl"
                            />
                          </div>
                          <div>
                            <Label className="mb-1 block text-xs text-muted-foreground">
                              Difficulty:{" "}
                              <span className="font-semibold text-foreground">
                                {getDifficultyLabel(section.difficulty)} (
                                {section.difficulty.toFixed(2)})
                              </span>
                            </Label>
                            <Slider
                              min={0}
                              max={1}
                              step={0.01}
                              value={[section.difficulty]}
                              onValueChange={([val]) => {
                                setAutoImportSections((prev) =>
                                  prev.map((s) =>
                                    s.id === section.id ? { ...s, difficulty: val } : s
                                  )
                                );
                              }}
                              className="mt-2"
                            />
                            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                              <span>Easy</span>
                              <span>Medium</span>
                              <span>Hard</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Admin import option */}
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={autoImportIncludeAdmin}
                    onChange={(e) => setAutoImportIncludeAdmin(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium">
                      Include questions from Admin Question Bank
                    </span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {autoImportIncludeAdmin
                        ? "Using both educator + admin question banks"
                        : "Using only your educator question bank"}
                    </p>
                  </div>
                </label>
                {autoImportIncludeAdmin && adminQuestionBankLoading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading admin question bank...
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-border bg-muted/10 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Import Summary
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span>
                    Total questions:{" "}
                    <strong>
                      {autoImportSections.reduce((sum, s) => sum + s.questionCount, 0)}
                    </strong>
                  </span>
                  <span>
                    Sections: <strong>{autoImportSections.length}</strong>
                  </span>
                  <span>
                    Educator bank: <strong>{questionBankRows.length}</strong> available
                  </span>
                  {autoImportIncludeAdmin && (
                    <span>
                      Admin bank: <strong>{adminQuestionBankRows.length}</strong> available
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <DialogFooter className="flex justify-end gap-2 border-t pt-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setAutoFillOpen(false)}
                disabled={autoImportApplying}
              >
                Cancel
              </Button>
              <Button
                className="gradient-bg rounded-xl text-white"
                onClick={handleAutoImportConfirm}
                disabled={
                  autoImportApplying ||
                  questionBankLoading ||
                  (autoImportIncludeAdmin && adminQuestionBankLoading) ||
                  autoImportSections.every((s) => s.questionCount === 0)
                }
              >
                {autoImportApplying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...
                  </>
                ) : (
                  "Confirm Import"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={questionBankOpen}
          onOpenChange={(open) => {
            setQuestionBankOpen(open);
            if (!open) {
              setQuestionBankInsertAfterId(null);
              setQuestionBankSelected({});
            }
          }}
        >
          <DialogContent className="max-w-5xl rounded-2xl">
            <DialogHeader>
              <DialogTitle>Import Questions from Educator Question Bank</DialogTitle>
              <DialogDescription>
                Select questions from your bank at educators/{`{uid}`}/question_bank and add them to
                this test.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <Label className="text-xs">Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={questionBankSearch}
                    onChange={(event) => setQuestionBankSearch(event.target.value)}
                    placeholder="Search question / option / topic..."
                    className="rounded-xl pl-9"
                  />
                </div>
              </div>

              <div className="lg:col-span-2">
                <Label className="text-xs">Subject</Label>
                <Select
                  value={questionBankSubject}
                  onValueChange={(v) => {
                    setQuestionBankSubject(v);
                    setQuestionBankChapter("all");
                    setQuestionBankTopic("all");
                  }}
                >
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    {questionBankSubjects.map((subject) => (
                      <SelectItem key={subject} value={subject}>
                        {subject === "all" ? "All subjects" : subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-2">
                <Label className="text-xs">Chapter</Label>
                <Select
                  value={questionBankChapter}
                  onValueChange={(v) => {
                    setQuestionBankChapter(v);
                    setQuestionBankTopic("all");
                  }}
                >
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue placeholder="All chapters" />
                  </SelectTrigger>
                  <SelectContent>
                    {questionBankChapters.map((ch) => (
                      <SelectItem key={ch} value={ch}>
                        {ch === "all" ? "All chapters" : ch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-2">
                <Label className="text-xs">Topic</Label>
                <Select value={questionBankTopic} onValueChange={setQuestionBankTopic}>
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue placeholder="All topics" />
                  </SelectTrigger>
                  <SelectContent>
                    {questionBankTopics.map((topic) => (
                      <SelectItem key={topic} value={topic}>
                        {topic === "all" ? "All topics" : topic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-2">
                <Label className="text-xs">Difficulty</Label>
                <Select
                  value={questionBankDifficulty}
                  onValueChange={(value: "all" | Difficulty) => setQuestionBankDifficulty(value)}
                >
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-12">
                <Label className="text-xs">Add To Section</Label>
                <Select value={questionBankSectionId} onValueChange={setQuestionBankSectionId}>
                  <SelectTrigger className="mt-1 rounded-xl">
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

            <div className="mt-3 overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between bg-muted/30 p-3">
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {filteredQuestionBankRows.length}
                  </span>{" "}
                  / {questionBankRows.length}
                </p>
                <p className="text-sm">
                  Selected: <span className="font-semibold">{selectedQuestionBankIds.length}</span>
                </p>
              </div>

              <div className="max-h-[460px] overflow-auto">
                {questionBankLoading ? (
                  <div className="flex items-center justify-center p-8 text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading educator question
                    bank...
                  </div>
                ) : filteredQuestionBankRows.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground">
                    No questions match your filters.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredQuestionBankRows.map((question) => {
                      const alreadyInTest = existingBankQuestionIds.has(question.id);
                      const checked = !!questionBankSelected[question.id];
                      return (
                        <div key={question.id} className="flex items-start gap-3 p-3">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            disabled={alreadyInTest}
                            onChange={(event) =>
                              setQuestionBankSelected((prev) => ({
                                ...prev,
                                [question.id]: event.target.checked,
                              }))
                            }
                          />

                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className="rounded-full">
                                {(question.difficulty || "medium").toUpperCase()}
                              </Badge>
                              {question.subject ? (
                                <Badge variant="secondary" className="rounded-full">
                                  {question.subject}
                                </Badge>
                              ) : null}
                              {question.topic ? (
                                <Badge variant="secondary" className="rounded-full">
                                  {question.topic}
                                </Badge>
                              ) : null}
                              {alreadyInTest ? (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                >
                                  <CheckCircle2 className="mr-1 h-3 w-3" /> Already in test
                                </Badge>
                              ) : null}
                            </div>

                            <div className="line-clamp-3">
                              <HtmlView
                                html={question.question || ""}
                                className="break-words text-sm"
                              />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Options: {question.options?.length || 0}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setQuestionBankOpen(false)}
                disabled={questionBankLoading || questionBankImporting}
              >
                Cancel
              </Button>
              <Button
                className="gradient-bg rounded-xl text-white"
                onClick={importSelectedFromQuestionBank}
                disabled={
                  questionBankLoading ||
                  questionBankImporting ||
                  selectedQuestionBankIds.length === 0
                }
              >
                {questionBankImporting ? "Importing..." : "Add Selected"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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

        {/* Create Section Dialog */}
        <Dialog open={addSectionDialogOpen} onOpenChange={setAddSectionDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle>Create New Section</DialogTitle>
              <DialogDescription>
                Add a new section to your test paper with configuration options.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="section-name">
                  Section Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="section-name"
                  placeholder="e.g., Mathematics, Section A, Part 1"
                  value={pendingSectionName}
                  onChange={(e) => setPendingSectionName(e.target.value)}
                  className="rounded-xl"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="questions-limit">Number of Questions</Label>
                  <Input
                    id="questions-limit"
                    type="number"
                    min="1"
                    placeholder="e.g., 10"
                    value={pendingSectionQuestionsLimit}
                    onChange={(e) => setPendingSectionQuestionsLimit(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attempts-limit">Attempts Limit</Label>
                  <Input
                    id="attempts-limit"
                    type="number"
                    min="1"
                    placeholder="e.g., 3"
                    value={pendingSectionAttemptsLimit}
                    onChange={(e) => setPendingSectionAttemptsLimit(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="time-limit">Time Limit (minutes)</Label>
                  <Input
                    id="time-limit"
                    type="number"
                    min="1"
                    placeholder="e.g., 30"
                    value={pendingSectionTimeLimit}
                    onChange={(e) => setPendingSectionTimeLimit(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div className="flex flex-col space-y-2">
                  <Label htmlFor="custom-marks">Custom Marks</Label>
                  <div className="flex h-full w-full items-center">
                    <Switch
                      checked={ischecked}
                      onCheckedChange={(checked) => setIsChecked(checked)}
                    />
                  </div>
                </div>
              </div>

              {ischecked && (
                <>
                  <div className="mt-2 border-t pt-3" />

                  <div className="space-y-3">
                    <h1 className="text-sm font-semibold">Custom Marks Configuration</h1>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Correct (+)</Label>
                        <Input
                          type="number"
                          value={markingScheme.correct}
                          onChange={(e) =>
                            setMarkingScheme({
                              ...markingScheme,
                              correct: Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Incorrect (-)</Label>
                        <Input
                          type="number"
                          value={markingScheme.incorrect}
                          onChange={(e) =>
                            setMarkingScheme({
                              ...markingScheme,
                              incorrect: Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Unattempted</Label>
                        <Input
                          type="number"
                          value={markingScheme.unattempted}
                          onChange={(e) =>
                            setMarkingScheme({
                              ...markingScheme,
                              unattempted: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAddSectionDialogOpen(false);
                  setPendingSectionName("");
                  setPendingSectionQuestionsLimit("");
                  setPendingSectionAttemptsLimit("");
                  setPendingSectionTimeLimit("");
                  setIsChecked(false);
                  setMarkingScheme({
                    correct: 4,
                    incorrect: -1,
                    unattempted: 0,
                  });
                }}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleCreateSection(pendingSectionName)}
                disabled={!pendingSectionName.trim()}
                className="gradient-bg rounded-xl text-white"
              >
                Create Section
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default QuestionsManager;

