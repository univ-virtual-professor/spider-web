// pages/admin/TestForm.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  X,
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

import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Textarea } from "@shared/ui/textarea";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Switch } from "@shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";

import EmptyState from "@features/admin/components/EmptyState";
import { toast } from "sonner";

import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
} from "firebase/firestore";

import { TagInput } from "@shared/ui/tag-input";
import ImageTextarea from "@features/educator/components/ImageTextarea";
import { Slider } from "@shared/ui/slider";
import { TopicMultiSelect } from "@shared/ui/topic-multi-select";

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

type Difficulty = "Easy" | "Medium" | "Hard";

type Section = {
  id: string;
  name: string;
  questionsCount: number;
  attemptConstraints?: {
    min: number;
    max: number;
  } | null;
  selectionRule?: "UPTO" | "EXACT" | null;
  durationMinutes?: number;
  difficultyLevel?: number;
  topics?: string[];
};

type MarkingScheme = {
  correct: number;
  incorrect: number;
  unanswered: number;
};

type SectionValidation = {
  errors: string[];
  warnings: string[];
};

type SectionsValidationResult = {
  sectionMap: Record<string, SectionValidation>;
  blockingErrors: string[];
  warnings: string[];
};

type SortableSectionCardProps = {
  section: Section;
  index: number;
  totalSections: number;
  collapsed: boolean;
  validation?: SectionValidation;
  questions: QuestionDoc[];
  editingQuestionId: string | null;
  savingQuestion: boolean;
  onDuplicate: (sectionId: string) => void;
  onToggleCollapse: (sectionId: string) => void;
  onRemove: (sectionId: string) => void;
  onUpdate: (sectionId: string, patch: Partial<Section>) => void;
  onCreateQuestion: (sectionId: string) => void;
  onEditQuestion: (q: QuestionDoc) => void;
  onDeleteQuestion: (q: QuestionDoc) => void;
  onToggleQuestionActive: (q: QuestionDoc) => void;
  onSaveQuestion: () => void;
  onCancelEdit: () => void;
  formQuestion: string;
  setFormQuestion: (value: string) => void;

  formOptions: string[];
  setFormOptions: React.Dispatch<React.SetStateAction<string[]>>;

  formCorrect: number;
  setFormCorrect: (value: number) => void;

  formExplanation: string;
  setFormExplanation: (value: string) => void;

  formDifficulty: Difficulty;
  setFormDifficulty: (value: Difficulty) => void;

  formSubject: string;
  setFormSubject: (value: string) => void;

  formTopic: string;
  setFormTopic: (value: string) => void;

  formMarks: string;
  setFormMarks: (value: string) => void;

  formNegMarks: string;
  setFormNegMarks: (value: string) => void;

  formActive: boolean;
  setFormActive: (value: boolean) => void;
};

type QuestionDoc = {
  id: string;
  question: string;
  options: string[];
  correctOption: number; // index
  explanation?: string;
  difficulty: Difficulty;
  subject?: string;
  topic?: string;
  marks?: number;
  negativeMarks?: number;
  isActive?: boolean;
  usageCount?: number;
  source?: "manual" | "question_bank" | string;
  bankQuestionId?: string;
  contentFormat?: "text" | "html";
  sectionId?: string;
  createdAtTs?: any;
  updatedAtTs?: any;
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function safeNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDifficulty(v: any): Difficulty {
  const s = String(v || "")
    .toLowerCase()
    .trim();
  if (s === "easy") return "Easy";
  if (s === "medium") return "Medium";
  if (s === "hard") return "Hard";
  return "Medium";
}

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

function difficultyBadge(d: Difficulty) {
  if (d === "Easy") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (d === "Hard") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
}

function difficultyBadgeFromLevel(level: number) {
  return difficultyBadge(getDifficultyLabel(level) as Difficulty);
}

const SUBJECTS = [
  "Accountancy",
  "Business Studies",
  "Applied Mathematics",
  "General Test",
  "English",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "History",
  "Geography",
  "Political Science",
  "Economics",
];

function validateSections(
  inputSections: Section[],
  testDurationValue: string
): SectionsValidationResult {
  const sectionMap: Record<string, SectionValidation> = {};
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (inputSections.length === 0) {
    blockingErrors.push("Please add at least one section");
  }

  const parsedTestDuration = Math.max(0, safeNum(testDurationValue, 0));
  let totalSectionDuration = 0;

  inputSections.forEach((section, index) => {
    const errors: string[] = [];
    const sectionWarnings: string[] = [];

    const sectionName = String(section.name ?? "").trim();
    const sectionQuestions = Number(section.questionsCount);
    const sectionDurationRaw =
      section.durationMinutes != null && String(section.durationMinutes) !== ""
        ? Number(section.durationMinutes)
        : null;

    if (!sectionName) {
      errors.push("Section name is required.");
      blockingErrors.push(`Section ${index + 1}: name is required`);
    }

    if (Number.isFinite(sectionQuestions) && sectionQuestions < 0) {
      errors.push("Questions count cannot be negative.");
      blockingErrors.push(`Section ${index + 1}: questions count cannot be negative`);
    }

    if (safeNum(section.questionsCount, 0) === 0) {
      sectionWarnings.push("Questions count is 0.");
    }

    if (sectionDurationRaw != null) {
      if (Number.isFinite(sectionDurationRaw) && sectionDurationRaw < 0) {
        errors.push("Section duration cannot be negative.");
        blockingErrors.push(`Section ${index + 1}: duration cannot be negative`);
      } else {
        totalSectionDuration += Math.max(0, safeNum(sectionDurationRaw, 0));
      }
    }

    sectionMap[section.id] = {
      errors,
      warnings: sectionWarnings,
    };
  });

  if (parsedTestDuration > 0 && totalSectionDuration > parsedTestDuration) {
    warnings.push(
      `Total section duration (${totalSectionDuration} min) exceeds test duration (${parsedTestDuration} min).`
    );
  }

  return {
    sectionMap,
    blockingErrors,
    warnings,
  };
}

function QuestionInlineEditor({
  question,
  saving,
  onSave,
  onCancel,
  formQuestion,
  setFormQuestion,
  formOptions,
  setFormOptions,
  formCorrect,
  setFormCorrect,
  formExplanation,
  setFormExplanation,
  formDifficulty,
  setFormDifficulty,
  formSubject,
  setFormSubject,
  formTopic,
  setFormTopic,
  formMarks,
  setFormMarks,
  formNegMarks,
  setFormNegMarks,
  formActive,
  setFormActive,
}: {
  question: QuestionDoc;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  formQuestion: string;
  setFormQuestion: (value: string) => void;
  formOptions: string[];
  setFormOptions: (value: string[]) => void;
  formCorrect: number;
  setFormCorrect: (value: number) => void;
  formExplanation: string;
  setFormExplanation: (value: string) => void;
  formDifficulty: Difficulty;
  setFormDifficulty: (value: Difficulty) => void;
  formSubject: string;
  setFormSubject: (value: string) => void;
  formTopic: string;
  setFormTopic: (value: string) => void;
  formMarks: string;
  setFormMarks: (value: string) => void;
  formNegMarks: string;
  setFormNegMarks: (value: string) => void;
  formActive: boolean;
  setFormActive: (value: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{question.id ? "Edit Question" : "New Question"}</h4>
        <Button variant="ghost" size="icon" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Question</Label>
            <ImageTextarea
              value={formQuestion}
              onChange={setFormQuestion}
              folder="/admin-test-questions"
              placeholder="Enter question..."
              minHeight="100px"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Options</Label>
            {formOptions.map((opt, idx) => (
              <ImageTextarea
                key={idx}
                value={opt}
                onChange={(v) => {
                  setFormOptions((prev) => prev.map((x, i) => (i === idx ? v : x)));
                }}
                folder="/admin-test-options"
                placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                minHeight="60px"
              />
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Explanation (optional)</Label>
            <ImageTextarea
              value={formExplanation}
              onChange={setFormExplanation}
              folder="/admin-test-explanations"
              placeholder="Explain the answer..."
              minHeight="80px"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm">Correct Option</Label>
              <Select value={String(formCorrect)} onValueChange={(v) => setFormCorrect(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3].map((i) => (
                    <SelectItem key={i} value={String(i)}>
                      {String.fromCharCode(65 + i)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Difficulty</Label>
              <Select value={formDifficulty} onValueChange={(v: any) => setFormDifficulty(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Subject</Label>
            <Input
              value={formSubject}
              onChange={(e) => setFormSubject(e.target.value)}
              placeholder="e.g. Physics"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Topic</Label>
            <Input
              value={formTopic}
              onChange={(e) => setFormTopic(e.target.value)}
              placeholder="e.g. Mechanics"
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm">Marks</Label>
              <Input
                value={formMarks}
                onChange={(e) => setFormMarks(e.target.value)}
                placeholder="5"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Neg. Marks</Label>
              <Input
                value={formNegMarks}
                onChange={(e) => setFormNegMarks(e.target.value)}
                placeholder="-1"
                className="h-9"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
            <div>
              <p className="text-sm font-medium">Published</p>
              <p className="text-xs text-muted-foreground">Available to students</p>
            </div>
            <Switch checked={formActive} onCheckedChange={setFormActive} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving} className="gradient-bg text-white">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : question.id ? (
            "Update"
          ) : (
            "Create"
          )}
        </Button>
      </div>
    </div>
  );
}

function SortableSectionCard({
  section,
  index,
  totalSections,
  collapsed,
  validation,
  questions,
  editingQuestionId,
  savingQuestion,
  onDuplicate,
  onToggleCollapse,
  onRemove,
  onUpdate,
  onCreateQuestion,
  onEditQuestion,
  onDeleteQuestion,
  onToggleQuestionActive,
  onSaveQuestion,
  onCancelEdit,
  formQuestion,
  setFormQuestion,

  formOptions,
  setFormOptions,

  formCorrect,
  setFormCorrect,

  formExplanation,
  setFormExplanation,

  formDifficulty,
  setFormDifficulty,

  formSubject,
  setFormSubject,

  formTopic,
  setFormTopic,

  formMarks,
  setFormMarks,

  formNegMarks,
  setFormNegMarks,

  formActive,
  setFormActive,
}: SortableSectionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const sectionDifficulty = clampDifficulty(section.difficultyLevel ?? 0.5);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border border-border bg-muted/20 p-4 ${isDragging ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">{`Section ${index + 1}`}</Badge>
              <p className="font-medium">{section.name?.trim() || `Section ${index + 1}`}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {safeNum(section.questionsCount, 0)} questions
              {section.durationMinutes != null && String(section.durationMinutes) !== ""
                ? ` • ${safeNum(section.durationMinutes, 0)} min`
                : " • duration optional"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-grab rounded-lg text-muted-foreground active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
              title="Drag to reorder"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-lg"
              onClick={() => onDuplicate(section.id)}
              title="Duplicate section"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-lg"
              onClick={() => onToggleCollapse(section.id)}
              title={collapsed ? "Expand section" : "Collapse section"}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              className="rounded-xl text-destructive"
              onClick={() => onRemove(section.id)}
              disabled={totalSections <= 1}
              title={totalSections <= 1 ? "At least 1 section required" : "Remove section"}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_13rem] md:items-end">
            <div className="space-y-2">
              <Label>Section Name</Label>
              <Input
                value={section.name}
                onChange={(e) => onUpdate(section.id, { name: e.target.value })}
                className="rounded-xl"
                placeholder={`Section ${index + 1}`}
              />
            </div>

            <div className="space-y-2">
              <Label>Questions</Label>
              <Input
                type="number"
                value={String(section.questionsCount)}
                onChange={(e) =>
                  onUpdate(section.id, { questionsCount: safeNum(e.target.value, 0) })
                }
                className="rounded-xl"
                min={0}
              />
            </div>

            <div className="space-y-2">
              <Label>Duration (optional)</Label>
              <Input
                type="number"
                value={section.durationMinutes == null ? "" : String(section.durationMinutes)}
                onChange={(e) => {
                  const value = e.target.value;
                  onUpdate(section.id, {
                    durationMinutes: value === "" ? undefined : safeNum(value, 0),
                  });
                }}
                className="rounded-xl"
                placeholder="e.g. 20"
                min={0}
              />
            </div>
          </div>
        )}

        {!collapsed && (
          <div className="flex flex-col gap-2 rounded-xl border bg-muted/10 p-3 text-xs">
            <div className="flex items-center gap-2">
              <Switch
                checked={!!section.attemptConstraints}
                onCheckedChange={(checked) => {
                  onUpdate(section.id, {
                    attemptConstraints: checked
                      ? { min: 0, max: safeNum(section.questionsCount, 0) }
                      : null,
                    selectionRule: checked ? section.selectionRule || "UPTO" : null,
                  } as any);
                }}
              />
              <Label className="text-xs font-medium">Attempt Constraints</Label>
            </div>
            {section.attemptConstraints && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px]">Min</Label>
                  <Input
                    type="number"
                    className="h-7 w-16 rounded-lg text-xs"
                    value={section.attemptConstraints.min}
                    onChange={(e) =>
                      onUpdate(section.id, {
                        attemptConstraints: {
                          ...section.attemptConstraints!,
                          min: Math.max(0, safeNum(e.target.value, 0)),
                        },
                      } as any)
                    }
                    min={0}
                    max={section.attemptConstraints.max}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px]">Max</Label>
                  <Input
                    type="number"
                    className="h-7 w-16 rounded-lg text-xs"
                    value={section.attemptConstraints.max}
                    onChange={(e) =>
                      onUpdate(section.id, {
                        attemptConstraints: {
                          ...section.attemptConstraints!,
                          max: Math.min(
                            safeNum(section.questionsCount, 0),
                            Math.max(section.attemptConstraints!.min, safeNum(e.target.value, 0))
                          ),
                        },
                      } as any)
                    }
                    min={section.attemptConstraints.min}
                    max={safeNum(section.questionsCount, 0)}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px]">Rule</Label>
                  <Select
                    value={section.selectionRule || "UPTO"}
                    onValueChange={(v) => onUpdate(section.id, { selectionRule: v } as any)}
                  >
                    <SelectTrigger className="h-7 w-24 rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPTO">Up to</SelectItem>
                      <SelectItem value="EXACT">Exactly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="w-full text-[10px] text-muted-foreground">
                  Students must attempt {section.selectionRule === "EXACT" ? "exactly" : "up to"}{" "}
                  {section.attemptConstraints.max} of {safeNum(section.questionsCount, 0)} questions
                  {section.attemptConstraints.min > 0
                    ? ` (minimum ${section.attemptConstraints.min})`
                    : ""}
                </p>
              </div>
            )}
          </div>
        )}

        {!collapsed && (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label>Section Difficulty</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[sectionDifficulty]}
                  onValueChange={(v) =>
                    onUpdate(section.id, { difficultyLevel: clampDifficulty(v[0]) })
                  }
                  min={0}
                  max={1}
                  step={0.05}
                  className="flex-1"
                />
                <span
                  className={`min-w-[70px] text-right text-xs font-semibold ${getDifficultyColor(sectionDifficulty)}`}
                >
                  {sectionDifficulty.toFixed(2)} — {getDifficultyLabel(sectionDifficulty)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Section Topics</Label>
              <TopicMultiSelect
                selectedTopics={section.topics || []}
                setSelectedTopics={(topics) => onUpdate(section.id, { topics })}
                placeholder="Search and select section topics..."
              />
            </div>
          </div>
        )}

        {!collapsed && (
          <>
            {/* Questions in this section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Questions ({questions.length})</h4>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => onCreateQuestion(section.id)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Question
                </Button>
              </div>

              {questions.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
                  <p className="text-sm">No questions in this section yet.</p>
                  <Button
                    className="gradient-bg mt-2 rounded-xl text-white"
                    size="sm"
                    onClick={() => onCreateQuestion(section.id)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add first question
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {questions.map((q, qIndex) => {
                    const isEditing = editingQuestionId === q.id;
                    const isHtml =
                      q.contentFormat === "html" || /<\w+[\s\S]*>/i.test(q.question || "");

                    return (
                      <div
                        key={q.id}
                        className={`rounded-xl border p-3 ${
                          isEditing ? "border-primary bg-primary/5" : "border-border bg-background"
                        }`}
                      >
                        {isEditing ? (
                          <QuestionInlineEditor
                            question={q}
                            saving={savingQuestion}
                            onSave={onSaveQuestion}
                            onCancel={onCancelEdit}
                            formQuestion={formQuestion}
                            setFormQuestion={setFormQuestion}
                            formOptions={formOptions}
                            setFormOptions={setFormOptions}
                            formCorrect={formCorrect}
                            setFormCorrect={setFormCorrect}
                            formExplanation={formExplanation}
                            setFormExplanation={setFormExplanation}
                            formDifficulty={formDifficulty}
                            setFormDifficulty={setFormDifficulty}
                            formSubject={formSubject}
                            setFormSubject={setFormSubject}
                            formTopic={formTopic}
                            setFormTopic={setFormTopic}
                            formMarks={formMarks}
                            setFormMarks={setFormMarks}
                            formNegMarks={formNegMarks}
                            setFormNegMarks={setFormNegMarks}
                            formActive={formActive}
                            setFormActive={setFormActive}
                          />
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  Q{qIndex + 1}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={`rounded-full text-xs ${difficultyBadge(q.difficulty)}`}
                                >
                                  {q.difficulty}
                                </Badge>
                                {q.subject && (
                                  <Badge variant="secondary" className="rounded-full text-xs">
                                    {q.subject}
                                  </Badge>
                                )}
                                {q.isActive !== false ? (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full bg-green-100 text-xs text-green-700"
                                  >
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    published
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full bg-gray-100 text-xs text-gray-700"
                                  >
                                    draft
                                  </Badge>
                                )}
                              </div>

                              {isHtml ? (
                                <div
                                  className="prose prose-sm line-clamp-2 max-w-none text-sm"
                                  dangerouslySetInnerHTML={{ __html: q.question }}
                                />
                              ) : (
                                <p className="line-clamp-2 text-sm">{q.question}</p>
                              )}

                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  Options: {q.options?.length || 0}
                                </span>
                                {q.correctOption >= 0 && q.options?.[q.correctOption] && (
                                  <span className="text-xs text-green-600">
                                    ✓ {stripHtml(q.options[q.correctOption]).substring(0, 20)}...
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onEditQuestion(q)}
                                title="Edit question"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onToggleQuestionActive(q)}
                                title={q.isActive !== false ? "Mark as draft" : "Publish question"}
                              >
                                {q.isActive !== false ? (
                                  <XCircle className="h-3.5 w-3.5" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => onDeleteQuestion(q)}
                                title="Delete question"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {(validation?.errors?.length || validation?.warnings?.length) && (
          <div className="space-y-1">
            {validation?.errors?.map((error) => (
              <p key={`${section.id}-error-${error}`} className="text-xs text-destructive">
                {error}
              </p>
            ))}
            {validation?.warnings?.map((warning) => (
              <p key={`${section.id}-warning-${warning}`} className="text-xs text-amber-600">
                {warning}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TestForm() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string; testId?: string }>();
  const testId = params.testId || params.id;

  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === "ADMIN";

  const isEdit = !!testId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<string>("General Test");
  const [description, setDescription] = useState("");

  const [durationMinutes, setDurationMinutes] = useState<string>("60");
  const [attemptsAllowed, setAttemptsAllowed] = useState<string>("3");

  // IMPORTANT: your new rule is “no test without code/pay”
  // keep this true by default.
  const [requiresUnlock, setRequiresUnlock] = useState(true);

  const [price, setPrice] = useState<string>("0"); // payment upcoming
  const [isPublished, setIsPublished] = useState(false);

  const [markingScheme, setMarkingScheme] = useState<MarkingScheme>({
    correct: 5,
    incorrect: -1,
    unanswered: 0,
  });

  // syllabus tags
  const [syllabusTags, setSyllabusTags] = useState<string[]>([]);

  // sections editor
  const [sections, setSections] = useState<Section[]>([
    {
      id: uid("sec"),
      name: "Section 1",
      questionsCount: 0,
      durationMinutes: undefined,
      attemptConstraints: null,
      selectionRule: null,
      difficultyLevel: 0.5,
      topics: [],
    },
  ]);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<string[]>([]);
  const [sectionValidationMap, setSectionValidationMap] = useState<
    Record<string, SectionValidation>
  >({});

  // questions editor
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // question form state
  const [formQuestion, setFormQuestion] = useState("");
  const [formOptions, setFormOptions] = useState<string[]>(["", "", "", ""]);
  const [formCorrect, setFormCorrect] = useState<number>(0);
  const [formExplanation, setFormExplanation] = useState("");
  const [formDifficulty, setFormDifficulty] = useState<Difficulty>("Medium");
  const [formSectionId, setFormSectionId] = useState<string>("");
  const [formSubject, setFormSubject] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formMarks, setFormMarks] = useState<string>("");
  const [formNegMarks, setFormNegMarks] = useState<string>("");
  const [formActive, setFormActive] = useState(true);
  const [sectionWarnings, setSectionWarnings] = useState<string[]>([]);

  const computedQuestionsCount = useMemo(() => {
    return sections.reduce((acc, s) => acc + safeNum(s.questionsCount, 0), 0);
  }, [sections]);

  const computedDifficultyLevel = useMemo(() => getAverageDifficulty(sections, 0.5), [sections]);

  const computedSectionDuration = useMemo(() => {
    return sections.reduce((acc, section) => {
      if (section.durationMinutes == null || String(section.durationMinutes) === "") {
        return acc;
      }
      return acc + Math.max(0, safeNum(section.durationMinutes, 0));
    }, 0);
  }, [sections]);

  const testDurationValue = Math.max(0, safeNum(durationMinutes, 0));
  const sectionDurationMismatch =
    testDurationValue > 0 && computedSectionDuration > testDurationValue;
  const sectionSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load (edit)
  useEffect(() => {
    if (authLoading) return;

    // guard
    if (!firebaseUser?.uid || !isAdmin) {
      setLoading(false);
      return;
    }

    if (!isEdit) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);

        const ref = doc(db, "test_series", testId!);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          toast.error("Test not found");
          navigate("/admin/tests");
          return;
        }

        const d = snap.data() as any;

        setTitle(String(d?.title || ""));
        setSubject(String(d?.subject || "General Test"));
        const baseDifficulty = normalizeLegacyDifficulty(
          d?.difficultyLevel ?? d?.level ?? d?.difficulty
        );
        setDescription(String(d?.description || ""));

        setDurationMinutes(String(safeNum(d?.durationMinutes ?? d?.duration, 60)));
        setAttemptsAllowed(String(Math.max(1, safeNum(d?.attemptsAllowed ?? d?.maxAttempts, 3))));

        setRequiresUnlock(d?.requiresUnlock !== false); // default true
        setPrice(String(Math.max(0, safeNum(d?.price, 0))));
        setIsPublished(!!d?.isPublished);

        if (d?.markingScheme) {
          setMarkingScheme({
            correct: safeNum(d.markingScheme.correct, 5),
            incorrect: safeNum(d.markingScheme.incorrect, -1),
            unanswered: safeNum(d.markingScheme.unanswered, 0),
          });
        } else {
          setMarkingScheme({
            correct: safeNum(d?.positiveMarks, 5),
            incorrect: safeNum(d?.negativeMarks, -1),
            unanswered: 0,
          });
        }

        const syl = Array.isArray(d?.syllabus) ? d.syllabus.map(String) : [];
        setSyllabusTags(syl);

        const rawSections = Array.isArray(d?.sections) ? d.sections : [];
        const parsed: Section[] =
          rawSections.length > 0
            ? rawSections.map((s: any, idx: number) => ({
                id: String(s?.id || `sec_${idx + 1}`),
                name: String(s?.name || `Section ${idx + 1}`),
                questionsCount: safeNum(s?.questionsCount, 0),
                attemptConstraints: s?.attemptConstraints || null,
                selectionRule: s?.selectionRule || null,
                durationMinutes:
                  s?.durationMinutes != null
                    ? safeNum(s.durationMinutes, undefined as any)
                    : s?.duration != null
                      ? safeNum(s.duration, undefined as any)
                      : undefined,
                difficultyLevel: clampDifficulty(
                  s?.difficultyLevel ??
                    normalizeLegacyDifficulty(s?.difficulty ?? s?.level ?? baseDifficulty)
                ),
                topics: Array.isArray(s?.topics) ? s.topics.map(String) : [],
              }))
            : [
                {
                  id: uid("sec"),
                  name: "Section 1",
                  questionsCount: 0,
                  attemptConstraints: null,
                  selectionRule: null,
                  difficultyLevel: baseDifficulty,
                  topics: [],
                },
              ];

        setSections(parsed);
        setCollapsedSectionIds([]);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load test");
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, firebaseUser?.uid, isAdmin, isEdit, testId, navigate]);

  // Load questions
  useEffect(() => {
    if (!testId || !firebaseUser?.uid || !isAdmin) {
      setQuestions([]);
      setQuestionsLoading(false);
      return;
    }

    setQuestionsLoading(true);

    const qQs = query(
      collection(db, "test_series", testId, "questions"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qQs,
      (snap) => {
        const rows: QuestionDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            question: String(data?.question || ""),
            options: Array.isArray(data?.options) ? data.options.map(String) : [],
            correctOption: safeNum(data?.correctOption, 0),
            explanation: String(data?.explanation || ""),
            difficulty: normalizeDifficulty(data?.difficulty),
            subject: String(data?.subject || ""),
            topic: String(data?.topic || ""),
            marks: data?.marks != null ? safeNum(data?.marks, 0) : undefined,
            negativeMarks:
              data?.negativeMarks != null ? safeNum(data?.negativeMarks, 0) : undefined,
            isActive: data?.isActive !== false,
            usageCount: safeNum(data?.usageCount, 0),
            source: String(data?.source || "manual"),
            bankQuestionId: String(data?.bankQuestionId || ""),
            contentFormat: String(data?.contentFormat || "html"),
            sectionId: String(data?.sectionId || ""),
            createdAtTs: data?.createdAt,
            updatedAtTs: data?.updatedAt,
          };
        });

        setQuestions(rows);
        setQuestionsLoading(false);
      },
      () => {
        setQuestions([]);
        setQuestionsLoading(false);
        toast.error("Failed to load questions");
      }
    );

    return () => unsub();
  }, [testId, firebaseUser?.uid, isAdmin]);

  useEffect(() => {
    const validation = validateSections(sections, durationMinutes);
    setSectionValidationMap(validation.sectionMap);
    setSectionWarnings(validation.warnings);
  }, [sections, durationMinutes]);

  function addSection() {
    setSections((prev) => [
      ...prev,
      {
        id: uid("sec"),
        name: `Section ${prev.length + 1}`,
        questionsCount: 0,
        attemptConstraints: null,
        selectionRule: null,
        difficultyLevel: computedDifficultyLevel,
        topics: [],
      },
    ]);
  }

  function duplicateSection(sectionId: string) {
    setSections((prev) => {
      const index = prev.findIndex((section) => section.id === sectionId);
      if (index < 0) return prev;

      const source = prev[index];
      const cloned: Section = {
        ...source,
        id: uid("sec"),
        name: source.name?.trim() ? `${source.name.trim()} Copy` : `Section ${prev.length + 1}`,
      };

      const next = [...prev];
      next.splice(index + 1, 0, cloned);
      return next;
    });
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSections((prev) => {
      const oldIndex = prev.findIndex((section) => section.id === String(active.id));
      const newIndex = prev.findIndex((section) => section.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function toggleSectionCollapse(sectionId: string) {
    setCollapsedSectionIds((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  }

  function removeSection(sectionId: string) {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    setCollapsedSectionIds((prev) => prev.filter((id) => id !== sectionId));
  }

  function updateSection(sectionId: string, patch: Partial<Section>) {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
  }

  // Question management functions
  function resetQuestionForm() {
    setEditingQuestionId(null);
    setFormQuestion("");
    setFormOptions(["", "", "", ""]);
    setFormCorrect(0);
    setFormExplanation("");
    setFormDifficulty("Medium");
    setFormSectionId(sections[0]?.id || "");
    setFormSubject(subject);
    setFormTopic("");
    setFormMarks("");
    setFormNegMarks("");
    setFormActive(true);
  }

  function openCreateQuestion(sectionId: string) {
    resetQuestionForm();
    setFormSectionId(sectionId);
    setEditingQuestionId("new");
    // Ensure section is expanded
    setCollapsedSectionIds((prev) => prev.filter((id) => id !== sectionId));
  }

  function openEditQuestion(q: QuestionDoc) {
    setEditingQuestionId(q.id);
    setFormQuestion(q.question || "");
    setFormOptions(() => {
      const base = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      while (base.length < 4) base.push("");
      return base;
    });
    setFormCorrect(Number.isFinite(q.correctOption) ? q.correctOption : 0);
    setFormExplanation(q.explanation || "");
    setFormDifficulty(q.difficulty || "Medium");
    setFormSectionId(q.sectionId || sections[0]?.id || "");
    setFormSubject(q.subject || subject);
    setFormTopic(q.topic || "");
    setFormMarks(q.marks != null ? String(q.marks) : "");
    setFormNegMarks(q.negativeMarks != null ? String(q.negativeMarks) : "");
    setFormActive(q.isActive !== false);
    // Ensure section is expanded
    setCollapsedSectionIds((prev) => prev.filter((id) => id !== q.sectionId));
  }

  async function saveQuestion() {
    if (!firebaseUser?.uid || !testId) return;

    const questionText = formQuestion.trim();
    const options = formOptions.map((x) => x.trim()).filter((x) => x.length > 0);

    if (!questionText) {
      toast.error("Question required");
      return;
    }
    if (options.length < 2) {
      toast.error("At least 2 options required");
      return;
    }
    if (formCorrect < 0 || formCorrect >= options.length) {
      toast.error("Invalid correct option");
      return;
    }
    if (!options[formCorrect]?.trim()) {
      toast.error("Correct option cannot be empty");
      return;
    }

    const marks = formMarks.trim() === "" ? undefined : safeNum(formMarks, undefined as any);
    const negativeMarks =
      formNegMarks.trim() === "" ? undefined : safeNum(formNegMarks, undefined as any);

    setSavingQuestion(true);
    try {
      const basePayload: any = {
        question: questionText,
        options: options,
        correctOption: formCorrect,
        explanation: formExplanation.trim() || "",
        difficulty: formDifficulty,
        sectionId: formSectionId,
        subject: formSubject.trim() || subject,
        topic: formTopic.trim() || "",
        isActive: !!formActive,
        usageCount: 0,
        source: "manual",
        contentFormat: "html",
        updatedAt: serverTimestamp(),
      };

      if (marks != null && Number.isFinite(marks)) basePayload.marks = marks;
      if (negativeMarks != null && Number.isFinite(negativeMarks))
        basePayload.negativeMarks = negativeMarks;

      if (!editingQuestionId || editingQuestionId === "new") {
        basePayload.createdAt = serverTimestamp();
        await addDoc(collection(db, "test_series", testId, "questions"), basePayload);
        toast.success("Question added");
      } else {
        await updateDoc(
          doc(db, "test_series", testId, "questions", editingQuestionId),
          basePayload
        );
        toast.success("Question updated");
      }

      resetQuestionForm();
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    } finally {
      setSavingQuestion(false);
    }
  }

  async function deleteQuestion(q: QuestionDoc) {
    if (!firebaseUser?.uid || !testId) return;

    if (!window.confirm("Delete this question?")) return;

    try {
      await deleteDoc(doc(db, "test_series", testId, "questions", q.id));
      toast.success("Question deleted");
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  }

  async function toggleQuestionActive(q: QuestionDoc) {
    if (!firebaseUser?.uid || !testId) return;

    try {
      await updateDoc(doc(db, "test_series", testId, "questions", q.id), {
        isActive: !q.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      toast.error("Update failed");
    }
  }

  async function save() {
    if (!firebaseUser?.uid || !isAdmin) return;

    const t = title.trim();
    if (!t) return toast.error("Please enter a title");

    const dur = safeNum(durationMinutes, 60);
    if (dur <= 0) return toast.error("Duration must be a positive number");

    const attempts = Math.max(1, safeNum(attemptsAllowed, 3));
    const p = Math.max(0, safeNum(price, 0)); // payment upcoming

    const sectionsValidation = validateSections(sections, durationMinutes);
    setSectionValidationMap(sectionsValidation.sectionMap);
    setSectionWarnings(sectionsValidation.warnings);

    if (sectionsValidation.blockingErrors.length > 0) {
      return toast.error(sectionsValidation.blockingErrors[0]);
    }

    const cleanedSections = sections
      .map((s, idx) => {
        const totalQ = Math.max(0, safeNum(s.questionsCount, 0));
        const ac = s.attemptConstraints;
        let validatedConstraints = ac;
        if (ac) {
          const min = Math.max(0, Math.min(ac.min, totalQ));
          const max = Math.max(min, Math.min(ac.max, totalQ));
          validatedConstraints = { min, max };
        }
        return {
          id: String(s.id || `sec_${idx + 1}`),
          name: String(s.name ?? "").trim(),
          questionsCount: totalQ,
          attemptConstraints: validatedConstraints || null,
          selectionRule: s.selectionRule || null,
          durationMinutes:
            s.durationMinutes != null && String(s.durationMinutes) !== ""
              ? Math.max(0, safeNum(s.durationMinutes, 0))
              : null,
          difficultyLevel: clampDifficulty(s.difficultyLevel),
          topics: Array.isArray(s.topics) ? s.topics : [],
        };
      })
      .filter((s) => s.name);

    if (cleanedSections.length === 0) {
      return toast.error("Please add at least one section");
    }

    const averagedDifficultyLevel = getAverageDifficulty(cleanedSections, 0.5);

    const payload: Record<string, any> = {
      title: t,
      subject: subject || "General Test",
      level: getDifficultyLabel(averagedDifficultyLevel),
      difficultyLevel: averagedDifficultyLevel,
      description: description.trim() || "",
      durationMinutes: dur,
      attemptsAllowed: attempts,

      // 🔒 new business rule
      requiresUnlock,

      // payment (upcoming) – keep field ready
      price: p,

      markingScheme: {
        correct: safeNum(markingScheme.correct, 5),
        incorrect: safeNum(markingScheme.incorrect, -1),
        unanswered: safeNum(markingScheme.unanswered, 0),
      },

      syllabus: syllabusTags,

      sections: cleanedSections.map((s: any) => ({
        id: s.id,
        name: s.name,
        questionsCount: s.questionsCount,
        attemptConstraints: s.attemptConstraints || null,
        selectionRule: s.selectionRule || null,
        difficultyLevel: s.difficultyLevel,
        topics: s.topics,
        // store as durationMinutes, keep backward compat too
        durationMinutes: s.durationMinutes,
      })),

      // this is only “declared” count (Questions page can update real count later)
      questionsCount: cleanedSections.reduce(
        (acc: number, s: any) => acc + (s.questionsCount || 0),
        0
      ),

      isPublished,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (!isEdit) {
        const ref = await addDoc(collection(db, "test_series"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: firebaseUser.uid,
          source: "admin",
        });

        toast.success("Test created");

        // Navigate to edit mode to manage questions inline
        navigate(`/admin/tests/edit/${ref.id}`);
      } else {
        await updateDoc(doc(db, "test_series", testId!), payload);
        toast.success("Test updated");

        // Questions are now managed inline, no need to navigate
      }
    } catch (e) {
      console.error(e);
      toast.error("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Guards
  if (!authLoading && (!firebaseUser?.uid || !isAdmin)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Admin • Test Editor</h1>
          <p className="text-sm text-muted-foreground">You must be logged in as an admin.</p>
        </div>
        <EmptyState
          title="Admin access required"
          description="Please login with an ADMIN account to manage tests."
          actionLabel="Go to Login"
          onAction={() => (window.location.href = "/login?role=admin")}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading test…
        </div>
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          Please wait…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <Button variant="ghost" asChild className="px-0">
            <Link to="/admin/tests">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Test Bank
            </Link>
          </Button>
          <h1 className="font-display text-2xl font-bold">
            {isEdit ? "Edit Test" : "Create Test"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Saved in{" "}
            <Badge variant="secondary" className="rounded-full">
              test_series
            </Badge>
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => save()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>

          <Button className="gradient-bg rounded-xl" onClick={() => save(false)} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Basic Info */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle className="text-base">Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Test Difficulty (avg of sections)</Label>
              <span
                className={`min-w-[70px] text-right text-sm font-semibold ${getDifficultyColor(computedDifficultyLevel)}`}
              >
                {computedDifficultyLevel.toFixed(2)} — {getDifficultyLabel(computedDifficultyLevel)}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="rounded-xl"
                min={1}
              />
            </div>

            <div className="space-y-2">
              <Label>Attempts Allowed</Label>
              <Select value={attemptsAllowed} onValueChange={setAttemptsAllowed}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Price (Payment upcoming)</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="rounded-xl"
                min={0}
              />
              <p className="text-xs text-muted-foreground">
                Students will see “Pay Online (Upcoming)”. Access codes will work now.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[110px] rounded-2xl"
              placeholder="Write a short description for students..."
            />
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-1 items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Requires Unlock</p>
                <p className="text-xs text-muted-foreground">
                  🔒 If ON: student must redeem access code (or pay later).
                </p>
              </div>
              <Switch checked={requiresUnlock} onCheckedChange={setRequiresUnlock} />
            </div>

            <div className="flex flex-1 items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Published</p>
                <p className="text-xs text-muted-foreground">
                  If OFF: hidden from students (recommended while editing).
                </p>
              </div>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Marking Scheme */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle className="text-base">Marking Scheme</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Correct</Label>
            <Input
              type="number"
              value={String(markingScheme.correct)}
              onChange={(e) =>
                setMarkingScheme((p) => ({ ...p, correct: safeNum(e.target.value, 5) }))
              }
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Incorrect</Label>
            <Input
              type="number"
              value={String(markingScheme.incorrect)}
              onChange={(e) =>
                setMarkingScheme((p) => ({ ...p, incorrect: safeNum(e.target.value, -1) }))
              }
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Unanswered</Label>
            <Input
              type="number"
              value={String(markingScheme.unanswered)}
              onChange={(e) =>
                setMarkingScheme((p) => ({ ...p, unanswered: safeNum(e.target.value, 0) }))
              }
              className="rounded-xl"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      <Card className="card-soft border-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Sections</CardTitle>
          <Button variant="outline" className="rounded-xl" onClick={addSection}>
            <Plus className="mr-2 h-4 w-4" />
            Add Section
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Section count</p>
              <p className="text-base font-semibold">{sections.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Declared questions</p>
              <p className="text-base font-semibold">{computedQuestionsCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Section duration sum</p>
              <p className="text-base font-semibold">{computedSectionDuration} min</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Test duration</p>
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold">{testDurationValue} min</p>
                {sectionDurationMismatch && (
                  <Badge variant="destructive" className="rounded-full">
                    Mismatch
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {sectionWarnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-600">
              {warning}
            </p>
          ))}

          <p className="text-xs text-muted-foreground">
            Drag sections using the handle to reorder.
          </p>

          <DndContext
            sensors={sectionSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
          >
            <SortableContext
              items={sections.map((section) => section.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {sections.map((section, index) => {
                  const sectionQuestions = questions.filter((q) => q.sectionId === section.id);
                  return (
                    <SortableSectionCard
                      key={section.id}
                      section={section}
                      index={index}
                      totalSections={sections.length}
                      collapsed={collapsedSectionIds.includes(section.id)}
                      validation={sectionValidationMap[section.id]}
                      questions={sectionQuestions}
                      editingQuestionId={editingQuestionId}
                      savingQuestion={savingQuestion}
                      onDuplicate={duplicateSection}
                      onToggleCollapse={toggleSectionCollapse}
                      onRemove={removeSection}
                      onUpdate={updateSection}
                      onCreateQuestion={openCreateQuestion}
                      onEditQuestion={openEditQuestion}
                      onDeleteQuestion={deleteQuestion}
                      onToggleQuestionActive={toggleQuestionActive}
                      onSaveQuestion={saveQuestion}
                      onCancelEdit={resetQuestionForm}
                      formQuestion={formQuestion}
                      setFormQuestion={setFormQuestion}
                      formOptions={formOptions}
                      setFormOptions={setFormOptions}
                      formCorrect={formCorrect}
                      setFormCorrect={setFormCorrect}
                      formExplanation={formExplanation}
                      setFormExplanation={setFormExplanation}
                      formDifficulty={formDifficulty}
                      setFormDifficulty={setFormDifficulty}
                      formSubject={formSubject}
                      setFormSubject={setFormSubject}
                      formTopic={formTopic}
                      setFormTopic={setFormTopic}
                      formMarks={formMarks}
                      setFormMarks={setFormMarks}
                      formNegMarks={formNegMarks}
                      setFormNegMarks={setFormNegMarks}
                      formActive={formActive}
                      setFormActive={setFormActive}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          <p className="text-xs text-muted-foreground">
            Note: the <b>Questions</b> page can maintain the real count later by syncing with
            question docs.
          </p>
        </CardContent>
      </Card>

      {/* Syllabus */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle className="text-base">Syllabus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Topics</Label>
          <TagInput
            tags={syllabusTags}
            setTags={setSyllabusTags}
            placeholder="Type a topic and press Enter..."
          />
        </CardContent>
      </Card>

      {/* Bottom actions */}
      <div className="flex flex-col justify-end gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => navigate("/admin/tests")}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={() => save()} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
        <Button className="gradient-bg rounded-xl" onClick={() => save(false)} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
