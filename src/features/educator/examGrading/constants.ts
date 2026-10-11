// Shared between ExamGradingList.tsx and ExamGradingReview.tsx so "flagged for
// review" means the same thing in both places. Matches grade-engine's own
// approve-all default (review_routes.py's approve_all, min_confidence=0.85) —
// below this, the AI's own bulk-accept wouldn't touch it either.
export const FLAGGED_CONFIDENCE = 0.85;
