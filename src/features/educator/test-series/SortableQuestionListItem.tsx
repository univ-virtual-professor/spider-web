import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Switch } from "@shared/ui/switch";
import "react-image-crop/dist/ReactCrop.css";
import { HtmlView } from "@shared/lib/safeHtml";
import { formatNegativeMarksDisplay } from "@shared/lib/aiQuestionImport";
import { useQuestionActions } from "@app/providers/QuestionActionsProvider";
import { Flag, MessageSquare } from "lucide-react";

import { isQuestionPublished, hasPreviewContent } from "./QuestionManager/QuestionManagerUtils";
import { normalizeQuestionType, QUESTION_TYPE_CONFIG } from "@shared/lib/questionTypes";

import { Trash2, GripVertical, Plus, Edit } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TestQuestion } from "./QuestionManager/QuestionManagerTypes";

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
  onAddAfterQuestion: (q: TestQuestion) => void;
  onImportAfterQuestion: (q: TestQuestion) => void;
  onDuplicate: (q: TestQuestion) => void;
  onDelete: (id: string) => void;
  onToggleActive: (q: TestQuestion, next: boolean) => void;
  contextId?: string;
  isReported?: boolean;
};

const SortableQuestionListItem = ({
  q,
  displayOrder,
  dragDisabled,
  hideDragHandle,
  readOnly,
  onOpenEdit,
  onAddAfterQuestion,
  onImportAfterQuestion,
  onDuplicate,
  onDelete,
  onToggleActive,
  contextId,
  isReported,
}: SortableQuestionListItemProps) => {
  const { openReportModal, openCommentsDrawer } = useQuestionActions();
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
    <>
      <div
        ref={setNodeRef}
        style={style}
        onClick={() => onOpenEdit(q)}
        className={`cursor-pointer rounded-xl border bg-card p-3 text-sm transition-colors hover:bg-gray-300/10 ${isDragging ? "opacity-70" : ""}`}
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
                  className="shrink-0 rounded-xl"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEdit(q);
                  }}
                  aria-label="Edit question"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              ) : null}

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
                {(() => {
                  const qType = normalizeQuestionType(q.questionType || "MCQ");
                  const cfg = QUESTION_TYPE_CONFIG[qType];
                  return (
                    <Badge
                      variant="outline"
                      className={`rounded-full text-[10px] ${cfg?.badgeColor || ""}`}
                    >
                      {cfg?.shortLabel || qType}
                    </Badge>
                  );
                })()}

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
      </div>
      {/* Add Question bar  */}
      {!readOnly ? (
        <div className="group relative flex w-full items-center">
          <div className="h-2 w-full rounded-full opacity-0 transition-all duration-200 group-hover:opacity-100" />
          <div className="absolute left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/3 flex-wrap justify-center gap-1.5 opacity-0 transition-all duration-200 group-hover:opacity-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onAddAfterQuestion(q);
              }}
              aria-label="Add question after this"
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline"> Add Question</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onImportAfterQuestion(q);
              }}
              aria-label="Import from question bank after this"
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline"> From Bank</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                openReportModal(q.id, contextId || "manager", q.question);
              }}
            >
              <Flag className="h-3 w-3" />
              <span className="hidden sm:inline ml-1">Report</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-xs text-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                openCommentsDrawer(q.id, contextId || "manager");
              }}
            >
              <MessageSquare className="h-3 w-3" />
              <span className="hidden sm:inline ml-1">Comments</span>
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default SortableQuestionListItem;
