import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type StudentWorkspace = "course" | "test";

const STORAGE_KEY = "pk_student_workspace";

const TEST_PLATFORM_PATH_PREFIXES = [
  "/student/tests",
  "/student/my-results",
  "/student/attempts",
  "/student/results",
  "/student/reports",
  "/student/rankings",
  "/student/practice",
  "/student/exam-results",
];

type Ctx = { workspace: StudentWorkspace; setWorkspace: (w: StudentWorkspace) => void };

const StudentWorkspaceContext = createContext<Ctx | null>(null);

export function StudentWorkspaceProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [workspace, setWorkspaceState] = useState<StudentWorkspace>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as StudentWorkspace | null;
      if (stored === "course" || stored === "test") return stored;
    } catch {
      // localStorage unavailable — fall through to path-based default
    }
    return TEST_PLATFORM_PATH_PREFIXES.some((p) => location.pathname.startsWith(p))
      ? "test"
      : "course";
  });

  const setWorkspace = (next: StudentWorkspace) => {
    setWorkspaceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — per-viewer convenience only
    }
    navigate(next === "test" ? "/student/tests" : "/student/dashboard");
  };

  const value = useMemo(() => ({ workspace, setWorkspace }), [workspace]);

  return (
    <StudentWorkspaceContext.Provider value={value}>{children}</StudentWorkspaceContext.Provider>
  );
}

export function useStudentWorkspace(): Ctx {
  const ctx = useContext(StudentWorkspaceContext);
  if (!ctx) throw new Error("useStudentWorkspace must be used within StudentWorkspaceProvider");
  return ctx;
}
