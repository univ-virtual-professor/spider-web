import React, { createContext, useContext, useState, ReactNode } from "react";
import QuestionReportModal from "@shared/components/QuestionReportModal";
import QuestionCommentsDrawer from "@shared/components/QuestionCommentsDrawer";

type QuestionActionsContextType = {
  openReportModal: (questionId: string, contextId: string, questionContent?: string) => void;
  openCommentsDrawer: (questionId: string, contextId: string) => void;
  closeReportModal: () => void;
  closeCommentsDrawer: () => void;
};

const QuestionActionsContext = createContext<QuestionActionsContextType | null>(null);

export const useQuestionActions = () => {
  const ctx = useContext(QuestionActionsContext);
  if (!ctx) {
    throw new Error("useQuestionActions must be used within a QuestionActionsProvider");
  }
  return ctx;
};

export const QuestionActionsProvider = ({ children }: { children: ReactNode }) => {
  const [reportQuestionId, setReportQuestionId] = useState<string | null>(null);
  const [reportContextId, setReportContextId] = useState<string | null>(null);
  const [reportQuestionContent, setReportQuestionContent] = useState<string | undefined>(undefined);

  const [commentsQuestionId, setCommentsQuestionId] = useState<string | null>(null);
  const [commentsContextId, setCommentsContextId] = useState<string | null>(null);

  const openReportModal = (questionId: string, contextId: string, questionContent?: string) => {
    setReportQuestionId(questionId);
    setReportContextId(contextId);
    setReportQuestionContent(questionContent);
  };

  const closeReportModal = () => {
    setReportQuestionId(null);
    setReportContextId(null);
    setReportQuestionContent(undefined);
  };

  const openCommentsDrawer = (questionId: string, contextId: string) => {
    setCommentsQuestionId(questionId);
    setCommentsContextId(contextId);
  };

  const closeCommentsDrawer = () => {
    setCommentsQuestionId(null);
    setCommentsContextId(null);
  };

  return (
    <QuestionActionsContext.Provider
      value={{
        openReportModal,
        openCommentsDrawer,
        closeReportModal,
        closeCommentsDrawer,
      }}
    >
      {children}

      {reportQuestionId && reportContextId && (
        <QuestionReportModal
          isOpen={!!reportQuestionId}
          onClose={closeReportModal}
          questionId={reportQuestionId}
          contextId={reportContextId}
          questionContent={reportQuestionContent}
        />
      )}

      {commentsQuestionId && commentsContextId && (
        <QuestionCommentsDrawer
          isOpen={!!commentsQuestionId}
          onClose={closeCommentsDrawer}
          questionId={commentsQuestionId}
          contextId={commentsContextId}
        />
      )}
    </QuestionActionsContext.Provider>
  );
};
