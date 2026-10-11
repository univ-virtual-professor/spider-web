// Owner / Faculty / Ops role resolution (BUILD-NOTES §02) and each role's primary-nav
// order (BUILD-NOTES §04, Desktop Portal.dc.html's NAV constant). Shared between
// EducatorLayout.tsx (sidebar shape) and Dashboard.tsx (which home screen to render)
// so the two can never drift apart. Pulled out of EducatorLayout.tsx so that
// component file only exports components (react-refresh/only-export-components).
export type EducatorPortalRole = "Owner" | "Faculty" | "Ops";

export function resolveEducatorPortalRole(
  isEmployee: boolean,
  roleName: string | null
): EducatorPortalRole {
  return !isEmployee ? "Owner" : roleName === "Front Desk / Ops" ? "Ops" : "Faculty";
}

// Exact per-role primary-nav order from the design's NAV constant
// (Desktop Portal.dc.html, BUILD-NOTES §04) — a flat href list rather than
// navCatalog's own array order, since each role orders the same items
// differently.
//
// Omitted deliberately (see design.md):
// - "Create test" (fa_create): a dialog reached from the "Tests & grading" page, not a
//   standalone route.
// - "Sheet review": the per-sheet drill-down (/educator/exam-grading/:examId/review/:sheetId),
//   like "Live test" on the student side — not a top-level screen.
// - "Student analysis" on Faculty's primary nav (owner's call): in the design it's actually
//   per-student (an Analysis tab on that student's detail page), not a standalone list for
//   Faculty today. /educator/analytics stays reachable from More as "Analytics".
export const PRIMARY_NAV_ORDER: Record<EducatorPortalRole, string[]> = {
  Owner: [
    "/educator/dashboard",
    "/educator/batches",
    "/educator/organization",
    "/educator/billing",
    "/educator/website-pages",
  ],
  Faculty: [
    "/educator/dashboard",
    "/educator/batches",
    "/educator/curriculum",
    "/educator/attendance",
    "/educator/exam-grading",
    "/educator/exam-schedule",
    "/educator/scheduled-dpps",
    "/educator/students",
  ],
  Ops: [
    "/educator/timetable",
    "/educator/exam-schedule",
    "/educator/enrolments",
    "/educator/students",
    "/educator/attendance-overview",
  ],
};
