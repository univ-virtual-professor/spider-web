import { Route } from "react-router-dom";

import RequireRole from "@shared/auth/RequireRole";
import EducatorLayout from "@features/educator/components/EducatorLayout";
import AccessCodes from "@features/educator/AccessCodes";
import EducatorAnalytics from "@features/educator/Analytics";
import Billing from "@features/educator/Billing";
import EducatorContent from "@features/educator/ContentManagement";
import EducatorDashboard from "@features/educator/Dashboard";
import Divisions from "@features/educator/Divisions";
import DppGenerator from "@features/educator/DppGenerator";
import InstituteBuilder from "@features/educator/InstituteBuilder";
import LearnerDetails from "@features/educator/LearnerDetails";
import Learners from "@features/educator/Learners";
import Messages from "@features/educator/Messages";
import EducatorQuestionBank from "@features/educator/QuestionBank";
import Settings from "@features/educator/Settings";
import { ManageQuestionsPage, TestSeries } from "@features/educator/test-series";
import WebsiteSettings from "@features/educator/WebsiteSettings";
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
      <Route path="learners" element={<Learners />} />
      <Route path="learners/:learnerId" element={<LearnerDetails />} />
      <Route path="test-series" element={<TestSeries />} />
      <Route path="test-series/:testId/questions" element={<ManageQuestionsPage />} />
      <Route path="question-bank" element={<EducatorQuestionBank />} />
      <Route path="access-codes" element={<AccessCodes />} />
      <Route path="messages" element={<Messages />} />
      <Route path="website-settings" element={<WebsiteSettings />} />
      <Route path="billing" element={<Billing />} />
      <Route path="seat-allocation" element={<SeatAllocation />} />
      <Route path="settings" element={<Settings />} />
      <Route path="divisions" element={<Divisions />} />
      <Route path="content" element={<EducatorContent />} />
      <Route path="dpp" element={<DppGenerator />} />
      <Route path="analytics" element={<EducatorAnalytics />} />
      <Route path="website-builder" element={<InstituteBuilder />} />
      <Route path="question-papers" element={<QuestionPaperRequests />} />
    </Route>
  );
}
