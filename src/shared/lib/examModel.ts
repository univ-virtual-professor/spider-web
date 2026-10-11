// Shared pieces of the "curriculum exam vs ad-hoc test" distinction (portal revamp rule #1,
// see docs/agents/mockups/revamp/BUILD-NOTES.md §05). The Exam Schedule screen
// (educators/{id}/exams, src/features/educator/ExamSchedule.tsx) is the source of truth for
// curriculum exams: every doc there carries a venue, a published syllabus and a term-plan
// place. Anything else a student is marked on — an online test attempt (`attempts`) or a
// manually entered grade (`manualGrades`) — is ad-hoc by definition: it has none of those three
// and never appears in the "curriculum exams" section of the report card.
//
// A curriculum exam's marks live in the top-level `examResults` collection (one doc per
// exam+student, id `${examId}_${studentId}`) rather than nested under the student. Rank is
// computed once, server-side-equivalent, by the educator when they release results
// (ExamSchedule.tsx's `recomputeRanks`) and stored directly on each student's own doc — the
// report card then only ever reads docs where `studentId` is the signed-in student, never a
// cross-student query, since a student's browser has no business reading classmates' marks.
//
// IMPORTANT — no Firestore security rule exists yet for `examResults` (rules are managed
// outside this repo). Until one is added, writes to this collection will be rejected in
// production. The rule this collection needs: create/update/delete only by the owning
// educator (`request.auth.uid == resource.data.educatorId`, or one of that educator's
// employees with the `tests.publish` permission) for students belonging to their own
// institute; read allowed for that same educator, and additionally for a student but only on
// docs where `studentId == request.auth.uid` (never a wider read — that's what would leak
// classmates' marks). See docs/agents/risks.md.

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
  // Written once by the educator at release time (ExamSchedule.tsx's `recomputeRanks`), not
  // computed client-side — see the file header note on why.
  rank?: number;
  totalStudents?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

// Rule #1 (only curriculum exams reach the report card) combined with rule #8 (students only
// ever see released results) — a result only belongs on a report card once both the exam is
// published, the educator has opted it into the report card, and results have been released.
export function examCountsTowardReportCard(
  exam: Pick<CurriculumExamDoc, "status" | "reportCardEligible" | "resultsReleased">
): boolean {
  return exam.status === "published" && exam.reportCardEligible && !!exam.resultsReleased;
}

export function examResultId(examId: string, studentId: string): string {
  return `${examId}_${studentId}`;
}
