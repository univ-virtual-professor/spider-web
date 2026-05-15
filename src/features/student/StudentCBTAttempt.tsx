import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, LayoutGrid, Upload } from "lucide-react";
import { toast } from "sonner";

import { normalizeQuestionType } from "@shared/lib/questionTypes";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import { TimerChip } from "@features/student/components/TimerChip";
import { cn } from "@shared/lib/utils";
import { HtmlView } from "@shared/lib/safeHtml";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";
import { logError } from "@shared/lib/errorLogger";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@shared/ui/sheet";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

/**
 * Fetches question_groups docs for any groupId found in the question list
 * and injects the passage into each matching question.
 * Falls back to the inline `passage` field already set by mapQuestion().
 * One Firestore read per unique groupId — cached in a Map.
 */
async function enrichQuestionsWithPassages(qs: AttemptQuestion[]): Promise<AttemptQuestion[]> {
  const uniqueGroupIds = [...new Set(qs.map((q) => q.groupId).filter(Boolean) as string[])];
  if (!uniqueGroupIds.length) return qs;

  const cache = new Map<
    string,
    { title: string; content: string; contentFormat: "html" | "latex" }
  >();

  await Promise.all(
    uniqueGroupIds.map(async (gid) => {
      try {
        const snap = await getDoc(doc(db, "question_groups", gid));
        if (snap.exists()) {
          const d = snap.data() as any;
          cache.set(gid, {
            title: String(d.title || ""),
            content: String(d.passageContent || ""),
            contentFormat: d.passageContentFormat === "latex" ? "latex" : "html",
          });
        }
      } catch {
        // Non-fatal: question renders without passage
      }
    })
  );

  return qs.map((q) => {
    if (!q.groupId) return q;
    const groupPassage = cache.get(q.groupId);
    if (!groupPassage) return q; // fall back to inline passage already set
    return { ...q, passage: groupPassage };
  });
}

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

type AttemptQuestion = {
  id: string;
  sectionId: string;
  type: "mcq" | "integer" | "short_answer" | "upload";
  stem: string;
  options?: { id: string; text: string }[];
  correctAnswer?: string;
  referenceAnswer?: string;
  referenceKeywords?: string[];
  referenceAnswerFileUrl?: string;
  evaluationInstructions?: string;
  explanation?: string;
  marks: { correct: number; incorrect: number };
  passage?: { title: string; content: string; contentFormat?: "html" | "latex" } | null;
  /** groupId links questions in the same comprehension/case-study block */
  groupId?: string;
  groupOrder?: number;
  /** Used for display ordering; not shown to students */
  sortOrder: number;
};

type TestMeta = {
  id: string;
  title: string;
  subject?: string;
  durationMinutes: number;
  sections: { id: string; name: string }[];
};

type AttemptDoc = {
  studentId: string;
  educatorId: string;
  tenantSlug: string | null;
  testId: string;
  testTitle?: string;
  subject?: string;
  status: "in_progress" | "submitted";
  durationSec: number;
  startedAtMs?: number;
  currentIndex?: number;
  responses?: Record<string, AttemptResponse>;
  exitCount?: number;
  createdAt?: any;
  startedAt?: any;
  updatedAt?: any;
};

const LS_ATTEMPT_ID_PREFIX = "cbt_attempt_id__";

const safeNumber = (v: any, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseMcqCorrectIndex = (value: any, optionCount: number): number | null => {
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
};

const buildInitResponses = (qs: AttemptQuestion[]) => {
  const init: Record<string, AttemptResponse> = {};
  qs.forEach(
    (q) => (init[q.id] = { answer: null, markedForReview: false, visited: false, answered: false })
  );
  return init;
};

const mapQuestion = (id: string, data: any): AttemptQuestion => {
  const opts: string[] = Array.isArray(data.options) ? data.options : [];
  const parsedCorrectIndex = parseMcqCorrectIndex(
    data.correctOption ?? data.correctOptionIndex ?? data.correctAnswer,
    opts.length || 4
  );
  const correctIndex = parsedCorrectIndex ?? 0;
  const positive = safeNumber((data as any).marks ?? data.positiveMarks, 5);
  const negative = Math.abs(safeNumber(data.negativeMarks, 1));

  // Determine question type using canonical normalizer
  const rawType = normalizeQuestionType(data.questionType);
  let mappedType: AttemptQuestion["type"] = "mcq";
  if (rawType === "SHORT_ANSWER") mappedType = "short_answer";
  else if (rawType === "UPLOAD") mappedType = "upload";
  else if (data.type === "integer") mappedType = "integer";

  return {
    id,
    sectionId: data.sectionId || "main",
    type: mappedType,
    stem: data.question || "",
    options:
      mappedType === "mcq" ? opts.map((t, i) => ({ id: String(i), text: String(t) })) : undefined,
    correctAnswer:
      mappedType === "mcq" || mappedType === "integer" ? String(correctIndex) : undefined,
    referenceAnswer: data.referenceAnswer || "",
    referenceKeywords: Array.isArray(data.referenceKeywords) ? data.referenceKeywords : [],
    referenceAnswerFileUrl: data.referenceAnswerFileUrl ? String(data.referenceAnswerFileUrl) : "",
    evaluationInstructions: data.evaluationInstructions ? String(data.evaluationInstructions) : "",
    explanation: data.explanation || "",
    marks: { correct: positive, incorrect: negative },
    // Passage resolved later via enrichQuestionsWithPassages()
    passage: data.passage
      ? {
          title: data.passage.title || "",
          content: data.passage.content || "",
          contentFormat: data.passage.contentFormat,
        }
      : null,
    groupId: data.groupId ? String(data.groupId) : undefined,
    groupOrder: data.groupOrder != null ? Number(data.groupOrder) : undefined,
    sortOrder: safeNumber(data.questionOrder, Number.MAX_SAFE_INTEGER),
  };
};

const computeRemainingSeconds = (startedAtMs: number | null, totalSec: number) => {
  if (!totalSec) return 0;
  if (!startedAtMs) return totalSec;
  const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
  return Math.max(0, totalSec - elapsed);
};

async function requestFullscreenSafe() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

async function exitFullscreenSafe() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // ignore
  }
}

export default function StudentCBTAttempt() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [testMeta, setTestMeta] = useState<TestMeta | null>(null);
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, AttemptResponse>>({});

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSectionId, setCurrentSectionId] = useState("");

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptStartedAtMs, setAttemptStartedAtMs] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState(0);

  const [isStarted, setIsStarted] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(true);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [instructionsChecked, setInstructionsChecked] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [evaluatingSubjective, setEvaluatingSubjective] = useState(false);
  const [evaluationProgress, setEvaluationProgress] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [timerStartSeconds, setTimerStartSeconds] = useState(0);

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  // Proctoring state
  const [exitCount, setExitCount] = useState(0);
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const ignoreProctoringRef = useRef(false);
  const resumeFullscreenRef = useRef(false);

  const attemptIdStorageKey = useMemo(
    () => `${LS_ATTEMPT_ID_PREFIX}${tenantSlug || "main"}__${testId || ""}`,
    [tenantSlug, testId]
  );

  const attemptRef = useMemo(
    () => (attemptId ? doc(db, "attempts", attemptId) : null),
    [attemptId]
  );

  // Debounced Firestore updates (reduces write spam)
  const saveTimerRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<Record<string, any>>({});

  const queueAttemptUpdate = useCallback(
    (patch: Record<string, any>) => {
      if (!attemptRef) return;

      pendingUpdateRef.current = { ...pendingUpdateRef.current, ...patch };

      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        const payload = pendingUpdateRef.current;
        pendingUpdateRef.current = {};
        setSaving(true);
        try {
          await updateDoc(attemptRef, { ...payload, updatedAt: serverTimestamp() });
          setLastSavedAt(Date.now());
        } catch (e) {
          console.error(e);
          logError(e, "cbt:save-progress");
          toast.error("Failed to save progress");
        } finally {
          setSaving(false);
        }
      }, 650);
    },
    [attemptRef]
  );

  const sections = useMemo(() => {
    return testMeta?.sections || [];
  }, [testMeta]);

  // Derived: questions in current active section
  const sectionQuestions = useMemo(() => {
    if (!currentSectionId) return questions;
    return questions.filter((q) => q.sectionId === currentSectionId);
  }, [questions, currentSectionId]);

  // Derived: current question index WITHIN the active section
  const currentSectionIndex = useMemo(() => {
    const q = questions[currentIndex];
    if (!q) return 0;
    const idx = sectionQuestions.findIndex((sq) => sq.id === q.id);
    return idx >= 0 ? idx : 0;
  }, [questions, currentIndex, sectionQuestions]);

  const currentQuestion = questions[currentIndex] || null;

  const effectiveResponses = useMemo(() => {
    if (!isStarted || !currentQuestion) return responses;

    const current = responses[currentQuestion.id] || {
      answer: null,
      markedForReview: false,
      visited: true,
      answered: false,
    };

    const nextAnswered =
      selectedAnswer !== null &&
      selectedAnswer !== undefined &&
      String(selectedAnswer).trim() !== "";

    // Include current in-progress selection in stats/submission even before explicit save.
    if (current.answer === selectedAnswer && Boolean(current.answered) === nextAnswered) {
      return responses;
    }

    return {
      ...responses,
      [currentQuestion.id]: {
        ...current,
        answer: selectedAnswer,
        answered: nextAnswered,
        visited: true,
      },
    };
  }, [responses, isStarted, currentQuestion, selectedAnswer]);

  const computeResponseCounts = useCallback(
    (responseMap: Record<string, AttemptResponse>) => {
      let answeredCount = 0;
      let notAnsweredCount = 0;
      let notVisitedCount = 0;
      let markedForReviewCount = 0;
      let markedForReviewUnansweredCount = 0;
      let answeredAndMarkedCount = 0;

      for (const q of questions) {
        const response = responseMap[q.id];
        const visited = Boolean(response?.visited);
        const markedForReview = Boolean(response?.markedForReview);
        const answered =
          response?.answer !== null &&
          response?.answer !== undefined &&
          String(response.answer).trim() !== "";

        if (!visited) notVisitedCount += 1;
        if (answered) answeredCount += 1;
        if (visited && !answered && !markedForReview) notAnsweredCount += 1;

        if (markedForReview) {
          markedForReviewCount += 1;
          if (answered) {
            answeredAndMarkedCount += 1;
          } else {
            markedForReviewUnansweredCount += 1;
          }
        }
      }

      const unansweredCount = Math.max(0, questions.length - answeredCount);

      return {
        answeredCount,
        notAnsweredCount,
        notVisitedCount,
        markedForReviewCount,
        markedForReviewUnansweredCount,
        answeredAndMarkedCount,
        unansweredCount,
      };
    },
    [questions]
  );

  const submissionCounts = useMemo(
    () => computeResponseCounts(effectiveResponses),
    [computeResponseCounts, effectiveResponses]
  );

  const answeredCount = submissionCounts.answeredCount;
  const unansweredVisitedCount = submissionCounts.notAnsweredCount;

  // Load test + questions + existing attempt
  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!testId) {
        setLoadError("Missing test id");
        setLoading(false);
        return;
      }
      if (authLoading || tenantLoading) return;
      if (!firebaseUser) {
        setLoadError("You must be logged in");
        setLoading(false);
        return;
      }
      if (!educatorId) {
        setLoadError("Tenant not found. Open this test from your coaching website.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        let meta: TestMeta | null = null;
        let qs: AttemptQuestion[] = [];
        let localTestData: any = null;

        const educatorTestRef = doc(db, "educators", educatorId, "my_tests", testId);
        const educatorTestSnap = await getDoc(educatorTestRef);

        if (educatorTestSnap.exists()) {
          localTestData = educatorTestSnap.data();
          const localTest = localTestData as any;
          const linkedAdminTestId = String(
            localTest?.linkedAdminTestId || localTest?.originalTestId || ""
          ).trim();
          const isAdminLinked =
            localTest?.originSource === "admin" ||
            localTest?.source === "imported" ||
            localTest?.source === "linked_admin" ||
            localTest?.isQuestionSourceShared === true ||
            Boolean(linkedAdminTestId);

          let resolvedTest = localTest;
          let questionSource = collection(
            db,
            "educators",
            educatorId,
            "my_tests",
            testId,
            "questions"
          );

          if (isAdminLinked && linkedAdminTestId) {
            const adminTestSnap = await getDoc(doc(db, "test_series", linkedAdminTestId));
            if (adminTestSnap.exists()) {
              resolvedTest = adminTestSnap.data() as any;
            }
            questionSource = collection(db, "test_series", linkedAdminTestId, "questions");
          }

          const durationMinutes = safeNumber(resolvedTest?.durationMinutes, 60);
          const computedSections = [
            { id: "main", name: resolvedTest?.subject || localTest?.subject || "General" },
          ];

          meta = {
            id: testId,
            title: resolvedTest?.title || localTest?.title || "Untitled Test",
            subject: resolvedTest?.subject || localTest?.subject,
            durationMinutes,
            sections:
              Array.isArray(resolvedTest?.sections) && resolvedTest.sections.length
                ? resolvedTest.sections
                : computedSections,
          };
          (meta as any).price = safeNumber(resolvedTest?.price || localTest?.price, 0);

          const qSnap = await getDocs(questionSource);
          qs = qSnap.docs
            .filter((q) => q.data()?.isActive !== false)
            .map((q) => mapQuestion(q.id, q.data()))
            .sort((a, b) => a.sortOrder - b.sortOrder);
          qs = await enrichQuestionsWithPassages(qs);
        }

        if (!meta || !qs.length) {
          const globalTestSnap = await getDoc(doc(db, "test_series", testId));
          if (globalTestSnap.exists()) {
            const globalTest = globalTestSnap.data() as any;
            const durationMinutes = safeNumber(globalTest?.durationMinutes, 60);
            const computedSections = [{ id: "main", name: globalTest?.subject || "General" }];

            meta = {
              id: testId,
              title: globalTest?.title || "Untitled Test",
              subject: globalTest?.subject,
              durationMinutes,
              sections:
                Array.isArray(globalTest?.sections) && globalTest.sections.length
                  ? globalTest.sections
                  : computedSections,
            };
            (meta as any).price = safeNumber(globalTest?.price, 0);

            const qSnap = await getDocs(collection(db, "test_series", testId, "questions"));
            qs = qSnap.docs
              .filter((q) => q.data()?.isActive !== false)
              .map((q) => mapQuestion(q.id, q.data()))
              .sort((a, b) => a.sortOrder - b.sortOrder);
            qs = await enrichQuestionsWithPassages(qs);
          }
        }

        if (!meta) throw new Error("Test not found");

        // --- SECURITY CHECK ---
        const unlockId = `${firebaseUser.uid}__${educatorId}__${testId}`;
        const unlockSnap = await getDoc(doc(db, "testUnlocks", unlockId));
        let isUnlocked = unlockSnap.exists();
        if (unlockSnap.exists()) {
          const ud = unlockSnap.data() as any;
          if (ud.windowExpiresAt && ud.windowExpiresAt.toMillis() < Date.now()) {
            isUnlocked = false;
          }
        }

        const startTime = localTestData?.startTime
          ? typeof localTestData.startTime.toMillis === "function"
            ? localTestData.startTime.toMillis()
            : localTestData.startTime
          : null;
        const endTime = localTestData?.endTime
          ? typeof localTestData.endTime.toMillis === "function"
            ? localTestData.endTime.toMillis()
            : localTestData.endTime
          : null;
        const isLive = startTime && endTime && Date.now() >= startTime && Date.now() <= endTime;
        const isFree = (meta as any).price <= 0;

        if (!isUnlocked && !isLive && !isFree) {
          throw new Error("This test is locked. Please unlock it from the test details page.");
        }
        // ----------------------

        if (!qs.length) throw new Error("No questions found in this test");

        if (!mounted) return;

        setTestMeta(meta);
        setQuestions(qs);
        setDurationSec(meta.durationMinutes * 60);

        const init = buildInitResponses(qs);
        setResponses(init);
        setCurrentIndex(0);

        // Find section of first question
        const firstSectionId = qs[0]?.sectionId || meta.sections[0]?.id || "main";
        setCurrentSectionId(firstSectionId);

        // Attempt resume: localStorage -> doc -> query
        const loadAttemptById = async (id: string) => {
          const aSnap = await getDoc(doc(db, "attempts", id));
          if (!aSnap.exists()) return null;
          const a = aSnap.data() as AttemptDoc;
          if (a.studentId !== firebaseUser.uid) return null;
          if (a.testId !== testId) return null;
          if (a.status !== "in_progress") return null;
          if (a.educatorId !== educatorId) return null;
          return { id: aSnap.id, ...a } as any;
        };

        let foundAttempt: any = null;
        const cachedId = localStorage.getItem(attemptIdStorageKey);

        if (cachedId) {
          foundAttempt = await loadAttemptById(cachedId);
          if (!foundAttempt) localStorage.removeItem(attemptIdStorageKey);
        }

        if (!foundAttempt) {
          const qAttempt = query(
            collection(db, "attempts"),
            where("studentId", "==", firebaseUser.uid)
          );
          const aSnap = await getDocs(qAttempt);
          if (!aSnap.empty) {
            const candidates = aSnap.docs
              .map((d) => ({ id: d.id, ...(d.data() as AttemptDoc) }))
              .filter(
                (a) =>
                  a.testId === testId && a.educatorId === educatorId && a.status === "in_progress"
              )
              .sort((a, b) => {
                const aStarted = safeNumber((a as any).startedAtMs, 0);
                const bStarted = safeNumber((b as any).startedAtMs, 0);
                if (aStarted !== bStarted) return bStarted - aStarted;

                const aCreated =
                  a?.createdAt && typeof (a.createdAt as any).toMillis === "function"
                    ? (a.createdAt as any).toMillis()
                    : 0;
                const bCreated =
                  b?.createdAt && typeof (b.createdAt as any).toMillis === "function"
                    ? (b.createdAt as any).toMillis()
                    : 0;
                return bCreated - aCreated;
              });

            if (candidates.length > 0) {
              foundAttempt = candidates[0] as any;
            }
          }

          if (foundAttempt) {
            localStorage.setItem(attemptIdStorageKey, foundAttempt.id);
          }
        }

        if (!mounted) return;

        if (foundAttempt) {
          setAttemptId(foundAttempt.id);
          setExitCount(safeNumber(foundAttempt.exitCount, 0));

          const stored = (foundAttempt.responses || {}) as Record<string, AttemptResponse>;
          setResponses((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((qid) => {
              if (stored[qid]) next[qid] = stored[qid];
            });
            return next;
          });

          const resumeIdx = safeNumber(foundAttempt.currentIndex, 0);
          setCurrentIndex(resumeIdx);
          if (qs[resumeIdx]) {
            setCurrentSectionId(qs[resumeIdx].sectionId || meta.sections[0]?.id || "main");
          }

          const startedMs =
            foundAttempt.startedAtMs ||
            (foundAttempt.startedAt && typeof foundAttempt.startedAt.toMillis === "function"
              ? foundAttempt.startedAt.toMillis()
              : null);

          setAttemptStartedAtMs(startedMs ? safeNumber(startedMs, Date.now()) : null);
          setDurationSec(safeNumber(foundAttempt.durationSec, meta.durationMinutes * 60));

          setIsStarted(false);
          setStartDialogOpen(true);
        } else {
          setAttemptId(null);
          setAttemptStartedAtMs(null);
          setExitCount(0);
          setIsStarted(false);
          setStartDialogOpen(true);
        }
      } catch (e: any) {
        console.error(e);
        logError(e, "cbt:load-test");
        if (!mounted) return;
        setLoadError(e?.message || "Failed to load test");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [testId, authLoading, tenantLoading, firebaseUser, educatorId, attemptIdStorageKey]);

  // Always show instructions gate before starting / resuming
  useEffect(() => {
    if (loading || authLoading || tenantLoading) return;
    if (!isStarted) {
      setInstructionsOpen(true);
      setInstructionsChecked(false);
    }
  }, [loading, authLoading, tenantLoading, isStarted, testId]);

  // Keep section in sync and load saved answer into local state
  useEffect(() => {
    const q = questions[currentIndex];
    if (q) {
      // Sync section ID if it's different
      if (q.sectionId && q.sectionId !== currentSectionId) {
        setCurrentSectionId(q.sectionId);
      }
      setSelectedAnswer(responses[q.id]?.answer || null);
    }
  }, [questions, currentIndex, responses]);

  // Mark visited (only after started)
  useEffect(() => {
    if (!isStarted || !currentQuestion || !attemptId) return;
    const qId = currentQuestion.id;

    setResponses((prev) => {
      const cur = prev[qId];
      if (!cur || cur.visited) return prev;

      const next = { ...prev, [qId]: { ...cur, visited: true } };
      queueAttemptUpdate({ [`responses.${qId}.visited`]: true, currentIndex });
      return next;
    });
  }, [isStarted, currentQuestion, attemptId, queueAttemptUpdate, currentIndex]);

  // Heartbeat (optional, keeps updatedAt fresh)
  useEffect(() => {
    if (!isStarted || !attemptId) return;
    const i = window.setInterval(() => queueAttemptUpdate({ currentIndex }), 20000);
    return () => window.clearInterval(i);
  }, [isStarted, attemptId, queueAttemptUpdate, currentIndex]);

  // Leave fullscreen on unmount
  useEffect(() => {
    return () => {
      exitFullscreenSafe();
    };
  }, []);

  // Hide any app sidebars/scroll while attempting (CBT should feel like a dedicated screen)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const goToIndex = (idx: number) => {
    const next = Math.max(0, Math.min(idx, questions.length - 1));
    setCurrentIndex(next);
    if (attemptId) queueAttemptUpdate({ currentIndex: next });
  };

  const goToSectionIndex = (sectionIdx: number) => {
    const q = sectionQuestions[sectionIdx];
    if (!q) return;
    const globalIdx = questions.findIndex((globalQ) => globalQ.id === q.id);
    if (globalIdx >= 0) goToIndex(globalIdx);
  };

  const switchSection = (sectionId: string) => {
    setCurrentSectionId(sectionId);
    // Find first question of this section
    const firstQIdx = questions.findIndex((q) => (q.sectionId || "main") === sectionId);
    if (firstQIdx >= 0) {
      goToIndex(firstQIdx);
    }
  };

  const handleStart = async () => {
    if (!firebaseUser || !testId || !educatorId || !testMeta) return;

    const fullscreenOk = await requestFullscreenSafe();
    if (!fullscreenOk)
      toast.message("Fullscreen was blocked by browser. Continuing in normal mode.");

    let id = attemptId;
    let startedAtMs = attemptStartedAtMs;

    try {
      const totalSec = durationSec || testMeta.durationMinutes * 60;

      // Resume expired attempt -> submit immediately
      if (id && startedAtMs && computeRemainingSeconds(startedAtMs, totalSec) <= 0) {
        toast.error("Time is already over. Submitting your test...");
        await handleSubmit(true);
        return;
      }

      if (!id) {
        startedAtMs = Date.now();
        const initialResponses = buildInitResponses(questions);

        const payload: AttemptDoc = {
          studentId: firebaseUser.uid,
          educatorId,
          tenantSlug: tenantSlug || null,
          testId,
          testTitle: testMeta.title,
          subject: testMeta.subject,
          status: "in_progress",
          durationSec: totalSec,
          startedAtMs,
          currentIndex,
          responses: initialResponses,
          exitCount: 0,
          createdAt: serverTimestamp(),
          startedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const ref = await addDoc(collection(db, "attempts"), payload);
        id = ref.id;

        setAttemptId(id);
        localStorage.setItem(attemptIdStorageKey, id);

        setResponses((prev) => ({ ...initialResponses, ...prev }));
      } else if (!startedAtMs) {
        startedAtMs = Date.now();
        setAttemptStartedAtMs(startedAtMs);
        await updateDoc(doc(db, "attempts", id), { startedAtMs, updatedAt: serverTimestamp() });
      }

      const remaining = computeRemainingSeconds(startedAtMs!, totalSec);
      setAttemptStartedAtMs(startedAtMs!);
      setDurationSec(totalSec);
      setTimerStartSeconds(remaining);

      setIsStarted(true);
      setStartDialogOpen(false);
    } catch (e) {
      console.error(e);
      logError(e, "cbt:start-test");
      toast.error("Failed to start test");
    }
  };

  const handleSelectOption = (answer: string) => {
    if (!currentQuestion || !isStarted) return;
    setSelectedAnswer(answer);
  };

  const handleSaveAndNext = () => {
    if (!currentQuestion || !attemptId || !isStarted) return;

    const answer = selectedAnswer;
    const hasAnswer = answer !== null && answer !== undefined && String(answer).trim() !== "";
    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        answer: hasAnswer ? answer : null,
        answered: hasAnswer,
        visited: true,
        markedForReview: false,
      },
    }));

    queueAttemptUpdate({
      [`responses.${currentQuestion.id}.answer`]: hasAnswer ? answer : null,
      [`responses.${currentQuestion.id}.answered`]: hasAnswer,
      [`responses.${currentQuestion.id}.visited`]: true,
      [`responses.${currentQuestion.id}.markedForReview`]: false,
      currentIndex,
    });

    // Move to next in section, or first of next section if available
    if (currentSectionIndex < sectionQuestions.length - 1) {
      goToSectionIndex(currentSectionIndex + 1);
    } else {
      // Find next section
      const currentSectionIdx = sections.findIndex((s) => s.id === currentSectionId);
      if (currentSectionIdx >= 0 && currentSectionIdx < sections.length - 1) {
        switchSection(sections[currentSectionIdx + 1].id);
      } else {
        toast.info("End of test reached.");
      }
    }
  };

  const handleSaveAndMarkForReview = () => {
    if (!currentQuestion || !attemptId || !isStarted) return;

    const answer = selectedAnswer;
    const hasAnswer = answer !== null && answer !== undefined && String(answer).trim() !== "";
    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        answer: hasAnswer ? answer : null,
        answered: hasAnswer,
        visited: true,
        markedForReview: true,
      },
    }));

    queueAttemptUpdate({
      [`responses.${currentQuestion.id}.answer`]: hasAnswer ? answer : null,
      [`responses.${currentQuestion.id}.answered`]: hasAnswer,
      [`responses.${currentQuestion.id}.visited`]: true,
      [`responses.${currentQuestion.id}.markedForReview`]: true,
      currentIndex,
    });

    // Move to next in section, or first of next section if available
    if (currentSectionIndex < sectionQuestions.length - 1) {
      goToSectionIndex(currentSectionIndex + 1);
    } else {
      // Find next section
      const currentSectionIdx = sections.findIndex((s) => s.id === currentSectionId);
      if (currentSectionIdx >= 0 && currentSectionIdx < sections.length - 1) {
        switchSection(sections[currentSectionIdx + 1].id);
      } else {
        toast.info("End of test reached.");
      }
    }
  };

  const handleMarkForReviewAndNext = () => {
    if (!currentQuestion || !attemptId || !isStarted) return;

    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...prev[currentQuestion.id], markedForReview: true },
    }));

    queueAttemptUpdate({ [`responses.${currentQuestion.id}.markedForReview`]: true, currentIndex });

    // Move to next in section, or first of next section if available
    if (currentSectionIndex < sectionQuestions.length - 1) {
      goToSectionIndex(currentSectionIndex + 1);
    } else {
      // Find next section
      const currentSectionIdx = sections.findIndex((s) => s.id === currentSectionId);
      if (currentSectionIdx >= 0 && currentSectionIdx < sections.length - 1) {
        switchSection(sections[currentSectionIdx + 1].id);
      } else {
        toast.info("End of test reached.");
      }
    }
  };

  const handleMarkForReview = () => {
    if (!currentQuestion || !attemptId) return;
    const nextVal = !responses[currentQuestion.id]?.markedForReview;

    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...prev[currentQuestion.id], markedForReview: nextVal },
    }));

    queueAttemptUpdate({
      [`responses.${currentQuestion.id}.markedForReview`]: nextVal,
      currentIndex,
    });
  };

  const handleClearResponse = () => {
    if (!currentQuestion || !attemptId) return;

    setSelectedAnswer(null);
    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        answer: null,
        answered: false,
        markedForReview: false,
      },
    }));

    queueAttemptUpdate({
      [`responses.${currentQuestion.id}.answer`]: null,
      [`responses.${currentQuestion.id}.answered`]: false,
      [`responses.${currentQuestion.id}.markedForReview`]: false,
      currentIndex,
    });
  };

  const computeScore = (responseMap: Record<string, AttemptResponse>) => {
    let score = 0;
    let maxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;

    for (const q of questions) {
      maxScore += safeNumber(q.marks.correct, 0);

      const ans = responseMap[q.id]?.answer;
      if (ans === null || ans === undefined || String(ans).trim() === "") {
        continue;
      }

      // Subjective types are scored by AI separately — skip here
      if (q.type === "short_answer" || q.type === "upload") {
        continue;
      }

      if (q.type === "integer") {
        if (String(ans).trim() === String(q.correctAnswer ?? "").trim()) {
          score += safeNumber(q.marks.correct, 0);
          correctCount += 1;
        } else {
          score -= Math.abs(safeNumber(q.marks.incorrect, 0));
          incorrectCount += 1;
        }
      } else {
        if (String(ans) === String(q.correctAnswer ?? "")) {
          score += safeNumber(q.marks.correct, 0);
          correctCount += 1;
        } else {
          score -= Math.abs(safeNumber(q.marks.incorrect, 0));
          incorrectCount += 1;
        }
      }
    }

    const attempted = correctCount + incorrectCount;
    const accuracy = attempted > 0 ? correctCount / attempted : 0;

    return { score, maxScore, correctCount, incorrectCount, accuracy };
  };

  const flushPendingSaves = async () => {
    if (!attemptRef) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const pending = pendingUpdateRef.current;
    pendingUpdateRef.current = {};
    if (Object.keys(pending).length > 0)
      await updateDoc(attemptRef, { ...pending, updatedAt: serverTimestamp() });
  };

  const handleSubmit = async (isAutoSubmit = false) => {
    if (!attemptId || !firebaseUser || !testId || !educatorId || !testMeta) return;

    try {
      setSaving(true);
      await flushPendingSaves();

      const submissionResponses = { ...effectiveResponses };
      const counts = computeResponseCounts(submissionResponses);
      const totalSec = durationSec || testMeta.durationMinutes * 60;
      const startedAtMs = attemptStartedAtMs || Date.now();
      const remaining = computeRemainingSeconds(startedAtMs, totalSec);
      const timeTakenSec = Math.max(0, totalSec - remaining);

      // Identify subjective questions that have answers
      const subjectiveToEvaluate = questions.filter((q) => {
        if (q.type !== "short_answer" && q.type !== "upload") return false;
        const ans = submissionResponses[q.id]?.answer;
        return ans !== null && ans !== undefined && String(ans).trim() !== "";
      });

      // Compute objective score first
      const objectiveResult = computeScore(submissionResponses);
      let finalScore = objectiveResult.score;
      const finalMaxScore = objectiveResult.maxScore;

      // AI evaluation for subjective questions
      if (subjectiveToEvaluate.length > 0) {
        setSaving(false);
        setSubmitDialogOpen(false);
        setEvaluatingSubjective(true);
        setEvaluationProgress(
          `Evaluating ${subjectiveToEvaluate.length} subjective answer${subjectiveToEvaluate.length > 1 ? "s" : ""}...`
        );
        await exitFullscreenSafe();

        try {
          const evaluations = subjectiveToEvaluate.map((q) => ({
            questionId: q.id,
            questionText: q.stem,
            questionType: q.type === "upload" ? ("UPLOAD" as const) : ("SHORT_ANSWER" as const),
            referenceAnswer: q.referenceAnswer || "",
            referenceKeywords: q.referenceKeywords || [],
            referenceAnswerImageUrl: q.referenceAnswerFileUrl || "",
            evaluationInstructions: q.evaluationInstructions || "",
            studentAnswer: String(submissionResponses[q.id]?.answer || ""),
            maxScore: safeNumber(q.marks.correct, 5),
          }));

          setEvaluationProgress(
            `AI is analyzing your answers... (0/${subjectiveToEvaluate.length})`
          );

          const res = await fetch("/api/ai/evaluate-subjective", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ evaluations }),
          });

          if (res.ok) {
            const data = await res.json();
            const aiResults: Record<string, any> = data.results || {};

            let evaluatedCount = 0;
            for (const q of subjectiveToEvaluate) {
              const aiResult = aiResults[q.id];
              if (aiResult) {
                submissionResponses[q.id] = {
                  ...submissionResponses[q.id],
                  aiEvaluation: {
                    score: safeNumber(aiResult.score, 0),
                    maxScore: safeNumber(aiResult.maxScore, safeNumber(q.marks.correct, 5)),
                    confidence: safeNumber(aiResult.confidence, 0.5),
                    feedback: aiResult.feedback || "",
                    evaluatedAt: aiResult.evaluatedAt || Date.now(),
                  },
                };
                finalScore += safeNumber(aiResult.score, 0);
                evaluatedCount += 1;
                setEvaluationProgress(
                  `AI is analyzing your answers... (${evaluatedCount}/${subjectiveToEvaluate.length})`
                );
              }
            }
          } else {
            console.error("AI evaluation failed:", res.status);
            setEvaluationProgress(
              "AI evaluation encountered an issue. Saving with partial scores..."
            );
            await new Promise((r) => setTimeout(r, 1500));
          }
        } catch (evalErr) {
          console.error("AI evaluation error:", evalErr);
          setEvaluationProgress(
            "AI evaluation encountered an issue. Saving with partial scores..."
          );
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      const totalAnswered = questions.filter((q) => {
        const ans = submissionResponses[q.id]?.answer;
        return ans !== null && ans !== undefined && String(ans).trim() !== "";
      }).length;
      const finalAccuracy = totalAnswered > 0 && finalMaxScore > 0 ? finalScore / finalMaxScore : 0;

      setEvaluationProgress("Saving your results...");

      await updateDoc(doc(db, "attempts", attemptId), {
        status: "submitted",
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        responses: submissionResponses,
        score: finalScore,
        maxScore: finalMaxScore,
        correctCount: objectiveResult.correctCount,
        incorrectCount: objectiveResult.incorrectCount,
        unansweredCount: counts.unansweredCount,
        markedForReviewCount: counts.markedForReviewCount,
        notVisitedCount: counts.notVisitedCount,
        notAnsweredCount: counts.notAnsweredCount,
        accuracy: finalAccuracy,
        timeTakenSec,
        hasSubjectiveQuestions: subjectiveToEvaluate.length > 0,
        subjectiveEvaluatedCount: subjectiveToEvaluate.filter(
          (q) => submissionResponses[q.id]?.aiEvaluation
        ).length,
      });

      localStorage.removeItem(attemptIdStorageKey);
      if (!evaluatingSubjective) await exitFullscreenSafe();

      // Invalidate cached attempt counts & dashboard so they refresh immediately
      queryClient.invalidateQueries({ queryKey: ["studentAttemptCounts"] });
      queryClient.invalidateQueries({ queryKey: ["studentDashboardAttempts"] });
      queryClient.invalidateQueries({ queryKey: ["studentRank"] });

      navigate(`/student/results/${attemptId}?fromTest=true${isAutoSubmit ? "&auto=1" : ""}`);
    } catch (e) {
      console.error(e);
      logError(e, "cbt:submit-test");
      toast.error("Failed to submit test");
    } finally {
      setSaving(false);
      setEvaluatingSubjective(false);
      setEvaluationProgress("");
      setSubmitDialogOpen(false);
    }
  };

  const handleTimeUp = async () => {
    toast.error("Time's up! Submitting your test...");
    await handleSubmit(true);
  };

  // Proctoring: Prevent copy, cut, paste, context menu
  useEffect(() => {
    if (!isStarted) return;

    const preventDefault = (e: Event) => e.preventDefault();

    document.addEventListener("copy", preventDefault);
    document.addEventListener("cut", preventDefault);
    document.addEventListener("paste", preventDefault);
    document.addEventListener("contextmenu", preventDefault);

    return () => {
      document.removeEventListener("copy", preventDefault);
      document.removeEventListener("cut", preventDefault);
      document.removeEventListener("paste", preventDefault);
      document.removeEventListener("contextmenu", preventDefault);
    };
  }, [isStarted]);

  // Use a ref to access latest values in the violation effect
  const proctorStateRef = useRef({
    isStarted,
    exitCount,
    submitDialogOpen,
    violationModalOpen,
    instructionsOpen,
  });
  useEffect(() => {
    proctorStateRef.current = {
      isStarted,
      exitCount,
      submitDialogOpen,
      violationModalOpen,
      instructionsOpen,
    };
  }, [isStarted, exitCount, submitDialogOpen, violationModalOpen, instructionsOpen]);

  const handleViolation = useCallback(
    async (violationType = "Proctoring Violation") => {
      const nextCount = proctorStateRef.current.exitCount + 1;
      setExitCount(nextCount);
      queueAttemptUpdate({ exitCount: nextCount });

      // Log violation to educator's cheat_alerts collection
      if (educatorId && firebaseUser && testMeta) {
        try {
          await addDoc(collection(db, "educators", educatorId, "cheat_alerts"), {
            studentId: firebaseUser.uid,
            studentName: firebaseUser.displayName || profile?.fullName || "Unknown Student",
            testId: testMeta.id,
            testTitle: testMeta.title,
            violationType,
            tenantSlug: tenantSlug || "main",
            timestamp: serverTimestamp(),
          });
        } catch (e) {
          console.error("Failed to log cheat alert", e);
        }
      }

      if (nextCount > 3) {
        toast.error("Maximum warnings exceeded. Submitting test automatically.");
        handleSubmit(true);
      } else {
        setViolationModalOpen(true);
      }
    },
    [queueAttemptUpdate, handleSubmit, educatorId, firebaseUser, profile, testMeta, tenantSlug]
  );

  // Proctoring: Tab switch & Full-screen exit logic
  useEffect(() => {
    if (!isStarted) return;

    const handleVisibilityChange = () => {
      if (ignoreProctoringRef.current) return;
      if (document.visibilityState === "hidden") {
        handleViolation("Switched Tab / Window Hidden");
      }
    };

    const handleFullscreenChange = () => {
      if (ignoreProctoringRef.current) return;
      const {
        isStarted: started,
        submitDialogOpen: subOpen,
        violationModalOpen: violOpen,
        instructionsOpen: instOpen,
      } = proctorStateRef.current;
      if (!document.fullscreenElement && started && !subOpen && !violOpen && !instOpen) {
        handleViolation("Exited Fullscreen");
      }
    };

    const handleWindowFocus = () => {
      const { isStarted: started } = proctorStateRef.current;
      if (resumeFullscreenRef.current && started) {
        resumeFullscreenRef.current = false;
        void requestFullscreenSafe();
      }
      ignoreProctoringRef.current = false;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isStarted, handleViolation]);

  // Warn on reload/close while started
  useEffect(() => {
    if (!isStarted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isStarted]);

  if (loading || authLoading || tenantLoading)
    return <div className="py-12 text-center">Loading...</div>;
  if (loadError || !testMeta || !currentQuestion)
    return <div className="py-12 text-center">{loadError || "Failed to load test"}</div>;

  // AI Evaluation Overlay — shown while Gemini grades subjective answers
  if (evaluatingSubjective) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#fff",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            border: "4px solid rgba(99, 102, 241, 0.3)",
            borderTopColor: "#6366f1",
            animation: "cbt-eval-spin 1s linear infinite",
            marginBottom: 32,
          }}
        />
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>
          Evaluating Your Answers
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "#94a3b8",
            maxWidth: 400,
            textAlign: "center",
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          AI is reviewing your subjective answers to provide accurate scoring. This may take a
          moment.
        </p>
        <div
          style={{
            padding: "8px 20px",
            background: "rgba(99, 102, 241, 0.15)",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            color: "#a5b4fc",
            border: "1px solid rgba(99, 102, 241, 0.25)",
          }}
        >
          {evaluationProgress || "Preparing..."}
        </div>
        <style>{`
          @keyframes cbt-eval-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  const timerKey = isStarted ? `running_${attemptId || "new"}` : `paused_${attemptId || "new"}`;

  // Palette legend counts
  const notVisitedCount = submissionCounts.notVisitedCount;
  const notAnsweredCount = submissionCounts.notAnsweredCount;
  const markedForReviewCount = submissionCounts.markedForReviewUnansweredCount;
  const answeredAndMarkedCount = submissionCounts.answeredAndMarkedCount;

  const getQuestionBtnStyle = (qId: string): React.CSSProperties => {
    const r = responses[qId];
    const isCurrent = currentQuestion?.id === qId;

    if (isCurrent) {
      return { background: "#3b82f6", color: "#ffffff", border: "2px solid #1e40af" };
    }
    if (r?.answered && r?.markedForReview) {
      return {
        background: "linear-gradient(135deg, #7c3aed 60%, #22c55e 100%)",
        color: "#ffffff",
        border: "1px solid #7c3aed",
      };
    }
    if (r?.answered) {
      return { background: "#22c55e", color: "#ffffff", border: "1px solid #16a34a" };
    }
    if (r?.markedForReview) {
      return { background: "#7c3aed", color: "#ffffff", border: "1px solid #6d28d9" };
    }
    if (r?.visited) {
      return { background: "#ef4444", color: "#ffffff", border: "1px solid #dc2626" };
    }
    return { background: "#e5e7eb", color: "#374151", border: "1px solid #d1d5db" };
  };

  const PaletteContent = ({ onClose }: { onClose?: () => void }) => (
    <div style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Legend */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #d1d5db" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#e5e7eb",
                border: "1px solid #d1d5db",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 10,
                color: "#374151",
              }}
            >
              {notVisitedCount}
            </span>
            <span style={{ color: "#374151" }}>Not Visited</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#ef4444",
                border: "1px solid #dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 10,
                color: "#fff",
              }}
            >
              {notAnsweredCount}
            </span>
            <span style={{ color: "#374151" }}>Not Answered</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#22c55e",
                border: "1px solid #16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 10,
                color: "#fff",
              }}
            >
              {answeredCount}
            </span>
            <span style={{ color: "#374151" }}>Answered</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#7c3aed",
                border: "1px solid #6d28d9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 10,
                color: "#fff",
              }}
            >
              {markedForReviewCount}
            </span>
            <span style={{ color: "#374151" }}>Marked for Review</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, gridColumn: "span 2" }}>
            <span
              style={{
                position: "relative",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#7c3aed",
                border: "1px solid #6d28d9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 10,
                color: "#fff",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  bottom: -3,
                  right: -3,
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#22c55e",
                  border: "1px solid #fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 7,
                  color: "#fff",
                }}
              >
                ✓
              </span>
              {answeredAndMarkedCount}
            </span>
            <span style={{ color: "#374151" }}>
              Answered &amp; Marked for Review{" "}
              <span style={{ fontSize: 9, color: "#6b7280" }}>(will be considered)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Section tabs if multiple */}
      {sections.length > 1 && (
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            borderBottom: "1px solid #d1d5db",
            padding: "0 8px",
          }}
        >
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => switchSection(section.id)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: currentSectionId === section.id ? 700 : 400,
                borderBottom:
                  currentSectionId === section.id ? "3px solid #2563eb" : "3px solid transparent",
                color: currentSectionId === section.id ? "#2563eb" : "#374151",
                background: "none",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {section.name}
            </button>
          ))}
        </div>
      )}

      {/* Question grid (current section only) */}
      <div style={{ padding: "15px", overflowY: "auto", maxHeight: "calc(100% - 160px)" }}>
        <div className="question-grid">
          {sectionQuestions.map((sq, idx) => {
            const isGrouped = !!sq.groupId;
            // Determine if this question starts a new group vs continuing one
            const prevQ = sectionQuestions[idx - 1];
            const isGroupStart = isGrouped && (!prevQ || prevQ.groupId !== sq.groupId);
            const nextQ = sectionQuestions[idx + 1];
            const isGroupEnd = isGrouped && (!nextQ || nextQ.groupId !== sq.groupId);

            return (
              <div
                key={sq.id}
                style={{
                  position: "relative",
                  ...(isGrouped && {
                    borderLeft: "3px solid #f59e0b",
                    ...(isGroupStart && {
                      borderTop: "3px solid #f59e0b",
                      borderTopLeftRadius: 4,
                      marginTop: 4,
                    }),
                    ...(isGroupEnd && {
                      borderBottom: "3px solid #f59e0b",
                      borderBottomLeftRadius: 4,
                      marginBottom: 4,
                    }),
                    paddingLeft: 2,
                  }),
                }}
              >
                <button
                  onClick={() => {
                    const globalIdx = questions.findIndex((q) => q.id === sq.id);
                    if (globalIdx >= 0) goToIndex(globalIdx);
                    onClose?.();
                  }}
                  style={{
                    ...getQuestionBtnStyle(sq.id),
                    width: "100%",
                    aspectRatio: "1",
                    borderRadius: "50%",
                    fontSize: "13px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "transform 0.1s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    padding: 0,
                    lineHeight: "1",
                    textAlign: "center",
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
                  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  title={isGrouped ? "Part of passage/case-study group" : undefined}
                >
                  <span
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "center",
                      color: "inherit",
                    }}
                  >
                    {idx + 1}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        height: "100dvh",
        background: "#f3f4f6",
        fontFamily: "Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none", // Prevent text selection
      }}
    >
      {/* ─── INSTITUTE WATERMARK ─── */}
      {tenant?.coachingName &&
        (() => {
          const name = tenant.coachingName!.replace(
            /[<>&"]/g,
            (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c
          );
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#000000" fill-opacity="0.45" transform="rotate(-30,160,90)" letter-spacing="3">${name}</text></svg>`;
          return (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 102,
                backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
                backgroundRepeat: "repeat",
                backgroundSize: "320px 180px",
              }}
            />
          );
        })()}

      {/* ─── INSTRUCTIONS GATE ─── */}
      {!isStarted && instructionsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 680,
              borderRadius: 12,
              background: "#fff",
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #e5e7eb",
                background: "#1e3a8a",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Computer Based Test</div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{testMeta?.title || "Test"}</div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  background: "rgba(255,255,255,0.15)",
                  padding: "4px 12px",
                  borderRadius: 20,
                }}
              >
                Duration: {testMeta?.durationMinutes ?? 60} min
              </div>
            </div>

            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#1e3a8a" }}>
                General Instructions
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  fontSize: 13,
                  color: "#374151",
                }}
              >
                {[
                  {
                    icon: (
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 3,
                          background: "#e5e7eb",
                          border: "1.5px solid #9ca3af",
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                    ),
                    text: "This is a computer-based test with a timer; it will auto-submit when time ends.",
                  },
                  {
                    icon: (
                      <span
                        style={{
                          width: 0,
                          height: 0,
                          borderTop: "10px solid transparent",
                          borderBottom: "10px solid transparent",
                          borderLeft: "16px solid #f97316",
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                    ),
                    text: `The time duration for the test is ${testMeta?.durationMinutes ?? 60} minutes.`,
                  },
                  {
                    icon: (
                      <span
                        style={{
                          width: 0,
                          height: 0,
                          borderTop: "10px solid transparent",
                          borderBottom: "10px solid transparent",
                          borderLeft: "16px solid #22c55e",
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                    ),
                    text: "Use Save & Next to move forward and Previous to go back.",
                  },
                  {
                    icon: (
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "#7c3aed",
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                    ),
                    text: "You can change or clear your answer anytime before submission.",
                  },
                  {
                    icon: (
                      <span
                        style={{
                          position: "relative",
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "#7c3aed",
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            bottom: -3,
                            right: -3,
                            width: 11,
                            height: 11,
                            borderRadius: "50%",
                            background: "#22c55e",
                            border: "1.5px solid #fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 8,
                            color: "#fff",
                          }}
                        >
                          ✓
                        </span>
                      </span>
                    ),
                    text: "Use Mark for Review & Next to revisit questions later (answered & marked will be evaluated).",
                  },
                  {
                    icon: (
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 3,
                          background: "#f3f4f6",
                          border: "1.5px solid #9ca3af",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        1
                      </span>
                    ),
                    text: "Check question status using the Question Palette on the right.",
                  },
                ].map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ marginTop: 1 }}>{item.icon}</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: "#1f2937",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                    checked={instructionsChecked}
                    onChange={(e) => setInstructionsChecked(e.target.checked)}
                  />
                  I have read and understood all the instructions.
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    disabled={!instructionsChecked}
                    onClick={async () => {
                      try {
                        await handleStart();
                        setInstructionsOpen(false);
                      } catch {
                        /* noop */
                      }
                    }}
                    style={{
                      padding: "9px 32px",
                      background: instructionsChecked ? "#1e3a8a" : "#9ca3af",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: instructionsChecked ? "pointer" : "not-allowed",
                      letterSpacing: 1,
                    }}
                  >
                    PROCEED
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOP HEADER BAR ─── */}
      <div
        style={{
          background: "#1e3a8a",
          color: "#fff",
          padding: "0 12px",
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {testMeta.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, padding: "0", borderRadius: 20, whiteSpace: "nowrap" }}>
            {isStarted ? (
              <TimerChip
                key={timerKey}
                initialSeconds={timerStartSeconds}
                onTimeUp={handleTimeUp}
                className="h-8 border border-white/30 bg-white/20 px-3 py-0 text-sm font-bold text-white"
              />
            ) : (
              <span
                style={{
                  background: "rgba(255,255,255,0.15)",
                  padding: "3px 10px",
                  borderRadius: 20,
                }}
              >
                {testMeta.durationMinutes} min
              </span>
            )}
          </div>
          {/* Mobile palette button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMobilePaletteOpen(true);
            }}
            style={{
              display: "none",
              alignItems: "center",
              gap: 4,
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              pointerEvents: "auto",
            }}
            className="mobile-palette-btn"
          >
            <LayoutGrid size={14} /> Palette
          </button>
        </div>
      </div>

      {/* ─── MAIN BODY ─── */}
      <div
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", overflow: "hidden" }}
      >
        {/* LEFT: Question Panel */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Section tabs */}
          {sections.length > 1 && (
            <div
              style={{
                background: "#e5e7eb",
                borderBottom: "1px solid #d1d5db",
                display: "flex",
                overflowX: "auto",
                flexShrink: 0,
              }}
            >
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => switchSection(section.id)}
                  style={{
                    padding: "7px 16px",
                    fontSize: 13,
                    fontWeight: currentSectionId === section.id ? 700 : 400,
                    borderBottom:
                      currentSectionId === section.id
                        ? "3px solid #1e3a8a"
                        : "3px solid transparent",
                    color: currentSectionId === section.id ? "#1e3a8a" : "#374151",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {section.name}
                </button>
              ))}
            </div>
          )}

          {/* Question number + scroll area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
            {/* Question header bar */}
            <div
              style={{
                background: "#dbeafe",
                borderBottom: "1px solid #bfdbfe",
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 700,
                color: "#1e3a8a",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <span>Question {currentSectionIndex + 1}:</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 400, color: "#3b82f6" }}>
                  {saving ? "⬆ Saving…" : lastSavedAt ? "✓ Saved" : "Ready"}
                </span>
                <button
                  onClick={() => setSubmitDialogOpen(true)}
                  disabled={!isStarted}
                  className="mobile-submit-btn"
                  style={{
                    display: "none",
                    background: isStarted ? "#22c55e" : "#9ca3af",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isStarted ? "pointer" : "not-allowed",
                  }}
                >
                  SUBMIT
                </button>
                {!isStarted && (
                  <button
                    onClick={handleStart}
                    style={{
                      background: "#1e3a8a",
                      color: "#fff",
                      border: "none",
                      borderRadius: 5,
                      padding: "4px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {attemptId ? "Resume" : "Start Test"}
                  </button>
                )}
              </div>
            </div>

            <div style={{ padding: "12px 16px" }}>
              {/* Passage / Case Study block */}
              {!!currentQuestion.passage &&
                (() => {
                  const p = currentQuestion.passage!;
                  const isTable = p.content.trimStart().startsWith("<table");
                  return (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                      {p.title && (
                        <div className="flex items-center gap-1.5 border-b border-amber-200 px-3 py-2 dark:border-amber-800">
                          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                            {isTable ? "Case Study" : "Passage"}
                          </span>
                          <span className="truncate text-xs text-amber-600 dark:text-amber-500">
                            {p.title}
                          </span>
                        </div>
                      )}
                      <div
                        className={cn(
                          "p-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300",
                          isTable && "overflow-x-auto"
                        )}
                      >
                        <HtmlView html={p.content} />
                      </div>
                    </div>
                  );
                })()}

              {/* Question stem */}
              <div style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.7, marginBottom: 16 }}>
                <HtmlView html={currentQuestion.stem} className="flex-1" />
              </div>

              {/* Options – MCQ */}
              {currentQuestion.type === "mcq" && currentQuestion.options && (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#6b7280",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Options :
                  </div>
                  {currentQuestion.options.map((option, i) => {
                    const isSelected = selectedAnswer === option.id;
                    return (
                      <label
                        key={option.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "8px 10px",
                          borderRadius: 5,
                          cursor: isStarted ? "pointer" : "not-allowed",
                          background: isSelected ? "#dbeafe" : "transparent",
                          border: isSelected ? "1px solid #93c5fd" : "1px solid transparent",
                          marginBottom: 4,
                          transition: "background 0.15s",
                        }}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQuestion.id}`}
                          value={option.id}
                          checked={isSelected}
                          disabled={!isStarted}
                          onChange={() => handleSelectOption(option.id)}
                          style={{
                            marginTop: 2,
                            accentColor: "#1e3a8a",
                            cursor: isStarted ? "pointer" : "not-allowed",
                          }}
                        />
                        <span style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.6 }}>
                          <span style={{ fontWeight: 700, marginRight: 4 }}>
                            {String.fromCharCode(65 + i)}.
                          </span>
                          <HtmlView html={option.text} className="inline" />
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Integer type */}
              {currentQuestion.type === "integer" && (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#6b7280",
                      marginBottom: 6,
                      textTransform: "uppercase",
                    }}
                  >
                    Your Answer :
                  </div>
                  <input
                    type="number"
                    placeholder="Enter integer answer"
                    value={selectedAnswer || ""}
                    onChange={(e) => handleSelectOption(e.target.value)}
                    disabled={!isStarted}
                    style={{
                      padding: "8px 12px",
                      border: "1.5px solid #d1d5db",
                      borderRadius: 5,
                      fontSize: 14,
                      width: 200,
                      outline: "none",
                    }}
                  />
                </div>
              )}

              {/* Short Answer type */}
              {currentQuestion.type === "short_answer" && (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#6b7280",
                      marginBottom: 6,
                      textTransform: "uppercase",
                    }}
                  >
                    Your Answer :
                  </div>
                  <textarea
                    placeholder="Type your answer here..."
                    value={selectedAnswer || ""}
                    onChange={(e) => handleSelectOption(e.target.value)}
                    disabled={!isStarted}
                    rows={6}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1.5px solid #d1d5db",
                      borderRadius: 8,
                      fontSize: 14,
                      lineHeight: 1.6,
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                      background: isStarted ? "#fff" : "#f3f4f6",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      Write a clear, complete answer. This will be evaluated by AI.
                    </span>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      {(selectedAnswer || "").length} chars
                    </span>
                  </div>
                </div>
              )}

              {/* Upload Answer type */}
              {currentQuestion.type === "upload" &&
                (() => {
                  const isUploading = saving && selectedAnswer === "__uploading__";
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#6b7280",
                          marginBottom: 6,
                          textTransform: "uppercase",
                        }}
                      >
                        Upload Your Answer :
                      </div>
                      {selectedAnswer && selectedAnswer !== "__uploading__" ? (
                        <div style={{ position: "relative", display: "inline-block" }}>
                          <img
                            src={selectedAnswer}
                            alt="Uploaded answer"
                            style={{
                              maxWidth: "100%",
                              maxHeight: 300,
                              borderRadius: 8,
                              border: "1.5px solid #d1d5db",
                              objectFit: "contain",
                            }}
                          />
                          <button
                            onClick={() => handleSelectOption("")}
                            disabled={!isStarted}
                            style={{
                              position: "absolute",
                              top: 4,
                              right: 4,
                              background: "#ef4444",
                              color: "#fff",
                              border: "none",
                              borderRadius: "50%",
                              width: 28,
                              height: 28,
                              fontSize: 14,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "32px 16px",
                            border: isUploading ? "2px solid #6366f1" : "2px dashed #d1d5db",
                            borderRadius: 12,
                            cursor: isStarted && !isUploading ? "pointer" : "not-allowed",
                            background: isUploading ? "#eef2ff" : "#f9fafb",
                            transition: "all 0.2s",
                            opacity: isUploading ? 0.8 : 1,
                          }}
                          onClick={() => {
                            if (!isStarted || isUploading) return;
                            resumeFullscreenRef.current = Boolean(document.fullscreenElement);
                            ignoreProctoringRef.current = true;
                          }}
                        >
                          {isUploading ? (
                            <>
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: "50%",
                                  border: "3px solid #c7d2fe",
                                  borderTopColor: "#6366f1",
                                  animation: "cbt-eval-spin 0.8s linear infinite",
                                  marginBottom: 8,
                                }}
                              />
                              <span style={{ fontSize: 13, color: "#6366f1", fontWeight: 600 }}>
                                Uploading your answer...
                              </span>
                            </>
                          ) : (
                            <>
                              <Upload size={32} style={{ color: "#9ca3af", marginBottom: 8 }} />
                              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
                                Click to upload image
                              </span>
                              <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                                JPG, PNG up to 10MB
                              </span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={!isStarted || isUploading}
                            style={{ display: "none" }}
                            onChange={async (e) => {
                              ignoreProctoringRef.current = false;
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file) return;
                              if (file.size > 10 * 1024 * 1024) {
                                toast.error("File too large. Max 10MB.");
                                return;
                              }
                              if (!file.type.startsWith("image/")) {
                                toast.error("Only image files are allowed.");
                                return;
                              }
                              try {
                                handleSelectOption("__uploading__");
                                setSaving(true);
                                const { url } = await uploadToImageKit(
                                  file,
                                  `student_ans_${currentQuestion.id}_${Date.now()}.${file.name.split(".").pop() || "jpg"}`,
                                  "/student-answers",
                                  "student"
                                );
                                handleSelectOption(url);
                                toast.success("Image uploaded successfully");
                              } catch (err: any) {
                                console.error("[StudentCBT] Upload failed:", err);
                                handleSelectOption("");
                                toast.error(err?.message || "Upload failed. Please try again.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          />
                        </label>
                      )}
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                        Upload a clear photo of your handwritten answer.
                      </div>
                    </div>
                  );
                })()}
            </div>
          </div>

          {/* ─── ACTION BUTTONS ROW ─── */}
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid #e5e7eb",
              background: "#f9fafb",
              padding: "8px 12px",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
            }}
          >
            {/* Save & Next */}
            <button
              onClick={handleSaveAndNext}
              disabled={!isStarted}
              style={{
                background: isStarted ? "#22c55e" : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isStarted ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              SAVE &amp; NEXT
            </button>

            {/* Clear */}
            <button
              onClick={handleClearResponse}
              disabled={!isStarted}
              style={{
                background: "#fff",
                color: "#374151",
                border: "1.5px solid #d1d5db",
                borderRadius: 4,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isStarted ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              CLEAR
            </button>

            {/* Save & Mark for Review */}
            <button
              onClick={handleSaveAndMarkForReview}
              disabled={!isStarted}
              style={{
                background: isStarted ? "#7c3aed" : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isStarted ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              SAVE &amp; MARK FOR REVIEW
            </button>

            {/* Mark for Review & Next */}
            <button
              onClick={handleMarkForReviewAndNext}
              disabled={!isStarted}
              style={{
                background: isStarted ? "#2563eb" : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isStarted ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              MARK FOR REVIEW &amp; NEXT
            </button>
          </div>

          {/* ─── NAVIGATION ROW ─── */}
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid #e5e7eb",
              background: "#fff",
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {
                  if (currentSectionIndex > 0) {
                    goToSectionIndex(currentSectionIndex - 1);
                  } else {
                    // Try to go to previous section
                    const currentSectionIdx = sections.findIndex((s) => s.id === currentSectionId);
                    if (currentSectionIdx > 0) {
                      const prevSection = sections[currentSectionIdx - 1];
                      setCurrentSectionId(prevSection.id);
                      // Go to last question of previous section
                      const prevSectionQs = questions.filter(
                        (q) => (q.sectionId || "main") === prevSection.id
                      );
                      const globalIdx = questions.findIndex(
                        (q) => q.id === prevSectionQs[prevSectionQs.length - 1]?.id
                      );
                      if (globalIdx >= 0) goToIndex(globalIdx);
                    }
                  }
                }}
                disabled={currentIndex === 0}
                style={{
                  background: currentIndex === 0 ? "#e5e7eb" : "#fff",
                  color: currentIndex === 0 ? "#9ca3af" : "#374151",
                  border: "1.5px solid #d1d5db",
                  borderRadius: 4,
                  padding: "6px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: currentIndex === 0 ? "not-allowed" : "pointer",
                }}
              >
                &lt;&lt; BACK
              </button>
              <button
                onClick={() => {
                  if (currentSectionIndex < sectionQuestions.length - 1) {
                    goToSectionIndex(currentSectionIndex + 1);
                  } else {
                    // Try to go to next section
                    const currentSectionIdx = sections.findIndex((s) => s.id === currentSectionId);
                    if (currentSectionIdx >= 0 && currentSectionIdx < sections.length - 1) {
                      switchSection(sections[currentSectionIdx + 1].id);
                    }
                  }
                }}
                disabled={currentIndex === questions.length - 1}
                style={{
                  background: currentIndex === questions.length - 1 ? "#e5e7eb" : "#fff",
                  color: currentIndex === questions.length - 1 ? "#9ca3af" : "#374151",
                  border: "1.5px solid #d1d5db",
                  borderRadius: 4,
                  padding: "6px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: currentIndex === questions.length - 1 ? "not-allowed" : "pointer",
                }}
              >
                NEXT &gt;&gt;
              </button>
            </div>

            <button
              onClick={() => setSubmitDialogOpen(true)}
              disabled={!isStarted}
              className="bottom-submit-btn"
              style={{
                background: isStarted ? "#22c55e" : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "7px 22px",
                fontSize: 13,
                fontWeight: 700,
                cursor: isStarted ? "pointer" : "not-allowed",
              }}
            >
              SUBMIT
            </button>
          </div>
        </div>

        {/* ─── RIGHT: Question Palette (desktop) ─── */}
        <div
          className="desktop-palette"
          style={{
            width: 260,
            flexShrink: 0,
            background: "#fff",
            borderLeft: "1px solid #d1d5db",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontWeight: 700,
              fontSize: 13,
              color: "#1e3a8a",
            }}
          >
            Question Palette
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <PaletteContent />
          </div>
        </div>
      </div>

      {/* ─── MOBILE PALETTE SHEET ─── */}
      <Sheet open={mobilePaletteOpen} onOpenChange={setMobilePaletteOpen}>
        <SheetContent
          side="bottom"
          className="mobile-palette-sheet z-[200] h-[80dvh] rounded-t-2xl px-0 pb-0 lg:hidden"
        >
          <SheetHeader
            className="relative border-b px-4 pb-4 pt-6 text-left"
            style={{ background: "#1e3a8a" }}
          >
            <SheetTitle style={{ color: "#fff", fontSize: 14 }}>Question Palette</SheetTitle>
            <SheetDescription className="sr-only">
              Quickly navigate between questions and view your attempt status.
            </SheetDescription>
          </SheetHeader>
          <div style={{ overflowY: "auto", height: "calc(80dvh - 56px)" }}>
            <PaletteContent onClose={() => setMobilePaletteOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── PROCTORING VIOLATION WARNING MODAL ─── */}
      {violationModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backdropFilter: "blur(5px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              borderRadius: 16,
              background: "#fff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              overflow: "hidden",
              textAlign: "center",
              padding: "35px 25px",
            }}
          >
            <div style={{ color: "#ef4444", marginBottom: 20 }}>
              <AlertTriangle size={64} style={{ margin: "0 auto" }} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 12 }}>
              Proctoring Warning!
            </h2>
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 15, color: "#4b5563", lineHeight: 1.6 }}>
                You have left the test environment (Tab Switch or Full-screen Exit). <br />
                This is a violation of the test rules.
              </p>
              <div
                style={{
                  marginTop: 20,
                  padding: "12px",
                  background: "#fee2e2",
                  borderRadius: 8,
                  color: "#991b1b",
                  fontWeight: 700,
                }}
              >
                Warning {exitCount} of 3
              </div>
              <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>
                The test will be automatically submitted after the 3rd warning.
              </p>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => {
                  handleSubmit(true);
                  setViolationModalOpen(false);
                }}
                style={{
                  flex: 1,
                  padding: "12px 20px",
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(239,68,68,0.2)",
                }}
              >
                Submit &amp; Exit
              </button>
              <button
                onClick={async () => {
                  await requestFullscreenSafe();
                  setViolationModalOpen(false);
                }}
                style={{
                  flex: 1,
                  padding: "12px 20px",
                  background: "#1e3a8a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(30,58,138,0.2)",
                }}
              >
                Return to Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUBMIT DIALOG ─── */}
      {submitDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 10,
              background: "#fff",
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <AlertTriangle size={20} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>Submit Test?</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                  Are you sure? You won't be able to change your answers after submission.
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "14px 18px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div
                style={{ padding: 12, borderRadius: 8, background: "#dcfce7", textAlign: "center" }}
              >
                <div style={{ fontWeight: 700, fontSize: 22, color: "#16a34a" }}>
                  {answeredCount}
                </div>
                <div style={{ fontSize: 12, color: "#374151" }}>Answered</div>
              </div>
              <div
                style={{ padding: 12, borderRadius: 8, background: "#fee2e2", textAlign: "center" }}
              >
                <div style={{ fontWeight: 700, fontSize: 22, color: "#dc2626" }}>
                  {unansweredVisitedCount}
                </div>
                <div style={{ fontSize: 12, color: "#374151" }}>Not Answered</div>
              </div>
              <div
                style={{ padding: 12, borderRadius: 8, background: "#ede9fe", textAlign: "center" }}
              >
                <div style={{ fontWeight: 700, fontSize: 22, color: "#7c3aed" }}>
                  {submissionCounts.markedForReviewCount}
                </div>
                <div style={{ fontSize: 12, color: "#374151" }}>Marked for Review</div>
              </div>
              <div
                style={{ padding: 12, borderRadius: 8, background: "#f3f4f6", textAlign: "center" }}
              >
                <div style={{ fontWeight: 700, fontSize: 22, color: "#4b5563" }}>
                  {submissionCounts.notVisitedCount}
                </div>
                <div style={{ fontSize: 12, color: "#374151" }}>Not Visited</div>
              </div>
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => setSubmitDialogOpen(false)}
                style={{
                  background: "#fff",
                  color: "#374151",
                  border: "1.5px solid #d1d5db",
                  borderRadius: 6,
                  padding: "7px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={!isStarted || saving}
                style={{
                  background: isStarted ? "#22c55e" : "#9ca3af",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "7px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isStarted ? "pointer" : "not-allowed",
                }}
              >
                {saving ? "Submitting..." : "Submit Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── RESPONSIVE STYLES ─── */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-palette { display: none !important; }
          .mobile-palette-btn { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-palette-btn { display: none !important; }
          .desktop-palette { display: flex !important; }
        }
        .question-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 10px;
        }
        @media (max-width: 480px) {
          .question-grid {
            grid-template-columns: repeat(8, 1fr);
            gap: 8px;
          }
        }
        /* Fix for Sheet z-index - ensure portals appear on top of test container */
        [data-radix-portal] {
          z-index: 200 !important;
          position: relative;
        }
        /* Ensure mobile palette sheet close button is visible */
        .mobile-palette-sheet button.absolute {
          color: white !important;
          opacity: 1 !important;
          background: rgba(255,255,255,0.1) !important;
          border-radius: 50% !important;
          width: 32px !important;
          height: 32px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          top: 24px !important;
          right: 12px !important;
        }
        .mobile-palette-sheet button.absolute svg {
          width: 20px !important;
          height: 20px !important;
        }
        @keyframes cbt-eval-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
