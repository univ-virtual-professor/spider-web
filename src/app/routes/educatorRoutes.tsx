import { Route, Navigate } from "react-router-dom";

import RequireRole from "@shared/auth/RequireRole";
import RequirePermission from "@shared/auth/RequirePermission";
import { PERMISSIONS } from "@shared/lib/rolesConfig";
import EducatorLayout from "@features/educator/components/EducatorLayout";
import EducatorStudentReportCard from "@features/educator/EducatorStudentReportCard";
import StudentAttemptDetails from "@features/student/StudentAttemptDetails";
import {
  AccessCodes,
  EducatorAnalytics,
  Billing,
  EducatorContent,
  EducatorDashboard,
  TestPlatformDashboard,
  Curriculum,
  Attendance,
  Timetable,
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
  ExamGradingList,
  ExamGradingDetail,
  ExamGradingReview,
  ExamSchedule,
  Enrolments,
  AttendanceOps,
  WebsitePages,
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
      <Route path="testing" element={<TestPlatformDashboard />} />
      <Route
        path="curriculum"
        element={
          <RequirePermission anyOf={[PERMISSIONS.CONTENT_VIEW]}>
            <Curriculum />
          </RequirePermission>
        }
      />
      <Route
        path="attendance"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <Attendance />
          </RequirePermission>
        }
      />
      <Route
        path="timetable"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <Timetable />
          </RequirePermission>
        }
      />
      <Route
        path="students"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <StudentsListing />
          </RequirePermission>
        }
      />
      <Route
        path="students/:studentId"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <StudentDetails />
          </RequirePermission>
        }
      />
      <Route
        path="students/:studentId/report-card"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <EducatorStudentReportCard />
          </RequirePermission>
        }
      />
      <Route
        path="batches"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <BatchesListing />
          </RequirePermission>
        }
      />
      <Route
        path="learners"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <Learners />
          </RequirePermission>
        }
      />
      <Route
        path="learners/:studentId"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <StudentDetails />
          </RequirePermission>
        }
      />
      <Route
        path="learners/:studentId/report-card"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <EducatorStudentReportCard />
          </RequirePermission>
        }
      />
      <Route
        path="scheduled-tests"
        element={
          <RequirePermission
            anyOf={[
              PERMISSIONS.TESTS_VIEW,
              PERMISSIONS.TESTS_CREATE,
              PERMISSIONS.QB_VIEW,
              PERMISSIONS.DPPS_MANAGE,
            ]}
          >
            <ScheduledTests />
          </RequirePermission>
        }
      />
      <Route
        path="scheduled-dpps"
        element={
          <RequirePermission anyOf={[PERMISSIONS.DPPS_MANAGE]}>
            <ScheduledDpps />
          </RequirePermission>
        }
      />
      <Route
        path="exam-schedule"
        element={
          <RequirePermission
            anyOf={[PERMISSIONS.TESTS_VIEW, PERMISSIONS.TESTS_CREATE, PERMISSIONS.TESTS_PUBLISH]}
          >
            <ExamSchedule />
          </RequirePermission>
        }
      />
      <Route
        path="enrolments"
        element={
          <RequirePermission anyOf={[PERMISSIONS.ENROLMENTS_VIEW, PERMISSIONS.ENROLMENTS_MANAGE]}>
            <Enrolments />
          </RequirePermission>
        }
      />
      <Route
        path="attendance-overview"
        element={
          <RequirePermission anyOf={[PERMISSIONS.STUDENTS_VIEW]}>
            <AttendanceOps />
          </RequirePermission>
        }
      />
      <Route
        path="test-series"
        element={
          <RequirePermission
            anyOf={[
              PERMISSIONS.TESTS_VIEW,
              PERMISSIONS.TESTS_CREATE,
              PERMISSIONS.QB_VIEW,
              PERMISSIONS.DPPS_MANAGE,
            ]}
          >
            <TestSeries />
          </RequirePermission>
        }
      />
      <Route
        path="test-series/:testId/questions"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_CREATE]}>
            <ManageQuestionsPage />
          </RequirePermission>
        }
      />
      <Route
        path="question-bank"
        element={
          <RequirePermission anyOf={[PERMISSIONS.QB_VIEW]}>
            <EducatorQuestionBank />
          </RequirePermission>
        }
      />
      <Route
        path="reported-questions"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_VIEW]}>
            <ReportedQuestions />
          </RequirePermission>
        }
      />
      <Route
        path="access-codes"
        element={
          <RequirePermission anyOf={[PERMISSIONS.CODES_VIEW]}>
            <AccessCodes />
          </RequirePermission>
        }
      />
      <Route
        path="messages"
        element={
          <RequirePermission anyOf={[PERMISSIONS.MESSAGES_VIEW]}>
            <Messages />
          </RequirePermission>
        }
      />
      <Route
        path="billing"
        element={
          <RequirePermission ownerOnly>
            <Billing />
          </RequirePermission>
        }
      />
      <Route
        path="analytics"
        element={
          <RequirePermission anyOf={[PERMISSIONS.ANALYTICS_VIEW]}>
            <EducatorAnalytics />
          </RequirePermission>
        }
      />
      <Route
        path="analytics/health/:category"
        element={
          <RequirePermission anyOf={[PERMISSIONS.ANALYTICS_VIEW]}>
            <StudentHealthCategoryList />
          </RequirePermission>
        }
      />
      <Route
        path="seat-allocation"
        element={
          <RequirePermission ownerOnly>
            <SeatAllocation />
          </RequirePermission>
        }
      />
      <Route path="settings" element={<Settings />} />
      <Route
        path="organization"
        element={
          <RequirePermission ownerOnly>
            <Divisions />
          </RequirePermission>
        }
      />
      <Route path="divisions" element={<Navigate to="/educator/organization" replace />} />
      <Route
        path="content"
        element={
          <RequirePermission anyOf={[PERMISSIONS.CONTENT_VIEW]}>
            <EducatorContent />
          </RequirePermission>
        }
      />
      <Route
        path="dpp"
        element={
          <RequirePermission anyOf={[PERMISSIONS.DPPS_MANAGE]}>
            <DppGenerator />
          </RequirePermission>
        }
      />
      <Route
        path="website-builder"
        element={
          <RequirePermission anyOf={[PERMISSIONS.WEBSITE_MANAGE]}>
            <InstituteBuilder />
          </RequirePermission>
        }
      />
      <Route
        path="website-pages"
        element={
          <RequirePermission anyOf={[PERMISSIONS.WEBSITE_MANAGE]}>
            <WebsitePages />
          </RequirePermission>
        }
      />
      <Route
        path="question-papers"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_CREATE]}>
            <QuestionPaperRequests />
          </RequirePermission>
        }
      />
      <Route
        path="attempts/:attemptId"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_VIEW]}>
            <StudentAttemptDetails />
          </RequirePermission>
        }
      />
      <Route
        path="review-submissions"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_VIEW]}>
            <SubjectiveReviewQueue />
          </RequirePermission>
        }
      />
      <Route
        path="review-submissions/:attemptId"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_VIEW]}>
            <SubjectiveAttemptGrader />
          </RequirePermission>
        }
      />
      <Route
        path="proctoring/:attemptId"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_VIEW]}>
            <ProctoringReview />
          </RequirePermission>
        }
      />
      <Route
        path="exam-grading"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_VIEW]}>
            <ExamGradingList />
          </RequirePermission>
        }
      />
      <Route
        path="exam-grading/:examId"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_VIEW]}>
            <ExamGradingDetail />
          </RequirePermission>
        }
      />
      <Route
        path="exam-grading/:examId/review/:sheetId"
        element={
          <RequirePermission anyOf={[PERMISSIONS.TESTS_VIEW]}>
            <ExamGradingReview />
          </RequirePermission>
        }
      />
    </Route>
  );
}
