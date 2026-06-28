import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Loader2, Save, ChevronDown, ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Switch } from "@shared/ui/switch";
import { MultiSelect } from "@shared/ui/MultiSelect";
import FloatingInput from "@shared/ui/FloatingInput";
import SectionCard from "@features/admin/components/SectionCard";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useAccessibleCourses } from "@shared/hooks/useAccessibleCourses";
import { useQBOptions } from "@shared/hooks/useQBOptions";

// ─── helpers ──────────────────────────────────────────────────────────────────

function getDifficultyLabel(v: number) {
  return v <= 0.3 ? "Easy" : v <= 0.7 ? "Medium" : "Hard";
}
function getDifficultyColor(v: number) {
  return v <= 0.3 ? "text-green-600" : v <= 0.7 ? "text-yellow-600" : "text-red-600";
}
function clamp(v?: number) {
  if (!Number.isFinite(Number(v))) return 0.5;
  return Math.min(1, Math.max(0, Number(v)));
}
function normalizeLegacy(v?: string | number): number {
  if (typeof v === "number") return clamp(v);
  const s = String(v || "")
    .toLowerCase()
    .trim();
  if (s === "easy") return 0.15;
  if (s === "hard") return 0.85;
  return 0.5;
}
function avgDifficulty(sections: { difficultyLevel?: number }[], fallback = 0.5) {
  if (!sections.length) return fallback;
  return sections.reduce((a, s) => a + clamp(s.difficultyLevel ?? fallback), 0) / sections.length;
}

// ─── types ────────────────────────────────────────────────────────────────────

type MarkingScheme = { correct: number; incorrect: number; unanswered: number };

type Section = {
  id: string;
  name: string;
  questionsCount: number;
  attemptlimit: number | null;
  durationMinutes?: number | null;
  difficultyLevel?: number;
  chapter?: string[];
  topics?: string[];
  subject?: string;
  tags?: string[];
  format?: string;
  markingScheme?: MarkingScheme | null;
};

const BLANK_SECTION = (): Section => ({
  id: `sec_${Date.now()}`,
  name: "Section 1",
  questionsCount: 0,
  attemptlimit: null,
  difficultyLevel: 0.5,
  chapter: [],
  topics: [],
  subject: "",
  tags: [],
  format: "",
});

export type TemplateModalProps = {
  role: "admin" | "educator";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateToEdit?: any | null; // admin only
};

// ─── component ────────────────────────────────────────────────────────────────

export default function TemplateModal({
  role,
  open,
  onOpenChange,
  templateToEdit,
}: TemplateModalProps) {
  const isAdmin = role === "admin";
  const isEdit = isAdmin && !!templateToEdit;

  const { firebaseUser } = useAuth();

  // Educator-scoped course/subject data
  const {
    courses: accessibleCourses,
    subjects: accessibleSubjects,
    allowedSubjectIds,
  } = useAccessibleCourses(!isAdmin ? (firebaseUser?.uid ?? "") : "");

  // QB options scoped: admin sees all, educator sees their subjects + own QB
  const qbOptions = useQBOptions(
    isAdmin ? undefined : allowedSubjectIds,
    isAdmin ? undefined : (firebaseUser?.uid ?? undefined)
  );

  // Admin-scoped course/subject data
  const [allCourses, setAllCourses] = useState<{ id: string; name: string }[]>([]);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string; courseId: string }[]>(
    []
  );

  useEffect(() => {
    if (!open || !isAdmin) return;
    Promise.all([getDocs(collection(db, "courses")), getDocs(collection(db, "subjects"))]).then(
      ([courseSnap, subjectSnap]) => {
        setAllCourses(
          courseSnap.docs
            .filter((d) => d.data()?.isActive !== false)
            .map((d) => ({ id: d.id, name: d.data().name as string }))
        );
        setAllSubjects(
          subjectSnap.docs.map((d) => ({
            id: d.id,
            name: d.data().name as string,
            courseId: d.data().courseId as string,
          }))
        );
      }
    );
  }, [open, isAdmin]);

  // ─── form state ─────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectMode, setSubjectMode] = useState<"single" | "section_wise">("single");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [attemptsAllowed, setAttemptsAllowed] = useState("3");
  const [isPublished, setIsPublished] = useState(true);
  const [markingScheme, setMarkingScheme] = useState<MarkingScheme>({
    correct: 1,
    incorrect: 0,
    unanswered: 0,
  });
  const [sections, setSections] = useState<Section[]>([
    { ...BLANK_SECTION(), id: "sec_1", name: "Section 1" },
  ]);
  const [useSections, setUseSections] = useState(false);
  const [questionFormat, setQuestionFormat] = useState("MCQ_SINGLE");
  const [globalChapters, setGlobalChapters] = useState<string[]>([]);
  const [globalTopics, setGlobalTopics] = useState<string[]>([]);
  const [globalTags, setGlobalTags] = useState<string[]>([]);
  const [globalAdvancedOpen, setGlobalAdvancedOpen] = useState(false);

  const computedDifficulty = useMemo(() => avgDifficulty(sections), [sections]);

  // Sync when edit target or open changes
  useEffect(() => {
    if (!open) return;
    if (isEdit && templateToEdit) {
      const base = normalizeLegacy(templateToEdit.difficultyLevel ?? templateToEdit.level);
      setTitle(templateToEdit.title || "");
      setDescription(templateToEdit.description || "");
      setCourseId(templateToEdit.courseId || "");
      setCourseName(templateToEdit.courseName || "");
      setSubject(templateToEdit.subject || "");
      setSubjectMode(templateToEdit.subjectMode || "single");
      setDurationMinutes(templateToEdit.durationMinutes?.toString() || "60");
      setAttemptsAllowed(templateToEdit.attemptsAllowed?.toString() || "3");
      setIsPublished(templateToEdit.isPublished !== false);
      setMarkingScheme({
        correct: templateToEdit.markingScheme?.correct ?? 1,
        incorrect: templateToEdit.markingScheme?.incorrect ?? 0,
        unanswered: templateToEdit.markingScheme?.unanswered ?? 0,
      });
      const loadedSections =
        templateToEdit.sections?.length > 0
          ? templateToEdit.sections.map((s: any) => ({
              ...s,
              attemptlimit: s.attemptlimit ?? null,
              difficultyLevel: clamp(
                s.difficultyLevel ?? normalizeLegacy(s.difficulty ?? s.level ?? base)
              ),
              chapter: Array.isArray(s.chapter) ? s.chapter : s.chapter ? [s.chapter] : [],
              topics: Array.isArray(s.topics) ? s.topics.map(String) : [],
              subject: s.subject || "",
              tags: Array.isArray(s.tags) ? s.tags : [],
              format: s.format || "",
            }))
          : [{ ...BLANK_SECTION(), id: "sec_1", difficultyLevel: base }];
      setSections(loadedSections);
      const hasSections =
        typeof templateToEdit.useSections === "boolean"
          ? templateToEdit.useSections
          : (templateToEdit.sections?.length ?? 0) > 0;
      setUseSections(hasSections);
      setQuestionFormat(templateToEdit.questionFormat || "MCQ_SINGLE");
      setGlobalChapters(
        Array.isArray(templateToEdit.chapter)
          ? templateToEdit.chapter
          : templateToEdit.chapter
            ? [templateToEdit.chapter]
            : []
      );
      setGlobalTopics(Array.isArray(templateToEdit.topics) ? templateToEdit.topics : []);
      setGlobalTags(Array.isArray(templateToEdit.tags) ? templateToEdit.tags : []);
      setGlobalAdvancedOpen(
        !!(
          templateToEdit.chapter?.length ||
          templateToEdit.topics?.length ||
          templateToEdit.tags?.length
        )
      );
    } else if (!isEdit) {
      // Reset for create mode
      setTitle("");
      setDescription("");
      setCourseId("");
      setCourseName("");
      setSubject("");
      setSubjectMode("single");
      setDurationMinutes("60");
      setAttemptsAllowed("3");
      setIsPublished(true);
      setMarkingScheme({ correct: 1, incorrect: 0, unanswered: 0 });
      setSections([{ ...BLANK_SECTION(), id: "sec_1", name: "Section 1" }]);
      setUseSections(false);
      setQuestionFormat("MCQ_SINGLE");
      setGlobalChapters([]);
      setGlobalTopics([]);
      setGlobalTags([]);
      setGlobalAdvancedOpen(false);
    }
  }, [open, templateToEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── section handlers ────────────────────────────────────────────────────────

  const handleAddSection = () =>
    setSections((prev) => [
      ...prev,
      {
        ...BLANK_SECTION(),
        name: `Section ${prev.length + 1}`,
        difficultyLevel: computedDifficulty,
      },
    ]);

  const handleRemoveSection = (i: number) =>
    setSections((prev) => prev.filter((_, idx) => idx !== i));

  const handleSectionEdit = (
    i: number,
    payload: {
      name: string;
      questionsCount: number;
      attemptLimit?: number | null;
      durationMinutes?: number | null;
      difficultyLevel: number;
      chapters: string[];
      topics: string[];
      markingScheme: MarkingScheme | null;
      subject: string;
      tags: string[];
      format: string;
    }
  ) => {
    setSections((prev) => {
      const next = [...prev];
      next[i] = {
        ...next[i],
        name: payload.name,
        questionsCount: payload.questionsCount,
        attemptlimit: payload.attemptLimit ?? null,
        durationMinutes: payload.durationMinutes ?? null,
        difficultyLevel: clamp(payload.difficultyLevel),
        chapter: payload.chapters || [],
        topics: payload.topics || [],
        markingScheme: payload.markingScheme,
        subject: payload.subject || "",
        tags: payload.tags || [],
        format: payload.format || "",
      };
      return next;
    });
  };

  // ─── save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!courseId) {
      toast.error("Course is required");
      return;
    }
    if (isAdmin && subjectMode === "single" && !subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!isAdmin && !subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (useSections && !sections.length) {
      toast.error("At least one section is required");
      return;
    }
    if (!isAdmin && !firebaseUser) return;

    setLoading(true);
    try {
      const mappedSections = useSections
        ? sections.map((s) => {
            const totalQ = Number(s.questionsCount) || 0;
            const attemptLimit =
              s.attemptlimit == null
                ? isAdmin
                  ? 0
                  : totalQ
                : Math.min(Number(s.attemptlimit), totalQ);
            return {
              name: s.name.trim(),
              questionsCount: totalQ,
              attemptlimit: attemptLimit,
              durationMinutes: s.durationMinutes ? Number(s.durationMinutes) : null,
              difficultyLevel: clamp(s.difficultyLevel),
              chapter: Array.isArray(s.chapter) ? s.chapter : [],
              topics: Array.isArray(s.topics) ? s.topics : [],
              subject: s.subject || "",
              tags: Array.isArray(s.tags) ? s.tags : [],
              format: s.format || "",
              markingScheme: s.markingScheme
                ? {
                    correct: Number(s.markingScheme.correct),
                    incorrect: Number(s.markingScheme.incorrect),
                    unanswered: Number(s.markingScheme.unanswered),
                  }
                : null,
            };
          })
        : [];

      const difficulty = useSections ? avgDifficulty(sections, 0.5) : 0.5;

      const base: Record<string, any> = {
        title: title.trim(),
        description: description.trim(),
        subject: isAdmin && subjectMode !== "single" ? "" : subject.trim(),
        courseId: courseId || null,
        courseName: courseName || null,
        level: getDifficultyLabel(difficulty),
        difficultyLevel: difficulty,
        durationMinutes: Number(durationMinutes) || 0,
        markingScheme: {
          correct: Number(markingScheme.correct),
          incorrect: Number(markingScheme.incorrect),
          unanswered: Number(markingScheme.unanswered),
        },
        useSections,
        sections: mappedSections,
        questionsCount: mappedSections.reduce((a, s) => a + s.questionsCount, 0),
        ...(!useSections && {
          questionFormat,
          chapter: globalChapters,
          topics: globalTopics,
          tags: globalTags,
        }),
        updatedAt: serverTimestamp(),
      };

      if (isAdmin) {
        const adminPayload = {
          ...base,
          subjectMode,
          attemptsAllowed: Number(attemptsAllowed) || 3,
          isPublished,
          source: "admin",
        };
        if (isEdit) {
          await updateDoc(doc(db, "templates", templateToEdit.id), {
            ...adminPayload,
            version: increment(1),
          });
          toast.success("Template updated");
        } else {
          await addDoc(collection(db, "templates"), {
            ...adminPayload,
            version: 1,
            createdAt: serverTimestamp(),
          });
          toast.success("Template created");
        }
      } else {
        await addDoc(collection(db, "educators", firebaseUser!.uid, "templates"), {
          ...base,
          createdAt: serverTimestamp(),
        });
        toast.success("Template created");
      }

      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save template");
    } finally {
      setLoading(false);
    }
  };

  // ─── derived ─────────────────────────────────────────────────────────────────

  const courses = isAdmin ? allCourses : accessibleCourses;
  const subjectsForCourse = isAdmin
    ? courseId
      ? allSubjects.filter((s) => s.courseId === courseId)
      : allSubjects
    : accessibleSubjects;

  const globalFilteredChapters = useMemo(() => {
    if (!qbOptions.rawQuestions.length || (!globalTopics.length && !globalTags.length))
      return qbOptions.chapters;
    const topicSet = new Set(globalTopics);
    const tagSet = new Set(globalTags);
    return [...new Set(
      qbOptions.rawQuestions
        .filter((q) => {
          const tm = !topicSet.size || q.topics.some((t) => topicSet.has(t));
          const gm = !tagSet.size || q.tags.some((t) => tagSet.has(t));
          return tm && gm;
        })
        .map((q) => q.chapter)
        .filter(Boolean)
    )].sort();
  }, [qbOptions.rawQuestions, globalTopics, globalTags, qbOptions.chapters]);

  const globalFilteredTopics = useMemo(() => {
    if (!qbOptions.rawQuestions.length || (!globalChapters.length && !globalTags.length))
      return qbOptions.topics;
    const chapterSet = new Set(globalChapters.map((c) => c.toLowerCase()));
    const tagSet = new Set(globalTags);
    return [...new Set(
      qbOptions.rawQuestions
        .filter((q) => {
          const cm = !chapterSet.size || (q.chapter && chapterSet.has(q.chapter.toLowerCase()));
          const gm = !tagSet.size || q.tags.some((t) => tagSet.has(t));
          return cm && gm;
        })
        .flatMap((q) => q.topics)
    )].sort();
  }, [qbOptions.rawQuestions, globalChapters, globalTags, qbOptions.topics]);

  const globalFilteredTags = useMemo(() => {
    if (!qbOptions.rawQuestions.length || (!globalChapters.length && !globalTopics.length))
      return qbOptions.tags;
    const chapterSet = new Set(globalChapters.map((c) => c.toLowerCase()));
    const topicSet = new Set(globalTopics);
    const tagSet = new Set<string>();
    qbOptions.rawQuestions.forEach((q) => {
      const chapterMatch =
        !globalChapters.length || (q.chapter && chapterSet.has(q.chapter.toLowerCase()));
      const topicMatch = !globalTopics.length || q.topics.some((t) => topicSet.has(t));
      if (chapterMatch && topicMatch) {
        q.tags.forEach((t) => tagSet.add(t));
      }
    });
    return Array.from(tagSet).sort();
  }, [qbOptions.rawQuestions, globalChapters, globalTopics, qbOptions.tags]);

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template" : "Create Template"}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Define default settings. Educators can base custom tests on this template."
              : "Build a reusable blueprint for quickly generating custom tests."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Title + Course */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. JEE Mains Mock"
              />
            </div>
            {courses.length > 0 && (
              <div className="space-y-2">
                <Label>Course</Label>
                <Select
                  value={courseId}
                  onValueChange={(v) => {
                    setCourseId(v);
                    setCourseName(courses.find((c) => c.id === v)?.name ?? "");
                    setSubject("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Subject mode toggle — admin only */}
            {isAdmin && (
              <div className="space-y-2">
                <Label>Subject Mode</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={subjectMode === "single" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSubjectMode("single")}
                  >
                    Single Subject
                  </Button>
                  <Button
                    type="button"
                    variant={subjectMode === "section_wise" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSubjectMode("section_wise")}
                  >
                    Section-wise
                  </Button>
                </div>
              </div>
            )}

            {/* Subject picker */}
            {(!isAdmin || subjectMode === "single") && (
              <div className="space-y-2">
                <Label>Subject *</Label>
                {subjectsForCourse.length > 0 ? (
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectsForCourse.map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Physics"
                  />
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Template description..."
            />
          </div>

          {/* Difficulty + Duration + Marking Scheme */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Difficulty (avg of sections)</Label>
              <span
                className={`mt-1 block text-sm font-semibold ${getDifficultyColor(computedDifficulty)}`}
              >
                {computedDifficulty.toFixed(2)} — {getDifficultyLabel(computedDifficulty)}
              </span>
            </div>
            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                min={1}
              />
            </div>
            {isAdmin && (
              <div className="space-y-2">
                <Label>Attempts Allowed</Label>
                <Input
                  type="number"
                  value={attemptsAllowed}
                  onChange={(e) => setAttemptsAllowed(e.target.value)}
                  min={1}
                />
              </div>
            )}
            <div className="col-span-2 space-y-3">
              <h3 className="text-sm font-semibold">Marking Scheme</h3>
              <div className="grid grid-cols-3 gap-4">
                <FloatingInput
                  label="Correct"
                  type="number"
                  value={markingScheme.correct}
                  onChange={(e) =>
                    setMarkingScheme((m) => ({ ...m, correct: Number(e.target.value) }))
                  }
                />
                <FloatingInput
                  label="Incorrect"
                  type="number"
                  value={markingScheme.incorrect}
                  onChange={(e) =>
                    setMarkingScheme((m) => ({ ...m, incorrect: Number(e.target.value) }))
                  }
                />
                <FloatingInput
                  label="Unanswered"
                  type="number"
                  value={markingScheme.unanswered}
                  onChange={(e) =>
                    setMarkingScheme((m) => ({ ...m, unanswered: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold">Sections</h3>
                <div className="flex items-center gap-2">
                  <Switch checked={useSections} onCheckedChange={setUseSections} />
                  <span className="text-xs text-muted-foreground">
                    {useSections ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
              {useSections && (
                <Button size="sm" variant="outline" onClick={handleAddSection}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Section
                </Button>
              )}
            </div>

            {!useSections ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Question Format</Label>
                  <Select value={questionFormat} onValueChange={setQuestionFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MCQ_SINGLE">MCQ (Single Correct)</SelectItem>
                      <SelectItem value="MCQ_MULTI">MCQ (Multiple Correct)</SelectItem>
                      <SelectItem value="MCQ_CASE_STUDY">MCQ (Case Study)</SelectItem>
                      <SelectItem value="FILL_UP">Fill-ups / One-word</SelectItem>
                      <SelectItem value="SUBJECTIVE_LONG">Subjective (Long)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Advanced: QB filter fields */}
                <div className="rounded-xl border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setGlobalAdvancedOpen((v) => !v)}
                  >
                    <span>Advanced Settings</span>
                    {globalAdvancedOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {globalAdvancedOpen && (
                    <div className="space-y-3 border-t px-3 pb-3 pt-3">
                      <p className="text-xs text-muted-foreground">
                        Used by auto-fill and AI fill to narrow the question pool.
                      </p>
                      <div className="space-y-2">
                        <Label>Chapters (optional)</Label>
                        <MultiSelect
                          options={globalFilteredChapters}
                          selected={globalChapters}
                          onChange={setGlobalChapters}
                          placeholder="Any chapter"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Topics (optional)</Label>
                        <MultiSelect
                          options={globalFilteredTopics}
                          selected={globalTopics}
                          onChange={setGlobalTopics}
                          placeholder="Select topics..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tags (optional)</Label>
                        <MultiSelect
                          options={globalFilteredTags}
                          selected={globalTags}
                          onChange={setGlobalTags}
                          placeholder="Select tags..."
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              sections.map((sec, i) => (
                <SectionCard
                  key={sec.id}
                  sectionId={sec.id}
                  sectionName={sec.name}
                  questionCount={sec.questionsCount}
                  attemptLimit={sec.attemptlimit ?? undefined}
                  durationMinutes={sec.durationMinutes ?? undefined}
                  sectionDifficulty={sec.difficultyLevel}
                  sectionChapter={sec.chapter}
                  sectionTopics={sec.topics}
                  sectionSubject={sec.subject}
                  sectionTags={sec.tags}
                  sectionFormat={sec.format}
                  markingScheme={sec.markingScheme}
                  defaultMarkingScheme={markingScheme}
                  availableChapters={qbOptions.chapters}
                  availableTopics={qbOptions.topics}
                  availableTagOptions={qbOptions.tags}
                  rawQuestions={qbOptions.rawQuestions}
                  showSubjectPicker={isAdmin && subjectMode === "section_wise"}
                  courseSubjects={
                    isAdmin ? allSubjects.filter((s) => s.courseId === courseId) : undefined
                  }
                  onEdit={(payload) => handleSectionEdit(i, payload)}
                  onRemove={() => handleRemoveSection(i)}
                />
              ))
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="gradient-bg text-white" onClick={handleSave} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
