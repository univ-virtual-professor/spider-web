import type { TestSection, TestQuestion, EditorDraftSnapshot } from "./QuestionManagerTypes";
import { normalizeQuestionType } from "@shared/lib/questionTypes";

export const IMG_TAG_REGEX = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function buildSnapshotFromQuestion(question?: TestQuestion): EditorDraftSnapshot {
  if (!question) {
    return {
      question: "",
      options: ["", "", "", ""],
      correct: 0,
      difficulty: "medium",
      subject: "",
      chapter: "",
      topic: "",
      marks: "",
      negativeMarks: "",
      active: true,
      questionType: "MCQ_SINGLE",
      referenceAnswer: "",
      referenceKeywords: "",
      referenceAnswerFileUrl: "",
      evaluationInstructions: "",
    };
  }

  const options = normalizeOptionsForSnapshot(question.options || []);
  const parsedCorrect = Number.isFinite(question.correctOption) ? question.correctOption : 0;

  return {
    question: question.question || "",
    options,
    correct: Math.min(Math.max(0, parsedCorrect), options.length - 1),
    difficulty: question.difficulty || "medium",
    subject: question.subject || "",
    chapter: question.chapter || "",
    topic: question.topic || "",
    marks: question.marks != null ? String(question.marks) : "",
    negativeMarks: question.negativeMarks != null ? String(question.negativeMarks) : "",
    active: isQuestionPublished(question.isActive),
    questionType: normalizeQuestionType(question.questionType),
    referenceAnswer: question.referenceAnswer || "",
    referenceKeywords: Array.isArray(question.referenceKeywords)
      ? question.referenceKeywords.join(", ")
      : "",
    referenceAnswerFileUrl: question.referenceAnswerFileUrl || "",
    evaluationInstructions: question.evaluationInstructions || "",
  };
}

export function areSnapshotsEqual(a: EditorDraftSnapshot, b: EditorDraftSnapshot) {
  if (a.question !== b.question) return false;
  if (a.correct !== b.correct) return false;
  if (a.difficulty !== b.difficulty) return false;
  if (a.subject !== b.subject) return false;
  if (a.chapter !== b.chapter) return false;
  if (a.topic !== b.topic) return false;
  if (a.marks !== b.marks) return false;
  if (a.negativeMarks !== b.negativeMarks) return false;
  if (a.active !== b.active) return false;
  if (a.questionType !== b.questionType) return false;
  if (a.referenceAnswer !== b.referenceAnswer) return false;
  if (a.referenceKeywords !== b.referenceKeywords) return false;
  if (a.referenceAnswerFileUrl !== b.referenceAnswerFileUrl) return false;
  if (a.evaluationInstructions !== b.evaluationInstructions) return false;
  if (a.options.length !== b.options.length) return false;
  for (let i = 0; i < a.options.length; i += 1) {
    if (a.options[i] !== b.options[i]) return false;
  }
  return true;
}

export function stripHtml(input: string) {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitPreviewContent(raw: string): { text: string; imageUrls: string[] } {
  if (!raw) return { text: "", imageUrls: [] };

  const imageUrls: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(IMG_TAG_REGEX.source, "gi");

  while ((match = regex.exec(raw)) !== null) {
    if (match[1]) imageUrls.push(match[1]);
  }

  const text = raw
    .replace(new RegExp(IMG_TAG_REGEX.source, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, imageUrls };
}

export function isQuestionPublished(isActive?: boolean) {
  return isActive !== false;
}

export function getPublishStatusLabel(isActive?: boolean) {
  return isQuestionPublished(isActive) ? "Published" : "Draft";
}

export function hasPreviewContent(raw: string) {
  if (!raw) return false;
  const imageRegex = new RegExp(IMG_TAG_REGEX.source, "gi");
  if (imageRegex.test(raw)) return true;
  return (
    raw
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim().length > 0
  );
}

export function combinePreviewContent(text: string, imageUrls: string[]) {
  if (imageUrls.length === 0) return text;
  const tags = imageUrls.map((url) => `<img src="${url}" alt="" />`).join("\n");
  if (!text) return tags;
  return text.endsWith("\n") ? `${text}${tags}` : `${text}\n${tags}`;
}

export function normalizeOptionsForSnapshot(options: string[] = []) {
  const normalized = options.slice(0, 6).map((value) => String(value ?? ""));
  while (normalized.length < 4) normalized.push("");
  return normalized;
}

function clampDifficulty(level?: number) {
  if (!Number.isFinite(Number(level))) return 0.5;
  return Math.min(1, Math.max(0, Number(level)));
}

export function normalizeSections(rawSections: any, subjectFallback?: string): TestSection[] {
  const parsed = Array.isArray(rawSections)
    ? rawSections
        .map((section: any, index: number) => ({
          id: String(section?.id || `sec_${index + 1}`).trim(),
          name: String(section?.name || `Section ${index + 1}`).trim(),
          questionsCount: Number.isFinite(Number(section?.questionsCount))
            ? Number(section.questionsCount)
            : null,
          topics: Array.isArray(section?.topics) ? section.topics.map(String).filter(Boolean) : [],
          format: section?.format ? String(section.format) : undefined,
          markingScheme: section?.markingScheme ?? undefined,
          difficultyLevel: clampDifficulty(section?.difficultyLevel),
        }))
        .filter((section) => section.id)
    : [];

  if (parsed.length > 0) return parsed;

  return [
    {
      id: "main",
      name: String(subjectFallback || "General").trim() || "General",
      questionsCount: null,
      topics: [],
      format: undefined,
      markingScheme: undefined,
      difficultyLevel: 0.5,
    },
  ];
}

export function resolveSectionId(sectionId: string | undefined, sections: TestSection[]): string {
  const fallback = sections[0]?.id || "main";
  const normalized = String(sectionId || "").trim();
  if (!normalized) return fallback;
  return sections.some((section) => section.id === normalized) ? normalized : fallback;
}
