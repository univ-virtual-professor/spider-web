import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { collection, doc, onSnapshot, Timestamp } from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useAccessibleCourses } from "@shared/hooks/useAccessibleCourses";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";
import { DsPageHeader, DsCard } from "@shared/ui/ds";

import QuestionsManager from "./QuestionManager/QuestionsManager";
import ScheduleTest from "./ScheduleTest";

type TestMeta = {
  title?: string;
  subject?: string;
  source?: string;
  originSource?: string;
  questionsCount?: number | null;
  useSections?: boolean;
  questionFormat?: string;
  chapters?: string[];
  topics?: string[];
  tags?: string[];
  markingScheme?: { correct?: number; incorrect?: number; unanswered?: number };
  sections?: {
    id: string;
    name: string;
    questionsCount?: number | null;
    topics?: string[];
    tags?: string[];
    chapters?: string[];
    format?: string;
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
  // Scheduling fields (ScheduleTest.tsx writes these back to the same doc)
  startTime?: Timestamp | null;
  endTime?: Timestamp | null;
  isScheduleActive?: boolean;
  durationMinutes?: number | null;
  targetBatches?: string[];
  recurrence?: any;
};

function formatScheduleSubtitle(meta: TestMeta): string {
  if (meta.isScheduleActive && meta.startTime) {
    const d = meta.startTime.toDate();
    const when = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    return `scheduled ${when}`;
  }
  return "draft, not scheduled";
}

export default function ManageQuestionsPage() {
  const navigate = useNavigate();
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const { testId } = useParams<{ testId: string }>();
  const { firebaseUser, loading: authLoading } = useAuth();
  const { allowedSubjectIds } = useAccessibleCourses(firebaseUser?.uid ?? "");

  const [testMeta, setTestMeta] = useState<TestMeta | null>(null);
  const [testLoading, setTestLoading] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [questionStats, setQuestionStats] = useState<{ count: number; marks: number } | null>(
    null
  );

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
          chapters: testMeta.chapters || [],
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
                    tags: Array.isArray(section?.tags)
                      ? section.tags.map(String).filter(Boolean)
                      : [],
                    chapters: Array.isArray(section?.chapters)
                      ? section.chapters.map(String).filter(Boolean)
                      : [],
                    subject: section?.subject ? String(section.subject) : "",
                    format: section?.format ? String(section.format) : undefined,
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
            chapters: Array.isArray(data?.chapters) ? data.chapters.map(String) : (data?.chapter ? [String(data.chapter)] : []),
            topics: Array.isArray(data?.topics) ? data.topics.map(String) : [],
            tags: Array.isArray(data?.tags) ? data.tags.map(String) : [],
            markingScheme: data?.markingScheme
              ? {
                  correct: Number(data.markingScheme.correct ?? 1),
                  incorrect: Number(data.markingScheme.incorrect ?? 0),
                  unanswered: Number(data.markingScheme.unanswered ?? 0),
                }
              : undefined,
            linkedAdminTestId: String(data?.linkedAdminTestId || ""),
            originalTestId: String(data?.originalTestId || ""),
            isQuestionSourceShared: data?.isQuestionSourceShared === true,
            questionsTarget: Number.isFinite(Number(data?.questionsTarget))
              ? Number(data.questionsTarget)
              : null,
            startTime: data?.startTime ?? null,
            endTime: data?.endTime ?? null,
            isScheduleActive: data?.isScheduleActive === true,
            durationMinutes: Number.isFinite(Number(data?.durationMinutes))
              ? Number(data.durationMinutes)
              : null,
            targetBatches: Array.isArray(data?.targetBatches)
              ? data.targetBatches.map(String)
              : [],
            recurrence: data?.recurrence ?? null,
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

  // Read-only aggregate of the test's own questions — doesn't duplicate any of
  // QuestionsManager's editing state, just totals for the settings rail.
  useEffect(() => {
    if (!firebaseUser || !testId) {
      setQuestionStats(null);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "educators", firebaseUser.uid, "my_tests", testId, "questions"),
      (snap) => {
        let marks = 0;
        snap.docs.forEach((d) => {
          const m = Number((d.data() as any)?.marks);
          if (Number.isFinite(m)) marks += m;
        });
        setQuestionStats({ count: snap.size, marks });
      },
      () => setQuestionStats(null)
    );
    return () => unsub();
  }, [firebaseUser, testId]);

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
          {!isApp && (
            <Button variant="outline" onClick={() => navigate("/educator/test-series")}>
              Back to Test Series
            </Button>
          )}
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

  const scheduleTestDoc = {
    id: testId,
    title: testMeta.title,
    startTime: testMeta.startTime,
    endTime: testMeta.endTime,
    isScheduleActive: testMeta.isScheduleActive,
    durationMinutes: testMeta.durationMinutes,
    targetBatches: testMeta.targetBatches,
    recurrence: testMeta.recurrence,
  };

  return (
    <div className="ds-scope space-y-4 p-4 md:p-6">
      <DsPageHeader
        title={testMeta.title || "Untitled test"}
        subtitle={`${testMeta.subject || "General"} · ${formatScheduleSubtitle(testMeta)}`}
        primary={{ label: "Schedule test", onClick: () => setScheduleOpen(true) }}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-h-0 flex-1 overflow-hidden rounded-[10px] border border-ds-ink/[.09]">
          <QuestionsManager
            mode="page"
            testId={testId}
            testTitle={testMeta.title}
            testSubject={testMeta.subject}
            useSections={testMeta.useSections}
            testSections={testSections}
            educatorUid={firebaseUser.uid}
            allowedSubjectIds={allowedSubjectIds}
            readOnly={isAdminLinked}
            questionSource={isAdminLinked ? "admin" : "educator"}
            questionSourceTestId={isAdminLinked ? adminSourceTestId : undefined}
            onClose={() => navigate("/educator/test-series")}
          />
        </div>

        <DsCard className="w-full shrink-0 p-4 lg:w-[288px]">
          <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">Test settings</div>
          <div className="mt-3 divide-y divide-ds-ink/[.055]">
            {[
              { k: "Name", v: testMeta.title || "Untitled test" },
              { k: "Subject", v: testMeta.subject || "General" },
              {
                k: "Questions",
                v: questionStats ? String(questionStats.count) : "—",
              },
              {
                k: "Total marks",
                v: questionStats ? String(questionStats.marks) : "—",
              },
              {
                k: "Batches",
                v: testMeta.targetBatches?.length
                  ? `${testMeta.targetBatches.length} assigned`
                  : "Not assigned",
              },
              {
                k: "Schedule",
                v:
                  testMeta.isScheduleActive && testMeta.startTime
                    ? testMeta.startTime.toDate().toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Not scheduled",
              },
              {
                k: "Duration",
                v: testMeta.durationMinutes ? `${testMeta.durationMinutes} minutes` : "—",
              },
              { k: "Results", v: "After faculty sign-off" },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-center justify-between gap-3 py-2 font-ds-sans text-[12px]"
              >
                <span className="text-ds-ink/50">{row.k}</span>
                <span className="text-right font-medium text-ds-ink">{row.v}</span>
              </div>
            ))}
          </div>
          <div className="mt-3.5 flex flex-col gap-1.5">
            <Button
              className="h-[34px] rounded-[7px] bg-ds-accent font-ds-sans text-[12.5px] font-semibold text-white hover:bg-ds-accent/90"
              onClick={() => setScheduleOpen(true)}
            >
              Schedule test
            </Button>
            <Button
              variant="outline"
              className="h-[34px] rounded-[7px] border-ds-ink/15 font-ds-sans text-[12.5px] font-semibold"
              onClick={() => navigate("/educator/test-series")}
            >
              Save draft
            </Button>
          </div>
        </DsCard>
      </div>

      <ScheduleTest
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        test={scheduleTestDoc}
        userId={firebaseUser.uid}
      />
    </div>
  );
}
