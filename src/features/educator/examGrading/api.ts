// Grade-engine (exam paper grading) + monkey-king (student roster) API clients
// for the educator exam-grading flow. Follows the same hand-written fetch +
// Firebase ID token pattern used everywhere else in the app (see
// QuestionPaperRequests.tsx) — grade-engine verifies the same Firebase
// project's tokens directly, no proxy through monkey-king needed.

const GRADE_ENGINE_API = import.meta.env.VITE_GRADE_ENGINE_API_URL?.replace(/\/+$/, "");
const MONKEY_KING_API = import.meta.env.VITE_MONKEY_KING_API_URL?.replace(/\/+$/, "");

export type Exam = {
  id: string;
  educator_uid: string;
  title: string;
  subject: string;
  school_id: string | null;
  status: string;
  results_released: boolean;
  results_released_at: string | null;
  created_at: string;
};

export type ExamQuestion = {
  id: string;
  exam_id: string;
  question_no: string;
  question_text: string | null;
  max_marks: number;
  marking_scheme: string;
  model_hint: string;
  sort_order: number;
};

export type PageImage = {
  id: string;
  imagekit_url: string;
  page_number: number;
};

export type AnswerSheet = {
  id: string;
  exam_id: string;
  student_name: string;
  student_roll: string | null;
  student_uid: string | null;
  status: string;
  pipeline_stage: string | null;
  error_message: string | null;
  total_marks_awarded: number | null;
  total_max_marks: number | null;
};

export type Step = { title: string; marks_awarded: number; max_marks: number; note: string };
export type Highlight = { box_2d: [number, number, number, number]; note: string };

export type Grading = {
  id: string;
  answer_sheet_id: string;
  question_no: string;
  question_text: string | null;
  status: "graded" | "not_attempted" | "failed" | "approved";
  marks_awarded: number | null;
  max_marks: number | null;
  confidence: number | null;
  feedback: string | null;
  annotation_json: { steps: Step[]; highlights_wrong: Highlight[] } | null;
  model_used: string | null;
  cropped_image_url: string | null;
  annotated_image_url: string | null;
  teacher_approved: boolean;
};

export type RosterStudent = {
  uid: string;
  name: string;
  email: string;
  status: string;
  branch_id: string | null;
  course_id: string | null;
  batch_id: string | null;
};

async function withAuth(token: string | undefined, init: RequestInit = {}): Promise<RequestInit> {
  return { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } };
}

async function gradeEngineFetch(token: string | undefined, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GRADE_ENGINE_API}${path}`, await withAuth(token, init));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

async function gradeEngineJson(
  token: string | undefined,
  path: string,
  body: unknown,
  method = "POST"
) {
  return gradeEngineFetch(token, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── exams ──────────────────────────────────────────────────────────────────

export const listExams = (token: string | undefined) =>
  gradeEngineFetch(token, "/api/exams/") as Promise<Exam[]>;

export const createExam = (token: string | undefined, title: string, subject: string) =>
  gradeEngineJson(token, "/api/exams/", { title, subject }) as Promise<Exam>;

export const getExam = (token: string | undefined, examId: string) =>
  gradeEngineFetch(token, `/api/exams/${examId}`) as Promise<Exam>;

export const listQuestions = (token: string | undefined, examId: string) =>
  gradeEngineFetch(token, `/api/exams/${examId}/questions`) as Promise<ExamQuestion[]>;

export type QuestionInput = {
  question_no: string;
  question_text?: string;
  max_marks: number;
  marking_scheme: string;
};

export const setQuestions = (
  token: string | undefined,
  examId: string,
  questions: QuestionInput[]
) =>
  gradeEngineJson(token, `/api/exams/${examId}/questions`, { questions }) as Promise<
    ExamQuestion[]
  >;

// Reads the exam's already-uploaded question paper photos with Gemini and
// persists question_no/max_marks/marking_scheme — same full-replace
// semantics and response shape as setQuestions, just derived from the
// photos instead of typed in. Throws (via gradeEngineFetch) with a
// user-facing message when no question paper has been uploaded yet, or the
// extraction found nothing usable.
export const extractQuestionsFromPaper = (token: string | undefined, examId: string) =>
  gradeEngineFetch(token, `/api/exams/${examId}/question-paper/extract`, {
    method: "POST",
  }) as Promise<ExamQuestion[]>;

// Test-level "release to students" step (business rules #3 + #8) — until
// called, no student can see ANY grading for this exam regardless of
// individual sheet/question status. See grade-engine's CLAUDE.md.
export const releaseResults = (token: string | undefined, examId: string) =>
  gradeEngineFetch(token, `/api/exams/${examId}/release-results`, {
    method: "POST",
  }) as Promise<Exam>;

export const unreleaseResults = (token: string | undefined, examId: string) =>
  gradeEngineFetch(token, `/api/exams/${examId}/unrelease-results`, {
    method: "POST",
  }) as Promise<Exam>;

// ── uploads (multiple images OR a single PDF) ───────────────────────────────

function filesFormData(files: File[]): FormData {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return fd;
}

export const uploadQuestionPaper = (token: string | undefined, examId: string, files: File[]) =>
  gradeEngineFetch(token, `/api/upload/exams/${examId}/question-paper`, {
    method: "POST",
    body: filesFormData(files),
  }) as Promise<PageImage[]>;

export const uploadAnswerKey = (token: string | undefined, examId: string, files: File[]) =>
  gradeEngineFetch(token, `/api/upload/exams/${examId}/answer-key`, {
    method: "POST",
    body: filesFormData(files),
  }) as Promise<PageImage[]>;

export const listQuestionPaperPages = (token: string | undefined, examId: string) =>
  gradeEngineFetch(token, `/api/upload/exams/${examId}/question-paper`) as Promise<PageImage[]>;

export const listAnswerKeyPages = (token: string | undefined, examId: string) =>
  gradeEngineFetch(token, `/api/upload/exams/${examId}/answer-key`) as Promise<PageImage[]>;

export const createAnswerSheet = (
  token: string | undefined,
  examId: string,
  body: { student_name: string; student_roll?: string; student_uid?: string }
) =>
  gradeEngineJson(token, `/api/upload/exams/${examId}/answer-sheets`, body) as Promise<AnswerSheet>;

export const uploadAnswerSheetPages = (token: string | undefined, sheetId: string, files: File[]) =>
  gradeEngineFetch(token, `/api/upload/answer-sheets/${sheetId}/pages`, {
    method: "POST",
    body: filesFormData(files),
  }) as Promise<PageImage[]>;

// ── grading ─────────────────────────────────────────────────────────────────

export const listAnswerSheets = (token: string | undefined, examId: string) =>
  gradeEngineFetch(token, `/api/grading/exams/${examId}/summary`) as Promise<{
    exam_id: string;
    total_students: number;
    students: {
      sheet_id: string;
      student_name: string;
      student_roll: string | null;
      status: string;
      total_marks_awarded: number | null;
      total_max_marks: number | null;
    }[];
  }>;

export const startGrading = (
  token: string | undefined,
  sheetId: string,
  mode: "instant" | "batch" = "instant"
) =>
  gradeEngineFetch(token, `/api/grading/answer-sheets/${sheetId}/start?mode=${mode}`, {
    method: "POST",
  }) as Promise<{
    ok: boolean;
    status: string;
    mode: string;
  }>;

export const getStatus = (token: string | undefined, sheetId: string) =>
  gradeEngineFetch(token, `/api/grading/answer-sheets/${sheetId}/status`) as Promise<{
    status: string;
    pipeline_stage: string | null;
    error_message: string | null;
  }>;

export const getResults = (token: string | undefined, sheetId: string) =>
  gradeEngineFetch(token, `/api/grading/answer-sheets/${sheetId}/results`) as Promise<{
    sheet: AnswerSheet;
    gradings: Grading[];
  }>;

export const overrideGrading = (
  token: string | undefined,
  gradingId: string,
  marks: number,
  reason: string
) => gradeEngineJson(token, `/api/review/gradings/${gradingId}/override`, { marks, reason });

export const approveGrading = (token: string | undefined, gradingId: string) =>
  gradeEngineFetch(token, `/api/review/gradings/${gradingId}/approve`, { method: "POST" });

// ── per-step marks (business rule #4: marks are stored per rubric step, the
// per-question total is derived) ────────────────────────────────────────────

export type StepOverride = {
  educator_uid: string;
  original_marks: number | null;
  override_marks: number;
  reason: string | null;
  created_at: string;
};

export type GradingStep = {
  step_id: string;
  step_index: number;
  title: string;
  ai_marks_awarded: number;
  marks_awarded: number;
  max_marks: number;
  note: string | null;
  override: StepOverride | null;
};

export type SheetStepsQuestion = {
  question_grading_id: string;
  question_no: string;
  status: string;
  confidence: number | null;
  teacher_approved: boolean;
  marks_awarded: number | null;
  max_marks: number | null;
  steps: GradingStep[];
};

export const getSheetSteps = (token: string | undefined, sheetId: string) =>
  gradeEngineFetch(token, `/api/review/answer-sheets/${sheetId}/steps`) as Promise<{
    sheet_id: string;
    questions: SheetStepsQuestion[];
  }>;

export const overrideStep = (
  token: string | undefined,
  stepId: string,
  marks: number,
  reason: string
) =>
  gradeEngineJson(token, `/api/review/steps/${stepId}/override`, { marks, reason }) as Promise<{
    ok: boolean;
    step: GradingStep;
  }>;

// ── student roster (monkey-king) ────────────────────────────────────────────

export async function listRosterStudents(
  token: string | undefined,
  filters: { branch_id?: string; course_id?: string; batch_id?: string } = {}
): Promise<RosterStudent[]> {
  const params = new URLSearchParams();
  if (filters.branch_id) params.set("branch_id", filters.branch_id);
  if (filters.course_id) params.set("course_id", filters.course_id);
  if (filters.batch_id) params.set("batch_id", filters.batch_id);
  const qs = params.toString();
  const res = await fetch(
    `${MONKEY_KING_API}/api/org/students${qs ? `?${qs}` : ""}`,
    await withAuth(token)
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load students");
  }
  return res.json();
}
