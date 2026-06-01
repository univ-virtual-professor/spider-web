import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Clock, FileText, Award, ArrowLeft, Play, Lock, Timer } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Input } from "@shared/ui/input";

import { toast } from "sonner";
import { cn } from "@shared/lib/utils";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";
import { logError } from "@shared/lib/errorLogger";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  limit,
} from "firebase/firestore";

type TestDoc = Record<string, any>;

type Test = {
  id: string;
  title: string;
  subject: string;
  duration: number; // minutes
  questionsCount: number;
  difficulty: "Easy" | "Medium" | "Hard";
  price: number;
  attemptsAllowed: number;
  sections: { id: string; name: string; questionsCount: number }[];
  syllabus: string[];
  markingScheme: { correct: number; incorrect: number; unanswered: number };
  startTime?: number | null;
  endTime?: number | null;
};

type AttemptRow = {
  id: string;
  score: number;
  maxScore: number;
  accuracyPct: number;
  createdAtMs: number;
};

function safeNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeDifficulty(v: any): "Easy" | "Medium" | "Hard" {
  const s = String(v || "").trim();
  if (s === "Easy" || s === "Medium" || s === "Hard") return s;
  return "Medium";
}
function sumSectionQuestions(sections: any[]) {
  if (!Array.isArray(sections)) return 0;
  return sections.reduce((acc, s) => acc + safeNum(s?.questionsCount, 0), 0);
}
function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return Date.now();
}
function accuracyFrom(score: number, maxScore: number) {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}
function formatWindowTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCountdownDetailed(ms: number): string {
  if (ms <= 0) return "now";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function isExpired(expiresAt: any) {
  if (!expiresAt) return false;
  const ts = expiresAt as Timestamp;
  if (!ts?.toDate) return false;
  return ts.toDate().getTime() < Date.now();
}

export default function StudentTestDetails() {
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const { testId } = useParams();
  const navigate = useNavigate();

  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, tenantSlug: tenantSlugFromDomain, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || profile?.educatorId || null;
  const tenantSlug = tenantSlugFromDomain || profile?.tenantSlug || null;

  const [loading, setLoading] = useState(true);
  const [test, setTest] = useState<Test | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockWindowExpiresAt, setUnlockWindowExpiresAt] = useState<number | null>(null);
  const [windowTimeLeft, setWindowTimeLeft] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // unlock dialog
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const canLoad = useMemo(() => {
    return !authLoading && !tenantLoading && !!firebaseUser?.uid && !!educatorId && !!testId;
  }, [authLoading, tenantLoading, firebaseUser?.uid, educatorId, testId]);

  // Tick for live updates
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 1) Load test (educator path first, fallback to test_series)
  useEffect(() => {
    let mounted = true;

    async function loadTest() {
      if (!canLoad) {
        setLoading(authLoading || tenantLoading);
        return;
      }

      setLoading(true);

      try {
        let data: TestDoc | null = null;
        let localTestData: any = null;

        const educatorTestSnap = await getDoc(
          doc(db, "educators", educatorId!, "my_tests", testId!)
        );
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

          if (isAdminLinked && linkedAdminTestId) {
            const adminSnap = await getDoc(doc(db, "test_series", linkedAdminTestId));
            data = adminSnap.exists() ? (adminSnap.data() as TestDoc) : (localTest as TestDoc);
          } else {
            data = localTest as TestDoc;
          }
        }

        if (!data) {
          const globalSnap = await getDoc(doc(db, "test_series", testId!));
          if (globalSnap.exists()) data = globalSnap.data() as TestDoc;
        }

        if (!data) throw new Error("Test not found");

        const title = String(data?.title || "Untitled Test");
        const subject = String(data?.subject || "General Test");
        const difficulty = normalizeDifficulty(data?.level || data?.difficulty);

        const duration = safeNum(data?.durationMinutes ?? data?.duration, 60);

        const rawSections = Array.isArray(data?.sections) ? data.sections : [];
        const sections = rawSections
          .map((s: any, idx: number) => ({
            id: String(s?.id || `sec_${idx + 1}`),
            name: String(s?.name || `Section ${idx + 1}`),
            questionsCount: safeNum(s?.questionsCount, 0),
          }))
          .filter((s: any) => s.name);

        const questionsCount =
          safeNum(data?.questionsCount ?? data?.questionCount ?? data?.totalQuestions, 0) ||
          sumSectionQuestions(sections);

        const price = Math.max(0, safeNum(data?.price, 0));
        const attemptsAllowed = Math.max(
          1,
          safeNum(
            data?.attemptsAllowed ?? data?.maxAttempts,
            tenant?.testDefaults?.attemptsAllowed ?? 3
          )
        );

        const markingScheme = data?.markingScheme
          ? {
              correct: safeNum(data.markingScheme.correct, 5),
              incorrect: safeNum(data.markingScheme.incorrect, -1),
              unanswered: safeNum(data.markingScheme.unanswered, 0),
            }
          : {
              correct: safeNum(data?.positiveMarks, 5),
              incorrect: safeNum(data?.negativeMarks, -1),
              unanswered: 0,
            };

        const syllabus = Array.isArray(data?.syllabus) ? data.syllabus.map(String) : [];

        // Schedule comes from the educator's specific test doc, even if linked to admin
        const startTime = localTestData?.startTime ? toMillis(localTestData.startTime) : null;
        const endTime = localTestData?.endTime ? toMillis(localTestData.endTime) : null;

        if (!mounted) return;

        setTest({
          id: testId!,
          title,
          subject,
          duration,
          questionsCount,
          difficulty,
          price,
          attemptsAllowed,
          sections,
          syllabus,
          markingScheme,
          startTime,
          endTime,
        });

        setLoading(false);
      } catch (e: any) {
        console.error(e);
        logError(e, "test-details:load");
        if (!mounted) return;
        setTest(null);
        setLoading(false);
      }
    }

    loadTest();
    return () => {
      mounted = false;
    };
  }, [canLoad, educatorId, testId, authLoading, tenantLoading]);

  // 2) Listen unlock status
  useEffect(() => {
    if (!canLoad) return;

    const unlockId = `${firebaseUser!.uid}__${educatorId}__${testId}`;
    const unlockRef = doc(db, "testUnlocks", unlockId);

    const unsub = onSnapshot(
      unlockRef,
      (snap) => {
        setUnlocked(snap.exists());
        if (snap.exists()) {
          const d = snap.data() as any;
          const we = d?.windowExpiresAt;
          const ms =
            d?.windowMinutes === 0 || !we
              ? null
              : typeof we?.toMillis === "function"
                ? we.toMillis()
                : null;
          setUnlockWindowExpiresAt(ms);
        } else {
          setUnlockWindowExpiresAt(null);
        }
      },
      (err) => {
        console.error(err);
        setUnlocked(false);
        setUnlockWindowExpiresAt(null);
      }
    );

    return () => unsub();
  }, [canLoad, firebaseUser, educatorId, testId]);

  // 2b) Live countdown for access window
  useEffect(() => {
    if (!unlockWindowExpiresAt) {
      setWindowTimeLeft(null);
      return;
    }
    const tick = () => setWindowTimeLeft(Math.max(0, unlockWindowExpiresAt - currentTime));
    tick();
  }, [unlockWindowExpiresAt, currentTime]);

  // 3) Listen attempts for this test
  useEffect(() => {
    if (!canLoad) return;

    const qAttempts = query(
      collection(db, "attempts"),
      where("studentId", "==", firebaseUser!.uid),
      where("educatorId", "==", educatorId!),
      where("testId", "==", testId!),
      where("status", "==", "submitted"),
      orderBy("submittedAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(
      qAttempts,
      (snap) => {
        const rows: AttemptRow[] = snap.docs.map((d) => {
          const a = d.data() as any;
          const score = safeNum(a?.score, 0);
          const maxScore = safeNum(a?.maxScore, 0);
          const accuracyPct =
            a?.accuracy != null
              ? (() => {
                  const n = Number(a.accuracy);
                  const pct = Number.isFinite(n)
                    ? n <= 1.01
                      ? n * 100
                      : n
                    : accuracyFrom(score, maxScore);
                  return Math.max(0, Math.min(100, Math.round(pct)));
                })()
              : accuracyFrom(score, maxScore);

          const createdAtMs = toMillis(a?.submittedAt || a?.createdAt);

          return { id: d.id, score, maxScore, accuracyPct, createdAtMs };
        });

        setAttempts(rows);
      },
      (err) => {
        console.error(err);
        setAttempts([]);
      }
    );

    return () => unsub();
  }, [canLoad, firebaseUser, educatorId, testId]);

  const isLive = useMemo(() => {
    if (!test?.startTime || !test?.endTime) return false;
    return currentTime >= test.startTime && currentTime <= test.endTime;
  }, [test, currentTime]);

  const isLocked = useMemo(() => {
    if (!test) return true;
    if (isLive) return false; // Scheduled live tests are always unlocked for enrolled students
    if (test.price <= 0) return false;
    if (!unlocked) return true;
    if (unlockWindowExpiresAt !== null && currentTime > unlockWindowExpiresAt) return true;
    return false;
  }, [test, unlocked, unlockWindowExpiresAt, isLive, currentTime]);

  const attemptsUsed = attempts.length;
  const attemptsLeft = test ? Math.max(0, test.attemptsAllowed - attemptsUsed) : 0;

  const openUnlock = () => {
    setAccessCode("");
    setUnlockDialogOpen(true);
  };

  const redeemCode = async () => {
    if (!firebaseUser?.uid || !educatorId || !testId) return;

    const codeUpper = accessCode.trim().toUpperCase();
    if (!codeUpper) {
      toast.error("Please enter an access code.");
      return;
    }

    setRedeeming(true);
    try {
      const codeRef = doc(db, "educators", educatorId, "accessCodes", codeUpper);
      const unlockId = `${firebaseUser.uid}__${educatorId}__${testId}`;
      const unlockRef = doc(db, "testUnlocks", unlockId);

      await runTransaction(db, async (tx) => {
        const codeSnap = await tx.get(codeRef);
        if (!codeSnap.exists()) throw new Error("Invalid code");

        const codeData = codeSnap.data() as any;
        const codeTestId = String(codeData?.testSeriesId || "");

        if (!codeTestId || codeTestId !== testId) throw new Error("Code does not match this test");

        const maxUses = safeNum(codeData?.maxUses, 0);
        const usesUsed = safeNum(codeData?.usesUsed, 0);
        const expiresAt = codeData?.expiresAt ?? null;

        if (maxUses > 0 && usesUsed >= maxUses) throw new Error("Code exhausted");
        if (isExpired(expiresAt)) throw new Error("Code expired");

        const already = await tx.get(unlockRef);
        if (already.exists()) return; // don't consume again

        const windowMinutes = safeNum(codeData?.windowMinutes, 0);
        let windowExpiresAt = null;
        if (windowMinutes > 0) {
          const codeCreatedMs =
            typeof codeData?.createdAt?.toMillis === "function"
              ? codeData.createdAt.toMillis()
              : Date.now();
          windowExpiresAt = Timestamp.fromMillis(codeCreatedMs + windowMinutes * 60 * 1000);
        }

        tx.set(unlockRef, {
          studentId: firebaseUser.uid,
          educatorId,
          tenantSlug: tenantSlug ?? null,
          testSeriesId: testId,
          unlockedVia: "accessCode",
          accessCode: codeUpper,
          unlockedAt: serverTimestamp(),
          windowMinutes,
          windowExpiresAt,
        });

        tx.update(codeRef, { usesUsed: increment(1), lastUsedAt: serverTimestamp() });
      });

      toast.success("Unlocked successfully!");
      setUnlockDialogOpen(false);
      setAccessCode("");
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("Invalid code")) toast.error("Invalid access code.");
      else if (msg.includes("does not match")) toast.error("This code is for a different test.");
      else if (msg.includes("exhausted")) toast.error("This code has reached its maximum uses.");
      else if (msg.includes("expired")) toast.error("This code is expired.");
      else toast.error("Failed to redeem code.");
      console.error(e);
    } finally {
      setRedeeming(false);
    }
  };

  const startTest = () => {
    if (!test) return;
    if (isLocked) {
      openUnlock();
      return;
    }
    if (attemptsLeft <= 0) {
      toast.error("No attempts left for this test.");
      return;
    }
    navigate(`/student/tests/${test.id}/attempt`);
  };

  if (loading || authLoading || tenantLoading) {
    return <div className="py-12 text-center">Loading...</div>;
  }

  if (!test) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p>Test not found</p>
        <Button asChild>
          <Link to="/student/tests">Back to Tests</Link>
        </Button>
      </div>
    );
  }

  const isUpcoming = test.startTime && currentTime < test.startTime;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {!isApp && (
        <Button variant="ghost" asChild>
          <Link to="/student/tests">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tests
          </Link>
        </Button>
      )}

      <Card
        className={cn(
          "card-soft border-0",
          isLive
            ? "border-2 border-red-500/20 bg-red-50 dark:bg-red-900/10"
            : isUpcoming
              ? "border-2 border-amber-400/30 bg-amber-50 dark:bg-amber-900/10"
              : "bg-pastel-mint"
        )}
      >
        <CardContent className="p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge>{test.subject}</Badge>
                {isLive && (
                  <Badge variant="destructive" className="flex animate-pulse items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE NOW
                  </Badge>
                )}
                {isUpcoming && (
                  <Badge
                    variant="outline"
                    className="border-amber-600/20 bg-amber-50 text-amber-600 dark:bg-amber-900/10"
                  >
                    <Clock className="mr-1 h-3 w-3" /> UPCOMING
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold">{test.title}</h1>

              <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {test.duration} minutes
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {test.questionsCount} questions
                </span>
                <span className="flex items-center gap-1">
                  <Award className="h-4 w-4" />
                  {test.markingScheme.correct} marks per correct
                </span>
              </div>

              {test.startTime && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Schedule: {new Date(test.startTime).toLocaleString()} –{" "}
                    {new Date(test.endTime!).toLocaleTimeString()}
                  </div>
                  {isUpcoming && (
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
                      <Timer className="h-4 w-4" />
                      Starts in {formatCountdownDetailed(test.startTime - currentTime)}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 text-xs text-muted-foreground">
                Attempts: <span className="font-medium">{attemptsUsed}</span>/
                <span className="font-medium">{test.attemptsAllowed}</span>{" "}
                {attemptsLeft > 0 ? (
                  <span className="ml-2 text-green-700 dark:text-green-400">
                    ({attemptsLeft} left)
                  </span>
                ) : (
                  <span className="ml-2 text-red-600">(No attempts left)</span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {isUpcoming && !unlocked && test.price > 0 ? (
                <div className="text-right">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Wait for live time or unlock now
                  </p>
                  <Button className="gradient-bg rounded-xl" onClick={openUnlock}>
                    <Lock className="mr-2 h-4 w-4" />
                    Unlock (₹{test.price})
                  </Button>
                </div>
              ) : isLocked ? (
                <Button className="gradient-bg rounded-xl" onClick={openUnlock}>
                  <Lock className="mr-2 h-4 w-4" />
                  Unlock (₹{test.price})
                </Button>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  <Button
                    className={cn(
                      "gradient-bg rounded-xl",
                      (attemptsLeft <= 0 || isUpcoming) && "opacity-60"
                    )}
                    onClick={startTest}
                    disabled={attemptsLeft <= 0 || isUpcoming}
                  >
                    {isUpcoming ? (
                      <Clock className="mr-2 h-4 w-4" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    {isUpcoming ? "Starts Soon" : "Start Test"}
                  </Button>
                  {windowTimeLeft !== null && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-xs font-medium",
                        windowTimeLeft < 5 * 60 * 1000 ? "text-red-600" : "text-amber-600"
                      )}
                    >
                      <Timer className="h-3 w-3" />
                      Access expires in{" "}
                      {windowTimeLeft <= 0 ? "—" : formatWindowTime(windowTimeLeft)}
                    </span>
                  )}
                  {isLive && (
                    <span className="text-[10px] font-bold uppercase tracking-tighter text-red-500">
                      Unlocked via Schedule
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="card-soft border-0">
          <CardHeader>
            <CardTitle>Sections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {test.sections.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sections configured.</div>
            ) : (
              test.sections.map((section, i) => (
                <div key={section.id} className="flex justify-between rounded-xl bg-muted/50 p-3">
                  <span>
                    {i + 1}. {section.name}
                  </span>
                  <span className="text-muted-foreground">{section.questionsCount} Q</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="card-soft border-0">
          <CardHeader>
            <CardTitle>Syllabus</CardTitle>
          </CardHeader>
          <CardContent>
            {test.syllabus.length === 0 ? (
              <div className="text-sm text-muted-foreground">No syllabus added.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {test.syllabus.map((topic, i) => (
                  <Badge key={i} variant="secondary" className="rounded-full">
                    {topic}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {attempts.length > 0 && (
        <Card className="card-soft border-0">
          <CardHeader>
            <CardTitle>Your Attempts ({attempts.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attempts.map((a, i) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl bg-muted/30 p-3"
              >
                <div>
                  <p className="font-medium">Attempt {attempts.length - i}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(a.createdAtMs).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {a.score}/{a.maxScore}
                  </p>
                  <p className="text-sm text-muted-foreground">{a.accuracyPct}% accuracy</p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/student/results/${a.id}`}>View</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unlock Dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Unlock Test</DialogTitle>
            <DialogDescription>
              Enter an access code or pay online to unlock this test.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="code">
            <TabsList className="grid w-full grid-cols-2 rounded-xl">
              <TabsTrigger value="code" className="rounded-lg">
                Access Code
              </TabsTrigger>
              <TabsTrigger value="pay" className="rounded-lg">
                Pay Online
              </TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="space-y-4 pt-4">
              <Input
                placeholder="Enter access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="rounded-xl"
              />
              <Button
                className="gradient-bg w-full rounded-xl"
                onClick={redeemCode}
                disabled={redeeming}
              >
                {redeeming ? "Redeeming..." : "Redeem Code"}
              </Button>
            </TabsContent>

            <TabsContent value="pay" className="space-y-4 pt-4">
              <div className="rounded-xl bg-pastel-mint p-4 text-center">
                <p className="text-2xl font-bold">₹{test.price}</p>
                <p className="text-sm text-muted-foreground">One-time payment</p>
              </div>
              <Button
                className="gradient-bg w-full rounded-xl"
                onClick={() => toast.info("Payment integration coming soon!")}
              >
                Pay Now
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
