type AiFeatureName = "pdfImport" | "websiteContent" | "performanceAnalysis" | "subjectiveEvaluation";

const FALSE_LIKE_VALUES = new Set(["0", "false", "off", "no", "disabled"]);

function parseEnvFlag(rawValue: unknown, defaultValue = true): boolean {
  if (typeof rawValue === "boolean") return rawValue;
  if (typeof rawValue !== "string") return defaultValue;

  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return !FALSE_LIKE_VALUES.has(normalized);
}

export const aiFeatureFlags = {
  pdfImport: parseEnvFlag(import.meta.env.VITE_AI_PDF_IMPORT_ENABLED, true),
  websiteContent: parseEnvFlag(import.meta.env.VITE_AI_WEBSITE_CONTENT_ENABLED, true),
  performanceAnalysis: parseEnvFlag(import.meta.env.VITE_AI_PERFORMANCE_ANALYSIS_ENABLED, true),
  subjectiveEvaluation: parseEnvFlag(import.meta.env.VITE_AI_SUBJECTIVE_EVALUATION_ENABLED, true),
};

const AI_FEATURE_DISABLED_MESSAGES: Record<AiFeatureName, string> = {
  pdfImport: "AI PDF import is currently disabled by configuration.",
  websiteContent: "AI website content generation is currently disabled by configuration.",
  performanceAnalysis: "AI performance analysis is currently disabled by configuration.",
  subjectiveEvaluation: "AI subjective answer evaluation is currently disabled by configuration.",
};

export function getAiFeatureDisabledMessage(feature: AiFeatureName): string {
  return AI_FEATURE_DISABLED_MESSAGES[feature];
}
