import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import { doc, getDoc, getDocs, collection, updateDoc } from "firebase/firestore";
import { HtmlView } from "@shared/lib/safeHtml";
import { isSubjectiveType } from "@shared/lib/questionTypes";

type AiEvaluation = {
  score: number;
  maxScore: number;
  confidence: number;
  feedback: string;
  evaluatedAt?: number;
};

type AttemptResponse = {
  answer?: string;
  answered?: boolean;
  needsManualReview?: boolean;
  aiEvaluation?: AiEvaluation;
  manualReview?: {
    score: number;
    maxScore: number;
    feedback: string;
    reviewedBy: string;
    reviewedAt: number;
  };
};

type AttemptDoc = {
  id: string;
  testId?: string;
  testTitle?: string;
  subject?: string;
  studentId?: string;
  studentName?: string;
  educatorId?: string;
  score?: number;
  maxScore?: number;
  submittedAt?: any;
  pendingManualReviewCount?: number;
  responses?: Record<string, AttemptResponse>;
};

type QuestionDoc = {
  id: string;
  questionText?: string;
  questionType?: string;
  referenceAnswer?: string;
  referenceAnswerFileUrl?: string; // legacy
  referenceAnswerFileUrls?: string[]; // multi-image
  referenceKeywords?: string[];
  evaluationInstructions?: string;
  marks?: { correct: number; incorrect: number };
};

function getRefImageUrls(q: QuestionDoc | undefined): string[] {
  if (!q) return [];
  if (q.referenceAnswerFileUrls?.length) return q.referenceAnswerFileUrls.filter(Boolean);
  if (q.referenceAnswerFileUrl) return [q.referenceAnswerFileUrl];
  return [];
}

function getAnswerImageUrls(answer: string | undefined): string[] {
  if (!answer) return [];
  if (answer.startsWith("[")) {
    try {
      const parsed = JSON.parse(answer);
      if (Array.isArray(parsed))
        return parsed.filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
    } catch {
      // ignore
    }
  }
  if (answer.startsWith("http")) return [answer];
  return [];
}

type ReviewState = {
  score: string;
  feedback: string;
  saving: boolean;
  saved: boolean;
};

function safeNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function confidenceLabel(c: number) {
  if (c >= 0.8) return { text: "High", cls: "bg-green-100 text-green-700" };
  if (c >= 0.5) return { text: "Medium", cls: "bg-yellow-100 text-yellow-700" };
  return { text: "Low", cls: "bg-red-100 text-red-700" };
}

export default function SubjectiveAttemptGrader() {
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const { attemptId } = useParams<{ attemptId: string }>();
  const { firebaseUser, profile } = useAuth();
  const educatorId = profile?.educatorId || firebaseUser?.uid || null;

  const [attempt, setAttempt] = useState<AttemptDoc | null>(null);
  const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-question review state
  const [reviewStates, setReviewStates] = useState<Record<string, ReviewState>>({});

  useEffect(() => {
    if (!attemptId || !educatorId) return;

    async function load() {
      try {
        const attemptSnap = await getDoc(doc(db, "attempts", attemptId!));
        if (!attemptSnap.exists()) {
          setError("Attempt not found.");
          setLoading(false);
          return;
        }
        const data = { id: attemptSnap.id, ...(attemptSnap.data() as any) } as AttemptDoc;

        if (data.educatorId !== educatorId) {
          setError("You do not have permission to review this attempt.");
          setLoading(false);
          return;
        }

        setAttempt(data);

        // Load questions from educator's test
        const testId = data.testId;
        if (testId) {
          const qSnap = await getDocs(
            collection(db, "educators", educatorId!, "my_tests", testId, "questions")
          );
          const qMap: Record<string, QuestionDoc> = {};
          qSnap.docs.forEach((d) => {
            const qData = d.data() as any;
            if (isSubjectiveType(qData.questionType)) {
              qMap[d.id] = { id: d.id, ...qData };
            }
          });
          setQuestions(qMap);
        }

        // Initialize review states for questions needing review
        const initial: Record<string, ReviewState> = {};
        if (data.responses) {
          for (const [qId, resp] of Object.entries(data.responses)) {
            if (resp.needsManualReview) {
              initial[qId] = {
                score: String(resp.aiEvaluation?.score ?? 0),
                feedback: resp.aiEvaluation?.feedback ?? "",
                saving: false,
                saved: false,
              };
            }
          }
        }
        setReviewStates(initial);
        setLoading(false);
      } catch (err) {
        console.error("[SubjectiveAttemptGrader] load error:", err);
        setError("Failed to load attempt. Please try again.");
        setLoading(false);
      }
    }

    load();
  }, [attemptId, educatorId]);

  async function saveGrade(qId: string, maxScore: number) {
    if (!attempt || !firebaseUser) return;

    const state = reviewStates[qId];
    const manualScore = Math.max(0, Math.min(maxScore, safeNum(state.score, 0)));

    setReviewStates((prev) => ({ ...prev, [qId]: { ...prev[qId], saving: true } }));

    try {
      const aiScore = safeNum(attempt.responses?.[qId]?.aiEvaluation?.score, 0);
      const currentTotal = safeNum(attempt.score, 0);
      const newTotal = Math.max(0, currentTotal - aiScore + manualScore);
      const newMax = safeNum(attempt.maxScore, 1);
      const newAccuracy = newMax > 0 ? newTotal / newMax : 0;
      const newPending = Math.max(0, safeNum(attempt.pendingManualReviewCount, 1) - 1);

      await updateDoc(doc(db, "attempts", attempt.id), {
        [`responses.${qId}.manualReview`]: {
          score: manualScore,
          maxScore,
          feedback: state.feedback.trim(),
          reviewedBy: firebaseUser.uid,
          reviewedAt: Date.now(),
        },
        [`responses.${qId}.needsManualReview`]: false,
        [`responses.${qId}.score`]: manualScore,
        score: newTotal,
        accuracy: newAccuracy,
        pendingManualReviewCount: newPending,
      });

      // Update local attempt state
      setAttempt((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          score: newTotal,
          accuracy: newAccuracy,
          pendingManualReviewCount: newPending,
          responses: {
            ...prev.responses,
            [qId]: {
              ...prev.responses?.[qId],
              needsManualReview: false,
              manualReview: {
                score: manualScore,
                maxScore,
                feedback: state.feedback.trim(),
                reviewedBy: firebaseUser.uid,
                reviewedAt: Date.now(),
              },
            },
          },
        };
      });

      setReviewStates((prev) => ({
        ...prev,
        [qId]: { ...prev[qId], saving: false, saved: true },
      }));

      toast.success("Grade saved");
    } catch (err) {
      console.error("[SubjectiveAttemptGrader] save error:", err);
      setReviewStates((prev) => ({ ...prev, [qId]: { ...prev[qId], saving: false } }));
      toast.error("Failed to save grade. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="flex flex-col items-center gap-4 p-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-semibold">{error || "Something went wrong"}</p>
        <Button asChild variant="outline">
          <Link to="/educator/review-submissions">Back to queue</Link>
        </Button>
      </div>
    );
  }

  const pendingEntries = Object.entries(attempt.responses || {}).filter(
    ([, resp]) => resp.needsManualReview
  );
  const allDone = pendingEntries.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        {!isApp && (
          <Button asChild variant="ghost" size="sm" className="-ml-1">
            <Link to="/educator/review-submissions">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{attempt.testTitle || "Untitled Test"}</h1>
          <p className="text-sm text-muted-foreground">
            {attempt.studentName || attempt.studentId?.slice(0, 8)}
            {attempt.subject && ` · ${attempt.subject}`}
          </p>
        </div>
        {!allDone && (
          <Badge className="bg-amber-100 text-amber-700">{pendingEntries.length} pending</Badge>
        )}
      </div>

      {allDone ? (
        <Card className="card-soft border-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-semibold">All answers graded!</p>
            <p className="text-sm text-muted-foreground">
              Total score: {attempt.score}/{attempt.maxScore}
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link to="/educator/review-submissions">Back to queue</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingEntries.map(([qId, resp], idx) => {
            const q = questions[qId];
            const ai = resp.aiEvaluation;
            const maxScore = safeNum(q?.marks?.correct, ai?.maxScore ?? 5);
            const state = reviewStates[qId];
            const conf = ai?.confidence ?? 0;
            const confMeta = confidenceLabel(conf);
            const studentImageUrls = getAnswerImageUrls(resp.answer);
            const isImageAnswer = studentImageUrls.length > 0;
            const refImageUrls = getRefImageUrls(q);

            if (!state) return null;

            return (
              <Card key={qId} className="overflow-hidden border-border/50">
                <CardHeader className="border-b border-border/50 bg-muted/20 pb-3 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-sm font-bold">Question {idx + 1}</CardTitle>
                    {ai && (
                      <>
                        <Badge variant="outline" className="text-xs">
                          AI: {ai.score}/{maxScore}
                        </Badge>
                        <Badge className={`text-xs ${confMeta.cls}`}>
                          Confidence: {Math.round(conf * 100)}% ({confMeta.text})
                        </Badge>
                      </>
                    )}
                    {!ai && (
                      <Badge className="bg-red-100 text-xs text-red-700">Evaluation failed</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  {/* Question stem */}
                  {q?.questionText && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Question
                      </p>
                      <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm">
                        <HtmlView html={q.questionText} />
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Student answer */}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Student Answer
                      </p>
                      <div className="min-h-[100px] rounded-lg border border-border/50 p-3">
                        {isImageAnswer ? (
                          <div className="flex flex-wrap gap-2">
                            {studentImageUrls.map((imgUrl, imgIdx) => (
                              <a
                                key={imgIdx}
                                href={imgUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`Student answer ${imgIdx + 1}`}
                                  className="max-h-56 max-w-[180px] rounded border border-border/50 object-contain"
                                />
                              </a>
                            ))}
                          </div>
                        ) : resp.answer ? (
                          <p className="text-sm">{resp.answer}</p>
                        ) : (
                          <p className="text-sm italic text-muted-foreground">No answer provided</p>
                        )}
                      </div>
                    </div>

                    {/* Reference answer */}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Reference Answer
                      </p>
                      <div className="min-h-[100px] rounded-lg border border-border/50 p-3">
                        {q?.referenceAnswer && <p className="mb-2 text-sm">{q.referenceAnswer}</p>}
                        {refImageUrls.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {refImageUrls.map((imgUrl, imgIdx) => (
                              <a
                                key={imgIdx}
                                href={imgUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`Reference answer ${imgIdx + 1}`}
                                  className="max-h-56 max-w-[180px] rounded border border-border/50 object-contain"
                                />
                              </a>
                            ))}
                          </div>
                        ) : !q?.referenceAnswer ? (
                          <p className="text-sm italic text-muted-foreground">
                            No reference answer provided
                          </p>
                        ) : null}
                        {q?.referenceKeywords?.length ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Keywords: {q.referenceKeywords.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* AI feedback */}
                  {ai?.feedback && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        AI Feedback
                      </p>
                      <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                        {ai.feedback}
                      </div>
                    </div>
                  )}

                  {/* Manual grade form */}
                  {state.saved ? (
                    <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 dark:bg-green-950/30">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        Graded: {reviewStates[qId].score}/{maxScore}
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        Your Grade
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-medium">Score</label>
                          <input
                            type="number"
                            min={0}
                            max={maxScore}
                            step={0.5}
                            value={state.score}
                            onChange={(e) =>
                              setReviewStates((prev) => ({
                                ...prev,
                                [qId]: { ...prev[qId], score: e.target.value },
                              }))
                            }
                            className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <span className="text-sm text-muted-foreground">/ {maxScore}</span>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Feedback</label>
                          <textarea
                            rows={3}
                            value={state.feedback}
                            onChange={(e) =>
                              setReviewStates((prev) => ({
                                ...prev,
                                [qId]: { ...prev[qId], feedback: e.target.value },
                              }))
                            }
                            placeholder="Explain your grade..."
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => saveGrade(qId, maxScore)}
                          disabled={state.saving}
                          className="rounded-lg"
                        >
                          {state.saving ? "Saving…" : "Save Grade"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
