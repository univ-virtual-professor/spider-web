// Shared pieces of the "curriculum exam vs ad-hoc test" distinction (portal revamp rule #1,
// see docs/agents/mockups/revamp/BUILD-NOTES.md §05). The Exam Schedule screen
// (educators/{id}/exams, src/features/educator/ExamSchedule.tsx) is the source of truth for
// curriculum exams: every doc there carries a venue, a published syllabus and a term-plan
// place. Anything else a student is marked on — an online test attempt (`attempts`) or a
// manually entered grade (`manualGrades`) — is ad-hoc by definition: it has none of those three
// and never appears in the "curriculum exams" section of the report card.
//
// A curriculum exam's marks live in the top-level `examResults` collection (one doc per
// exam+student, id `${examId}_${studentId}`) rather than nested under the student, so a
// student's rank can be computed with a single query across everyone who sat that exam — the
// same pattern `attempts` already uses for online-test rankings (see StudentRankings.tsx).

export type CurriculumExamDoc = {
  id: string;
  title: string;
  courseId: string;
  courseName: string; // doubles as the exam's subject label
  targetBatches: string[];
  examDate: string; // YYYY-MM-DD
  venue: string;
  hall: string;
  status: "draft" | "published";
  reportCardEligible: boolean;
  resultsReleased?: boolean;
  resultsReleasedAt?: unknown;
};

export type ExamResultDoc = {
  id: string;
  examId: string;
  educatorId: string;
  studentId: string;
  studentName: string;
  courseName: string; // subject
  marks: number;
  maxMarks: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

// Rule #1 (only curriculum exams reach the report card) combined with rule #8 (students only
// ever see released results) — a result only belongs on a report card once both the exam is
// published, the educator has opted it into the report card, and results have been released.
export function examCountsTowardReportCard(exam: Pick<
  CurriculumExamDoc,
  "status" | "reportCardEligible" | "resultsReleased"
>): boolean {
  return exam.status === "published" && exam.reportCardEligible && !!exam.resultsReleased;
}

export function examResultId(examId: string, studentId: string): string {
  return `${examId}_${studentId}`;
}
