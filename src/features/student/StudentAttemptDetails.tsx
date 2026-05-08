import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { cn } from "@shared/lib/utils";
import { HtmlView } from "@shared/lib/safeHtml";

import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import { logError } from "@shared/lib/errorLogger";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

type AttemptResponse = {
  answer: string | null;
  markedForReview: boolean;
  visited: boolean;
  answered: boolean;
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
  type: "mcq" | "integer";
  stem: string;
  options?: { id: string; text: string }[];
  correctAnswer?: string; // for mcq => option index as string, for integer => exact string
  explanation?: string;
  marks: { correct: number; incorrect: number }; // incorrect as positive penalty
  passage?: { title: string; content: string } | null;
  /** Used for display ordering */
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
  const opts: string[] = Array.isArray(data.options) ? data.options : [];
  const parsedCorrectIndex = parseMcqCorrectIndex(
    data.correctOption ?? data.correctOptionIndex ?? data.correctAnswer,
    opts.length || 4
  );
  const correctIndex = parsedCorrectIndex ?? 0;

  const positive = data.marks ?? data.positiveMarks ?? 5;
  const negative = Math.abs(data.negativeMarks ?? 1);

  return {
    id,
    sectionId: data.sectionId || "main",
    type: "mcq",
    stem: data.question || data.text || "",
    options: opts.map((t, i) => ({ id: String(i), text: String(t) })),
    correctAnswer: String(correctIndex),
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
  if (!isAnswered(userAnswer)) return false;
  if (q.type === "integer") return String(userAnswer).trim() === String(q.correctAnswer ?? "").trim();
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
        if (a.studentId !== firebaseUser.uid) throw new Error("You don't have permission to view this attempt.");

        const educatorId = a.educatorId;
        const testId = a.testId;

        if (!educatorId || !testId) throw new Error("Attempt is missing test reference.");

        let qs: AttemptQuestion[] = [];
        let testSections: TestSection[] = [];

        const educatorTestSnap = await getDoc(doc(db, "educators", educatorId, "my_tests", testId));

        if (educatorTestSnap.exists()) {
          const localTest = educatorTestSnap.data() as any;
          testSections = Array.isArray(localTest?.sections) ? localTest.sections : [];
          
          const linkedAdminTestId = String(localTest?.linkedAdminTestId || localTest?.originalTestId || "").trim();
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
            
          if (isAdminLinked && linkedAdminTestId && testSections.length === 0) {
              const adminTestSnap = await getDoc(doc(db, "test_series", linkedAdminTestId));
              if (adminTestSnap.exists()) {
                  testSections = Array.isArray(adminTestSnap.data()?.sections) ? adminTestSnap.data()?.sections : [];
              }
          }
        }

        if (!qs.length) {
          const globalTestSnap = await getDoc(doc(db, "test_series", testId));
          if (!globalTestSnap.exists()) throw new Error("Test not found for this attempt.");
          testSections = Array.isArray(globalTestSnap.data()?.sections) ? globalTestSnap.data()?.sections : [];

          const qSnap = await getDocs(collection(db, "test_series", testId, "questions"));
          qs = qSnap.docs
            .map((d) => mapQuestion(d.id, d.data()))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        }

        if (!qs.length) throw new Error("Questions not found for this attempt.");

        if (!mounted) return;

        setAttempt(a);
        setQuestions(qs);
        setResponses(a.responses || {});
        setSections(testSections.length > 0 ? testSections : [{ id: "main", name: a.subject || "General" }]);
      } catch (e: any) {
        console.error(e);
        logError(e, "attempt-details:load");
        if (!mounted) return;
        setError(e?.message || "Failed to load attempt details.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadAll();
    return () => {
      mounted = false;
    };
  }, [attemptId, firebaseUser, authLoading]);

  const questionsBySection = useMemo(() => {
    const map: Record<string, AttemptQuestion[]> = {};
    sections.forEach(s => map[s.id] = []);
    questions.forEach(q => {
      const sid = q.sectionId || "main";
      if (!map[sid]) map[sid] = [];
      map[sid].push(q);
    });
    return map;
  }, [questions, sections]);

  if (loading || authLoading) return <div className="text-center py-12">Loading...</div>;
  if (error) return <div className="text-center py-12">{error}</div>;
  if (!attempt) return <div className="text-center py-12">Attempt not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <Button variant="ghost" asChild>
        <Link to={`/student/results/${attemptId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Results
        </Link>
      </Button>

      <Card className="card-soft border-0 bg-pastel-lavender">
        <CardContent className="p-6">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-muted-foreground">Review your answers</p>
        </CardContent>
      </Card>

      <div className="space-y-8">
        {sections.map((section) => {
          const sectionQs = questionsBySection[section.id] || [];
          if (sectionQs.length === 0) return null;

          return (
            <div key={section.id} className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="h-6 w-1 bg-primary rounded-full" />
                <h2 className="text-lg font-bold">{section.name}</h2>
                <Badge variant="outline" className="rounded-full">{sectionQs.length} Questions</Badge>
              </div>

              <div className="space-y-4">
                {sectionQs.map((q, idx) => {
                  const userAnswer = responses[q.id]?.answer ?? null;
                  const answered = isAnswered(userAnswer);
                  const correct = isCorrectAnswer(q, userAnswer);
                  const awarded = !answered ? 0 : correct ? q.marks.correct : -Math.abs(q.marks.incorrect);

                  return (
                    <Card
                      key={q.id}
                      className={cn(
                        "card-soft border-0",
                        !answered ? "bg-slate-50 dark:bg-slate-900/10" : correct ? "bg-green-50 dark:bg-green-900/10" : "bg-red-50 dark:bg-red-900/10"
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="rounded-full">
                            Q{idx + 1}
                          </Badge>

                          <div className="flex items-center gap-2">
                            {answered ? (
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
                                !answered
                                  ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                  : correct
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              )}
                            >
                              {!answered ? "0" : awarded > 0 ? `+${awarded}` : `${awarded}`}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {!!q.passage && (
                          <div className="p-4 bg-pastel-cream rounded-xl">
                            <p className="font-semibold mb-2">{q.passage.title}</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-line">{q.passage.content}</p>
                          </div>
                        )}

                        <HtmlView html={q.stem} className="font-medium" />

                        {q.options && q.type === "mcq" && (
                          <div className="space-y-2">
                            {q.options.map((opt, j) => {
                              const isOptCorrect = opt.id === q.correctAnswer;
                              const isUser = answered && opt.id === String(userAnswer);

                              return (
                                <div
                                  key={opt.id}
                                  className={cn(
                                    "p-3 rounded-xl border-2",
                                    isOptCorrect
                                      ? "border-green-500 bg-green-100/50 dark:bg-green-900/20"
                                      : isUser && !isOptCorrect
                                      ? "border-red-500 bg-red-100/50 dark:bg-red-900/20"
                                      : "border-transparent bg-background/50"
                                  )}
                                >
                                  <div className="flex gap-2 items-start">
                                    <span className="font-medium shrink-0">{String.fromCharCode(65 + j)}.</span>
                                    <HtmlView html={opt.text} className="flex-1" />
                                  </div>

                                  {isOptCorrect && <Badge className="ml-2 rounded-full bg-green-500">Correct</Badge>}
                                  {isUser && !isOptCorrect && <Badge className="ml-2 rounded-full bg-red-500">Your Answer</Badge>}
                                  {isUser && isOptCorrect && <Badge className="ml-2 rounded-full bg-green-500">Your Answer</Badge>}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.type === "integer" && (
                          <div className="flex gap-4 flex-wrap">
                            <div className="p-3 rounded-xl bg-background/50">
                              <span className="text-muted-foreground">Your answer:</span>{" "}
                              <span className="font-bold">{answered ? userAnswer : "—"}</span>
                            </div>
                            <div className="p-3 rounded-xl bg-green-100/50 dark:bg-green-900/20">
                              <span className="text-muted-foreground">Correct:</span>{" "}
                              <span className="font-bold text-green-600">{q.correctAnswer}</span>
                            </div>
                          </div>
                        )}

                        <div className="p-4 rounded-xl bg-pastel-cream">
                          <p className="text-sm font-medium mb-1">Explanation</p>
                          {q.explanation?.trim() ? (
                            <HtmlView html={q.explanation} className="text-sm text-muted-foreground" />
                          ) : (
                            <p className="text-sm text-muted-foreground">No explanation available.</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
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

