export type Difficulty = "easy" | "medium" | "hard";

export type TestSection = {
    id: string;
    name: string;
    questionsCount?: number | null;
    questionsLimit?: number | null;
    attemptsLimit?: number | null;
    timeLimit?: number | null;
    topics?: string[];
    difficultyLevel?: number;
    markingScheme?: {
        correct: number | null;
        incorrect: number;
        unattempted: number;
    } | null;
};

export type TestQuestion = {
    id: string;
    questionOrder?: number;

    // Stored schema (admin-compatible)
    question: string; // can be plain text OR HTML
    options: string[]; // can be plain text OR HTML strings
    correctOption: number; // index
    explanation?: string; // plain/HTML

    difficulty: Difficulty;
    subject?: string;
    topic?: string;

    marks?: number; // positive marks
    negativeMarks?: number;

    isActive?: boolean;

    // Question type
    questionType?: string;

    // Subjective answer reference
    referenceAnswer?: string;
    referenceKeywords?: string[];
    referenceAnswerFileUrl?: string;
    evaluationInstructions?: string;

    // AI import metadata
    source?: "ai_import" | "ai_import_partial" | string;
    bankQuestionId?: string;
    importStatus?: "ready" | "partial";
    reviewRequired?: boolean;
    importIssues?: string[];
    importSourceIndex?: number;
    rawImportBlock?: string;
    questionImageUrl?: string;

    // Section support
    sectionId?: string;

    createdAt?: any;
    updatedAt?: any;
};

export type QuestionBankQuestion = {
    id: string;
    question: string;
    options: string[];
    correctOption: number;
    explanation?: string;
    difficulty: Difficulty;
    subject?: string;
    topic?: string;
    marks?: number;
    negativeMarks?: number;
    updatedAt?: any;
};

export type DifficultyMix = {
    easy: number;
    medium: number;
    hard: number;
};

export type EditorDraftSnapshot = {
    question: string;
    options: string[];
    correct: number;
    difficulty: Difficulty;
    subject: string;
    topic: string;
    marks: string;
    negativeMarks: string;
    active: boolean;
    questionType: string;
    referenceAnswer: string;
    referenceKeywords: string;
    referenceAnswerFileUrl: string;
    evaluationInstructions: string;
};

export type PendingEditorAction =
    | { type: "close-manager" }
    | { type: "close-editor" }
    | { type: "open-new"; sectionId?: string; insertAfterQuestionId?: string }
    | { type: "open-edit"; question: TestQuestion };

export type PreviewCropTarget =
    | { kind: "question"; imageIndex: number }
    | { kind: "option"; optionIndex: number; imageIndex: number };