import type { Timestamp } from "firebase/firestore";

/** A comprehension passage or case study scenario shared by multiple questions. */
export type QuestionGroupType = "comprehension" | "case_study";

export type QuestionGroup = {
  id: string;
  type: QuestionGroupType;
  /** Short title shown in the admin UI, e.g. "Passage: The Industrial Revolution" */
  title: string;
  /** HTML or LaTeX — the shared reading material / scenario */
  passageContent: string;
  passageContentFormat: "html" | "latex";
  subjectId?: string;
  subjectName?: string;
  topics?: string[];
  tags?: string[];
  difficulty?: "easy" | "medium" | "hard";
  /** Ordered question_bank document IDs belonging to this group */
  questionIds: string[];
  /** Denormalized count for fast querying; keep in sync with questionIds.length */
  questionCount: number;
  uploadedBy?: string;
  uploadedByRole?: "admin" | "educator";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

/** Minimal passage info embedded on test questions for fast CBT rendering */
export type EmbeddedPassage = {
  groupId: string;
  title: string;
  content: string;
  contentFormat: "html" | "latex";
};
