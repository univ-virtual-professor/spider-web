import { useEffect, useState, type ReactNode } from "react";
import { GripVertical, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import "react-image-crop/dist/ReactCrop.css";

import SortableQuestionListItem from "./SortableQuestionListItem";
import { TestQuestion, TestSection } from "./QuestionManager/QuestionManagerTypes";

type SortableSectionCardProps = {
  section: TestSection;
  index: number;
  questions: TestQuestion[];
  collapsed: boolean;
  readOnly: boolean;
  questionDndEnabled: boolean;
  totalQuestionCount: number;
  questionLimit: number | null;
  editingId: string | null;
  onToggleCollapse: (sectionId: string) => void;
  onRename: (sectionId: string, name: string) => void;
  onDelete: (sectionId: string) => void;
  onAddQuestion: (sectionId: string) => void;
  onImportFromBank: (sectionId: string) => void;
  onAddAfterQuestion: (q: TestQuestion) => void;
  onImportAfterQuestion: (q: TestQuestion) => void;
  onOpenEdit: (q: TestQuestion) => void;
  onDuplicate: (q: TestQuestion) => void;
  onDeleteQuestion: (id: string) => void;
  onToggleActive: (q: TestQuestion, next: boolean) => void;
  onAddSection: (sectionId: string) => void;
  inlineEditor: ReactNode;
  inlineEditorAfterQuestionId: string | null;
  inlineEditorAtEnd: boolean;
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
  editingId,
  onToggleCollapse,
  onRename,
  onDelete,
  onAddQuestion,
  onImportFromBank,
  onAddAfterQuestion,
  onImportAfterQuestion,
  onOpenEdit,
  onDuplicate,
  onDeleteQuestion,
  onToggleActive,
  onAddSection,
  inlineEditor,
  inlineEditorAfterQuestionId,
  inlineEditorAtEnd,
  contextId,
  reportedQuestionIds = new Set(),
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
    <>
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
              <div className="space-y-2">
                <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                  <p>No questions in this section yet.</p>
                  {!readOnly ? (
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <Button
                        type="button"
                        className="mt-3 rounded-xl"
                        onClick={() => onAddQuestion(section.id)}
                        disabled={isAtCapacity}
                      >
                        <Plus className="mr-2 h-4 w-4" /> Add first question
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 rounded-xl"
                        onClick={() => onImportFromBank(section.id)}
                        disabled={isAtCapacity}
                      >
                        <Plus className="mr-2 h-4 w-4" /> Import from question bank
                      </Button>
                    </div>
                  ) : null}
                </div>
                {inlineEditor}
              </div>
            ) : (
              <SortableContext
                items={questions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {questions.map((question, questionIndex) => (
                    <div key={question.id} className="space-y-2">
                      {editingId === question.id ? (
                        inlineEditor
                      ) : (
                        <SortableQuestionListItem
                          q={question}
                          displayOrder={questionIndex + 1}
                          dragDisabled={!questionDndEnabled}
                          readOnly={readOnly}
                          onOpenEdit={onOpenEdit}
                          onAddAfterQuestion={onAddAfterQuestion}
                          onImportAfterQuestion={onImportAfterQuestion}
                          onDuplicate={onDuplicate}
                          onDelete={onDeleteQuestion}
                          onToggleActive={onToggleActive}
                          contextId={contextId}
                          isReported={reportedQuestionIds.has(question.id)}
                        />
                      )}
                      {!(editingId === question.id) && inlineEditorAfterQuestionId === question.id
                        ? inlineEditor
                        : null}
                    </div>
                  ))}
                  {inlineEditorAtEnd ? inlineEditor : null}
                </div>
              </SortableContext>
            )}
          </div>
        ) : null}
      </div>
      {!readOnly ? (
        <div className="group relative flex w-full items-center">
          {/* Line */}
          <div className="h-2 w-full rounded-full opacity-0 transition-all duration-200 group-hover:opacity-100" />

          {/* Button to add question after question */}
          <div className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-2 opacity-0 transition-all duration-200 group-hover:opacity-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onAddSection(section.id)}
              aria-label="Add Section after this"
            >
              <Plus className="h-3 w-3" /> Add Section
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default SortableSectionCard;
