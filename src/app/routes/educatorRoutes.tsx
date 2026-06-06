import { Route, Navigate } from "react-router-dom";

import RequireRole from "@shared/auth/RequireRole";
import EducatorLayout from "@features/educator/components/EducatorLayout";
import StudentAttemptDetails from "@features/student/StudentAttemptDetails";
import {
  AccessCodes,
  EducatorAnalytics,
  Billing,
  EducatorContent,
  EducatorDashboard,
  Divisions,
  DppGenerator,
  InstituteBuilder,
  StudentDetails,
  Learners,
  Messages,
  BatchesListing,
  EducatorQuestionBank,
  Settings,
  StudentsListing,
  ManageQuestionsPage,
  TestSeries,
  ScheduledTests,
  ScheduledDpps,
  SeatAllocation,
  StudentHealthCategoryList,
  ReportedQuestions,
  SubjectiveReviewQueue,
  SubjectiveAttemptGrader,
  ProctoringReview,
  LiveClasses,
  NeedsAttention,
} from "@features/educator";
import QuestionPaperRequests from "@features/educator/QuestionPaperRequests";

export function getEducatorRoutes() {
  return (
    <Route
      path="/educator"
      element={
        <RequireRole allow={["EDUCATOR", "ADMIN"]} redirectTo="/login">
          <EducatorLayout />
        </RequireRole>
      }
    >
      <Route index element={<EducatorDashboard />} />
      <Route path="dashboard" element={<EducatorDashboard />} />
      <Route path="live-classes" element={<LiveClasses />} />

      <Route path="students" element={<StudentsListing />} />
      <Route path="students/:studentId" element={<StudentDetails />} />
      <Route path="batches" element={<BatchesListing />} />
      <Route path="learners" element={<Learners />} />
      <Route path="learners/:studentId" element={<StudentDetails />} />
      <Route path="scheduled-tests" element={<ScheduledTests />} />
      <Route path="scheduled-dpps" element={<ScheduledDpps />} />
      <Route path="test-series" element={<TestSeries />} />
      <Route path="test-series/:testId/questions" element={<ManageQuestionsPage />} />
      <Route path="question-bank" element={<EducatorQuestionBank />} />
      <Route path="reported-questions" element={<ReportedQuestions />} />
      <Route path="access-codes" element={<AccessCodes />} />
      <Route path="messages" element={<Messages />} />
      <Route path="billing" element={<Billing />} />
      <Route path="analytics" element={<EducatorAnalytics />} />
      <Route path="analytics/health/:category" element={<StudentHealthCategoryList />} />
      <Route path="needs-attention" element={<NeedsAttention />} />
      <Route path="seat-allocation" element={<SeatAllocation />} />
      <Route path="settings" element={<Settings />} />
      <Route path="organization" element={<Divisions />} />
      <Route path="divisions" element={<Navigate to="/educator/organization" replace />} />
      <Route path="content" element={<EducatorContent />} />
      <Route path="dpp" element={<DppGenerator />} />
      <Route path="website-builder" element={<InstituteBuilder />} />
      <Route path="question-papers" element={<QuestionPaperRequests />} />
      <Route path="attempts/:attemptId" element={<StudentAttemptDetails />} />
      <Route path="review-submissions" element={<SubjectiveReviewQueue />} />
      <Route path="review-submissions/:attemptId" element={<SubjectiveAttemptGrader />} />
      <Route path="proctoring/:attemptId" element={<ProctoringReview />} />
    </Route>
  );
}
