import React from "react";
import { Route } from "react-router-dom";

import RequireRole from "@shared/auth/RequireRole";
import AdminAnalytics from "@features/admin/Analytics";
import AdminContentLibrary from "@features/admin/ContentLibrary";
import AdminCouponManagement from "@features/admin/CouponManagement";
import AdminDashboard from "@features/admin/Dashboard";
import AdminDppTemplate from "@features/admin/DppTemplate";
import AdminEducators from "@features/admin/Educators";
import AdminLayout from "@features/admin/AdminLayout";
import AdminPaymentLogs from "@features/admin/PaymentLogs";
import AdminQuestionPaperRequests from "@features/admin/QuestionPaperRequests";
import AdminPlanManagement from "@features/admin/PlanManagement";
import AdminQuestionBank from "@features/admin/QuestionBank";
import AdminQuestions from "@features/admin/Questions";
import AdminSeatManagement from "@features/admin/SeatManagement";
import AdminContentTypeManagement from "@features/admin/ContentTypeManagement";
import AdminSubjectManagement from "@features/admin/SubjectManagement";
import AdminTemplates from "@features/admin/Templates";
import AdminTestBank from "@features/admin/TestBank";
import AdminTestForm from "@features/admin/TestForm";
import AdminRolesManagement from "@features/admin/RolesManagement";
import AdminReportedQuestions from "@features/admin/ReportedQuestions";
import AdminTrials from "@features/admin/Trials";

export function getAdminRoutes(adminIndexRoute: React.ReactElement) {
  return (
    <Route
      path="/admin"
      element={
        <RequireRole allow={["ADMIN"]} redirectTo="/admin/login">
          <AdminLayout />
        </RequireRole>
      }
    >
      {adminIndexRoute}
      <Route path="dashboard" element={<AdminDashboard />} />
      <Route path="analytics" element={<AdminAnalytics />} />
      <Route path="tests" element={<AdminTestBank />} />
      <Route path="tests/new" element={<AdminTestForm />} />
      <Route path="tests/edit/:id" element={<AdminTestForm />} />
      <Route path="questions/:testId" element={<AdminQuestions />} />
      <Route path="templates" element={<AdminTemplates />} />
      <Route path="question-bank" element={<AdminQuestionBank />} />
      <Route path="seat-management" element={<AdminSeatManagement />} />
      <Route path="educators" element={<AdminEducators />} />
      <Route path="plans" element={<AdminPlanManagement />} />
      <Route path="subjects" element={<AdminSubjectManagement />} />
      <Route path="content" element={<AdminContentLibrary />} />
      <Route path="content-types" element={<AdminContentTypeManagement />} />
      <Route path="dpp-template" element={<AdminDppTemplate />} />
      <Route path="coupons" element={<AdminCouponManagement />} />
      <Route path="payment-logs" element={<AdminPaymentLogs />} />
      <Route path="question-paper-requests" element={<AdminQuestionPaperRequests />} />
      <Route path="roles" element={<AdminRolesManagement />} />
      <Route path="reported-questions" element={<AdminReportedQuestions />} />
      <Route path="trials" element={<AdminTrials />} />
    </Route>
  );
}
