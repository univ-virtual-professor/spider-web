import { Route, Navigate } from "react-router-dom";

import RequireRole from "@shared/auth/RequireRole";
import EducatorLayout from "@features/educator/components/EducatorLayout";
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
  WebsiteSettings,
  ManageQuestionsPage,
  TestSeries,
  ScheduledTests,
  ScheduledDpps,
} from "@features/educator";
import QuestionPaperRequests from "@features/educator/QuestionPaperRequests";
import SeatAllocation from "@features/educator/SeatAllocation";

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
      <Route path="students" element={<StudentsListing />} />
      <Route path="students/:studentId" element={<StudentDetails />} />
      <Route path="batches" element={<BatchesListing />} />
      <Route path="learners" element={<Learners />} />
      <Route path="scheduled-tests" element={<ScheduledTests />} />
      <Route path="scheduled-dpps" element={<ScheduledDpps />} />
      <Route path="test-series" element={<TestSeries />} />
      <Route path="test-series/:testId/questions" element={<ManageQuestionsPage />} />
      <Route path="question-bank" element={<EducatorQuestionBank />} />
      <Route path="access-codes" element={<AccessCodes />} />
      <Route path="messages" element={<Messages />} />
      <Route path="website-settings" element={<WebsiteSettings />} />
      <Route path="billing" element={<Billing />} />
      <Route path="analytics" element={<EducatorAnalytics />} />
      <Route path="seat-allocation" element={<SeatAllocation />} />
      <Route path="settings" element={<Settings />} />
      <Route path="organization" element={<Divisions />} />
      <Route path="divisions" element={<Navigate to="/educator/organization" replace />} />
      <Route path="content" element={<EducatorContent />} />
      <Route path="dpp" element={<DppGenerator />} />
      <Route path="website-builder" element={<InstituteBuilder />} />
      <Route path="question-papers" element={<QuestionPaperRequests />} />
    </Route>
  );
}
