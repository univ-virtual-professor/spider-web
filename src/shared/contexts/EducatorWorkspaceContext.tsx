import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type EducatorWorkspace = "lms" | "test";

const STORAGE_KEY = "pk_educator_workspace";

// Routes that live under the Test Platform grouping — used to infer a sensible
// default workspace from the current URL (e.g. a deep link into DPP Generator).
const TEST_PLATFORM_PATH_PREFIXES = [
  "/educator/testing",
  "/educator/test-series",
  "/educator/question-bank",
  "/educator/scheduled-tests",
  "/educator/scheduled-dpps",
  "/educator/dpp",
  "/educator/access-codes",
  "/educator/reported-questions",
  "/educator/review-submissions",
  "/educator/proctoring",
  "/educator/exam-grading",
  "/educator/question-papers",
];

type Ctx = { workspace: EducatorWorkspace; setWorkspace: (w: EducatorWorkspace) => void };

const EducatorWorkspaceContext = createContext<Ctx | null>(null);

export function EducatorWorkspaceProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [workspace, setWorkspaceState] = useState<EducatorWorkspace>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as EducatorWorkspace | null;
      if (stored === "lms" || stored === "test") return stored;
    } catch {
      // localStorage unavailable — fall through to path-based default
    }
    return TEST_PLATFORM_PATH_PREFIXES.some((p) => location.pathname.startsWith(p))
      ? "test"
      : "lms";
  });

  const setWorkspace = (next: EducatorWorkspace) => {
    setWorkspaceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — per-viewer convenience only
    }
    navigate(next === "test" ? "/educator/testing" : "/educator/dashboard");
  };

  const value = useMemo(() => ({ workspace, setWorkspace }), [workspace]);

  return (
    <EducatorWorkspaceContext.Provider value={value}>{children}</EducatorWorkspaceContext.Provider>
  );
}

export function useEducatorWorkspace(): Ctx {
  const ctx = useContext(EducatorWorkspaceContext);
  if (!ctx) throw new Error("useEducatorWorkspace must be used within EducatorWorkspaceProvider");
  return ctx;
}
