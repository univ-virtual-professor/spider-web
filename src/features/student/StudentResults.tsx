import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trophy, Target, Clock, TrendingUp, Eye, BrainCircuit } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Progress } from "@shared/ui/progress";
import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

type AttemptResponse = {
  answer: string | null;
  markedForReview: boolean;
  visited: boolean;
  answered: boolean;
  aiEvaluation?: {
    score: number;
    maxScore: number;
    confidence: number;
    feedback: string;
    evaluatedAt?: number;
  };
};

type AttemptDoc = {
  studentId: string;
  educatorId: string;
  tenantSlug?: string | null;

  testId: string;
  testTitle?: string;
  subject?: string;

  status?: "in_progress" | "submitted";

  durationSec?: number;
  startedAtMs?: number;
  timeTakenSec?: number;

  score?: number;
  maxScore?: number;
  accuracy?: number; // may be 0..1 or 0..100

  responses?: Record<string, AttemptResponse>;

  rank?: number;
  totalParticipants?: number;

  hasSubjectiveQuestions?: boolean;
  subjectiveEvaluatedCount?: number;
};

type QuestionDoc = {
  sectionId?: string;
  type?: "mcq" | "integer";
  questionType?: string; // "MCQ" | "SHORT_ANSWER" | "UPLOAD"
  question?: string;
  text?: string;
  options?: string[];
  correctOptionIndex?: number;
  correctAnswer?: string | number;
  explanation?: string;
  positiveMarks?: number;
  negativeMarks?: number;
  marks?: number;
  questionOrder?: number;
  referenceAnswer?: string;
  referenceKeywords?: string[];
};

type TestDoc = {
  title?: string;
  subject?: string;
  durationMinutes?: number;
  sections?: { id: string; name: string }[];
};

type SectionScore = { sectionName: string; score: number; maxScore: number };

function safeNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseMcqCorrectIndex(value: any, optionCount: number): number | null {
  if (value === null || value === undefined) return null;

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    if (asNumber >= 0 && asNumber < optionCount) return Math.trunc(asNumber);
    if (asNumber >= 1 && asNumber <= optionCount) return Math.trunc(asNumber - 1);
  }

  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;

  const letterMatch = raw.match(/^(?:OPTION\s*)?([A-Z])$/);
  if (letterMatch) {
    const idx = letterMatch[1].charCodeAt(0) - 65;
    if (idx >= 0 && idx < optionCount) return idx;
  }

  return null;
}

function normalizeAccuracyPercent(val: any, fallback = 0) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const pct = n <= 1.01 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  return `${mins} min`;
}

function isAnswered(val: any) {
  return val !== null && val !== undefined && String(val).trim() !== "";
}

function computeFromQuestionsAndResponses(
  questions: { id: string; data: QuestionDoc }[],
  responses: Record<string, AttemptResponse>,
  sectionNameById: Record<string, string>
) {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;

  const perSection: Record<string, { score: number; maxScore: number }> = {};

  for (const q of questions) {
    const d = q.data;
    const sectionId = d.sectionId || "main";
    const pos = safeNumber((d as any).marks ?? d.positiveMarks, 5);
    const neg = Math.abs(safeNumber(d.negativeMarks, 1));

    maxScore += pos;
    perSection[sectionId] = perSection[sectionId] || { score: 0, maxScore: 0 };
    perSection[sectionId].maxScore += pos;

    const userAnswer = responses[q.id]?.answer ?? null;

    if (!isAnswered(userAnswer)) continue;

    const qType = (d.questionType || "").toUpperCase();
    const isSubjective = qType === "SHORT_ANSWER" || qType === "UPLOAD";

    if (isSubjective) {
      const aiScore = responses[q.id]?.aiEvaluation?.score;
      if (Number.isFinite(Number(aiScore))) {
        const safeScore = safeNumber(aiScore, 0);
        score += safeScore;
        perSection[sectionId].score += safeScore;
      }
      continue;
    }

    const type = d.type === "integer" ? "integer" : "mcq";
    let isCorrect = false;

    if (type === "integer") {
      isCorrect = String(userAnswer).trim() === String(d.correctAnswer ?? "").trim();
    } else {
      const optionCount = Array.isArray(d.options) && d.options.length ? d.options.length : 4;
      const correctIndex = parseMcqCorrectIndex(
        (d as any).correctOption ?? d.correctOptionIndex ?? d.correctAnswer,
        optionCount
      );
      isCorrect = String(userAnswer) === String(correctIndex ?? 0);
    }

    if (isCorrect) {
      score += pos;
      perSection[sectionId].score += pos;
      correctCount += 1;
    } else {
      score -= neg;
      perSection[sectionId].score -= neg;
      incorrectCount += 1;
    }
  }

  const attempted = correctCount + incorrectCount;
  const accuracyPct = attempted > 0 ? Math.round((correctCount / attempted) * 100) : 0;

  const sectionScores: SectionScore[] = Object.keys(perSection).map((sid) => ({
    sectionName: sectionNameById[sid] || sid,
    score: perSection[sid].score,
    maxScore: perSection[sid].maxScore,
  }));

  return { score, maxScore, accuracyPct, sectionScores };
}

export default function StudentResults() {
  const { attemptId } = useParams();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<AttemptDoc | null>(null);
  const [sectionScores, setSectionScores] = useState<SectionScore[]>([]);
  const [computedScore, setComputedScore] = useState<number | null>(null);
  const [computedMaxScore, setComputedMaxScore] = useState<number | null>(null);
  const [computedAccuracyPct, setComputedAccuracyPct] = useState<number | null>(null);

  const [questionsData, setQuestionsData] = useState<{ id: string; data: QuestionDoc }[]>([]);
  const [sectionNameMap, setSectionNameMap] = useState<Record<string, string>>({});

  const rank = attempt?.rank ?? 0;
  const totalParticipants = attempt?.totalParticipants ?? 0;

  const percentileText = useMemo(() => {
    if (!rank || !totalParticipants) return "—";
    const top = Math.round((rank / totalParticipants) * 100);
    return `Top ${top}%`;
  }, [rank, totalParticipants]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!attemptId) {
        setError("Missing attempt id");
        setLoading(false);
        return;
      }
      if (authLoading) return;
      if (!firebaseUser) {
        setError("Please login to view your results.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1) Attempt
        const aSnap = await getDoc(doc(db, "attempts", attemptId));
        if (!aSnap.exists()) throw new Error("Attempt not found.");

        const a = aSnap.data() as AttemptDoc;

        // student can only view their own attempt
        if (a.studentId !== firebaseUser.uid)
          throw new Error("You don't have permission to view this attempt.");

        if (!a.educatorId || !a.testId) throw new Error("Attempt is missing test reference.");

        let testData: TestDoc | null = null;
        let qs: { id: string; data: QuestionDoc }[] = [];

        const educatorTestSnap = await getDoc(
          doc(db, "educators", a.educatorId, "my_tests", a.testId)
        );

        if (educatorTestSnap.exists()) {
          const localTest = educatorTestSnap.data() as any;
          const linkedAdminTestId = String(
            localTest?.linkedAdminTestId || localTest?.originalTestId || ""
          ).trim();
          const isAdminLinked =
            localTest?.originSource === "admin" ||
            localTest?.source === "imported" ||
            localTest?.source === "linked_admin" ||
            localTest?.isQuestionSourceShared === true ||
            Boolean(linkedAdminTestId);

          if (isAdminLinked && linkedAdminTestId) {
            const adminTestSnap = await getDoc(doc(db, "test_series", linkedAdminTestId));
            if (adminTestSnap.exists()) {
              testData = adminTestSnap.data() as TestDoc;
            } else {
              testData = localTest as TestDoc;
            }

            const qSnap = await getDocs(
              collection(db, "test_series", linkedAdminTestId, "questions")
            );
            qs = qSnap.docs.map((d) => ({ id: d.id, data: d.data() as QuestionDoc }));
          } else {
            testData = localTest as TestDoc;
            const qSnap = await getDocs(
              collection(db, "educators", a.educatorId, "my_tests", a.testId, "questions")
            );
            qs = qSnap.docs.map((d) => ({ id: d.id, data: d.data() as QuestionDoc }));
          }
        }

        if (!testData || !qs.length) {
          const globalTestSnap = await getDoc(doc(db, "test_series", a.testId));
          if (globalTestSnap.exists()) {
            testData = globalTestSnap.data() as TestDoc;
            const qSnap = await getDocs(collection(db, "test_series", a.testId, "questions"));
            qs = qSnap.docs.map((d) => ({ id: d.id, data: d.data() as QuestionDoc }));
          }
        }

        qs = qs.sort((a, b) => {
          const aOrder = safeNumber(a.data.questionOrder, Number.MAX_SAFE_INTEGER);
          const bOrder = safeNumber(b.data.questionOrder, Number.MAX_SAFE_INTEGER);
          return aOrder - bOrder;
        });

        if (!testData) throw new Error("Test not found for this attempt.");
        if (!qs.length) throw new Error("Questions not found for this attempt.");

        // Build section name mapping
        const sectionNameById: Record<string, string> = {};
        if (Array.isArray(testData.sections) && testData.sections.length) {
          testData.sections.forEach((s) => (sectionNameById[s.id] = s.name));
        } else {
          // fallback
          sectionNameById["main"] = testData.subject || "General";
        }

        const resp = a.responses || {};
        const derived = computeFromQuestionsAndResponses(qs, resp, sectionNameById);

        if (!mounted) return;

        // Store questions data for AI analysis and subjective display
        setQuestionsData(qs);
        setSectionNameMap(sectionNameById);

        // prefer stored values when present, otherwise computed
        setAttempt({
          ...a,
          testTitle: a.testTitle || testData.title || "Untitled Test",
          subject: a.subject || testData.subject || "General",
        });

        setSectionScores(derived.sectionScores);

        setComputedScore(typeof a.score === "number" ? a.score : derived.score);
        setComputedMaxScore(typeof a.maxScore === "number" ? a.maxScore : derived.maxScore);

        const storedAcc =
          typeof a.accuracy === "number" ? normalizeAccuracyPercent(a.accuracy) : null;
        setComputedAccuracyPct(storedAcc ?? derived.accuracyPct);
      } catch (e: any) {
        console.error(e);
        if (!mounted) return;
        setError(e?.message || "Failed to load results.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [attemptId, firebaseUser, authLoading]);

  if (loading || authLoading) return <div className="py-12 text-center">Loading...</div>;
  if (error) return <div className="py-12 text-center">{error}</div>;
  if (!attempt) return <div className="py-12 text-center">Attempt not found.</div>;

  const score = computedScore ?? 0;
  const maxScore = computedMaxScore ?? 0;
  const accuracyPct = computedAccuracyPct ?? 0;
  const timeSpentSec = safeNumber(attempt.timeTakenSec, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" asChild>
        <Link to="/student/attempts">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Attempts
        </Link>
      </Button>

      {/* Score Header */}
      <Card className="card-soft border-0 bg-gradient-to-r from-pastel-mint to-pastel-lavender">
        <CardContent className="p-6 text-center">
          <h1 className="mb-2 text-2xl font-bold">{attempt.testTitle || "Test"}</h1>
          <div className="gradient-text mb-2 text-5xl font-bold">
            {score}/{maxScore}
          </div>
          <p className="text-muted-foreground">Your Score</p>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="card-soft border-0 bg-pastel-yellow">
          <CardContent className="p-4 text-center">
            <Target className="mx-auto mb-2 h-6 w-6 text-primary" />
            <p className="text-2xl font-bold">{accuracyPct}%</p>
            <p className="text-xs text-muted-foreground">Accuracy</p>
          </CardContent>
        </Card>

        <Card className="card-soft border-0 bg-pastel-lavender">
          <CardContent className="p-4 text-center">
            <Trophy className="mx-auto mb-2 h-6 w-6 text-yellow-500" />
            <p className="text-2xl font-bold">{rank ? `#${rank}` : "—"}</p>
            <p className="text-xs text-muted-foreground">Rank</p>
          </CardContent>
        </Card>

        <Card className="card-soft border-0 bg-pastel-peach">
          <CardContent className="p-4 text-center">
            <Clock className="mx-auto mb-2 h-6 w-6 text-primary" />
            <p className="text-2xl font-bold">{formatTime(timeSpentSec)}</p>
            <p className="text-xs text-muted-foreground">Time Spent</p>
          </CardContent>
        </Card>

        <Card className="card-soft border-0 bg-pastel-mint">
          <CardContent className="p-4 text-center">
            <TrendingUp className="mx-auto mb-2 h-6 w-6 text-green-600" />
            <p className="text-2xl font-bold">{percentileText}</p>
            <p className="text-xs text-muted-foreground">Percentile</p>
          </CardContent>
        </Card>
      </div>

      {/* Section Breakdown */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle>Section-wise Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sectionScores.length === 0 ? (
            <div className="text-sm text-muted-foreground">No section breakdown available.</div>
          ) : (
            sectionScores.map((section, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{section.sectionName}</span>
                  <span className="font-medium">
                    {section.score}/{section.maxScore}
                  </span>
                </div>
                <Progress
                  value={section.maxScore ? (section.score / section.maxScore) * 100 : 0}
                  className="h-2"
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* AI-Evaluated Answers Card */}
      {attempt.hasSubjectiveQuestions &&
        attempt.responses &&
        (() => {
          if (!questionsData.length) return null;

          const responsesMap = attempt.responses || {};
          const sectionOrder = Array.from(
            new Set(questionsData.map((q) => String(q.data.sectionId || "main")))
          );

          const sections = sectionOrder
            .map((sectionId) => {
              let indexInSection = 0;
              const items = questionsData
                .filter((q) => String(q.data.sectionId || "main") === sectionId)
                .map((q) => {
                  const resp = responsesMap[q.id];
                  if (!resp?.aiEvaluation) return null;
                  indexInSection += 1;
                  const questionType = String(q.data.questionType || "").toUpperCase();
                  return {
                    qId: q.id,
                    index: indexInSection,
                    questionText: String(
                      q.data.question || q.data.text || `Question ${indexInSection}`
                    ),
                    questionType,
                    score: resp.aiEvaluation.score,
                    maxScore: resp.aiEvaluation.maxScore,
                    confidence: resp.aiEvaluation.confidence,
                    feedback: resp.aiEvaluation.feedback,
                  };
                })
                .filter(Boolean) as Array<{
                qId: string;
                index: number;
                questionText: string;
                questionType: string;
                score: number;
                maxScore: number;
                confidence: number;
                feedback: string;
              }>;
              return { sectionId, sectionName: sectionNameMap[sectionId] || sectionId, items };
            })
            .filter((s) => s.items.length > 0);

          if (!sections.length) return null;

          const allItems = sections.flatMap((s) => s.items);
          const totalSubjScore = allItems.reduce((acc, e) => acc + e.score, 0);
          const totalSubjMax = allItems.reduce((acc, e) => acc + e.maxScore, 0);

          const confidencePill = (confidence: number) => {
            if (confidence >= 0.8) return "bg-green-100 text-green-700";
            if (confidence >= 0.5) return "bg-amber-100 text-amber-700";
            return "bg-red-100 text-red-600";
          };

          return (
            <Card className="card-soft border-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-purple-600" />
                  AI-Evaluated Answers
                  <span className="ml-auto text-base font-semibold text-purple-600">
                    {totalSubjScore.toFixed(1)}{" "}
                    <span className="font-normal text-muted-foreground">/ {totalSubjMax}</span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {sections.map((section) => (
                  <div key={section.sectionId} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{section.sectionName}</p>
                      <span className="text-xs text-muted-foreground">
                        {section.items.length} evaluated
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.items.map((entry) => (
                        <div key={entry.qId} className="space-y-2 rounded-xl border p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 text-sm font-semibold">Q{entry.index}</span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                  entry.questionType === "UPLOAD"
                                    ? "border-purple-200 bg-purple-100 text-purple-700"
                                    : "border-orange-200 bg-orange-100 text-orange-700"
                                }`}
                              >
                                {entry.questionType === "UPLOAD" ? "Upload" : "Short Answer"}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${confidencePill(entry.confidence)}`}
                              >
                                {Math.round(entry.confidence * 100)}% confidence
                              </span>
                              <span
                                className={`text-sm font-bold ${
                                  entry.score >= entry.maxScore * 0.7
                                    ? "text-green-600"
                                    : entry.score >= entry.maxScore * 0.4
                                      ? "text-amber-600"
                                      : "text-red-500"
                                }`}
                              >
                                {entry.score.toFixed(1)}{" "}
                                <span className="text-xs font-normal text-muted-foreground">
                                  / {entry.maxScore}
                                </span>
                              </span>
                            </div>
                          </div>
                          <Progress
                            value={entry.maxScore ? (entry.score / entry.maxScore) * 100 : 0}
                            className="h-1.5"
                          />
                          <details className="group">
                            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                              <span className="group-open:hidden">▶ Show AI feedback</span>
                              <span className="hidden group-open:inline">▼ Hide feedback</span>
                            </summary>
                            <p className="mt-2 border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
                              {entry.feedback}
                            </p>
                          </details>
                          {entry.confidence < 0.5 && (
                            <p className="text-[10px] text-amber-600">
                              ⚠ Low confidence — may require manual review
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })()}

      {/* Actions */}
      <div className="flex gap-4">
        <Button variant="outline" className="flex-1 rounded-xl" asChild>
          <Link to={`/student/attempts/${attemptId}`}>
            <Eye className="mr-2 h-4 w-4" />
            Review Answers
          </Link>
        </Button>

        <Button className="gradient-bg flex-1 rounded-xl" asChild>
          <Link to="/student/tests">Take Another Test</Link>
        </Button>
      </div>
    </div>
  );
}
