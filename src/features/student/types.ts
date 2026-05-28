export type AIReview = {
  overallAnalysis: string;
  strengths: string[];
  weakAreas: string[];
  suggestions: string[];
  nextTestRecommendations: string[];
};

export type AttemptStatus = "completed" | "in-progress" | "expired";

export type Attempt = {
  id: string;
  testId: string;
  testTitle: string;
  subject: string;
  score: number;
  maxScore: number;
  accuracy: number;
  timeSpent: number;
  rank: number;
  totalParticipants: number;
  status: AttemptStatus;
  createdAt: string;
  completedAt?: string;
  sectionScores?: { sectionName: string; score: number; maxScore: number }[];
  aiReviewStatus?: "queued" | "in-progress" | "completed" | "failed";
};

export type Test = {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  questionsCount: number;
  difficulty: "Easy" | "Medium" | "Hard";
  level?: string;
  isLocked?: boolean;
  price: number;
  attemptsAllowed?: number;
  maxAttempts?: number;
  windowExpiresAt?: number | null;
};
