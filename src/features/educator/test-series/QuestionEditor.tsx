import { useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { Plus, Trash2, Loader2, CheckCircle2, ImagePlus } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Switch } from "@shared/ui/switch";
import { Textarea } from "@shared/ui/textarea";

import ImageTextarea from "@features/educator/components/ImageTextarea";
import { HtmlView } from "@shared/lib/safeHtml";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import {
  type QuestionType,
  QUESTION_TYPES,
  QUESTION_TYPE_CONFIG,
  getQuestionTypeConfig,
  getQuestionTypeShortLabel,
} from "@shared/lib/questionTypes";

type QuestionEditorSection = {
  id: string;
  name: string;
};

type PreviewOption = {
  index: number;
  option: string;
};

type QuestionEditorProps = {
  editingId: string | null;
  readOnly: boolean;
  editorOpen: boolean;
  inlineMode?: boolean;
  openNew: () => void;
  requestCloseEditor: () => void;
  formQuestion: string;
  setFormQuestion: (value: string) => void;
  formOptions: string[];
  setFormOptions: Dispatch<SetStateAction<string[]>>;
  formCorrect: number;
  setFormCorrect: (value: number) => void;
  formDifficulty: string;
  setFormDifficulty: (value: string) => void;
  formSectionId: string;
  setFormSectionId: (value: string) => void;
  managedSections: QuestionEditorSection[];
  formMarks: string;
  setFormMarks: (value: string) => void;
  formNegMarks: string;
  setFormNegMarks: (value: string) => void;
  formActive: boolean;
  handleEditorPublishChange: (value: boolean) => void;
  removeOptionField: (index: number) => void;
  addOptionField: () => void;
  handleQuestionPreviewImageClick: (event: MouseEvent<HTMLDivElement>) => void;
  previewOptions: PreviewOption[];
  handleOptionPreviewImageClick: (
    optionIndex: number,
    optionRaw: string,
    event: MouseEvent<HTMLDivElement>
  ) => void;
  saving: boolean;
  saveQuestion: () => void;
  // Subjective question type support
  formQuestionType: QuestionType;
  setFormQuestionType: (value: QuestionType) => void;
  formReferenceAnswer: string;
  setFormReferenceAnswer: (value: string) => void;
  formReferenceKeywords: string;
  setFormReferenceKeywords: (value: string) => void;
  formReferenceAnswerFileUrl: string;
  setFormReferenceAnswerFileUrl: (value: string) => void;
  formEvaluationInstructions: string;
  setFormEvaluationInstructions: (value: string) => void;
};

function hasPreviewContent(raw: string) {
  if (!raw) return false;
  const imageRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
  if (imageRegex.test(raw)) return true;
  return (
    raw
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim().length > 0
  );
}

function getPublishStatusLabel(isActive?: boolean) {
  return isActive !== false ? "Published" : "Draft";
}

function UploadReferenceSection({
  formReferenceAnswer,
  setFormReferenceAnswer,
  formReferenceAnswerFileUrl,
  setFormReferenceAnswerFileUrl,
  formEvaluationInstructions,
  setFormEvaluationInstructions,
}: {
  formReferenceAnswer: string;
  setFormReferenceAnswer: (v: string) => void;
  formReferenceAnswerFileUrl: string;
  setFormReferenceAnswerFileUrl: (v: string) => void;
  formEvaluationInstructions: string;
  setFormEvaluationInstructions: (v: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10MB.");
      return;
    }
    try {
      setUploading(true);
      const { url } = await uploadToImageKit(
        file,
        `ref_answer_${Date.now()}.${file.name.split(".").pop()}`,
        "/test-reference-answers",
        "website"
      );
      setFormReferenceAnswerFileUrl(url);
      toast.success("Reference image uploaded");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Provide a reference answer as text, image, or both. At least one is recommended for accurate
        AI evaluation.
      </p>
      <div className="space-y-2">
        <Label>
          Reference Answer{" "}
          <span className="font-normal text-muted-foreground">(text, optional)</span>
        </Label>
        <Textarea
          value={formReferenceAnswer}
          onChange={(e) => setFormReferenceAnswer(e.target.value)}
          placeholder="Enter the expected answer or solution steps..."
          className="min-h-[100px] rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label>
          Reference Answer Image{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        {formReferenceAnswerFileUrl ? (
          <div className="relative inline-block rounded-xl border border-border p-2">
            <img
              src={formReferenceAnswerFileUrl}
              alt="Reference"
              className="max-h-48 rounded-lg object-contain"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute right-1 top-1 h-6 w-6 rounded-full"
              onClick={() => setFormReferenceAnswerFileUrl("")}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${
              uploading
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {uploading ? "Uploading..." : "Click to upload reference image (JPG, PNG)"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={handleFileUpload}
            />
          </label>
        )}
      </div>
      <div className="space-y-2">
        <Label>
          Evaluation Instructions{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          value={formEvaluationInstructions}
          onChange={(e) => setFormEvaluationInstructions(e.target.value)}
          placeholder="e.g. Check for diagram labels, award partial marks for correct steps..."
          className="min-h-[80px] rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Instructions for AI on how to evaluate uploaded answers.
        </p>
      </div>
    </div>
  );
}

const QuestionEditor = (props: QuestionEditorProps) => {
  const {
    editingId,
    readOnly,
    editorOpen,
    inlineMode = false,
    openNew,
    requestCloseEditor,
    formQuestion,
    setFormQuestion,
    formOptions,
    setFormOptions,
    formCorrect,
    setFormCorrect,
    formDifficulty,
    setFormDifficulty,
    formSectionId,
    setFormSectionId,
    managedSections,
    formMarks,
    setFormMarks,
    formNegMarks,
    setFormNegMarks,
    formActive,
    handleEditorPublishChange,
    removeOptionField,
    addOptionField,
    handleQuestionPreviewImageClick,
    previewOptions,
    handleOptionPreviewImageClick,
    saving,
    saveQuestion,
    formQuestionType,
    setFormQuestionType,
    formReferenceAnswer,
    setFormReferenceAnswer,
    formReferenceKeywords,
    setFormReferenceKeywords,
    formReferenceAnswerFileUrl,
    setFormReferenceAnswerFileUrl,
    formEvaluationInstructions,
    setFormEvaluationInstructions,
  } = props;

  const typeConfig = getQuestionTypeConfig(formQuestionType);

  if (inlineMode && !editorOpen) return null;

  const renderReadOnly = () => (
    <div className="space-y-5">
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

      <div>
        <Badge variant="outline" className={`rounded-full text-xs ${typeConfig.badgeColor}`}>
          {getQuestionTypeShortLabel(formQuestionType)}
        </Badge>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">Question</Label>
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          {hasPreviewContent(formQuestion) ? (
            <HtmlView html={formQuestion} className="break-words text-sm" />
          ) : (
            <p className="text-sm italic text-muted-foreground">(No question content)</p>
          )}
        </div>
      </div>

      {typeConfig.supportsOptions && (
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
                    isCorrect ? "border-green-500/40 bg-green-500/5" : "border-border bg-muted/10"
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
      )}

      <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-4">
        <p className="text-sm font-semibold text-muted-foreground">Question Details</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-background p-3 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Difficulty
            </p>
            <p className="mt-1 text-sm font-semibold capitalize">{formDifficulty || "medium"}</p>
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
  );

  const renderEditor = () => (
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

        {/* MCQ: Options */}
        {typeConfig.supportsOptions && (
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
                      setFormOptions((prev) => prev.map((x, i) => (i === idx ? value : x)));
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
        )}

        {/* Subjective: reference answer (text + optional image) */}
        {(formQuestionType === "SUBJECTIVE_SHORT" || formQuestionType === "SUBJECTIVE_LONG") && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Expected / Reference Answer</Label>
              <Textarea
                value={formReferenceAnswer}
                onChange={(e) => setFormReferenceAnswer(e.target.value)}
                placeholder="Enter the expected answer for AI evaluation..."
                className="min-h-[100px] rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Used by AI to evaluate student responses. Students can answer by typing or uploading
                an image.
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                Keywords <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={formReferenceKeywords}
                onChange={(e) => setFormReferenceKeywords(e.target.value)}
                placeholder="e.g. oxidation, reduction, electron transfer"
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated keywords that should appear in the answer.
              </p>
            </div>
            <UploadReferenceSection
              formReferenceAnswer={formReferenceAnswer}
              setFormReferenceAnswer={setFormReferenceAnswer}
              formReferenceAnswerFileUrl={formReferenceAnswerFileUrl}
              setFormReferenceAnswerFileUrl={setFormReferenceAnswerFileUrl}
              formEvaluationInstructions={formEvaluationInstructions}
              setFormEvaluationInstructions={setFormEvaluationInstructions}
            />
          </div>
        )}

        {/* Question Settings */}
        <div className="space-y-4 rounded-xl border border-border bg-muted/15 p-4">
          <p className="text-sm font-semibold">Question Settings</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {typeConfig.supportsCorrectOption && (
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
            )}
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={formDifficulty} onValueChange={setFormDifficulty}>
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
              <p className="text-sm font-medium">{getPublishStatusLabel(formActive)}</p>
              <p className="text-xs text-muted-foreground">
                {formActive ? "Visible in published list" : "Saved as draft until published"}
              </p>
            </div>
            <Switch checked={formActive} onCheckedChange={handleEditorPublishChange} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {/* Preview — MCQ */}
      {(formQuestionType === "MCQ_SINGLE" || formQuestionType === "MCQ_MULTI") && (
        <div className="mt-5 rounded-xl border border-border bg-muted/20 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Question Preview</p>
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
                <p className="text-xs font-medium text-muted-foreground">Options Preview</p>
                {previewOptions.length ? (
                  previewOptions.map(({ index, option }) => (
                    <div
                      key={index}
                      className="rounded-lg border border-border/60 bg-background p-3"
                      onClick={(event) => handleOptionPreviewImageClick(index, option, event)}
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
      )}

      {/* Preview — Subjective */}
      {(formQuestionType === "SUBJECTIVE_SHORT" || formQuestionType === "SUBJECTIVE_LONG") &&
        hasPreviewContent(formQuestion) && (
          <div className="mt-5 rounded-xl border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Question Preview</p>
            <div className="rounded-lg border border-border/60 bg-background p-3">
              <HtmlView html={formQuestion} className="break-words text-sm" />
            </div>
            <div className="mt-3 rounded-lg border border-dashed border-border/60 bg-background p-3">
              <p className="text-xs italic text-muted-foreground">
                Student can type their answer or upload an image
              </p>
            </div>
          </div>
        )}

      {!readOnly ? (
        <div className="mt-5 flex items-center justify-end">
          <Button className="min-w-[160px] rounded-xl" disabled={saving} onClick={saveQuestion}>
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
  );

  return (
    <div
      className={
        inlineMode
          ? "rounded-2xl border bg-background p-4"
          : "order-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
      }
    >
      <div className={inlineMode ? "" : "p-6 lg:p-8"}>
        <div className={inlineMode ? "space-y-5" : "mx-auto max-w-4xl space-y-5"}>
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">
                {editingId ? (readOnly ? "Question Preview" : "Edit Question") : "Add Question"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {readOnly
                  ? "Preview only. Changes are not allowed."
                  : "Basic text editor for quick question entry."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Question Type Selector */}
              {!readOnly && editorOpen && (
                <Select
                  value={formQuestionType}
                  onValueChange={(v) => setFormQuestionType(v as QuestionType)}
                >
                  <SelectTrigger className="h-9 w-[180px] rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map((qt) => (
                      <SelectItem key={qt} value={qt}>
                        <span className="text-xs">{QUESTION_TYPE_CONFIG[qt].label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {readOnly && editorOpen && (
                <Badge
                  variant="outline"
                  className={`rounded-full text-xs ${typeConfig.badgeColor}`}
                >
                  {getQuestionTypeShortLabel(formQuestionType)}
                </Badge>
              )}

              {!readOnly && !inlineMode ? (
                <>
                  <Button variant="outline" className="rounded-xl" onClick={openNew}>
                    <Plus className="mr-2 h-4 w-4" /> New
                  </Button>
                  {editorOpen ? (
                    <Button variant="outline" className="rounded-xl" onClick={requestCloseEditor}>
                      Cancel
                    </Button>
                  ) : null}
                </>
              ) : null}

              {!readOnly && inlineMode ? (
                <Button variant="outline" className="rounded-xl" onClick={requestCloseEditor}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>

          {!editorOpen && !inlineMode ? (
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
            renderReadOnly()
          ) : (
            renderEditor()
          )}
        </div>
      </div>
    </div>
  );
};

export default QuestionEditor;
