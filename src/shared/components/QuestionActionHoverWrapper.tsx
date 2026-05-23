import React, { ReactNode } from "react";
import { Flag, MessageSquare } from "lucide-react";
import { Button } from "@shared/ui/button";
import { useQuestionActions } from "@app/providers/QuestionActionsProvider";
import { cn } from "@shared/lib/utils";

type QuestionActionHoverWrapperProps = {
  children: ReactNode;
  questionId: string;
  contextId: string;
  questionContent?: string;
  className?: string;
};

export default function QuestionActionHoverWrapper({
  children,
  questionId,
  contextId,
  questionContent,
  className,
}: QuestionActionHoverWrapperProps) {
  const { openReportModal, openCommentsDrawer } = useQuestionActions();

  return (
    <div
      className={cn(
        "group relative rounded-xl transition-all duration-300 hover:shadow-md hover:ring-1 hover:ring-primary/20",
        className
      )}
    >
      {children}

      {/* Desktop Hover Actions & Mobile Persistent Actions */}
      <div className="absolute bottom-2 right-2 z-10 flex gap-2 opacity-10 transition-opacity duration-200 group-hover:opacity-100 md:opacity-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openReportModal(questionId, contextId, questionContent);
          }}
        >
          <Flag className="mr-1.5 h-3.5 w-3.5" /> Report
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-xs text-blue-600 hover:bg-blue-500/10 hover:text-blue-600"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openCommentsDrawer(questionId, contextId);
          }}
        >
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Comments
        </Button>
      </div>
    </div>
  );
}
