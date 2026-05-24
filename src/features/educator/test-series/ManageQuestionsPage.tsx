import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";

import QuestionsManager from "./QuestionManager/QuestionsManager";

type TestMeta = {
  title?: string;
  subject?: string;
  source?: string;
  originSource?: string;
  questionsCount?: number | null;
  useSections?: boolean;
  questionFormat?: string;
  chapter?: string;
  topics?: string[];
  tags?: string[];
  markingScheme?: { correct?: number; incorrect?: number; unanswered?: number };
  sections?: {
    id: string;
    name: string;
    questionsCount?: number | null;
    topics?: string[];
    difficultyLevel?: number;
    questionsLimit?: number;
    attemptsLimit?: number;
    timeLimit?: number;
    markingScheme?: any;
  }[];
  linkedAdminTestId?: string;
  originalTestId?: string;
  isQuestionSourceShared?: boolean;
  questionsTarget?: number | null;
};

export default function ManageQuestionsPage() {
  const navigate = useNavigate();
  const { testId } = useParams<{ testId: string }>();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [testMeta, setTestMeta] = useState<TestMeta | null>(null);
  const [testLoading, setTestLoading] = useState(true);

  // Must be before early returns — hooks cannot be called conditionally
  const testSections = useMemo(() => {
    if (!testMeta) return [];
    if (testMeta.sections?.length) {
      return testMeta.sections.map((section) => ({
        ...section,
        questionsCount:
          section.questionsCount != null
            ? section.questionsCount
            : testMeta.sections!.length === 1
              ? (testMeta.questionsCount ?? null)
              : null,
      }));
    }
    if (testMeta.questionsCount != null) {
      return [
        {
          id: "main",
          name: testMeta.subject || "General",
          questionsCount: testMeta.questionsTarget ?? null,
          format: testMeta.questionFormat || "",
          chapter: testMeta.chapter || "",
          topics: testMeta.topics || [],
          tags: testMeta.tags || [],
          markingScheme: testMeta.markingScheme || null,
        },
      ];
    }
    return [];
  }, [testMeta]);

  useEffect(() => {
    if (authLoading) return;

    if (!firebaseUser || !testId) {
      setTestMeta(null);
      setTestLoading(false);
      return;
    }

    const testRef = doc(db, "educators", firebaseUser.uid, "my_tests", testId);
    const unsub = onSnapshot(
      testRef,
      (snap) => {
        if (!snap.exists()) {
          setTestMeta(null);
        } else {
          const data = snap.data() as any;
          setTestMeta({
            title: String(data?.title || ""),
            subject: String(data?.subject || ""),
            source: String(data?.source || ""),
            originSource: String(data?.originSource || ""),
            sections: Array.isArray(data?.sections)
              ? data.sections
                  .map((section: any, index: number) => ({
                    id: String(section?.id || `sec_${index + 1}`),
                    name: String(section?.name || `Section ${index + 1}`),
                    questionsCount: Number.isFinite(Number(section?.questionsCount))
                      ? Number(section.questionsCount)
                      : null,
                    topics: Array.isArray(section?.topics)
                      ? section.topics.map(String).filter(Boolean)
                      : [],
                    difficultyLevel: Number.isFinite(Number(section?.difficultyLevel))
                      ? Number(section.difficultyLevel)
                      : undefined,
                    questionsLimit: Number.isFinite(Number(section?.questionsLimit))
                      ? Number(section.questionsLimit)
                      : undefined,
                    attemptsLimit: Number.isFinite(
                      Number(section?.attemptsLimit ?? section?.attemptlimit)
                    )
                      ? Number(section.attemptsLimit ?? section.attemptlimit)
                      : undefined,
                    timeLimit: Number.isFinite(
                      Number(section?.timeLimit ?? section?.durationMinutes)
                    )
                      ? Number(section.timeLimit ?? section.durationMinutes)
                      : undefined,
                    markingScheme: section?.markingScheme ?? undefined,
                  }))
                  .filter((section: any) => section.id)
              : [],
            questionsCount: Number.isFinite(Number(data?.questionsCount))
              ? Number(data.questionsCount)
              : null,
            useSections: data?.useSections !== false,
            questionFormat: String(data?.questionFormat || ""),
            chapter: String(data?.chapter || ""),
            topics: Array.isArray(data?.topics) ? data.topics.map(String) : [],
            tags: Array.isArray(data?.tags) ? data.tags.map(String) : [],
            markingScheme: data?.markingScheme
              ? {
                  correct: Number(data.markingScheme.correct ?? 4),
                  incorrect: Number(data.markingScheme.incorrect ?? -1),
                  unanswered: Number(data.markingScheme.unanswered ?? 0),
                }
              : undefined,
            linkedAdminTestId: String(data?.linkedAdminTestId || ""),
            originalTestId: String(data?.originalTestId || ""),
            isQuestionSourceShared: data?.isQuestionSourceShared === true,
            questionsTarget: Number.isFinite(Number(data?.questionsTarget))
              ? Number(data.questionsTarget)
              : null,
          });
        }
        setTestLoading(false);
      },
      () => {
        setTestMeta(null);
        setTestLoading(false);
      }
    );

    return () => unsub();
  }, [authLoading, firebaseUser, testId]);

  if (authLoading || testLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading questions manager...
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-muted-foreground">Please login to manage questions.</p>
          <Button onClick={() => navigate("/login?role=educator")}>Go to Login</Button>
        </CardContent>
      </Card>
    );
  }

  if (!testId || !testMeta) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-muted-foreground">Test not found or you do not have access.</p>
          <Button variant="outline" onClick={() => navigate("/educator/test-series")}>
            Back to Test Series
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isAdminLinked =
    testMeta.originSource === "admin" ||
    testMeta.source === "imported" ||
    testMeta.source === "linked_admin" ||
    testMeta.isQuestionSourceShared === true ||
    Boolean(testMeta.linkedAdminTestId) ||
    Boolean(testMeta.originalTestId);

  const adminSourceTestId = testMeta.linkedAdminTestId || testMeta.originalTestId || testId;

  return (
    <QuestionsManager
      mode="page"
      testId={testId}
      testTitle={testMeta.title}
      testSubject={testMeta.subject}
      useSections={testMeta.useSections}
      testSections={testSections}
      educatorUid={firebaseUser.uid}
      readOnly={isAdminLinked}
      questionSource={isAdminLinked ? "admin" : "educator"}
      questionSourceTestId={isAdminLinked ? adminSourceTestId : undefined}
      onClose={() => navigate("/educator/test-series")}
    />
  );
}
