import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle, Circle, BrainCircuit } from "lucide-react";

import { Card, CardContent, CardHeader } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { cn } from "@shared/lib/utils";
import { HtmlView } from "@shared/lib/safeHtml";
import QuestionActionHoverWrapper from "@shared/components/QuestionActionHoverWrapper";
import { normalizeQuestionType } from "@shared/lib/questionTypes";

import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import { logError } from "@shared/lib/errorLogger";
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
  responses?: Record<string, AttemptResponse>;

  score?: number;
  maxScore?: number;
};

type AttemptQuestion = {
  id: string;
  sectionId: string;
  type: "mcq" | "integer" | "subjective";
  stem: string;
  options?: { id: string; text: string }[];
  correctAnswer?: string; // for mcq => option index as string, for integer => exact string
  explanation?: string;
  marks: { correct: number; incorrect: number }; // incorrect as positive penalty
  passage?: { title: string; content: string } | null;
  sortOrder: number;
};

type TestSection = {
  id: string;
  name: string;
};

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

function mapQuestion(id: string, data: any): AttemptQuestion {
  const rawType = normalizeQuestionType(data.questionType);
  const isSubjective = rawType === "SUBJECTIVE_SHORT" || rawType === "SUBJECTIVE_LONG";
  const isInteger = !isSubjective && data.type === "integer";
  const type: AttemptQuestion["type"] = isSubjective ? "subjective" : isInteger ? "integer" : "mcq";

  const opts: string[] = !isSubjective && Array.isArray(data.options) ? data.options : [];
  const parsedCorrectIndex = isSubjective
    ? null
    : parseMcqCorrectIndex(
        data.correctOption ?? data.correctOptionIndex ?? data.correctAnswer,
        opts.length || 4
      );
  const correctIndex = parsedCorrectIndex ?? 0;

  const positive = data.marks ?? data.positiveMarks ?? 5;
  const negative = Math.abs(data.negativeMarks ?? 1);

  return {
    id,
    sectionId: data.sectionId || "main",
    type,
    stem: data.question || data.text || "",
    options: type === "mcq" ? opts.map((t, i) => ({ id: String(i), text: String(t) })) : undefined,
    correctAnswer: isSubjective ? undefined : String(correctIndex),
    explanation: data.explanation || "",
    marks: { correct: positive, incorrect: negative },
    passage: data.passage || null,
    sortOrder: safeNumber(data.questionOrder, Number.MAX_SAFE_INTEGER),
  };
}

function isAnswered(val: any) {
  return val !== null && val !== undefined && String(val).trim() !== "";
}

function isCorrectAnswer(q: AttemptQuestion, userAnswer: string | null) {
  if (q.type === "subjective") return false; // subjective graded by AI, not boolean correct/incorrect
  if (!isAnswered(userAnswer)) return false;
  if (q.type === "integer")
    return String(userAnswer).trim() === String(q.correctAnswer ?? "").trim();
  return String(userAnswer) === String(q.correctAnswer ?? "");
}

export default function StudentAttemptDetails() {
  const { attemptId } = useParams();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<AttemptDoc | null>(null);
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, AttemptResponse>>({});
  const [sections, setSections] = useState<TestSection[]>([]);

  const title = useMemo(() => attempt?.testTitle || "Attempt Review", [attempt]);

  useEffect(() => {
    let mounted = true;

    async function loadAll() {
      if (!attemptId) {
        setError("Missing attempt id");
        setLoading(false);
        return;
      }
      if (authLoading) return;
      if (!firebaseUser) {
        setError("Please login to view your attempt.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1) Load attempt
        const aSnap = await getDoc(doc(db, "attempts", attemptId));
        if (!aSnap.exists()) throw new Error("Attempt not found.");

        const a = aSnap.data() as AttemptDoc;

        // Security: student can only see their own attempts
        if (a.studentId !== firebaseUser.uid)
          throw new Error("You don't have permission to view this attempt.");

        const educatorId = a.educatorId;
        const testId = a.testId;

        if (!educatorId || !testId) throw new Error("Attempt is missing test reference.");

        let qs: AttemptQuestion[] = [];
        let testSections: TestSection[] = [];

        const educatorTestSnap = await getDoc(doc(db, "educators", educatorId, "my_tests", testId));

        if (educatorTestSnap.exists()) {
          const localTest = educatorTestSnap.data() as any;
          testSections = Array.isArray(localTest?.sections) ? localTest.sections : [];

          const linkedAdminTestId = String(
            localTest?.linkedAdminTestId || localTest?.originalTestId || ""
          ).trim();
          const isAdminLinked =
            localTest?.originSource === "admin" ||
            localTest?.source === "imported" ||
            localTest?.source === "linked_admin" ||
            localTest?.isQuestionSourceShared === true ||
            Boolean(linkedAdminTestId);

          const qCol =
            isAdminLinked && linkedAdminTestId
              ? collection(db, "test_series", linkedAdminTestId, "questions")
              : collection(db, "educators", educatorId, "my_tests", testId, "questions");

          const qSnap = await getDocs(qCol);
          qs = qSnap.docs
            .map((d) => mapQuestion(d.id, d.data()))
            .sort((a, b) => a.sortOrder - b.sortOrder);

          if (isAdminLinked && linkedAdminTestId) {
            const adminTestSnap = await getDoc(doc(db, "test_series", linkedAdminTestId));
            if (adminTestSnap.exists()) {
              const adminSections = adminTestSnap.data()?.sections;
              if (Array.isArray(adminSections) && adminSections.length) {
                testSections = adminSections;
              }
            }
          }
        }

        if (!qs.length) {
          const globalTestSnap = await getDoc(doc(db, "test_series", testId));
          if (!globalTestSnap.exists()) throw new Error("Test not found for this attempt.");
          testSections = Array.isArray(globalTestSnap.data()?.sections)
            ? globalTestSnap.data()?.sections
            : [];

          const qSnap = await getDocs(collection(db, "test_series", testId, "questions"));
          qs = qSnap.docs
            .map((d) => mapQuestion(d.id, d.data()))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        }

        if (!qs.length) throw new Error("Questions not found for this attempt.");

        if (!mounted) return;

        const normalizedSections = testSections.map((s: any, index: number) => ({
          ...s,
          id: String(s?.id || `sec_${index + 1}`).trim() || `sec_${index + 1}`,
          name: String(s?.name || `Section ${index + 1}`).trim(),
        }));

        setAttempt(a);
        setQuestions(qs);
        setResponses(a.responses || {});
        setSections(
          normalizedSections.length > 0
            ? normalizedSections
            : [{ id: "main", name: a.subject || "General" }]
        );
      } catch (e: any) {
        console.error(e);
        logError(e, "attempt-details:load");
        if (!mounted) return;
        setError(e?.message || "Failed to load attempt details.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAll();
    return () => {
      mounted = false;
    };
  }, [attemptId, firebaseUser, authLoading]);

  const questionsBySection = useMemo(() => {
    const map: Record<string, AttemptQuestion[]> = {};
    sections.forEach((s) => (map[s.id] = []));

    // Same resolution logic as QuestionsManager: if a question's sectionId is
    // missing or doesn't match any defined section, place it in the first section.
    const firstSectionId = sections[0]?.id || "main";
    questions.forEach((q) => {
      const raw = String(q.sectionId || "").trim();
      const sid = raw && sections.some((s) => s.id === raw) ? raw : firstSectionId;
      if (!map[sid]) map[sid] = [];
      map[sid].push(q);
    });
    return map;
  }, [questions, sections]);

  const [filter, setFilter] = useState<
    "all" | "correct" | "incorrect" | "unanswered" | "subjective"
  >("all");

  if (loading || authLoading) return <div className="py-12 text-center">Loading...</div>;
  if (error) return <div className="py-12 text-center">{error}</div>;
  if (!attempt) return <div className="py-12 text-center">Attempt not found.</div>;

  const filterCounts = questions.reduce(
    (acc, q) => {
      const userAnswer = responses[q.id]?.answer ?? null;
      const answered = isAnswered(userAnswer);
      if (!answered) acc.unanswered++;
      else if (q.type === "subjective") acc.subjective++;
      else if (isCorrectAnswer(q, userAnswer)) acc.correct++;
      else acc.incorrect++;
      return acc;
    },
    { correct: 0, incorrect: 0, unanswered: 0, subjective: 0 }
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <Button variant="ghost" asChild>
        <Link to={`/student/results/${attemptId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Results
        </Link>
      </Button>

      <Card className="card-soft border-0 bg-pastel-lavender">
        <CardContent className="p-6">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-muted-foreground">Review your answers</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: "All", count: questions.length },
            { key: "correct", label: "Correct", count: filterCounts.correct },
            { key: "incorrect", label: "Incorrect", count: filterCounts.incorrect },
            { key: "unanswered", label: "Unanswered", count: filterCounts.unanswered },
            ...(filterCounts.subjective > 0
              ? [{ key: "subjective", label: "AI Graded", count: filterCounts.subjective }]
              : []),
          ] as const
        ).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
              filter === key
                ? key === "correct"
                  ? "border-green-500 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : key === "incorrect"
                    ? "border-red-500 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : key === "unanswered"
                      ? "border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      : key === "subjective"
                        ? "border-purple-500 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                        : "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {key === "correct" && <CheckCircle className="h-3.5 w-3.5" />}
            {key === "incorrect" && <XCircle className="h-3.5 w-3.5" />}
            {key === "unanswered" && <Circle className="h-3.5 w-3.5" />}
            {key === "subjective" && <BrainCircuit className="h-3.5 w-3.5" />}
            {label}
            <span className="ml-0.5 rounded-full bg-background/60 px-1.5 text-xs">{count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {sections.map((section) => {
          const allSectionQs = questionsBySection[section.id] || [];
          const sectionQs = allSectionQs.filter((q) => {
            if (filter === "all") return true;
            const userAnswer = responses[q.id]?.answer ?? null;
            const answered = isAnswered(userAnswer);
            if (filter === "subjective") return q.type === "subjective";
            if (filter === "unanswered") return !answered && q.type !== "subjective";
            if (filter === "correct")
              return q.type !== "subjective" && answered && isCorrectAnswer(q, userAnswer);
            if (filter === "incorrect")
              return q.type !== "subjective" && answered && !isCorrectAnswer(q, userAnswer);
            return true;
          });
          if (sectionQs.length === 0) return null;

          return (
            <div key={section.id} className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="h-6 w-1 rounded-full bg-primary" />
                <h2 className="text-lg font-bold">{section.name}</h2>
                <Badge variant="outline" className="rounded-full">
                  {sectionQs.length}
                  {filter !== "all" ? ` / ${allSectionQs.length}` : ""} Questions
                </Badge>
              </div>

              <div className="space-y-4">
                {sectionQs.map((q) => {
                  const idx = allSectionQs.indexOf(q);
                  const userAnswer = responses[q.id]?.answer ?? null;
                  const answered = isAnswered(userAnswer);
                  const aiEval = responses[q.id]?.aiEvaluation;

                  const correct = isCorrectAnswer(q, userAnswer);
                  const isSubjective = q.type === "subjective";
                  const isImageAnswer =
                    isSubjective && answered && String(userAnswer).startsWith("https://");

                  const awarded = isSubjective
                    ? aiEval
                      ? aiEval.score
                      : 0
                    : !answered
                      ? 0
                      : correct
                        ? q.marks.correct
                        : -Math.abs(q.marks.incorrect);

                  const cardBg = isSubjective
                    ? "bg-purple-50 dark:bg-purple-900/10"
                    : !answered
                      ? "bg-slate-50 dark:bg-slate-900/10"
                      : correct
                        ? "bg-green-50 dark:bg-green-900/10"
                        : "bg-red-50 dark:bg-red-900/10";

                  return (
                    <QuestionActionHoverWrapper
                      key={q.id}
                      questionId={q.id}
                      contextId={attemptId || ""}
                      questionContent={q.stem}
                    >
                      <Card className={cn("card-soft border-0", cardBg)}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="rounded-full">
                                Q{idx + 1}
                              </Badge>
                              {isSubjective && (
                                <Badge className="rounded-full border border-purple-200 bg-purple-100 text-purple-700">
                                  <BrainCircuit className="mr-1 h-3 w-3" />
                                  AI Graded
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {isSubjective ? (
                                answered ? (
                                  <BrainCircuit className="h-5 w-5 text-purple-600" />
                                ) : (
                                  <Badge className="rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    Unanswered
                                  </Badge>
                                )
                              ) : answered ? (
                                correct ? (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-red-500" />
                                )
                              ) : (
                                <Badge className="rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  Unanswered
                                </Badge>
                              )}

                              <Badge
                                className={cn(
                                  "rounded-full",
                                  isSubjective
                                    ? aiEval
                                      ? "bg-purple-100 text-purple-700"
                                      : "bg-slate-200 text-slate-700"
                                    : !answered
                                      ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                      : correct
                                        ? "bg-green-100 text-green-700"
                                        : "bg-red-100 text-red-700"
                                )}
                              >
                                {isSubjective
                                  ? aiEval
                                    ? `${aiEval.score}/${aiEval.maxScore}`
                                    : "Pending"
                                  : !answered
                                    ? "0"
                                    : awarded > 0
                                      ? `+${awarded}`
                                      : `${awarded}`}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          {!!q.passage && (
                            <div className="rounded-xl bg-pastel-cream p-4">
                              <p className="mb-2 font-semibold">{q.passage.title}</p>
                              <p className="whitespace-pre-line text-sm text-muted-foreground">
                                {q.passage.content}
                              </p>
                            </div>
                          )}

                          <HtmlView html={q.stem} className="font-medium" />

                          {isSubjective && (
                            <div className="space-y-3">
                              <div className="rounded-xl border bg-background/50 p-3">
                                <p className="mb-2 text-sm font-medium text-muted-foreground">
                                  Your Answer
                                </p>
                                {!answered ? (
                                  <p className="text-sm italic text-muted-foreground">
                                    Not answered
                                  </p>
                                ) : isImageAnswer ? (
                                  <img
                                    src={String(userAnswer)}
                                    alt="Your uploaded answer"
                                    className="max-h-80 rounded-lg border object-contain"
                                  />
                                ) : (
                                  <p className="text-sm">{userAnswer}</p>
                                )}
                              </div>
                              {aiEval ? (
                                <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 dark:bg-purple-900/20">
                                  <div className="mb-2 flex items-center justify-between">
                                    <p className="text-sm font-medium text-purple-700">
                                      AI Feedback
                                    </p>
                                    <span
                                      className={cn(
                                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                        aiEval.confidence >= 0.8
                                          ? "bg-green-100 text-green-700"
                                          : aiEval.confidence >= 0.5
                                            ? "bg-amber-100 text-amber-700"
                                            : "bg-red-100 text-red-600"
                                      )}
                                    >
                                      {Math.round(aiEval.confidence * 100)}% confidence
                                    </span>
                                  </div>
                                  <p className="text-sm leading-relaxed text-muted-foreground">
                                    {aiEval.feedback}
                                  </p>
                                  {aiEval.confidence < 0.5 && (
                                    <p className="mt-1 text-[10px] text-amber-600">
                                      ⚠ Low confidence — may require manual review
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:bg-amber-900/20">
                                  <p className="text-sm text-amber-700">
                                    ⏳ AI evaluation pending — your educator will review this answer
                                    manually.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {q.options && q.type === "mcq" && (
                            <div className="space-y-2">
                              {q.options.map((opt, j) => {
                                const isOptCorrect = opt.id === q.correctAnswer;
                                const isUser = answered && opt.id === String(userAnswer);

                                return (
                                  <div
                                    key={opt.id}
                                    className={cn(
                                      "rounded-xl border-2 p-3",
                                      isOptCorrect
                                        ? "border-green-500 bg-green-100/50 dark:bg-green-900/20"
                                        : isUser && !isOptCorrect
                                          ? "border-red-500 bg-red-100/50 dark:bg-red-900/20"
                                          : "border-transparent bg-background/50"
                                    )}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="shrink-0 font-medium">
                                        {String.fromCharCode(65 + j)}.
                                      </span>
                                      <HtmlView html={opt.text} className="flex-1" />
                                    </div>

                                    {isOptCorrect && (
                                      <Badge className="ml-2 rounded-full bg-green-500">
                                        Correct
                                      </Badge>
                                    )}
                                    {isUser && !isOptCorrect && (
                                      <Badge className="ml-2 rounded-full bg-red-500">
                                        Your Answer
                                      </Badge>
                                    )}
                                    {isUser && isOptCorrect && (
                                      <Badge className="ml-2 rounded-full bg-green-500">
                                        Your Answer
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {q.type === "integer" && (
                            <div className="flex flex-wrap gap-4">
                              <div className="rounded-xl bg-background/50 p-3">
                                <span className="text-muted-foreground">Your answer:</span>{" "}
                                <span className="font-bold">{answered ? userAnswer : "—"}</span>
                              </div>
                              <div className="rounded-xl bg-green-100/50 p-3 dark:bg-green-900/20">
                                <span className="text-muted-foreground">Correct:</span>{" "}
                                <span className="font-bold text-green-600">{q.correctAnswer}</span>
                              </div>
                            </div>
                          )}

                          {!isSubjective && (
                            <div className="rounded-xl bg-pastel-cream p-4">
                              <p className="mb-1 text-sm font-medium">Explanation</p>
                              {q.explanation?.trim() ? (
                                <HtmlView
                                  html={q.explanation}
                                  className="text-sm text-muted-foreground"
                                />
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No explanation available.
                                </p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </QuestionActionHoverWrapper>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
