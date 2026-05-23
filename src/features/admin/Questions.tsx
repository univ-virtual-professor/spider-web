// pages/admin/Questions.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Search,
  Trash2,
  Edit,
  Copy,
  CheckCircle2,
  XCircle,
  BarChart3,
  Loader2,
  X,
  GripVertical,
} from "lucide-react";

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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@shared/lib/utils";
import { auth, db } from "@shared/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  where,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Switch } from "@shared/ui/switch";
import { Progress } from "@shared/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { toast } from "@shared/hooks/use-toast";
import ImageTextarea from "@features/educator/components/ImageTextarea";
import QuestionActionHoverWrapper from "@shared/components/QuestionActionHoverWrapper";

type Difficulty = "easy" | "medium" | "hard";

type TestSection = {
  id: string;
  name: string;
};

type TestSeries = {
  id: string;
  title: string;
  subject?: string;
  level?: string;
  durationMinutes?: number;
  positiveMarks?: number;
  negativeMarks?: number;
  questionsCount?: number;
  sections?: TestSection[];
};

type QuestionDoc = {
  id: string;
  question: string;
  options: string[];
  correctOption: number; // index
  explanation?: string;
  difficulty: Difficulty;
  subject?: string;
  chapter?: string;
  topic?: string;

  marks?: number;
  negativeMarks?: number;

  isActive?: boolean;
  usageCount?: number;

  source?: "manual" | "question_bank" | string;
  bankQuestionId?: string;
  contentFormat?: "text" | "html" | "latex";
  sectionId?: string;

  // Extended fields
  format?: "single_correct_mcq" | "multicorrect_mcq" | "subjective" | "subjective_long";
  correctOptions?: number[];
  topics?: string[];
  questionImage?: string;
  optionImages?: string[];
  explanationImage?: string;
  subjectId?: string;
  subjectName?: string;

  createdAtTs?: Timestamp | null;
  updatedAtTs?: Timestamp | null;
  questionOrder?: number;
};

type QBQuestion = {
  id: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  difficulty?: Difficulty;
  question: string; // HTML
  options: string[]; // HTML
  correctOption: number;
  explanation?: string;
  marks?: number;
  negativeMarks?: number;
  updatedAtTs?: Timestamp | null;
};

function stripHtml(html: string) {
  if (!html) return "";
  try {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  } catch {
    return String(html);
  }
}

function fmtDate(ts?: Timestamp | null) {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function difficultyBadge(d: Difficulty) {
  if (d === "easy") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (d === "hard") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
}

function safeStr(v: any, fb = "") {
  return typeof v === "string" ? v : fb;
}
function safeNum(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}
function normalizeDifficulty(v: any): Difficulty {
  const s = String(v || "")
    .toLowerCase()
    .trim();
  if (s === "easy" || s === "medium" || s === "hard") return s;
  return "medium";
}

function normalizeSections(rawSections: any, subjectFallback?: string): TestSection[] {
  const parsed = Array.isArray(rawSections)
    ? rawSections
        .map((section: any, index: number) => ({
          id: String(section?.id || `sec_${index + 1}`).trim(),
          name: String(section?.name || `Section ${index + 1}`).trim(),
        }))
        .filter((section) => section.id)
    : [];

  if (parsed.length > 0) return parsed;

  return [{ id: "main", name: String(subjectFallback || "General").trim() || "General" }];
}

function resolveSectionId(sectionId: string | undefined, sections: TestSection[]): string {
  const fallback = sections[0]?.id || "main";
  const normalized = String(sectionId || "").trim();
  if (!normalized) return fallback;
  return sections.some((section) => section.id === normalized) ? normalized : fallback;
}

const DIFFICULTY_OPTIONS: Difficulty[] = ["easy", "medium", "hard"];

function sortQuestionsForDisplay(rows: QuestionDoc[]): QuestionDoc[] {
  return [...rows].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a.questionOrder)) ? Number(a.questionOrder) : null;
    const bOrder = Number.isFinite(Number(b.questionOrder)) ? Number(b.questionOrder) : null;
    if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
    if (aOrder != null && bOrder == null) return -1;
    if (aOrder == null && bOrder != null) return 1;
    const aTime = a.createdAtTs?.toMillis?.() ?? 0;
    const bTime = b.createdAtTs?.toMillis?.() ?? 0;
    return aTime - bTime;
  });
}

function SortableCardShell({
  id,
  dndEnabled,
  children,
}: {
  id: string;
  dndEnabled: boolean;
  children: (dragProps: React.HTMLAttributes<HTMLElement>, isDragging: boolean) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !dndEnabled,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners }, isDragging)}
    </div>
  );
}

export default function Questions() {
  const navigate = useNavigate();
  const { testId } = useParams<{ testId: string }>();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tests, setTests] = useState<TestSeries[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);

  const [selectedTestId, setSelectedTestId] = useState<string>(testId || "");
  const selectedTest = useMemo(
    () => tests.find((t) => t.id === selectedTestId) || null,
    [tests, selectedTestId]
  );

  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | Difficulty>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");

  // collapsed section IDs in the section-grouped view
  const [collapsedQSections, setCollapsedQSections] = useState<string[]>([]);

  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // editor dialog
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingToSection, setAddingToSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formQuestion, setFormQuestion] = useState("");
  const [formOptions, setFormOptions] = useState<string[]>(["", "", "", ""]);
  const [formCorrect, setFormCorrect] = useState<number>(0);
  const [formExplanation, setFormExplanation] = useState("");
  const [formDifficulty, setFormDifficulty] = useState<Difficulty>("medium");
  const [formSectionId, setFormSectionId] = useState<string>("main");
  const [formSubject, setFormSubject] = useState("");
  const [formChapter, setFormChapter] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formMarks, setFormMarks] = useState<string>("");
  const [formNegMarks, setFormNegMarks] = useState<string>("");
  const [formActive, setFormActive] = useState(true);
  const [editingOriginalScoring, setEditingOriginalScoring] = useState<{
    correctOption?: number;
    marks?: number;
    negativeMarks?: number;
  } | null>(null);

  // Extended editor fields
  const [formFormat, setFormFormat] =
    useState<NonNullable<QuestionDoc["format"]>>("single_correct_mcq");
  const [formTopics, setFormTopics] = useState("");
  const [formMultiCorrects, setFormMultiCorrects] = useState<number[]>([0]);
  const [formQImgUrl, setFormQImgUrl] = useState("");
  const [formOImgUrls, setFormOImgUrls] = useState<string[]>(["", "", "", ""]);
  const [formEImgUrl, setFormEImgUrl] = useState("");
  const [formSubjectId, setFormSubjectId] = useState("");
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);

  // import from GLOBAL question bank
  const [qbOpen, setQbOpen] = useState(false);
  const [qbLoading, setQbLoading] = useState(false);
  const [qbRows, setQbRows] = useState<QBQuestion[]>([]);
  const [qbSearch, setQbSearch] = useState("");
  const [qbSubject, setQbSubject] = useState<string>("all");
  const [qbChapter, setQbChapter] = useState<string>("all");
  const [qbTopic, setQbTopic] = useState<string>("all");
  const [qbDifficulty, setQbDifficulty] = useState<"all" | Difficulty>("all");
  const [qbSelected, setQbSelected] = useState<Record<string, boolean>>({});
  const [qbSectionId, setQbSectionId] = useState<string>("main");

  const selectedTestSections = useMemo(
    () => normalizeSections(selectedTest?.sections, selectedTest?.subject),
    [selectedTest]
  );
  const sectionNameById = useMemo(
    () =>
      selectedTestSections.reduce<Record<string, string>>((acc, section) => {
        acc[section.id] = section.name;
        return acc;
      }, {}),
    [selectedTestSections]
  );

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Load subjects for subject dropdown
  useEffect(() => {
    getDocs(query(collection(db, "subjects"), orderBy("name"))).then((snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
    });
  }, []);

  // Load tests
  useEffect(() => {
    if (!uid) {
      setTests([]);
      setTestsLoading(false);
      return;
    }

    setTestsLoading(true);

    const qTests = query(collection(db, "test_series"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qTests,
      (snap) => {
        const rows: TestSeries[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: safeStr(data?.title, "Untitled Test"),
            subject: safeStr(data?.subject, ""),
            level: safeStr(data?.level, ""),
            durationMinutes: safeNum(data?.durationMinutes ?? data?.duration, 60),
            positiveMarks: safeNum(data?.positiveMarks, undefined as any),
            negativeMarks: safeNum(data?.negativeMarks, undefined as any),
            questionsCount: safeNum(data?.questionsCount, 0),
            sections: normalizeSections(data?.sections, safeStr(data?.subject, "General")),
          };
        });
        setTests(rows);

        // keep URL param testId as priority
        const desired = testId || selectedTestId;
        if (desired && rows.some((t) => t.id === desired)) {
          setSelectedTestId(desired);
        } else if (!desired && rows.length) {
          setSelectedTestId(rows[0].id);
        }

        setTestsLoading(false);
      },
      () => {
        setTests([]);
        setTestsLoading(false);
        toast({
          title: "Failed to load tests",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Sync selectedTestId with route param (if route changes)
  useEffect(() => {
    if (testId && testId !== selectedTestId) setSelectedTestId(testId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  useEffect(() => {
    const fallbackSectionId = selectedTestSections[0]?.id || "main";

    if (!selectedTestSections.some((section) => section.id === formSectionId)) {
      setFormSectionId(fallbackSectionId);
    }
    if (!selectedTestSections.some((section) => section.id === qbSectionId)) {
      setQbSectionId(fallbackSectionId);
    }
    if (
      sectionFilter !== "all" &&
      !selectedTestSections.some((section) => section.id === sectionFilter)
    ) {
      setSectionFilter("all");
    }
  }, [selectedTestSections, formSectionId, qbSectionId, sectionFilter]);

  // Load questions
  useEffect(() => {
    if (!uid || !selectedTestId) {
      setQuestions([]);
      setQuestionsLoading(false);
      return;
    }

    setQuestionsLoading(true);

    const qQs = query(
      collection(db, "test_series", selectedTestId, "questions"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qQs,
      (snap) => {
        const rows: QuestionDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            question: safeStr(data?.question, ""),
            options: Array.isArray(data?.options) ? data.options.map(String) : [],
            correctOption: safeNum(data?.correctOption, 0),
            explanation: safeStr(data?.explanation, ""),
            difficulty: normalizeDifficulty(data?.difficulty),
            subject: safeStr(data?.subject, ""),
            chapter: safeStr(data?.chapter, "") || undefined,
            topic: safeStr(data?.topic, ""),
            marks: data?.marks != null ? safeNum(data?.marks, 0) : undefined,
            negativeMarks:
              data?.negativeMarks != null ? safeNum(data?.negativeMarks, 0) : undefined,
            isActive: data?.isActive !== false,
            usageCount: safeNum(data?.usageCount, 0),
            source: safeStr(data?.source, undefined as any) as any,
            bankQuestionId: safeStr(data?.bankQuestionId, "") || undefined,
            contentFormat: (safeStr(data?.contentFormat, "") as any) || undefined,
            sectionId: safeStr(data?.sectionId, "") || undefined,
            createdAtTs: (data?.createdAt as Timestamp) || null,
            updatedAtTs: (data?.updatedAt as Timestamp) || null,
            questionOrder: data?.questionOrder != null ? Number(data.questionOrder) : undefined,
          };
        });

        setQuestions(sortQuestionsForDisplay(rows));
        setQuestionsLoading(false);
      },
      () => {
        setQuestions([]);
        setQuestionsLoading(false);
        toast({
          title: "Failed to load questions",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    );

    return () => unsub();
  }, [uid, selectedTestId]);

  const existingBankIds = useMemo(() => {
    const s = new Set<string>();
    questions.forEach((q) => {
      if (q.bankQuestionId) s.add(String(q.bankQuestionId));
    });
    return s;
  }, [questions]);

  // Load global question bank when dialog opens
  useEffect(() => {
    if (!uid || !qbOpen) return;

    let alive = true;
    (async () => {
      try {
        setQbLoading(true);
        const qRef = query(collection(db, "question_bank"), orderBy("updatedAt", "desc"));
        const snap = await getDocs(qRef);
        if (!alive) return;

        const rows: QBQuestion[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            subject: safeStr(data?.subject, ""),
            chapter: safeStr(data?.chapter, "") || undefined,
            topic: safeStr(data?.topic, ""),
            difficulty: normalizeDifficulty(data?.difficulty),
            question: safeStr(data?.question, ""),
            options: Array.isArray(data?.options) ? data.options.map(String) : [],
            correctOption: safeNum(data?.correctOption, 0),
            explanation: safeStr(data?.explanation, ""),
            marks: data?.marks != null ? safeNum(data?.marks, 0) : undefined,
            negativeMarks:
              data?.negativeMarks != null ? safeNum(data?.negativeMarks, 0) : undefined,
            updatedAtTs: (data?.updatedAt as Timestamp) || null,
          };
        });

        setQbRows(rows);
        setQbSelected({});
        setQbSearch("");
        setQbSubject("all");
        setQbTopic("all");
        setQbDifficulty("all");
        setQbSectionId(selectedTestSections[0]?.id || "main");
      } catch (e) {
        console.error(e);
        toast({
          title: "Failed to load question bank",
          description: "Could not fetch global questions.",
          variant: "destructive",
        });
      } finally {
        setQbLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid, qbOpen, selectedTestSections]);

  const qbSubjects = useMemo(() => {
    const s = new Set<string>();
    qbRows.forEach((q) => q.subject && s.add(q.subject));
    return ["all", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [qbRows]);

  const qbChapters = useMemo(() => {
    const s = new Set<string>();
    qbRows.forEach((q) => {
      if (qbSubject !== "all" && q.subject !== qbSubject) return;
      if (q.chapter) s.add(q.chapter);
    });
    return ["all", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [qbRows, qbSubject]);

  const qbTopics = useMemo(() => {
    const s = new Set<string>();
    qbRows.forEach((q) => {
      if (qbSubject !== "all" && q.subject !== qbSubject) return;
      if (qbChapter !== "all" && (q.chapter || "") !== qbChapter) return;
      if (q.topic) s.add(q.topic);
    });
    return ["all", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [qbRows, qbSubject, qbChapter]);

  const qbFiltered = useMemo(() => {
    const q = qbSearch.trim().toLowerCase();
    return qbRows.filter((x) => {
      if (qbDifficulty !== "all" && (x.difficulty || "medium") !== qbDifficulty) return false;
      if (qbSubject !== "all" && (x.subject || "") !== qbSubject) return false;
      if (qbChapter !== "all" && (x.chapter || "") !== qbChapter) return false;
      if (qbTopic !== "all" && (x.topic || "") !== qbTopic) return false;
      if (!q) return true;
      const hay = [
        stripHtml(x.question),
        x.subject || "",
        x.chapter || "",
        x.topic || "",
        ...(x.options || []).map(stripHtml),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [qbRows, qbSearch, qbDifficulty, qbSubject, qbChapter, qbTopic]);

  const qbSelectedIds = useMemo(
    () => Object.keys(qbSelected).filter((id) => qbSelected[id]),
    [qbSelected]
  );

  async function importSelectedFromQuestionBank() {
    if (!uid || !selectedTestId) return;
    const rawIds = qbSelectedIds;
    const ids = rawIds.filter((id) => !existingBankIds.has(id));
    if (!ids.length) {
      toast({
        title: "Nothing to import",
        description: "All selected questions are already in this test.",
      });
      return;
    }

    const byId = new Map(qbRows.map((q) => [q.id, q] as const));
    const items = ids.map((id) => byId.get(id)).filter(Boolean) as QBQuestion[];
    if (!items.length) {
      toast({ title: "Nothing to import", description: "Selected questions were not found." });
      return;
    }

    try {
      setQbLoading(true);

      let batch = writeBatch(db);
      let ops = 0;
      let added = 0;

      for (const q of items) {
        const docRef = doc(collection(db, "test_series", selectedTestId, "questions"));

        const payload: any = {
          question: q.question,
          options: Array.isArray(q.options) ? q.options : [],
          correctOption: safeNum(q.correctOption, 0),
          explanation: q.explanation || "",
          difficulty: normalizeDifficulty(q.difficulty),
          sectionId: resolveSectionId(qbSectionId, selectedTestSections),
          subject: q.subject || selectedTest?.subject || "",
          chapter: q.chapter || "",
          topic: q.topic || "",
          isActive: true,
          usageCount: 0,

          // link back to global bank
          source: "question_bank",
          bankQuestionId: q.id,
          contentFormat: "html",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (q.marks != null) payload.marks = safeNum(q.marks, 0);
        if (q.negativeMarks != null) payload.negativeMarks = safeNum(q.negativeMarks, 0);

        batch.set(docRef, payload);

        // optional: bump usageCount on the global question
        batch.update(doc(db, "question_bank", q.id), {
          usageCount: increment(1),
          updatedAt: serverTimestamp(),
        });

        ops += 2;
        added += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }

      // update test counts
      batch.update(doc(db, "test_series", selectedTestId), {
        questionsCount: increment(added),
        updatedAt: serverTimestamp(),
      });
      ops += 1;

      if (ops > 0) await batch.commit();

      toast({ title: "Imported", description: `Added ${added} questions from Question Bank.` });
      setQbOpen(false);
    } catch (e) {
      console.error(e);
      toast({
        title: "Import failed",
        description: "Could not import from Question Bank.",
        variant: "destructive",
      });
    } finally {
      setQbLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter((x) => {
      if (difficultyFilter !== "all" && x.difficulty !== difficultyFilter) return false;
      const active = x.isActive !== false;
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "inactive" && active) return false;
      if (sectionFilter !== "all") {
        const currentSectionId = resolveSectionId(x.sectionId, selectedTestSections);
        if (currentSectionId !== sectionFilter) return false;
      }

      if (!q) return true;

      const hay = [x.question, x.subject || "", x.topic || "", ...(x.options || [])]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [questions, search, difficultyFilter, statusFilter, sectionFilter, selectedTestSections]);

  // Group filtered questions by section
  const questionsBySection = useMemo(() => {
    const map: Record<string, QuestionDoc[]> = {};
    // Initialize all sections with empty arrays
    selectedTestSections.forEach((section) => {
      map[section.id] = [];
    });
    // Distribute filtered questions into sections
    filtered.forEach((q) => {
      const sid = resolveSectionId(q.sectionId, selectedTestSections);
      if (!map[sid]) map[sid] = [];
      map[sid].push(q);
    });
    return map;
  }, [filtered, selectedTestSections]);

  const dndEnabled =
    search.trim().length === 0 && difficultyFilter === "all" && statusFilter === "all";

  // analytics
  const total = questions.length;
  const activeCount = useMemo(
    () => questions.filter((q) => q.isActive !== false).length,
    [questions]
  );
  const easyCount = useMemo(
    () => questions.filter((q) => q.difficulty === "easy").length,
    [questions]
  );
  const medCount = useMemo(
    () => questions.filter((q) => q.difficulty === "medium").length,
    [questions]
  );
  const hardCount = useMemo(
    () => questions.filter((q) => q.difficulty === "hard").length,
    [questions]
  );

  const activePct = total ? Math.round((activeCount / total) * 100) : 0;

  function resetEditor() {
    setEditingId(null);
    setAddingToSection(null);
    setEditingOriginalScoring(null);
    setFormQuestion("");
    setFormOptions(["", "", "", ""]);
    setFormCorrect(0);
    setFormExplanation("");
    setFormDifficulty("medium");
    setFormSectionId(selectedTestSections[0]?.id || "main");
    setFormSubject(selectedTest?.subject || "");
    setFormTopic("");
    setFormMarks(selectedTest?.positiveMarks != null ? String(selectedTest.positiveMarks) : "");
    setFormNegMarks(selectedTest?.negativeMarks != null ? String(selectedTest.negativeMarks) : "");
    setFormActive(true);
    setFormFormat("single_correct_mcq");
    setFormTopics("");
    setFormMultiCorrects([0]);
    setFormQImgUrl("");
    setFormOImgUrls(["", "", "", ""]);
    setFormEImgUrl("");
    setFormSubjectId("");
  }

  function scoreResponses(
    qs: {
      correctOption?: number;
      correctAnswer?: any;
      marks?: number;
      positiveMarks?: number;
      negativeMarks?: number;
      type?: string;
      options?: string[];
    }[],
    responses: Record<string, { answer?: string | null }>
  ) {
    let score = 0,
      maxScore = 0,
      correctCount = 0,
      incorrectCount = 0;
    for (const q of qs) {
      const pos = safeNum(q.marks ?? q.positiveMarks, 5);
      const neg = Math.abs(safeNum(q.negativeMarks, 1));
      maxScore += pos;
      const userAnswer = (responses[(q as any).id] as any)?.answer ?? null;
      if (userAnswer === null || userAnswer === undefined || String(userAnswer).trim() === "")
        continue;
      let isCorrect = false;
      if (q.type === "integer") {
        isCorrect = String(userAnswer).trim() === String(q.correctAnswer ?? "").trim();
      } else {
        isCorrect = String(userAnswer) === String(q.correctOption ?? 0);
      }
      if (isCorrect) {
        score += pos;
        correctCount += 1;
      } else {
        score -= neg;
        incorrectCount += 1;
      }
    }
    const attempted = correctCount + incorrectCount;
    const accuracy = attempted > 0 ? correctCount / attempted : 0;
    return { score, maxScore, accuracy, correctCount, incorrectCount };
  }

  async function recalculateAttemptsForTest(testId: string) {
    const qSnap = await getDocs(collection(db, "test_series", testId, "questions"));
    const qs = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (!qs.length) return;

    const aSnap = await getDocs(query(collection(db, "attempts"), where("testId", "==", testId)));
    // Filter to submitted/completed in JS to avoid needing a composite Firestore index
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

  function getNextQuestionOrder() {
    return (
      questions.reduce((max, q) => {
        const n = Number(q.questionOrder);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0) + 1
    );
  }

  async function persistDraggedOrder(reordered: QuestionDoc[]) {
    if (!selectedTestId) return;
    try {
      setReordering(true);
      const updates = reordered
        .map((q, index) => ({
          id: q.id,
          nextOrder: index + 1,
          currentOrder: Number.isFinite(Number(q.questionOrder)) ? Number(q.questionOrder) : null,
        }))
        .filter((item) => item.currentOrder !== item.nextOrder);
      if (!updates.length) return;
      const CHUNK_SIZE = 450;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        updates.slice(i, i + CHUNK_SIZE).forEach((item) => {
          batch.update(doc(db, "test_series", selectedTestId, "questions", item.id), {
            questionOrder: item.nextOrder,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to save order", variant: "destructive" });
    } finally {
      setReordering(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!dndEnabled || reordering) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.id === String(active.id));
    const newIndex = questions.findIndex((q) => q.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedBase = arrayMove(questions, oldIndex, newIndex);
    const reordered = reorderedBase.map((q, i) => ({ ...q, questionOrder: i + 1 }));
    setQuestions(reordered);
    await persistDraggedOrder(reorderedBase);
  }

  function openCreate() {
    if (!selectedTestId) {
      toast({ title: "Select a test first", description: "Choose a test to add questions." });
      return;
    }
    resetEditor();
    setAddingToSection(null);
    setEditorOpen(true);
  }

  function openCreateForSection(sectionId: string) {
    if (!selectedTestId) {
      toast({ title: "Select a test first", description: "Choose a test to add questions." });
      return;
    }
    resetEditor();
    setFormSectionId(sectionId);
    setAddingToSection(sectionId);
    setEditorOpen(true);
    // Make sure this section is expanded
    setCollapsedQSections((prev) => prev.filter((id) => id !== sectionId));
  }

  function toggleQSectionCollapse(sectionId: string) {
    setCollapsedQSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  }

  function openEdit(q: QuestionDoc) {
    setEditingId(q.id);
    setFormQuestion(q.question || "");
    setFormOptions(() => {
      const base = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      while (base.length < 4) base.push("");
      return base;
    });
    setFormCorrect(Number.isFinite(q.correctOption) ? q.correctOption : 0);
    setFormExplanation(q.explanation || "");
    setFormDifficulty(q.difficulty || "medium");
    setFormSectionId(resolveSectionId(q.sectionId, selectedTestSections));
    setFormSubject(q.subject || selectedTest?.subject || "");
    setFormChapter(q.chapter || "");
    setFormTopic(q.topic || "");
    setFormMarks(
      q.marks != null
        ? String(q.marks)
        : selectedTest?.positiveMarks != null
          ? String(selectedTest.positiveMarks)
          : ""
    );
    setFormNegMarks(
      q.negativeMarks != null
        ? String(q.negativeMarks)
        : selectedTest?.negativeMarks != null
          ? String(selectedTest.negativeMarks)
          : ""
    );
    setFormActive(q.isActive !== false);
    setFormFormat(q.format || "single_correct_mcq");
    setFormTopics((q.topics?.length ? q.topics : q.topic ? [q.topic] : []).join(", "));
    setFormMultiCorrects(q.correctOptions?.length ? q.correctOptions : [q.correctOption ?? 0]);
    setFormQImgUrl(q.questionImage || "");
    setFormOImgUrls(
      q.optionImages?.length ? [...q.optionImages, "", "", "", ""].slice(0, 4) : ["", "", "", ""]
    );
    setFormEImgUrl(q.explanationImage || "");
    setFormSubjectId(q.subjectId || "");
    setEditingOriginalScoring({
      correctOption: q.correctOption,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
    });
    setEditorOpen(true);
  }

  async function saveQuestion() {
    if (!uid) return;
    if (!selectedTestId) return;

    const questionText = formQuestion.trim();
    const isMcq = formFormat === "single_correct_mcq" || formFormat === "multicorrect_mcq";
    const options = formOptions.map((x) => x.trim()).filter((x) => x.length > 0);

    if (!questionText) {
      toast({
        title: "Question required",
        description: "Please enter the question.",
        variant: "destructive",
      });
      return;
    }
    if (isMcq) {
      if (options.length < 2) {
        toast({
          title: "Options required",
          description: "Add at least 2 options.",
          variant: "destructive",
        });
        return;
      }
      if (formFormat === "single_correct_mcq" && !formOptions[formCorrect]?.trim()) {
        toast({
          title: "Correct option empty",
          description: "The selected correct option cannot be empty.",
          variant: "destructive",
        });
        return;
      }
    }

    const marks = formMarks.trim() === "" ? undefined : safeNum(formMarks, undefined as any);
    const negativeMarks =
      formNegMarks.trim() === "" ? undefined : safeNum(formNegMarks, undefined as any);
    const normalizedSectionId = resolveSectionId(formSectionId, selectedTestSections);
    const topicsArr = formTopics
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const matchedSubject = subjects.find((s) => s.id === formSubjectId);

    setSaving(true);
    try {
      const basePayload: any = {
        question: questionText,
        options: isMcq ? formOptions.map((x) => x.trim()) : [],
        correctOption:
          formFormat === "single_correct_mcq" ? formCorrect : (formMultiCorrects[0] ?? 0),
        explanation: formExplanation.trim() || "",
        difficulty: formDifficulty,
        sectionId: normalizedSectionId,
        subject: formSubject.trim() || selectedTest?.subject || "",
        chapter: formChapter.trim() || "",
        topic: topicsArr[0] || formTopic.trim() || "",
        isActive: !!formActive,
        usageCount: 0,
        source: "manual",
        contentFormat: "html",
        format: formFormat,
        updatedAt: serverTimestamp(),
      };

      if (topicsArr.length) basePayload.topics = topicsArr;
      if (formFormat === "multicorrect_mcq" && formMultiCorrects.length > 1)
        basePayload.correctOptions = formMultiCorrects;
      if (formQImgUrl.trim()) basePayload.questionImage = formQImgUrl.trim();
      if (formOImgUrls.some(Boolean)) basePayload.optionImages = formOImgUrls;
      if (formEImgUrl.trim()) basePayload.explanationImage = formEImgUrl.trim();
      if (matchedSubject) {
        basePayload.subjectId = matchedSubject.id;
        basePayload.subjectName = matchedSubject.name;
      }

      if (marks != null && Number.isFinite(marks)) basePayload.marks = marks;
      if (negativeMarks != null && Number.isFinite(negativeMarks))
        basePayload.negativeMarks = negativeMarks;

      if (!editingId) {
        basePayload.createdAt = serverTimestamp();
        basePayload.questionOrder = getNextQuestionOrder();

        await addDoc(collection(db, "test_series", selectedTestId, "questions"), basePayload);

        // keep test_series.questionsCount roughly in sync
        await updateDoc(doc(db, "test_series", selectedTestId), {
          questionsCount: increment(1),
          updatedAt: serverTimestamp(),
        });

        toast({ title: "Question added", description: "Question saved successfully." });
      } else {
        await updateDoc(
          doc(db, "test_series", selectedTestId, "questions", editingId),
          basePayload
        );

        await updateDoc(doc(db, "test_series", selectedTestId), {
          updatedAt: serverTimestamp(),
        });

        toast({ title: "Question updated", description: "Changes saved successfully." });

        const scoringChanged =
          formCorrect !== editingOriginalScoring?.correctOption ||
          safeNum(formMarks, -1) !== safeNum(String(editingOriginalScoring?.marks ?? ""), -1) ||
          safeNum(formNegMarks, -1) !==
            safeNum(String(editingOriginalScoring?.negativeMarks ?? ""), -1);

        if (scoringChanged) {
          recalculateAttemptsForTest(selectedTestId).catch((err) => {
            console.error("Recalculation failed:", err);
            toast({
              title: "Score recalculation failed",
              description: String(err?.message || err),
              variant: "destructive",
            });
          });
        }
      }

      setEditorOpen(false);
      resetEditor();
    } catch (e) {
      console.error(e);
      toast({
        title: "Save failed",
        description: "Could not save question.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(q: QuestionDoc, next: boolean) {
    if (!uid || !selectedTestId) return;
    try {
      await updateDoc(doc(db, "test_series", selectedTestId, "questions", q.id), {
        isActive: next,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Update failed",
        description: "Could not update status.",
        variant: "destructive",
      });
    }
  }

  async function deleteQuestion(q: QuestionDoc) {
    if (!uid || !selectedTestId) return;

    const ok = window.confirm("Delete this question? This cannot be undone.");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "test_series", selectedTestId, "questions", q.id));

      // safer count update (avoid negative)
      await runTransaction(db, async (tx) => {
        const testRef = doc(db, "test_series", selectedTestId);
        const snap = await tx.get(testRef);
        const curr = safeNum((snap.data() as any)?.questionsCount, 0);
        tx.update(testRef, {
          questionsCount: Math.max(0, curr - 1),
          updatedAt: serverTimestamp(),
        });
      });

      toast({ title: "Deleted", description: "Question removed." });
    } catch (e) {
      console.error(e);
      toast({
        title: "Delete failed",
        description: "Could not delete question.",
        variant: "destructive",
      });
    }
  }

  if (authLoading || testsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Questions</h1>
        </div>
        <Card className="border-border/50">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Please login to manage questions.
            <div className="mt-4">
              <Button onClick={() => (window.location.href = "/login?role=admin")}>
                Go to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const testSelectValue = selectedTestId || "";

  const renderInlineEditor = () => (
    <div className="space-y-6 duration-300 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{editingId ? "Edit Question" : "New Question"}</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setEditorOpen(false);
            resetEditor();
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Question Content</Label>
            <ImageTextarea
              value={formQuestion}
              onChange={setFormQuestion}
              folder="/admin-test-questions"
              placeholder="Write your question with text, HTML/expressions, and images..."
              minHeight="170px"
            />
            <Input
              value={formQImgUrl}
              onChange={(e) => setFormQImgUrl(e.target.value)}
              placeholder="Question image URL (optional)"
              className="rounded-xl font-mono text-xs"
            />
            {formQImgUrl && (
              <img
                src={formQImgUrl}
                alt=""
                className="h-16 w-auto rounded-xl border object-contain"
              />
            )}
          </div>

          {(formFormat === "single_correct_mcq" || formFormat === "multicorrect_mcq") && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {formOptions.map((opt, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">{`Option ${String.fromCharCode(65 + idx)}`}</Label>
                    {formFormat === "multicorrect_mcq" && (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={formMultiCorrects.includes(idx)}
                          onChange={(e) =>
                            setFormMultiCorrects((prev) =>
                              e.target.checked ? [...prev, idx] : prev.filter((x) => x !== idx)
                            )
                          }
                        />
                        Correct
                      </label>
                    )}
                  </div>
                  <ImageTextarea
                    value={opt}
                    onChange={(v) =>
                      setFormOptions((prev) => prev.map((x, i) => (i === idx ? v : x)))
                    }
                    folder="/admin-test-options"
                    placeholder={`Enter option ${idx + 1}`}
                    minHeight="95px"
                  />
                  <Input
                    value={formOImgUrls[idx]}
                    onChange={(e) =>
                      setFormOImgUrls((prev) => {
                        const c = [...prev];
                        c[idx] = e.target.value;
                        return c;
                      })
                    }
                    placeholder="Option image URL (optional)"
                    className="rounded-xl font-mono text-xs"
                  />
                  {formOImgUrls[idx] && (
                    <img
                      src={formOImgUrls[idx]}
                      alt=""
                      className="h-10 w-auto rounded border object-contain"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Explanation (optional)</Label>
            <ImageTextarea
              value={formExplanation}
              onChange={setFormExplanation}
              folder="/admin-test-explanations"
              placeholder="Explain the answer with text, images, or formatted content"
              minHeight="125px"
            />
            <Input
              value={formEImgUrl}
              onChange={(e) => setFormEImgUrl(e.target.value)}
              placeholder="Explanation image URL (optional)"
              className="rounded-xl font-mono text-xs"
            />
            {formEImgUrl && (
              <img
                src={formEImgUrl}
                alt=""
                className="h-16 w-auto rounded-xl border object-contain"
              />
            )}
          </div>
        </div>

        <div className="space-y-5 xl:col-span-2">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Format</Label>
              <Select value={formFormat} onValueChange={(v: any) => setFormFormat(v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_correct_mcq">Single Correct MCQ</SelectItem>
                  <SelectItem value="multicorrect_mcq">Multi-Correct MCQ</SelectItem>
                  <SelectItem value="subjective">Subjective</SelectItem>
                  <SelectItem value="subjective_long">Subjective Long</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formFormat === "single_correct_mcq" && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Correct Option</Label>
                <Select
                  value={String(formCorrect)}
                  onValueChange={(v) => setFormCorrect(Number(v))}
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3].map((i) => (
                      <SelectItem key={i} value={String(i)}>
                        Option {String.fromCharCode(65 + i)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Difficulty</Label>
              <Select value={formDifficulty} onValueChange={(v: any) => setFormDifficulty(v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Section</Label>
              <Select value={formSectionId} onValueChange={setFormSectionId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {selectedTestSections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Published</p>
                <p className="text-xs text-muted-foreground">Draft is hidden from active use</p>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Subject</Label>
              <Select
                value={formSubjectId || "__none"}
                onValueChange={(v) => setFormSubjectId(v === "__none" ? "" : v)}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder={formSubject || "Select subject"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Chapter</Label>
              <Input
                className="h-11 rounded-xl"
                value={formChapter}
                onChange={(e) => setFormChapter(e.target.value)}
                placeholder="e.g. Optics"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Topics{" "}
                <span className="text-xs font-normal text-muted-foreground">(comma-separated)</span>
              </Label>
              <Input
                value={formTopics}
                onChange={(e) => setFormTopics(e.target.value)}
                placeholder="e.g. Kinematics, Newton's Laws"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Marks</Label>
                <Input
                  value={formMarks}
                  onChange={(e) => setFormMarks(e.target.value)}
                  placeholder={
                    selectedTest?.positiveMarks != null ? String(selectedTest.positiveMarks) : "5"
                  }
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Neg. Marks</Label>
                <Input
                  value={formNegMarks}
                  onChange={(e) => setFormNegMarks(e.target.value)}
                  placeholder={
                    selectedTest?.negativeMarks != null ? String(selectedTest.negativeMarks) : "1"
                  }
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <Button
          variant="outline"
          className="rounded-xl px-6"
          onClick={() => {
            setEditorOpen(false);
            resetEditor();
          }}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          className="gradient-bg min-w-[140px] rounded-xl px-8 text-white"
          onClick={saveQuestion}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>{editingId ? "Update Question" : "Save Question"}</>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/tests")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">Questions</h1>
            <p className="text-sm text-muted-foreground">
              Manage question bank for a test series (Firestore:{" "}
              <span className="font-mono">test_series/{`{testId}`}/questions</span>)
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-[260px]">
            <Select
              value={testSelectValue}
              onValueChange={(v) => {
                setSelectedTestId(v);
                // AppRoutes uses /admin/questions/:testId
                navigate(`/admin/questions/${v}`);
              }}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={tests.length ? "Select a test" : "No tests found"} />
              </SelectTrigger>
              <SelectContent>
                {tests.length ? (
                  tests.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__none" disabled>
                    Create a test first
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={qbOpen} onOpenChange={setQbOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl" disabled={!selectedTestId}>
                <BookOpen className="mr-2 h-4 w-4" />
                Import from Question Bank
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl rounded-2xl">
              <DialogHeader>
                <DialogTitle>Import Questions from Global Question Bank</DialogTitle>
                <DialogDescription>
                  Select questions from <span className="font-mono">question_bank</span> and add
                  them to this test.
                </DialogDescription>
              </DialogHeader>

              {/* Filters */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <Label className="text-xs">Search</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={qbSearch}
                      onChange={(e) => setQbSearch(e.target.value)}
                      placeholder="Search question / option / topic..."
                      className="rounded-xl pl-9"
                    />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <Label className="text-xs">Subject</Label>
                  <Select
                    value={qbSubject}
                    onValueChange={(v) => {
                      setQbSubject(v);
                      setQbChapter("all");
                      setQbTopic("all");
                    }}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="All subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      {qbSubjects.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s === "all" ? "All subjects" : s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="lg:col-span-2">
                  <Label className="text-xs">Chapter</Label>
                  <Select
                    value={qbChapter}
                    onValueChange={(v) => {
                      setQbChapter(v);
                      setQbTopic("all");
                    }}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="All chapters" />
                    </SelectTrigger>
                    <SelectContent>
                      {qbChapters.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c === "all" ? "All chapters" : c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="lg:col-span-2">
                  <Label className="text-xs">Topic</Label>
                  <Select value={qbTopic} onValueChange={setQbTopic}>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="All topics" />
                    </SelectTrigger>
                    <SelectContent>
                      {qbTopics.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t === "all" ? "All topics" : t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="lg:col-span-2">
                  <Label className="text-xs">Difficulty</Label>
                  <Select value={qbDifficulty} onValueChange={(v: any) => setQbDifficulty(v)}>
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
                  <Select value={qbSectionId} onValueChange={setQbSectionId}>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedTestSections.map((section) => (
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
                    Showing <span className="font-medium text-foreground">{qbFiltered.length}</span>{" "}
                    / {qbRows.length}
                  </p>
                  <p className="text-sm">
                    Selected: <span className="font-semibold">{qbSelectedIds.length}</span>
                  </p>
                </div>

                <div className="max-h-[460px] overflow-auto">
                  {qbLoading ? (
                    <div className="flex items-center justify-center p-8 text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading question bank…
                    </div>
                  ) : qbFiltered.length === 0 ? (
                    <div className="p-10 text-center text-muted-foreground">
                      No questions match your filters.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {qbFiltered.map((q) => {
                        const already = existingBankIds.has(q.id);
                        const checked = !!qbSelected[q.id];
                        return (
                          <div key={q.id} className="flex items-start gap-3 p-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              disabled={already}
                              onChange={(e) =>
                                setQbSelected((prev) => ({ ...prev, [q.id]: e.target.checked }))
                              }
                            />

                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "rounded-full",
                                    difficultyBadge(normalizeDifficulty(q.difficulty))
                                  )}
                                >
                                  {normalizeDifficulty(q.difficulty)}
                                </Badge>
                                {q.subject ? (
                                  <Badge variant="secondary" className="rounded-full">
                                    {q.subject}
                                  </Badge>
                                ) : null}
                                {q.chapter ? (
                                  <Badge variant="outline" className="rounded-full">
                                    {q.chapter}
                                  </Badge>
                                ) : null}
                                {q.topic ? (
                                  <Badge variant="secondary" className="rounded-full">
                                    {q.topic}
                                  </Badge>
                                ) : null}
                                {already ? (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  >
                                    <CheckCircle2 className="mr-1 h-3 w-3" /> Already in test
                                  </Badge>
                                ) : null}
                              </div>

                              <div
                                className="prose prose-sm dark:prose-invert line-clamp-3 max-w-none"
                                dangerouslySetInnerHTML={{ __html: q.question }}
                              />
                              <p className="mt-1 text-xs text-muted-foreground">
                                Options: {q.options?.length || 0}
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
                  onClick={() => setQbOpen(false)}
                  disabled={qbLoading}
                >
                  Cancel
                </Button>
                <Button
                  className="gradient-bg rounded-xl text-white"
                  onClick={importSelectedFromQuestionBank}
                  disabled={qbLoading || qbSelectedIds.length === 0}
                >
                  {qbLoading ? "Importing..." : "Add Selected"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            className="gradient-bg rounded-xl text-white"
            onClick={openCreate}
            disabled={!selectedTestId}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Question
          </Button>
        </div>
      </div>

      {/* Selected Test Summary */}
      {selectedTest && (
        <Card className="border-border/50">
          <CardContent className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Selected Test</p>
              <p className="truncate text-lg font-semibold">{selectedTest.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedTest.subject ? (
                  <Badge variant="secondary" className="rounded-full">
                    {selectedTest.subject}
                  </Badge>
                ) : null}
                {selectedTest.level ? (
                  <Badge variant="secondary" className="rounded-full">
                    {selectedTest.level}
                  </Badge>
                ) : null}
                <Badge variant="secondary" className="rounded-full">
                  {safeNum(selectedTest.durationMinutes, 60)} min
                </Badge>
              </div>
            </div>

            <div className="w-full space-y-2 md:w-[320px]">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Published questions</span>
                <span className="font-medium">
                  {activeCount}/{total} ({activePct}%)
                </span>
              </div>
              <Progress value={activePct} />
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="rounded-xl bg-muted/40 p-2">
                  <p className="text-[11px] text-muted-foreground">Easy</p>
                  <p className="text-sm font-semibold">{easyCount}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <p className="text-[11px] text-muted-foreground">Medium</p>
                  <p className="text-sm font-semibold">{medCount}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <p className="text-[11px] text-muted-foreground">Hard</p>
                  <p className="text-sm font-semibold">{hardCount}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search question / option / topic..."
              className="rounded-xl pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-[180px] rounded-xl">
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {selectedTestSections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={difficultyFilter} onValueChange={(v: any) => setDifficultyFilter(v)}>
              <SelectTrigger className="w-[160px] rounded-xl">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulty</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-[150px] rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Published</SelectItem>
                <SelectItem value="inactive">Draft</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setSearch("");
                setDifficultyFilter("all");
                setStatusFilter("all");
                setSectionFilter("all");
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="questions">
        <TabsList className="rounded-xl">
          <TabsTrigger value="questions" className="rounded-lg">
            Question Bank
          </TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-lg">
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="pt-4">
          {questionsLoading ? (
            <Card className="border-border/50">
              <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading questions…
              </CardContent>
            </Card>
          ) : !selectedTestId ? (
            <Card className="border-border/50">
              <CardContent className="p-8 text-center text-muted-foreground">
                Select a test to manage its questions.
                <div className="mt-4">
                  <Button asChild className="rounded-xl">
                    <Link to="/admin/tests">Go to Tests</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Inline editor for new questions (shows at top when no specific section is targeted) */}
              {editorOpen && !editingId && addingToSection === null && (
                <Card className="border-primary/40 shadow-md ring-1 ring-primary/20">
                  <CardContent className="p-6">{renderInlineEditor()}</CardContent>
                </Card>
              )}

              {!dndEnabled &&
                (search.trim() || difficultyFilter !== "all" || statusFilter !== "all") && (
                  <p className="pb-1 text-center text-xs text-muted-foreground">
                    Clear filters to reorder questions
                  </p>
                )}

              {filtered.length === 0 && !editorOpen && (
                <Card className="border-border/50">
                  <CardContent className="p-10 text-center text-muted-foreground">
                    No questions found.
                    <div className="mt-4">
                      <Button className="gradient-bg rounded-xl text-white" onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add your first question
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filtered.map((q) => q.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filtered.map((q, idx) => {
                    const isHtml =
                      q.contentFormat === "html" ||
                      q.source === "question_bank" ||
                      /<\w+[\s\S]*>/i.test(q.question || "");
                    const correctText = q.options?.[q.correctOption] || "";
                    const correctTextPlain = stripHtml(correctText);
                    const isEditing = editingId === q.id && editorOpen;

                    return (
                      <SortableCardShell key={q.id} id={q.id} dndEnabled={dndEnabled && !isEditing}>
                        {(dragProps, isDragging) => (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: isDragging ? 0 : Math.min(0.2, idx * 0.02) }}
                          >
                            <QuestionActionHoverWrapper
                              questionId={q.id}
                              contextId={selectedTestId}
                              questionContent={q.question}
                            >
                              <Card
                                className={cn(
                                  "border-border/50 transition-all duration-300 hover:shadow-sm",
                                  isEditing && "border-primary/40 shadow-md ring-1 ring-primary/20",
                                  isDragging && "opacity-80 shadow-lg"
                                )}
                              >
                                <CardContent className="p-4">
                                  {isEditing ? (
                                    renderInlineEditor()
                                  ) : (
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                          <Badge
                                            variant="secondary"
                                            className={cn(
                                              "rounded-full",
                                              difficultyBadge(q.difficulty)
                                            )}
                                          >
                                            {q.difficulty}
                                          </Badge>
                                          {q.subject ? (
                                            <Badge variant="secondary" className="rounded-full">
                                              {q.subject}
                                            </Badge>
                                          ) : null}
                                          {q.chapter ? (
                                            <Badge variant="outline" className="rounded-full">
                                              {q.chapter}
                                            </Badge>
                                          ) : null}
                                          {q.topic ? (
                                            <Badge variant="secondary" className="rounded-full">
                                              {q.topic}
                                            </Badge>
                                          ) : null}

                                          {q.isActive !== false ? (
                                            <Badge
                                              variant="secondary"
                                              className="rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                            >
                                              <CheckCircle2 className="mr-1 h-3 w-3" />
                                              published
                                            </Badge>
                                          ) : (
                                            <Badge
                                              variant="secondary"
                                              className="rounded-full bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300"
                                            >
                                              <XCircle className="mr-1 h-3 w-3" />
                                              draft
                                            </Badge>
                                          )}
                                        </div>

                                        {isHtml ? (
                                          <div
                                            className="prose prose-sm dark:prose-invert line-clamp-3 max-w-none leading-snug"
                                            dangerouslySetInnerHTML={{ __html: q.question }}
                                          />
                                        ) : (
                                          <p className="line-clamp-3 font-medium leading-snug text-foreground">
                                            {q.question}
                                          </p>
                                        )}

                                        {q.options?.length ? (
                                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {q.options.slice(0, 4).map((opt, i) => (
                                              <div
                                                key={i}
                                                className={cn(
                                                  "rounded-xl border p-2 text-sm",
                                                  i === q.correctOption
                                                    ? "border-primary/40 bg-primary/5"
                                                    : "border-border bg-muted/20"
                                                )}
                                              >
                                                <span className="mr-2 text-xs text-muted-foreground">
                                                  {String.fromCharCode(65 + i)}.
                                                </span>
                                                {isHtml ? (
                                                  <span
                                                    className={cn(
                                                      i === q.correctOption && "font-medium"
                                                    )}
                                                    dangerouslySetInnerHTML={{ __html: opt }}
                                                  />
                                                ) : (
                                                  <span
                                                    className={cn(
                                                      i === q.correctOption && "font-medium"
                                                    )}
                                                  >
                                                    {opt}
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : null}

                                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                          <span>
                                            Correct:{" "}
                                            <span className="font-medium text-foreground">
                                              {correctTextPlain || "—"}
                                            </span>
                                          </span>
                                          <span>
                                            Marks:{" "}
                                            <span className="font-medium text-foreground">
                                              {q.marks ?? selectedTest?.positiveMarks ?? "—"}
                                            </span>
                                          </span>
                                          <span>
                                            Neg:{" "}
                                            <span className="font-medium text-foreground">
                                              {q.negativeMarks ??
                                                selectedTest?.negativeMarks ??
                                                "—"}
                                            </span>
                                          </span>
                                          <span>
                                            Used:{" "}
                                            <span className="font-medium text-foreground">
                                              {q.usageCount ?? 0}
                                            </span>
                                          </span>
                                          <span>
                                            Updated:{" "}
                                            <span className="font-medium text-foreground">
                                              {fmtDate(q.updatedAtTs || q.createdAtTs || null)}
                                            </span>
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex flex-col items-end gap-2">
                                        <div className="flex items-center gap-2">
                                          {dndEnabled && (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="cursor-grab rounded-xl text-muted-foreground active:cursor-grabbing"
                                              onClick={(e) => e.stopPropagation()}
                                              aria-label="Drag to reorder"
                                              {...dragProps}
                                            >
                                              <GripVertical className="h-4 w-4" />
                                            </Button>
                                          )}
                                          <Switch
                                            checked={q.isActive !== false}
                                            onCheckedChange={(checked) => toggleActive(q, checked)}
                                          />
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="rounded-xl"
                                            onClick={() => openEdit(q)}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="rounded-xl"
                                            onClick={() => {
                                              navigator.clipboard.writeText(q.question);
                                              toast({
                                                title: "Copied",
                                                description: "Question text copied.",
                                              });
                                            }}
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="rounded-xl text-destructive"
                                            onClick={() => deleteQuestion(q)}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {!isEditing && q.explanation ? (
                                    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
                                      <p className="mb-1 text-xs text-muted-foreground">
                                        Explanation
                                      </p>
                                      <p className="whitespace-pre-wrap text-sm text-foreground">
                                        {q.explanation}
                                      </p>
                                    </div>
                                  ) : null}
                                </CardContent>
                              </Card>
                            </QuestionActionHoverWrapper>
                          </motion.div>
                        )}
                      </SortableCardShell>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="pt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total questions</span>
                  <span className="font-semibold">{total}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Published</span>
                  <span className="font-semibold">{activeCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Draft</span>
                  <span className="font-semibold">{Math.max(0, total - activeCount)}</span>
                </div>

                <div className="pt-2">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Published ratio</span>
                    <span className="font-medium">{activePct}%</span>
                  </div>
                  <Progress value={activePct} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Difficulty Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(
                  [
                    { label: "Easy", value: easyCount, key: "easy" as Difficulty },
                    { label: "Medium", value: medCount, key: "medium" as Difficulty },
                    { label: "Hard", value: hardCount, key: "hard" as Difficulty },
                  ] as const
                ).map((row) => {
                  const pct = total ? Math.round((row.value / total) * 100) : 0;
                  return (
                    <div key={row.key}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={cn("rounded-full", difficultyBadge(row.key))}
                          >
                            {row.label}
                          </Badge>
                          <span className="text-muted-foreground">{row.value} questions</span>
                        </div>
                        <span className="font-medium">{pct}%</span>
                      </div>
                      <Progress value={pct} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
