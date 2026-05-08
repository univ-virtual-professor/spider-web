import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Switch } from "@shared/ui/switch";
import "react-image-crop/dist/ReactCrop.css";
import { HtmlView } from "@shared/lib/safeHtml";
import {
  formatNegativeMarksDisplay,
} from "@shared/lib/aiQuestionImport";

import {
  isQuestionPublished,
  hasPreviewContent,
} from "./QuestionManager/QuestionManagerUtils";
import { normalizeQuestionType, QUESTION_TYPE_CONFIG } from "@shared/lib/questionTypes";

import { Trash2, GripVertical,Plus,Edit } from "lucide-react";
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
};

const SortableQuestionListItem =({
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
}: SortableQuestionListItemProps) => {
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
                className={`p-3 rounded-xl cursor-pointer text-sm hover:bg-gray-300/10 transition-colors border bg-card ${isDragging ? "opacity-70" : ""}`}
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
                            className="h-7 w-7 rounded-lg text-muted-foreground mt-0.5 cursor-grab active:cursor-grabbing shrink-0"
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
                                <div className="flex items-center gap-2 min-w-0">

                                    {/* Q Number */}
                                    <span className="text-muted-foreground shrink-0">
                                        Q{displayOrder}:
                                    </span>

                                    {/* Question */}
                                    <div className="min-w-0 flex-1 overflow-hidden">
                                        {hasPreviewContent(q.question || "") ? (
                                            <HtmlView
                                                html={q.question || ""}
                                                className="text-sm line-clamp-1 break-words [&_p]:m-0 [&_img]:hidden"
                                            />
                                        ) : (
                                            <p className="text-sm text-muted-foreground truncate">
                                                (empty)
                                            </p>
                                        )}
                                    </div>

                                </div>
                            </div>

                            {!readOnly ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-xl shrink-0"
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
                                    className="rounded-xl text-destructive shrink-0"
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
                        <div className="mt-2 flex flex-wrap justify-between w-full gap-2">

                            <div className="flex gap-1.5 flex-wrap">
                                {(() => {
                                    const qType = normalizeQuestionType(q.questionType || "MCQ");
                                    const cfg = QUESTION_TYPE_CONFIG[qType];
                                    return (
                                        <Badge variant="outline" className={`text-[10px] rounded-full ${cfg?.badgeColor || ""}`}>
                                            {cfg?.shortLabel || qType}
                                        </Badge>
                                    );
                                })()}

                                <Badge variant="secondary" className="text-[10px] rounded-full">
                                    {(q.difficulty || "medium").toUpperCase()}
                                </Badge>

                                <Badge variant="outline" className="text-[10px] rounded-full">
                                    +{q.marks ?? "-"} / {formatNegativeMarksDisplay(q.negativeMarks)}
                                </Badge>

                                {q.source === "ai_import" && (
                                    <Badge variant="outline" className="text-[10px] rounded-full">AI</Badge>
                                )}

                                {q.source === "ai_import_partial" && (
                                    <Badge variant="outline" className="text-[10px] rounded-full">AI Draft</Badge>
                                )}

                                {isPublished ? (
                                    <Badge className="text-[10px] rounded-full">Published</Badge>
                                ) : (
                                    <Badge variant="destructive" className="text-[10px] rounded-full">
                                        Draft
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
                <div className="group w-full relative flex items-center">

                    {/* Line */}
                    <div className="w-full h-2  
                  opacity-0 group-hover:opacity-100 rounded-full
                  transition-all duration-200" />

                    {/* Button to add question after question */}
                    <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/3
                  opacity-0 group-hover:opacity-100 
                  transition-all duration-200 flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddAfterQuestion(q);
                            }}
                            aria-label="Add question after this"
                        >
                            <Plus className="h-3 w-3" /> Add Question
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={(e) => {
                                e.stopPropagation();
                                onImportAfterQuestion(q);
                            }}
                            aria-label="Import from question bank after this"
                        >
                            <Plus className="h-3 w-3" /> Import From Question Bank
                        </Button>
                    </div>

                </div>
            ) : null}
        </>
    );
}

export default SortableQuestionListItem;