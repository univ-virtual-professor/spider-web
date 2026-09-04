import { Route } from "react-router-dom";

import StudentRoute from "@shared/routes/StudentRoute";
import StudentAttemptDetails from "@features/student/StudentAttemptDetails";
import StudentAttempts from "@features/student/StudentAttempts";
import StudentCBTAttempt from "@features/student/StudentCBTAttempt";
import StudentChatbot from "@features/student/StudentChatbot";
import StudentContent from "@features/student/StudentContent";
import StudentDashboard from "@features/student/StudentDashboard";
import StudentLayout from "@features/student/StudentLayout";
import StudentMessages from "@features/student/StudentMessages";
import PracticeGenerator from "@features/student/PracticeGenerator";
import StudentCurriculum from "@features/student/StudentCurriculum";
import StudentTimetable from "@features/student/StudentTimetable";
import StudentAttendance from "@features/student/StudentAttendance";
import StudentGrades from "@features/student/StudentGrades";
import StudentRankings from "@features/student/StudentRankings";
import StudentReports from "@features/student/StudentReports";
import StudentResults from "@features/student/StudentResults";
import StudentSettings from "@features/student/StudentSettings";
import StudentTestDetails from "@features/student/StudentTestDetails";
import StudentTests from "@features/student/StudentTests";
import StudentExamResultsList from "@features/student/examResults/StudentExamResultsList";
import StudentExamResultDetail from "@features/student/examResults/StudentExamResultDetail";
import StudentAllResults from "@features/student/StudentAllResults";

export function getStudentRoutes() {
  return (
    <Route path="/student" element={<StudentRoute />}>
      <Route element={<StudentLayout />}>
        <Route index element={<StudentDashboard />} />
        <Route path="dashboard" element={<StudentDashboard />} />
        <Route path="tests" element={<StudentTests />} />
        <Route path="tests/:testId" element={<StudentTestDetails />} />
        <Route path="tests/:testId/attempt" element={<StudentCBTAttempt />} />
        <Route path="attempts" element={<StudentAttempts />} />
        <Route path="attempts/:attemptId" element={<StudentAttemptDetails />} />
        <Route path="results/:attemptId" element={<StudentResults />} />
        <Route path="rankings" element={<StudentRankings />} />
        <Route path="messages" element={<StudentMessages />} />
        <Route path="settings" element={<StudentSettings />} />
        <Route path="content" element={<StudentContent />} />
        <Route path="chatbot" element={<StudentChatbot />} />
        <Route path="reports" element={<StudentReports />} />
        <Route path="practice" element={<PracticeGenerator />} />
        <Route path="curriculum" element={<StudentCurriculum />} />
        <Route path="timetable" element={<StudentTimetable />} />
        <Route path="attendance" element={<StudentAttendance />} />
        <Route path="grades" element={<StudentGrades />} />
        <Route path="my-results" element={<StudentAllResults />} />
        <Route path="exam-results" element={<StudentExamResultsList />} />
        <Route path="exam-results/:sheetId" element={<StudentExamResultDetail />} />
      </Route>
    </Route>
  );
}
