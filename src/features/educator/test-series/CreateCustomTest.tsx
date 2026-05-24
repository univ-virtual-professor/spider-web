import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { Badge } from "@shared/ui/badge";
import { Slider } from "@shared/ui/slider";
import { MultiSelect } from "@shared/ui/MultiSelect";
import { SearchableSingleSelect } from "@shared/ui/searchable-single-select";
import { useQBOptions } from "@shared/hooks/useQBOptions";
import {
  Plus,
  Loader2,
  Clock,
  BookOpen,
  ListChecks,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import SectionCard from "@features/admin/components/SectionCard";
import { Switch } from "@shared/ui/switch";

function getDifficultyLabel(level: number): string {
  if (level <= 0.3) return "Easy";
  if (level <= 0.7) return "Medium";
  return "Hard";
}

function getDifficultyColor(level: number): string {
  if (level <= 0.3) return "text-green-600";
  if (level <= 0.7) return "text-yellow-600";
  return "text-red-600";
}

function normalizeLegacyDifficulty(level?: string | number): number {
  if (typeof level === "number") return Math.max(0, Math.min(1, level));
  const s = String(level || "")
    .toLowerCase()
    .trim();
  if (s === "easy") return 0.15;
  if (s === "medium" || s === "general") return 0.5;
  if (s === "hard") return 0.85;
  return 0.5;
}

function clampDifficulty(level?: number) {
  if (!Number.isFinite(Number(level))) return 0.5;
  return Math.min(1, Math.max(0, Number(level)));
}

function getAverageDifficulty(sections: Array<{ difficultyLevel?: number }>, fallback = 0.5) {
  if (sections.length === 0) return fallback;
  const total = sections.reduce(
    (acc, s) => acc + clampDifficulty(s.difficultyLevel ?? fallback),
    0
  );
  return total / sections.length;
}

type TemplateOption = {
  id: string;
  label: string;
  group: "admin" | "educator";
};

type FullTemplateData = {
  id: string;
  title?: string;
  description?: string;
  subject?: string;
  level?: string;
  durationMinutes?: number;
  duration?: number;
  attemptsAllowed?: number;
  sections?: Array<{
    id?: string;
    name?: string;
    questionsCount?: number;
    attemptlimit?: number | null;
    durationMinutes?: number | null;
    difficultyLevel?: number;
    difficulty?: string;
    topics?: string[];
    markingScheme?: {
      correct?: number;
      incorrect?: number;
      unanswered?: number;
    } | null;
  }>;
  markingScheme?: {
    correct?: number;
    incorrect?: number;
    unanswered?: number;
  };
  syllabus?: string[];
  requiresUnlock?: boolean;
  price?: number;
  isPublished?: boolean;
  questionsCount?: number;
  questionCount?: number;
  totalQuestions?: number;
  templateName?: string;
  difficultyLevel?: number;
  version?: number | string;
};

type CreateCustomTestProps = {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  handleCreateCustom: (values: Record<string, any>) => Promise<void> | void;
  creating: boolean;
  selectedTemplateId: string;
  setSelectedTemplateId: (value: string) => void;
  templates: TemplateOption[];
  educatorTemplates: FullTemplateData[];
  accessibleCourses?: { id: string; name: string }[];
  accessibleSubjects?: { id: string; name: string; courseId: string }[];
  onCreateTemplate?: () => void;
};

function safeNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const CreateCustomTest = ({
  createOpen,
  setCreateOpen,
  handleCreateCustom,
  creating,
  selectedTemplateId,
  setSelectedTemplateId,
  templates,
  educatorTemplates,
  accessibleCourses = [],
  accessibleSubjects = [],
  onCreateTemplate,
}: CreateCustomTestProps) => {
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCourseId, setFormCourseId] = useState("");
  const [formCourseName, setFormCourseName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [subjectMode, setSubjectMode] = useState<"single" | "section_wise">("single");
  const [formDuration, setFormDuration] = useState("60");
  const [formSections, setFormSections] = useState<any[]>([]);
  const [formMarkingScheme, setFormMarkingScheme] = useState<any>({
    correct: 4,
    incorrect: -1,
    unanswered: 0,
  });

  // Add Section popup state
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionQuestionsCount, setNewSectionQuestionsCount] = useState("");
  const [newSectionDifficulty, setNewSectionDifficulty] = useState(0.5);
  const [newSectionTopics, setNewSectionTopics] = useState<string[]>([]);
  const [newSectionChapter, setNewSectionChapter] = useState("");
  const [newSectionSubject, setNewSectionSubject] = useState("");
  const [newSectionTags, setNewSectionTags] = useState<string[]>([]);
  const [newSectionAttemptLimit, setNewSectionAttemptLimit] = useState("");
  const [newSectionFormat, setNewSectionFormat] = useState("MCQ_SINGLE");
  const [addSectionAdvancedOpen, setAddSectionAdvancedOpen] = useState(false);
  const [useSections, setUseSections] = useState(false);
  const [formQuestionFormat, setFormQuestionFormat] = useState("MCQ_SINGLE");
  const [formQuestionsCount, setFormQuestionsCount] = useState("");
  const [formGlobalChapter, setFormGlobalChapter] = useState("");
  const [formGlobalTopics, setFormGlobalTopics] = useState<string[]>([]);
  const [formGlobalTags, setFormGlobalTags] = useState<string[]>([]);
  const [globalAdvancedOpen, setGlobalAdvancedOpen] = useState(false);

  // QB options scoped to educator's accessible subjects
  const allowedSubjectIds = accessibleSubjects.map((s) => s.id);
  const qbOptions = useQBOptions(allowedSubjectIds);

  // Reset form & template selection when dialog opens
  useEffect(() => {
    if (createOpen) {
      setFormTitle("");
      setFormDescription("");
      setFormCourseId("");
      setFormCourseName("");
      setFormSubject("");
      setSubjectMode("single");
      setFormDuration("60");
      setFormSections([]);
      setFormMarkingScheme({ correct: 4, incorrect: -1, unanswered: 0 });
      setSelectedTemplateId("none");
      setUseSections(false);
      setFormQuestionFormat("MCQ_SINGLE");
      setFormQuestionsCount("");
      setFormGlobalChapter("");
      setFormGlobalTopics([]);
      setFormGlobalTags([]);
      setGlobalAdvancedOpen(false);
    }
  }, [createOpen]);

  const resolvedTemplate = useMemo((): FullTemplateData | null => {
    if (!selectedTemplateId || selectedTemplateId === "none") return null;
    const [type, id] = selectedTemplateId.split(":");
    if (!id) return null;

    if (type === "edu") return educatorTemplates.find((t) => t.id === id) || null;
    return null;
  }, [selectedTemplateId, educatorTemplates]);

  useEffect(() => {
    if (!resolvedTemplate) {
      if (selectedTemplateId === "none" || !selectedTemplateId) {
        setFormDescription("");
        setFormSubject("");
        setSubjectMode("single");
        setFormDuration("60");
        setFormSections([]);
        setFormMarkingScheme({ correct: 4, incorrect: -1, unanswered: 0 });
      }
      return;
    }
    const baseDifficulty = normalizeLegacyDifficulty(
      resolvedTemplate.difficultyLevel ?? resolvedTemplate.level
    );
    setFormDescription(String(resolvedTemplate.description || ""));
    if ((resolvedTemplate as any).courseId) {
      setFormCourseId(String((resolvedTemplate as any).courseId));
      setFormCourseName(String((resolvedTemplate as any).courseName || ""));
    }
    setFormSubject(String(resolvedTemplate.subject || ""));
    setSubjectMode((resolvedTemplate as any).subjectMode || "single");
    setFormDuration(
      String(safeNum(resolvedTemplate.durationMinutes ?? resolvedTemplate.duration, 60))
    );
    const loadedSections = resolvedTemplate.sections
      ? JSON.parse(JSON.stringify(resolvedTemplate.sections)).map((s: any) => ({
          ...s,
          attemptlimit: s.attemptlimit ?? null,
          durationMinutes: s.durationMinutes ?? null,
          difficultyLevel: clampDifficulty(
            s?.difficultyLevel ??
              normalizeLegacyDifficulty(s?.difficulty ?? s?.level ?? baseDifficulty)
          ),
          topics: Array.isArray(s?.topics) ? s.topics.map(String) : [],
        }))
      : [];
    setFormSections(loadedSections);
    setUseSections(loadedSections.length > 0);
    setFormMarkingScheme(
      resolvedTemplate.markingScheme
        ? JSON.parse(JSON.stringify(resolvedTemplate.markingScheme))
        : { correct: 4, incorrect: -1, unanswered: 0 }
    );
  }, [resolvedTemplate]);

  const handleTemplateChange = (value: string) => {
    if (value === "__create_template__") {
      onCreateTemplate?.();
      return;
    }
    setSelectedTemplateId(value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formCourseId) {
      toast.error("Course is required");
      return;
    }

    if (!(useSections && subjectMode === "section_wise") && !formSubject.trim()) {
      toast.error("Subject is required");
      return;
    }

    // Validation: if sections enabled, every section must have questionsCount > 0
    if (useSections && formSections.length > 0) {
      const emptySections = formSections.filter((s) => (Number(s.questionsCount) || 0) <= 0);
      if (emptySections.length > 0) {
        const names = emptySections.map((s) => s.name?.trim() || "Unnamed").join(", ");
        toast.error(
          `Cannot create test: section(s) "${names}" have no questions. Set a question count for each section or remove them.`
        );
        return;
      }
    }

    const averagedDifficultyLevel = getAverageDifficulty(formSections, 0.5);
    const values: Record<string, any> = {
      title: formTitle.trim(),
      description: formDescription.trim(),
      courseId: formCourseId,
      courseName: formCourseName,
      subject: useSections && subjectMode === "section_wise" ? "" : formSubject.trim(),
      subjectMode: useSections ? subjectMode : "single",
      level: getDifficultyLabel(averagedDifficultyLevel),
      difficultyLevel: averagedDifficultyLevel,
      durationMinutes: Number(formDuration) || 60,
      useSections,
      ...(useSections
        ? {}
        : {
            questionsCount: Number(formQuestionsCount) || 0,
            questionFormat: formQuestionFormat,
            chapter: formGlobalChapter || null,
            topics: formGlobalTopics,
            tags: formGlobalTags,
          }),
      sections: (useSections ? formSections : []).map((s, index) => {
        const totalQ = Number(s.questionsCount) || 0;

        const attemptLimit =
          s.attemptlimit == null ? totalQ : Math.min(Number(s.attemptlimit), totalQ);

        return {
          id: s.id || `sec_${index + 1}`,
          name: s.name?.trim() || "Section",
          questionsCount: totalQ,
          attemptlimit: attemptLimit,
          durationMinutes: s.durationMinutes ? Number(s.durationMinutes) : null,
          difficultyLevel: clampDifficulty(s.difficultyLevel),
          chapter: s.chapter || "",
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
      }),
      markingScheme: {
        correct: Number(formMarkingScheme.correct),
        incorrect: Number(formMarkingScheme.incorrect),
        unanswered: Number(formMarkingScheme.unanswered),
      },
    };
    if (resolvedTemplate) {
      if (resolvedTemplate.syllabus) values.syllabus = resolvedTemplate.syllabus;
      if (resolvedTemplate.requiresUnlock !== undefined)
        values.requiresUnlock = resolvedTemplate.requiresUnlock;
      if (resolvedTemplate.attemptsAllowed)
        values.attemptsAllowed = resolvedTemplate.attemptsAllowed;
      // Track source template for drift detection
      if (selectedTemplateId && selectedTemplateId !== "none") {
        const [, rawTemplateId] = selectedTemplateId.split(":");
        if (rawTemplateId) {
          values.sourceTemplateId = rawTemplateId;
          // version may be undefined for pre-versioning templates — store 0 so drift check is graceful
          values.sourceTemplateVersion = Number(resolvedTemplate.version ?? 0);
        }
      }
    }
    await handleCreateCustom(values);
  };

  const openAddSectionDialog = () => {
    setNewSectionName(`Section ${formSections.length + 1}`);
    setNewSectionQuestionsCount("");
    setNewSectionAttemptLimit("");
    setNewSectionDifficulty(computedDifficultyLevel);
    setNewSectionTopics([]);
    setNewSectionChapter("");
    setNewSectionSubject("");
    setNewSectionTags([]);
    setNewSectionFormat("MCQ_SINGLE");
    setAddSectionAdvancedOpen(false);
    setAddSectionOpen(true);
  };

  const handleConfirmAddSection = () => {
    const name = newSectionName.trim() || `Section ${formSections.length + 1}`;
    const qCount = Math.max(0, Number(newSectionQuestionsCount) || 0);

    if (qCount <= 0) {
      toast.error("Question count must be greater than 0");
      return;
    }

    setFormSections([
      ...formSections,
      {
        id: `sec_${Date.now()}`,
        name,
        questionsCount: qCount,
        attemptlimit: newSectionAttemptLimit.trim()
          ? Math.max(0, Number(newSectionAttemptLimit) || 0)
          : null,
        durationMinutes: null,
        difficultyLevel: clampDifficulty(newSectionDifficulty),
        topics: newSectionTopics,
        chapter: newSectionChapter || "",
        subject: newSectionSubject || "",
        tags: newSectionTags,
        format: newSectionFormat || "",
      },
    ]);
    setAddSectionOpen(false);
  };

  // Admin templates first, then educator templates
  const adminTemplates = templates.filter((t) => t.group === "admin");
  const educatorTpls = templates.filter((t) => t.group === "educator");

  const totalQuestions = resolvedTemplate
    ? safeNum(
        resolvedTemplate.questionsCount ??
          resolvedTemplate.questionCount ??
          resolvedTemplate.totalQuestions ??
          (resolvedTemplate.sections || []).reduce(
            (acc: number, s: any) => acc + safeNum(s?.questionsCount, 0),
            0
          ),
        0
      )
    : 0;

  const computedDifficultyLevel = getAverageDifficulty(formSections, 0.5);

  return (
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl">
      <DialogHeader>
        <DialogTitle>Create New Test</DialogTitle>
        <DialogDescription>
          Start from an admin template or one of your saved templates, then create a new test with
          the same settings.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="mt-2 space-y-4">
        <div className="space-y-2">
          <Label>Template</Label>
          <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Blank test</SelectItem>

              {/* Admin templates first */}
              {adminTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Admin Templates</SelectLabel>
                  {adminTemplates.map((template) => (
                    <SelectItem
                      key={template.id}
                      value={`admin:${template.id.replace("admin:", "")}`}
                    >
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

              {/* Educator custom templates */}
              {educatorTpls.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Your Templates</SelectLabel>
                    {educatorTpls.map((template) => (
                      <SelectItem
                        key={template.id}
                        value={`edu:${template.id.replace("edu:", "")}`}
                      >
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}

              {/* Create Custom Template option at the end */}
              <SelectSeparator />
              <SelectItem value="__create_template__" className="font-medium text-primary">
                + Create Custom Template
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {resolvedTemplate && (
          <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Template Preview</span>
              <Badge variant="secondary" className="ml-auto rounded-full text-xs">
                Pre-filled
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-background/80 p-2.5 text-center">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Duration</p>
                <p className="flex items-center justify-center gap-1 text-sm font-bold">
                  <Clock className="h-3 w-3" />
                  {safeNum(resolvedTemplate.durationMinutes ?? resolvedTemplate.duration, 60)}m
                </p>
              </div>
              <div className="rounded-xl bg-background/80 p-2.5 text-center">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Questions</p>
                <p className="flex items-center justify-center gap-1 text-sm font-bold">
                  <BookOpen className="h-3 w-3" />
                  {totalQuestions}
                </p>
              </div>
              <div className="rounded-xl bg-background/80 p-2.5 text-center">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Sections</p>
                <p className="flex items-center justify-center gap-1 text-sm font-bold">
                  <ListChecks className="h-3 w-3" />
                  {(resolvedTemplate.sections || []).length}
                </p>
              </div>
            </div>
            {resolvedTemplate.syllabus && resolvedTemplate.syllabus.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Syllabus ({resolvedTemplate.syllabus.length} topics):
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {resolvedTemplate.syllabus.slice(0, 5).join(", ")}
                  {resolvedTemplate.syllabus.length > 5
                    ? ` +${resolvedTemplate.syllabus.length - 5} more`
                    : ""}
                </p>
              </div>
            )}
            <p className="mt-2 text-[11px] italic text-muted-foreground">
              Template loaded! You can modify its settings below.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            required
            placeholder="e.g. Weekly Biology Mock"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Short instructions / overview..."
            className="min-h-[90px] rounded-xl"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {accessibleCourses.length > 0 && (
            <div className="space-y-2">
              <Label>Course *</Label>
              <Select
                value={formCourseId}
                onValueChange={(v) => {
                  setFormCourseId(v);
                  setFormCourseName(accessibleCourses.find((c) => c.id === v)?.name ?? "");
                  setFormSubject("");
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {accessibleCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!(useSections && subjectMode === "section_wise") && (
            <div className="space-y-2">
              <Label>Subject *</Label>
              {formCourseId &&
              accessibleSubjects.filter((s) => s.courseId === formCourseId).length > 0 ? (
                <Select value={formSubject} onValueChange={setFormSubject}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {accessibleSubjects
                      .filter((s) => s.courseId === formCourseId)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="rounded-xl"
                  placeholder="e.g. Maths"
                />
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Test Difficulty (avg of sections)</Label>
            <span
              className={`min-w-[60px] text-right text-xs font-semibold ${getDifficultyColor(computedDifficultyLevel)}`}
            >
              {computedDifficultyLevel.toFixed(2)} — {getDifficultyLabel(computedDifficultyLevel)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input
              value={formDuration}
              onChange={(e) => setFormDuration(e.target.value)}
              required
              type="number"
              min={1}
              className="rounded-xl"
            />
          </div>
          {!useSections && (
            <div className="space-y-2">
              <Label>Question Count *</Label>
              <Input
                type="number"
                min={1}
                value={formQuestionsCount}
                onChange={(e) => setFormQuestionsCount(e.target.value)}
                placeholder="e.g. 30"
                className="rounded-xl"
              />
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold">Global Marking Scheme</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Correct (+)</Label>
              <Input
                type="number"
                className="h-8"
                value={formMarkingScheme.correct}
                onChange={(e) =>
                  setFormMarkingScheme({ ...formMarkingScheme, correct: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Incorrect (-)</Label>
              <Input
                type="number"
                className="h-8"
                value={formMarkingScheme.incorrect}
                onChange={(e) =>
                  setFormMarkingScheme({ ...formMarkingScheme, incorrect: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Unanswered</Label>
              <Input
                type="number"
                className="h-8"
                value={formMarkingScheme.unanswered}
                onChange={(e) =>
                  setFormMarkingScheme({ ...formMarkingScheme, unanswered: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold">Sections</h3>
              <div className="flex items-center gap-2">
                <Switch checked={useSections} onCheckedChange={setUseSections} />
                <span className="text-xs text-muted-foreground">
                  {useSections ? "Enabled" : "Disabled"}
                </span>
              </div>
              {useSections && (
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-1">
                  <button
                    type="button"
                    onClick={() => setSubjectMode("single")}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      subjectMode === "single"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Single Subject
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubjectMode("section_wise")}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      subjectMode === "section_wise"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Section-wise
                  </button>
                </div>
              )}
            </div>
            {useSections && (
              <Button type="button" size="sm" variant="outline" onClick={openAddSectionDialog}>
                <Plus className="mr-2 h-4 w-4" /> Add Section
              </Button>
            )}
          </div>

          {!useSections ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Question Format</Label>
                <Select value={formQuestionFormat} onValueChange={setFormQuestionFormat}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select question format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MCQ_SINGLE">MCQ (Single Correct)</SelectItem>
                    <SelectItem value="MCQ_MULTI">MCQ (Multiple Correct)</SelectItem>
                    <SelectItem value="MCQ_CASE_STUDY">MCQ (Case Study)</SelectItem>
                    <SelectItem value="SUBJECTIVE_SHORT">Subjective (Short)</SelectItem>
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
                      <Label>Chapter (optional)</Label>
                      {qbOptions.chapters.length > 0 ? (
                        <SearchableSingleSelect
                          options={qbOptions.chapters}
                          value={formGlobalChapter}
                          onChange={setFormGlobalChapter}
                          placeholder="Any chapter"
                          searchPlaceholder="Search chapters..."
                          className="rounded-xl"
                        />
                      ) : (
                        <Input
                          value={formGlobalChapter}
                          onChange={(e) => setFormGlobalChapter(e.target.value)}
                          placeholder="e.g. Kinematics"
                          className="rounded-xl"
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Topics (optional)</Label>
                      <MultiSelect
                        options={qbOptions.topics}
                        selected={formGlobalTopics}
                        onChange={setFormGlobalTopics}
                        placeholder="Select topics..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tags (optional)</Label>
                      <MultiSelect
                        options={qbOptions.tags}
                        selected={formGlobalTags}
                        onChange={setFormGlobalTags}
                        placeholder="Select tags..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : formSections.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-muted/20 py-4 text-center text-xs italic text-muted-foreground">
              No sections defined. The test will be a single unsectioned list of questions.
            </p>
          ) : (
            formSections.map((sec, index) => (
              <SectionCard
                key={sec.id || index}
                sectionId={sec.id || `sec_${index + 1}`}
                sectionName={sec.name}
                questionCount={Number(sec.questionsCount) || 0}
                attemptLimit={sec.attemptlimit ?? undefined}
                durationMinutes={sec.durationMinutes ?? undefined}
                sectionDifficulty={sec.difficultyLevel}
                sectionChapter={sec.chapter}
                sectionTopics={sec.topics}
                sectionSubject={sec.subject}
                sectionTags={sec.tags}
                availableChapters={qbOptions.chapters}
                availableTopics={qbOptions.topics}
                availableTagOptions={qbOptions.tags}
                sectionFormat={sec.format}
                markingScheme={sec.markingScheme}
                defaultMarkingScheme={formMarkingScheme}
                showSubjectPicker={subjectMode === "section_wise"}
                courseSubjects={accessibleSubjects.filter((s) =>
                  formCourseId ? s.courseId === formCourseId : true
                )}
                onEdit={(payload) => {
                  const updated = [...formSections];
                  updated[index] = {
                    ...updated[index],
                    name: payload.name,
                    questionsCount: payload.questionsCount,
                    attemptlimit: payload.attemptLimit ?? null,
                    durationMinutes: payload.durationMinutes ?? null,
                    difficultyLevel: clampDifficulty(payload.difficultyLevel),
                    chapter: payload.chapter || "",
                    topics: payload.topics || [],
                    subject: payload.subject || "",
                    tags: payload.tags || [],
                    format: payload.format || "",
                    markingScheme: payload.markingScheme,
                  };
                  setFormSections(updated);
                }}
                onRemove={() => setFormSections(formSections.filter((_, i) => i !== index))}
              />
            ))
          )}
        </div>

        {/* Add Section Dialog */}
        <Dialog open={addSectionOpen} onOpenChange={setAddSectionOpen}>
          <DialogContent className="max-w-md rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Add New Section</DialogTitle>
              <DialogDescription>
                Fill in the section details. Question count must be greater than 0.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Section Name</Label>
                <Input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="e.g. Physics"
                  className="rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Question Count *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newSectionQuestionsCount}
                    onChange={(e) => setNewSectionQuestionsCount(e.target.value)}
                    placeholder="e.g. 25"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Attempt Limit</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newSectionAttemptLimit}
                    onChange={(e) => setNewSectionAttemptLimit(e.target.value)}
                    placeholder="All"
                    className="rounded-xl"
                  />
                  <p className="text-[10px] text-muted-foreground">Leave blank to allow all</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>
                  Difficulty:{" "}
                  <span className={`font-semibold ${getDifficultyColor(newSectionDifficulty)}`}>
                    {newSectionDifficulty.toFixed(2)} — {getDifficultyLabel(newSectionDifficulty)}
                  </span>
                </Label>
                <Slider
                  value={[newSectionDifficulty]}
                  onValueChange={([v]) => setNewSectionDifficulty(clampDifficulty(v))}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Easy</span>
                  <span>Medium</span>
                  <span>Hard</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Question Format</Label>
                  <Select value={newSectionFormat} onValueChange={setNewSectionFormat}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MCQ_SINGLE">MCQ (Single Correct)</SelectItem>
                      <SelectItem value="MCQ_MULTI">MCQ (Multiple Correct)</SelectItem>
                      <SelectItem value="MCQ_CASE_STUDY">MCQ (Case Study)</SelectItem>
                      <SelectItem value="SUBJECTIVE_SHORT">Subjective (Short)</SelectItem>
                      <SelectItem value="SUBJECTIVE_LONG">Subjective (Long)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {subjectMode === "section_wise" && (
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    {formCourseId &&
                    accessibleSubjects.filter((s) => s.courseId === formCourseId).length > 0 ? (
                      <Select value={newSectionSubject} onValueChange={setNewSectionSubject}>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {accessibleSubjects
                            .filter((s) => s.courseId === formCourseId)
                            .map((s) => (
                              <SelectItem key={s.id} value={s.name}>
                                {s.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={newSectionSubject}
                        onChange={(e) => setNewSectionSubject(e.target.value)}
                        placeholder="e.g. Physics"
                        className="rounded-xl"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Advanced: QB filter fields */}
              <div className="rounded-xl border border-border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setAddSectionAdvancedOpen((v) => !v)}
                >
                  <span>Advanced Settings</span>
                  {addSectionAdvancedOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                {addSectionAdvancedOpen && (
                  <div className="space-y-3 border-t px-3 pb-3 pt-3">
                    <p className="text-xs text-muted-foreground">
                      Used by auto-fill and AI fill to narrow the question pool.
                    </p>
                    <div className="space-y-2">
                      <Label>Chapter (optional)</Label>
                      {qbOptions.chapters.length > 0 ? (
                        <SearchableSingleSelect
                          options={qbOptions.chapters}
                          value={newSectionChapter}
                          onChange={setNewSectionChapter}
                          placeholder="Any chapter"
                          searchPlaceholder="Search chapters..."
                          className="rounded-xl"
                        />
                      ) : (
                        <Input
                          value={newSectionChapter}
                          onChange={(e) => setNewSectionChapter(e.target.value)}
                          placeholder="e.g. Kinematics"
                          className="rounded-xl"
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Topics (optional)</Label>
                      <MultiSelect
                        options={qbOptions.topics}
                        selected={newSectionTopics}
                        onChange={setNewSectionTopics}
                        placeholder="Select topics..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tags (optional)</Label>
                      <MultiSelect
                        options={qbOptions.tags}
                        selected={newSectionTags}
                        onChange={setNewSectionTags}
                        placeholder="Select tags..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setAddSectionOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="gradient-bg rounded-xl text-white"
                onClick={handleConfirmAddSection}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button type="submit" className="mt-6 w-full rounded-xl" disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Test"}
        </Button>

        <p className="text-xs text-muted-foreground">
          Note: Educators cannot import from the global question bank. Add questions manually inside
          the test.
        </p>
      </form>
    </DialogContent>
  );
};

export default CreateCustomTest;
