import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  ShieldOff,
  ShieldCheck,
  Search,
  Folder,
  ChevronDown,
  CalendarClock,
} from "lucide-react";
import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { toast } from "sonner";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { TestCard } from "@features/student/components/TestCard";
import { Badge } from "@shared/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@shared/lib/utils";

const isDppTest = (t: any) => t.type === "from_dpp" || t.type === "dpp";

const getDppDisplayTitle = (t: any) => {
  if (t.topic) return `DPP: ${t.topic}`;
  const m = String(t.title || "").match(/^DPP\s*[-–]\s*(.+?)\s*\(/i);
  return m ? `DPP: ${m[1].trim()}` : "DPP";
};

export default function StudentTests() {
  const nav = useNavigate();
  const { firebaseUser, role, enrolledTenants, profile, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, isTenantDomain, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || "";
  const [seatActive, setSeatActive] = useState(false);
  const [billingLoading, setBillingLoading] = useState(true);

  const [unlockedIds, setUnlockedIds] = useState<Map<string, number | null>>(new Map());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authLoading && role && role !== "STUDENT") nav("/login?role=student");
  }, [authLoading, role, nav]);

  // Ensure student appears in educator learners list (idempotent)
  useEffect(() => {
    (async () => {
      if (!firebaseUser || !tenantSlug || !isTenantDomain) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch("/api/tenant/register-student", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tenantSlug }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn("[StudentTests] register-student failed:", data?.error || res.statusText);
        }
      } catch (err) {
        console.warn("[StudentTests] register-student request failed:", err);
      }
    })();
  }, [firebaseUser, tenantSlug, isTenantDomain]);

  // Subscribe to billing access (subscription + seat) — kept as onSnapshot for real-time gating
  useEffect(() => {
    if (!firebaseUser?.uid || !educatorId) {
      setBillingLoading(false);
      return;
    }

    setBillingLoading(true);

    const unsubSeat = onSnapshot(
      doc(db, "educators", educatorId, "billingSeats", firebaseUser.uid),
      (snap) => {
        const s = String((snap.data() as any)?.status || "").toLowerCase();
        setSeatActive(s === "active");
        setBillingLoading(false);
      }
    );

    return () => {
      unsubSeat();
    };
  }, [firebaseUser?.uid, educatorId]);

  const enrolledHere = tenantSlug ? enrolledTenants.includes(tenantSlug) : false;
  const allowed = enrolledHere && seatActive;

  const studentBatchId = profile?.batchId;

  // Load tests via useQuery (cached, no real-time listener needed)
  const { data: tests = [] } = useQuery({
    queryKey: ["studentTests", educatorId, studentBatchId],
    queryFn: async () => {
      const qTests = query(
        collection(db, "educators", educatorId, "my_tests"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qTests);
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      // Show test if: legacy (no targetBatches field) OR student's batch is in targetBatches
      return all.filter((t: any) =>
        t.targetBatches === undefined || t.targetBatches === null
          ? true
          : studentBatchId
            ? t.targetBatches.includes(studentBatchId)
            : t.targetBatches.length === 0
      );
    },
    enabled: allowed && !!educatorId,
    staleTime: 2 * 60 * 1000,
  });

  // Load unlocked tests — kept as onSnapshot because window expiry needs real-time checks
  useEffect(() => {
    if (!firebaseUser?.uid || !educatorId) return;

    const qUnlock = query(
      collection(db, "testUnlocks"),
      where("studentId", "==", firebaseUser.uid),
      where("educatorId", "==", educatorId)
    );

    const unsub = onSnapshot(qUnlock, (snap) => {
      const m = new Map<string, number | null>();
      snap.docs.forEach((d) => {
        const data: any = d.data();
        const tid = String(data.testSeriesId || data.testId || "");
        if (!tid) return;
        const we = data?.windowExpiresAt;
        const expMs =
          data?.windowMinutes === 0 || !we
            ? null
            : typeof we?.toMillis === "function"
              ? we.toMillis()
              : null;
        const existing = m.get(tid);
        // Keep most permissive: null (no expiry) wins; otherwise take latest expiry
        if (existing === undefined) {
          m.set(tid, expMs);
        } else if (existing !== null && expMs === null) {
          m.set(tid, null);
        } else if (existing !== null && expMs !== null && expMs > existing) {
          m.set(tid, expMs);
        }
      });
      setUnlockedIds(m);
    });

    return () => unsub();
  }, [firebaseUser?.uid, educatorId]);

  // Fetch student attempt counts via useQuery (cached, no real-time listener needed)
  const { data: attemptCounts = {} } = useQuery({
    queryKey: ["studentAttemptCounts", firebaseUser?.uid, educatorId],
    queryFn: async () => {
      const qAttempts = query(
        collection(db, "attempts"),
        where("studentId", "==", firebaseUser!.uid),
        where("educatorId", "==", educatorId),
        where("status", "==", "submitted")
      );
      const snap = await getDocs(qAttempts);
      const counts: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const a = d.data();
        const tid = String(a.testId || "");
        if (tid) {
          counts[tid] = (counts[tid] || 0) + 1;
        }
      });
      return counts;
    },
    enabled: !!firebaseUser?.uid && !!educatorId,
    staleTime: 60 * 1000,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [activeTab, setActiveTab] = useState<"tests" | "dpp">("tests");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const normalizeSubjectName = (sub: string) => {
    const s = sub.trim().toLowerCase();

    // Exact mapping for requested subjects
    if (s === "bst" || s === "business studies" || s === "business study")
      return "Business Studies";
    if (s === "phy" || s === "physics") return "Physics";
    if (s === "chem" || s === "chemistry") return "Chemistry";
    if (s === "math" || s === "maths" || s === "mathematics") return "Maths";
    if (s === "eng" || s === "english") return "English";
    if (s === "gt" || s === "general test") return "General Test";
    if (s === "acc" || s === "accountancy" || s === "accounts") return "Accountancy";
    if (s === "eco" || s === "economics") return "Economics";
    if (s === "geo" || s === "geography") return "Geography";
    if (s === "pol sc" || s === "political science" || s === "polscience" || s === "polity")
      return "Political Science";
    if (s === "hist" || s === "history") return "History";

    // Default: Capitalize first letter of each word
    return sub
      .trim()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const filteredTests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = q
      ? tests.filter(
          (t) =>
            (t.title || "").toLowerCase().includes(q) || (t.subject || "").toLowerCase().includes(q)
        )
      : tests;
    return {
      regular: all.filter((t) => !isDppTest(t)),
      dpp: all.filter((t) => isDppTest(t) && t.status !== "failed" && t.status !== "generating"),
    };
  }, [tests, search]);

  // Separate upcoming scheduled tests from available/past ones (regular tests only)
  const { upcomingTests, availableTests } = useMemo(() => {
    const upcoming: any[] = [];
    const available: any[] = [];
    filteredTests.regular.forEach((t) => {
      const startMs = t.startTime
        ? typeof t.startTime.toMillis === "function"
          ? t.startTime.toMillis()
          : Number(t.startTime)
        : null;
      if (startMs && startMs > now && t.isScheduleActive === true) {
        upcoming.push({ ...t, _startsAtMs: startMs });
      } else {
        available.push(t);
      }
    });
    upcoming.sort((a, b) => a._startsAtMs - b._startsAtMs);
    return { upcomingTests: upcoming, availableTests: available };
  }, [filteredTests.regular, now]);

  const groupedTests = useMemo(() => {
    const groups: Record<
      string,
      { name: string; type: "subject" | "uncategorized"; tests: any[] }
    > = {};

    availableTests.forEach((t) => {
      if (t.subject) {
        const normalizedName = normalizeSubjectName(t.subject);
        const subKey = `subject_${normalizedName.toLowerCase().replace(/\s+/g, "_")}`;
        if (!groups[subKey]) {
          groups[subKey] = { name: normalizedName, type: "subject", tests: [] };
        }
        groups[subKey].tests.push(t);
      } else {
        const unKey = "uncategorized";
        if (!groups[unKey]) {
          groups[unKey] = { name: "Uncategorized", type: "uncategorized", tests: [] };
        }
        groups[unKey].tests.push(t);
      }
    });

    return groups;
  }, [availableTests]);

  // Unlock codes (kept, but only reachable if allowed)
  // Accepts optional expectedTestId to ensure student is unlocking the intended test
  const unlockWithCode = async (code: string, expectedTestId?: string) => {
    if (!firebaseUser?.uid || !educatorId) return;
    const c = String(code || "")
      .trim()
      .toUpperCase();
    if (!c) return;

    try {
      await runTransaction(db, async (tx) => {
        const codeRef = doc(db, "educators", educatorId, "accessCodes", c);
        const codeSnap = await tx.get(codeRef);
        if (!codeSnap.exists()) throw new Error("Invalid code");

        const data = codeSnap.data() as any;
        const testId = String(data.testSeriesId || data.testId || "");
        if (!testId) throw new Error("Code not linked to any test");

        // If caller expected a specific test, ensure code maps to it
        if (expectedTestId && expectedTestId !== testId)
          throw new Error("Code is not valid for this test");

        // Check expiry
        const expiresAt = data.expiresAt;
        const expiresMs =
          typeof expiresAt?.toMillis === "function"
            ? expiresAt.toMillis()
            : typeof expiresAt?.seconds === "number"
              ? expiresAt.seconds * 1000
              : null;
        if (typeof expiresMs === "number" && Date.now() > expiresMs)
          throw new Error("Code has expired");

        // Check max uses
        const max = Number(data.maxUses || 0);
        const used = Number(data.usesUsed || 0);
        if (max > 0 && used >= max) throw new Error("Code has been exhausted");

        // increment usesUsed
        const newUsed = used + 1;
        tx.update(codeRef, { usesUsed: newUsed });

        const windowMinutes = Number(data.windowMinutes || 0);
        let windowExpiresAt = null;
        if (windowMinutes > 0) {
          const codeCreatedMs =
            typeof data.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : Date.now();
          windowExpiresAt = new Date(codeCreatedMs + windowMinutes * 60 * 1000);
        }

        const unlockRef = doc(collection(db, "testUnlocks"));
        tx.set(unlockRef, {
          studentId: firebaseUser.uid,
          educatorId,
          testSeriesId: testId,
          code: c,
          createdAt: serverTimestamp(),
          windowMinutes,
          windowExpiresAt,
        });
      });

      toast.success("Unlocked successfully!");
    } catch (e: any) {
      toast.error(e?.message || "Failed to unlock");
    }
  };

  if (authLoading || tenantLoading || billingLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
      </div>
    );
  }

  if (!isTenantDomain) {
    return (
      <div className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Open your coaching URL</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Students must use their coaching website to access tests.
        </p>
        <Button onClick={() => nav("/login?role=student")}>Go to Login</Button>
      </div>
    );
  }

  if (!tenantSlug || !educatorId) {
    return (
      <div className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Invalid coaching URL</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          This tenant domain is not linked to any educator.
        </p>
      </div>
    );
  }

  if (!enrolledHere) {
    return (
      <div className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Not enrolled</h1>
        </div>
        <p className="text-sm text-muted-foreground">Please signup on this coaching URL first.</p>
        <Button onClick={() => nav("/signup?role=student")}>Signup</Button>
      </div>
    );
  }

  if (!seatActive) {
    return (
      <div className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Tests Locked</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your educator has not granted you a seat yet. Ask your educator to grant a seat from the
          Learners panel.
        </p>
      </div>
    );
  }

  // Allowed
  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-green-600" />
        <h1 className="text-xl font-semibold">Available Tests</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "tests" | "dpp")}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="tests" className="rounded-xl">
            Tests
            {filteredTests.regular.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 rounded-full px-1.5 py-0 text-[10px]">
                {filteredTests.regular.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dpp" className="rounded-xl">
            DPP
            {filteredTests.dpp.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 rounded-full px-1.5 py-0 text-[10px]">
                {filteredTests.dpp.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${activeTab === "dpp" ? "DPPs" : "tests"}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Optional unlock UI (keep if you want) */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Enter access code to unlock..."
          className="max-w-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value;
              unlockWithCode(val);
              (e.target as HTMLInputElement).value = "";
            }
          }}
        />
        <div className="text-sm text-muted-foreground">Press Enter to unlock</div>
      </div>

      {activeTab === "tests" && (
        <>
          {/* Upcoming scheduled tests */}
          {upcomingTests.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/10">
                <CalendarClock className="h-5 w-5 text-amber-600" />
                <h3 className="font-semibold text-amber-900 dark:text-amber-200">Upcoming Tests</h3>
                <Badge variant="secondary" className="ml-1 rounded-full bg-amber-100 text-amber-700">
                  {upcomingTests.length}
                </Badge>
              </div>
              <div className="flex flex-col gap-3">
                {upcomingTests.map((t) => (
                  <TestCard
                    key={t.id}
                    test={{
                      ...t,
                      isLocked: false,
                      isUpcoming: true,
                      startsAtMs: t._startsAtMs,
                      windowExpiresAt: null,
                    }}
                    attemptsUsed={attemptCounts[t.id] || 0}
                    onView={() => nav(`/student/tests/${t.id}`)}
                    onStart={() => nav(`/student/tests/${t.id}`)}
                    onUnlock={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            {Object.entries(groupedTests).map(([groupId, group]) => {
              const isExpanded = !!expandedFolders[groupId];
              return (
                <div key={groupId} className="space-y-3">
                  <div
                    className={cn(
                      "group flex cursor-pointer items-center justify-between rounded-lg border border-l-4 border-border border-l-primary/60 bg-card px-3 py-2.5 shadow-sm transition-all duration-200 hover:bg-muted/15",
                      isExpanded && "border-l-primary bg-muted/5"
                    )}
                    onClick={() => toggleFolder(groupId)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-all duration-200",
                          isExpanded && "bg-primary text-primary-foreground"
                        )}
                      >
                        <Folder className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {group.tests.length} test{group.tests.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-all duration-200",
                        isExpanded && "rotate-180 text-primary"
                      )}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="flex flex-col gap-3 pl-2 transition-all duration-200 duration-300 animate-in fade-in sm:pl-4">
                      {group.tests.map((t) => {
                        const unlockEntry = unlockedIds.get(t.id);
                        const windowValid =
                          unlockEntry !== undefined && (unlockEntry === null || unlockEntry > now);

                        const startTime = t.startTime
                          ? typeof t.startTime.toMillis === "function"
                            ? t.startTime.toMillis()
                            : t.startTime
                          : null;
                        const endTime = t.endTime
                          ? typeof t.endTime.toMillis === "function"
                            ? t.endTime.toMillis()
                            : t.endTime
                          : null;
                        const isLive = startTime && endTime && now >= startTime && now <= endTime;

                        const locked = !(t.isPublic === true || windowValid || isLive);
                        return (
                          <TestCard
                            key={t.id}
                            test={{
                              ...t,
                              isLocked: locked,
                              windowExpiresAt: unlockEntry ?? null,
                              isLive,
                            }}
                            attemptsUsed={attemptCounts[t.id] || 0}
                            onView={() => nav(`/student/tests/${t.id}`)}
                            onStart={() => nav(`/student/tests/${t.id}`)}
                            onUnlock={(testId: string) => {
                              const entered = window.prompt("Enter access code to unlock this test:");
                              if (entered && entered.trim()) {
                                unlockWithCode(entered.trim(), testId);
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeTab === "dpp" && (
        <div className="flex flex-col gap-3">
          {filteredTests.dpp.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No DPPs available yet.</p>
          ) : (
            filteredTests.dpp.map((t) => {
              const unlockEntry = unlockedIds.get(t.id);
              const windowValid =
                unlockEntry !== undefined && (unlockEntry === null || unlockEntry > now);
              const startTime = t.startTime
                ? typeof t.startTime.toMillis === "function"
                  ? t.startTime.toMillis()
                  : t.startTime
                : null;
              const endTime = t.endTime
                ? typeof t.endTime.toMillis === "function"
                  ? t.endTime.toMillis()
                  : t.endTime
                : null;
              const isLive = startTime && endTime && now >= startTime && now <= endTime;
              const locked = !(t.isPublic === true || windowValid || isLive);
              return (
                <TestCard
                  key={t.id}
                  test={{
                    ...t,
                    title: getDppDisplayTitle(t),
                    isLocked: locked,
                    windowExpiresAt: unlockEntry ?? null,
                    isLive,
                  }}
                  attemptsUsed={attemptCounts[t.id] || 0}
                  onView={() => nav(`/student/tests/${t.id}`)}
                  onStart={() => nav(`/student/tests/${t.id}`)}
                  onUnlock={(testId: string) => {
                    const entered = window.prompt("Enter access code to unlock this DPP:");
                    if (entered && entered.trim()) {
                      unlockWithCode(entered.trim(), testId);
                    }
                  }}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
