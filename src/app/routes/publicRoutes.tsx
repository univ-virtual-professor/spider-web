import React from "react";
import { Navigate, Route } from "react-router-dom";

import AiAnswerSheetEvaluation from "@/pages/AiAnswerSheetEvaluation";
import CompleteProfile from "@/pages/CompleteProfile";
import Contact from "@/pages/Contact";
import Features from "@/pages/Features";
import HowItWorks from "@/pages/HowItWorks";
import Impersonate from "@/pages/Impersonate";
import Index from "@/pages/Index";
import Join from "@/pages/Join";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import PersonalisedPracticePapers from "@/pages/PersonalisedPracticePapers";
import Pricing from "@/pages/Pricing";
import Privacy from "@/pages/Privacy";
import Refund from "@/pages/Refund";
import Signup from "@/pages/Signup";
import StudentPerformanceAnalysis from "@/pages/StudentPerformanceAnalysis";
import Terms from "@/pages/Terms";
import TestGenerator from "@/pages/TestGenerator";
import PayCallback from "@features/pay/PayCallback";
import TenantCustomPage from "@/pages/TenantCustomPage";

export function getSharedPublicRoutes() {
  return (
    <>
      <Route path="/impersonate" element={<Impersonate />} />
      <Route path="/join/:token" element={<Join />} />
      <Route path="/callback" element={<PayCallback />} />
    </>
  );
}

export function getMainDomainPublicRoutes() {
  return (
    <>
      <Route path="/" element={<Index />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/features" element={<Features />} />
      <Route path="/features/ai-answer-sheet-evaluation" element={<AiAnswerSheetEvaluation />} />
      <Route
        path="/features/student-performance-analysis"
        element={<StudentPerformanceAnalysis />}
      />
      <Route
        path="/features/personalised-practice-papers"
        element={<PersonalisedPracticePapers />}
      />
      <Route path="/features/test-generator" element={<TestGenerator />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/refunds" element={<Refund />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="*" element={<NotFound />} />
    </>
  );
}

export function getTenantDomainPublicRoutes(
  tenantHome: React.ReactElement,
  tenantCourses: React.ReactElement
) {
  return (
    <>
      <Route path="/" element={tenantHome} />
      <Route path="/courses" element={tenantCourses} />
      <Route path="/p/:slug" element={<TenantCustomPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="*" element={<NotFound />} />
    </>
  );
}

export function getAdminRedirectRoute() {
  return <Route index element={<Navigate to="dashboard" replace />} />;
}
