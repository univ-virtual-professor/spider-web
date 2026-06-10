import { useMemo, useState } from "react";
import { Card } from "@shared/ui/card";
import { Edit, Trash2, X, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Slider } from "@shared/ui/slider";
import { Switch } from "@shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { TopicMultiSelect } from "@shared/ui/topic-multi-select";
import { MultiSelect } from "@shared/ui/MultiSelect";
import type { RawQBQ } from "@shared/hooks/useQBOptions";

type MarkingScheme = {
  correct: number;
  incorrect: number;
  unanswered: number;
} | null;

const QUESTION_FORMATS = [
  { value: "MCQ_SINGLE", label: "MCQ (Single Correct)" },
  { value: "MCQ_MULTI", label: "MCQ (Multiple Correct)" },
  { value: "MCQ_CASE_STUDY", label: "MCQ (Case Study)" },
  { value: "FILL_UP", label: "Fill-ups / One-word" },
  { value: "SUBJECTIVE_LONG", label: "Subjective (Long)" },
];

type SectionCardProps = {
  sectionId: string;
  sectionName: string;
  questionCount: number;
  attemptLimit?: number;
  durationMinutes?: number;
  sectionDifficulty?: number;
  sectionChapter?: string[];
  sectionTopics?: string[];
  sectionSubject?: string;
  sectionTags?: string[];
  sectionFormat?: string;
  availableChapters?: string[];
  availableTopics?: string[];
  availableTagOptions?: string[];
  rawQuestions?: RawQBQ[];
  showSubjectPicker?: boolean;
  courseSubjects?: { id: string; name: string }[];
  defaultMarkingScheme?: {
    correct: number;
    incorrect: number;
    unanswered: number;
  };
  markingScheme?: MarkingScheme;
  onEdit?: (payload: {
    name: string;
    questionsCount: number;
    attemptLimit?: number | null;
    durationMinutes?: number | null;
    difficultyLevel: number;
    chapters: string[];
    topics: string[];
    markingScheme: MarkingScheme;
    subject: string;
    tags: string[];
    format: string;
  }) => void;
  onRemove: () => void;
};

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

function clampDifficulty(level?: number) {
  if (!Number.isFinite(Number(level))) return 0.5;
  return Math.min(1, Math.max(0, Number(level)));
}

const SectionCard = ({
  sectionId,
  sectionName,
  questionCount,
  attemptLimit,
  durationMinutes,
  sectionDifficulty,
  sectionChapter,
  sectionTopics,
  sectionSubject,
  sectionTags,
  sectionFormat,
  availableChapters,
  availableTopics,
  availableTagOptions,
  rawQuestions,
  showSubjectPicker,
  courseSubjects,
  defaultMarkingScheme,
  markingScheme,
  onEdit,
  onRemove,
}: SectionCardProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [draftName, setDraftName] = useState(sectionName);
  const [draftQuestionsCount, setDraftQuestionsCount] = useState(String(questionCount));
  const [draftAttemptLimit, setDraftAttemptLimit] = useState(
    attemptLimit == null ? "" : String(attemptLimit)
  );
  const [draftDurationMinutes, setDraftDurationMinutes] = useState(
    durationMinutes == null ? "" : String(durationMinutes)
  );
  const [draftDifficultyLevel, setDraftDifficultyLevel] = useState(
    clampDifficulty(sectionDifficulty)
  );
  const [draftChapters, setDraftChapters] = useState<string[]>(sectionChapter || []);
  const [draftTopics, setDraftTopics] = useState<string[]>(sectionTopics || []);
  const [draftSubject, setDraftSubject] = useState(sectionSubject || "");
  const [draftTags, setDraftTags] = useState<string[]>(sectionTags || []);

  const filteredTopics = useMemo(() => {
    if (!rawQuestions?.length || !draftChapters.length) return availableTopics || [];
    const chapterSet = new Set(draftChapters.map((c) => c.toLowerCase()));
    const topicSet = new Set<string>();
    rawQuestions.forEach((q) => {
      if (q.chapter && chapterSet.has(q.chapter.toLowerCase())) {
        q.topics.forEach((t) => topicSet.add(t));
      }
    });
    return Array.from(topicSet).sort();
  }, [rawQuestions, draftChapters, availableTopics]);

  const filteredTags = useMemo(() => {
    if (!rawQuestions?.length || (!draftChapters.length && !draftTopics.length))
      return availableTagOptions || [];
    const chapterSet = new Set(draftChapters.map((c) => c.toLowerCase()));
    const topicSet = new Set(draftTopics);
    const tagSet = new Set<string>();
    rawQuestions.forEach((q) => {
      const chapterMatch =
        !draftChapters.length || (q.chapter && chapterSet.has(q.chapter.toLowerCase()));
      const topicMatch = !draftTopics.length || q.topics.some((t) => topicSet.has(t));
      if (chapterMatch && topicMatch) {
        q.tags.forEach((t) => tagSet.add(t));
      }
    });
    return Array.from(tagSet).sort();
  }, [rawQuestions, draftChapters, draftTopics, availableTagOptions]);
  const [draftFormat, setDraftFormat] = useState(sectionFormat || "");
  const [draftMarkingEnabled, setDraftMarkingEnabled] = useState(!!markingScheme);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const fallbackScheme = defaultMarkingScheme || { correct: 1, incorrect: 0, unanswered: 0 };
  const [draftMarkingScheme, setDraftMarkingScheme] = useState({
    correct: markingScheme?.correct ?? fallbackScheme.correct,
    incorrect: markingScheme?.incorrect ?? fallbackScheme.incorrect,
    unanswered: markingScheme?.unanswered ?? fallbackScheme.unanswered,
  });

  const openEdit = () => {
    setDraftName(sectionName);
    setDraftQuestionsCount(String(questionCount));
    setDraftAttemptLimit(attemptLimit == null ? "" : String(attemptLimit));
    setDraftDurationMinutes(durationMinutes == null ? "" : String(durationMinutes));
    setDraftDifficultyLevel(clampDifficulty(sectionDifficulty));
    setDraftChapters(sectionChapter || []);
    setDraftTopics(sectionTopics || []);
    setDraftSubject(sectionSubject || "");
    setDraftTags(sectionTags || []);
    setDraftFormat(sectionFormat || "");
    setDraftMarkingEnabled(!!markingScheme);
    setAdvancedOpen(
      !!(
        (sectionChapter?.length ?? 0) > 0 ||
        (sectionTopics?.length ?? 0) > 0 ||
        (sectionTags?.length ?? 0) > 0
      )
    );
    setDraftMarkingScheme({
      correct: markingScheme?.correct ?? fallbackScheme.correct,
      incorrect: markingScheme?.incorrect ?? fallbackScheme.incorrect,
      unanswered: markingScheme?.unanswered ?? fallbackScheme.unanswered,
    });
    setEditOpen(true);
  };

  const onRemoveConfirmation = () => {
    if (confirm("Are you sure you want to remove this section? This action cannot be undone.")) {
      // Call the onRemove function passed as a prop to actually remove the section
      onRemove();
    } else {
      // User cancelled the action, do nothing
      return;
    }
  };

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-5">
            <h4 className="font-semibold">{sectionName}</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Questions: {questionCount}</Badge>
              {attemptLimit !== undefined && (
                <Badge variant="outline">Attempt Limit: {attemptLimit}</Badge>
              )}
              {durationMinutes > 0 && (
                <Badge variant="outline">Duration: {durationMinutes} mins</Badge>
              )}
              {sectionDifficulty != null && (
                <Badge variant="outline">
                  Difficulty: {getDifficultyLabel(clampDifficulty(sectionDifficulty))}
                </Badge>
              )}
              {Array.isArray(sectionChapter) && sectionChapter.length > 0 && (
                <Badge variant="outline">Ch: {sectionChapter.join(", ")}</Badge>
              )}
              {sectionSubject && <Badge variant="secondary">{sectionSubject}</Badge>}
              {sectionFormat && (
                <Badge variant="secondary" className="capitalize">
                  {sectionFormat.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={openEdit}
              className="mb-0.5 shrink-0 rounded-xl"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="mb-0.5 shrink-0 rounded-xl text-destructive"
              onClick={onRemoveConfirmation}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {markingScheme && (
          <div className="flex items-center gap-2">
            <h6 className="text-sm font-medium">Marking Scheme:</h6>
            <div className="mt-1 flex gap-4">
              <Badge variant="secondary">Correct: {markingScheme.correct} pts</Badge>
              <Badge variant="secondary">Incorrect: {markingScheme.incorrect} pts</Badge>
              <Badge variant="secondary">Unanswered: {markingScheme.unanswered} pts</Badge>
            </div>
          </div>
        )}
        <div>
          <h6 className="mt-2 text-sm font-medium">
            Section Topics:
            <div className="mt-1 flex flex-wrap gap-2 rounded-lg border p-2">
              {(sectionTopics || []).length === 0 ? (
                <span className="text-xs text-muted-foreground">No topics selected</span>
              ) : (
                (sectionTopics || []).map((topic) => (
                  <Badge key={`${sectionId}-${topic}`} variant="secondary">
                    {topic}
                  </Badge>
                ))
              )}
            </div>
          </h6>
        </div>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
            <DialogDescription>
              Update section details, difficulty, and topic mapping.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Section Name</Label>
                <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Question Count</Label>
                <Input
                  type="number"
                  value={draftQuestionsCount}
                  onChange={(e) => setDraftQuestionsCount(e.target.value)}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>Attempt Limit</Label>
                <Input
                  type="number"
                  value={draftAttemptLimit}
                  onChange={(e) => setDraftAttemptLimit(e.target.value)}
                  min={0}
                  placeholder="All"
                />
              </div>
              <div className="space-y-2">
                <Label>Time Limit (minutes)</Label>
                <Input
                  type="number"
                  value={draftDurationMinutes}
                  onChange={(e) => setDraftDurationMinutes(e.target.value)}
                  min={0}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Difficulty</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[draftDifficultyLevel]}
                  onValueChange={(v) => setDraftDifficultyLevel(clampDifficulty(v[0]))}
                  min={0}
                  max={1}
                  step={0.05}
                  className="flex-1"
                />
                <span
                  className={`min-w-[70px] text-right text-xs font-semibold ${getDifficultyColor(draftDifficultyLevel)}`}
                >
                  {draftDifficultyLevel.toFixed(2)} — {getDifficultyLabel(draftDifficultyLevel)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Question Format</Label>
                <Select
                  value={draftFormat || "__any__"}
                  onValueChange={(v) => setDraftFormat(v === "__any__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any format</SelectItem>
                    {QUESTION_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showSubjectPicker && courseSubjects && courseSubjects.length > 0 && (
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select
                    value={draftSubject || "__any__"}
                    onValueChange={(v) => setDraftSubject(v === "__any__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any subject</SelectItem>
                      {courseSubjects.map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Advanced: QB filter fields */}
            <div className="rounded-xl border border-border">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                <span>Advanced Settings</span>
                {advancedOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {advancedOpen && (
                <div className="space-y-3 border-t px-3 pb-3 pt-3">
                  <p className="text-xs text-muted-foreground">
                    Used by auto-fill and AI fill to narrow the question pool.
                  </p>
                  <div className="space-y-2">
                    <Label>Chapters</Label>
                    <MultiSelect
                      options={availableChapters || []}
                      selected={draftChapters}
                      onChange={setDraftChapters}
                      placeholder="Any chapter"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Topics</Label>
                    <TopicMultiSelect
                      selectedTopics={draftTopics}
                      setSelectedTopics={setDraftTopics}
                      placeholder="Search and select topics..."
                      availableTopics={filteredTopics}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    {filteredTags.length > 0 ? (
                      <MultiSelect
                        options={filteredTags}
                        selected={draftTags}
                        onChange={setDraftTags}
                        placeholder="Select tags..."
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {draftTags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="gap-1">
                            {tag}
                            <button
                              onClick={() => setDraftTags((prev) => prev.filter((t) => t !== tag))}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        <span className="text-xs text-muted-foreground">
                          No tags in question bank yet.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={draftMarkingEnabled}
                  onCheckedChange={(checked) => setDraftMarkingEnabled(checked)}
                />
                <Label className="text-sm">Custom Marking Scheme</Label>
              </div>
              {draftMarkingEnabled && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Correct</Label>
                    <Input
                      type="number"
                      value={draftMarkingScheme.correct}
                      onChange={(e) =>
                        setDraftMarkingScheme((prev) => ({
                          ...prev,
                          correct: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Incorrect</Label>
                    <Input
                      type="number"
                      value={draftMarkingScheme.incorrect}
                      onChange={(e) =>
                        setDraftMarkingScheme((prev) => ({
                          ...prev,
                          incorrect: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unanswered</Label>
                    <Input
                      type="number"
                      value={draftMarkingScheme.unanswered}
                      onChange={(e) =>
                        setDraftMarkingScheme((prev) => ({
                          ...prev,
                          unanswered: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                className="gradient-bg text-white"
                onClick={() => {
                  const normalizedQuestions = Math.max(0, Number(draftQuestionsCount) || 0);
                  const attemptLimitValue =
                    draftAttemptLimit.trim() === ""
                      ? null
                      : Math.max(0, Number(draftAttemptLimit) || 0);
                  const durationValue =
                    draftDurationMinutes.trim() === ""
                      ? null
                      : Math.max(0, Number(draftDurationMinutes) || 0);
                  const nextMarking = draftMarkingEnabled
                    ? {
                        correct: Number(draftMarkingScheme.correct) || 0,
                        incorrect: Number(draftMarkingScheme.incorrect) || 0,
                        unanswered: Number(draftMarkingScheme.unanswered) || 0,
                      }
                    : null;

                  onEdit?.({
                    name: draftName.trim() || sectionName,
                    questionsCount: normalizedQuestions,
                    attemptLimit: attemptLimitValue,
                    durationMinutes: durationValue,
                    difficultyLevel: clampDifficulty(draftDifficultyLevel),
                    chapters: draftChapters,
                    topics: draftTopics,
                    markingScheme: nextMarking,
                    subject: draftSubject,
                    tags: draftTags,
                    format: draftFormat,
                  });
                  setEditOpen(false);
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SectionCard;
