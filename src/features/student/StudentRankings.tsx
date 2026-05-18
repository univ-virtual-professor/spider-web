import { useEffect, useMemo, useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Minus, Filter, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { Button } from "@shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { cn } from "@shared/lib/utils";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

type LeaderboardRow = {
  studentId: string;
  name: string;
  avatar?: string;
  rank: number;
  score: number; // raw points
  accuracy: number; // percent
  rankChange: number;
  isCurrentUser: boolean;
};

type AttemptDoc = {
  studentId: string;
  educatorId: string;
  tenantSlug?: string | null;
  status?: string;

  score?: number;
  maxScore?: number;
  accuracy?: number; // 0..1 or 0..100
  timeTakenSec?: number;
  timeSpent?: number;

  testId?: string;
  testTitle?: string;
  subject?: string;

  submittedAt?: any;
};

type UserProfileDoc = {
  displayName?: string;
  name?: string;
  photoURL?: string;
  avatar?: string;
};

function safeNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pct(score: number, maxScore: number) {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, (score / maxScore) * 100));
}

function normalizeAccuracyPercent(val: any) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  const pctVal = n <= 1.01 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pctVal)));
}

function fallbackName(uid: string) {
  const tail = uid.slice(-4).toUpperCase();
  return `Student ${tail}`;
}

function windowRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(now) };
}

function previousWindowRange(days: number) {
  const now = new Date();
  const end = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
}

function computeRankings(attempts: AttemptDoc[]) {
  const best: Record<string, { percent: number; score: number; time: number; accuracy: number }> =
    {};

  for (const a of attempts) {
    const uid = a.studentId;
    if (!uid) continue;

    const s = safeNumber(a.score, 0);
    const m = safeNumber(a.maxScore, 0);
    const p = pct(s, m);
    const t = safeNumber(a.timeTakenSec || a.timeSpent, 999999);
    const acc = a.accuracy != null ? normalizeAccuracyPercent(a.accuracy) : Math.round(p);

    const current = best[uid];
    if (
      !current ||
      p > current.percent ||
      (p === current.percent && s > current.score) ||
      (p === current.percent && s === current.score && t < current.time)
    ) {
      best[uid] = { percent: p, score: s, time: t, accuracy: acc };
    }
  }

  const sorted = Object.entries(best).sort((a, b) => {
    if (b[1].score !== a[1].score) return b[1].score - a[1].score;
    if (b[1].percent !== a[1].percent) return b[1].percent - a[1].percent;
    return a[1].time - b[1].time;
  });

  // Standard Competition Ranking (1, 2, 2, 4)
  let currentRank = 0;
  let lastPercent = -1;
  let lastScore = -1;
  let lastTime = -1;

  return sorted.map(([studentId, data], index) => {
    if (data.percent !== lastPercent || data.score !== lastScore || data.time !== lastTime) {
      currentRank = index + 1;
    }
    lastPercent = data.percent;
    lastScore = data.score;
    lastTime = data.time;
    return { studentId, rank: currentRank, ...data };
  });
}

async function hydrateProfiles(studentIds: string[]) {
  const result: Record<string, { name: string; avatar?: string }> = {};
  await Promise.all(
    studentIds.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const d = snap.data() as UserProfileDoc;
          const name = (d.displayName || d.name || "").trim() || fallbackName(uid);
          const avatar = (d.photoURL || d.avatar || "").trim() || undefined;
          result[uid] = { name, avatar };
        } else {
          result[uid] = { name: fallbackName(uid) };
        }
      } catch {
        result[uid] = { name: fallbackName(uid) };
      }
    })
  );
  return result;
}

export default function StudentRankings() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || null;

  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [prevRankMap, setPrevRankMap] = useState<Record<string, number>>({});

  // Filters
  const [filterType, setFilterType] = useState<"all" | "test" | "dpp">("all");
  const [filterTest, setFilterTest] = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");

  const [availableTests, setAvailableTests] = useState<{ id: string; title: string }[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);

  const canLoad = useMemo(() => {
    return !authLoading && !tenantLoading && !!firebaseUser?.uid && !!educatorId;
  }, [authLoading, tenantLoading, firebaseUser?.uid, educatorId]);

  // 1) Load metadata (tests and subjects) for filters
  useEffect(() => {
    if (!canLoad) return;

    const cur = windowRange(30);
    // Use ONLY educatorId to avoid index errors on complex queries
    const q = query(
      collection(db, "attempts"),
      where("educatorId", "==", educatorId!),
      limit(1000)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const testsMap: Record<string, string> = {};
        const subjectsSet = new Set<string>();
        const validStatuses = ["completed", "submitted", "finished", "done"];

        snap.docs.forEach((d) => {
          const a = d.data() as AttemptDoc;

          // --- Client Side Filtering ---
          if (!validStatuses.includes(a.status || "")) return;
          if (tenantSlug && a.tenantSlug !== tenantSlug) return;

          // Time filter (last 30 days)
          const subAt = a.submittedAt?.toMillis?.() || 0;
          if (subAt < cur.start.toMillis()) return;

          // Classify attempt as DPP or Test
          const title = (a.testTitle || "").toLowerCase();
          const isDpp = title.includes("dpp") || title.includes("practice");
          const matchesType =
            filterType === "all" ||
            (filterType === "dpp" && isDpp) ||
            (filterType === "test" && !isDpp);

          if (!matchesType) return;

          if (a.testId && a.testTitle) testsMap[a.testId] = a.testTitle;
          if (a.subject) subjectsSet.add(a.subject);
        });

        setAvailableTests(Object.entries(testsMap).map(([id, title]) => ({ id, title })));
        setAvailableSubjects(Array.from(subjectsSet).sort());
      },
      (err) => {
        console.error("Metadata load failed:", err);
      }
    );

    return () => unsub();
  }, [canLoad, educatorId, tenantSlug, filterType]);

  // 2) Load previous window ranks (for rankChange)
  useEffect(() => {
    let mounted = true;

    async function loadPrev() {
      if (!canLoad) return;

      try {
        const DAYS = 30;
        const prev = previousWindowRange(DAYS);

        // Minimal query to avoid index errors
        const qPrev = query(
          collection(db, "attempts"),
          where("educatorId", "==", educatorId!),
          limit(1000)
        );

        const snap = await getDocs(qPrev);
        let attempts = snap.docs.map((d) => d.data() as AttemptDoc);

        const validStatuses = ["completed", "submitted", "finished", "done"];
        const pStart = prev.start.toMillis();
        const pEnd = prev.end.toMillis();

        // Client-side filtering
        attempts = attempts.filter((a) => {
          const subAt = a.submittedAt?.toMillis?.() || 0;

          // Classify attempt as DPP or Test
          const title = (a.testTitle || "").toLowerCase();
          const isDpp = title.includes("dpp") || title.includes("practice");
          const matchesType =
            filterType === "all" ||
            (filterType === "dpp" && isDpp) ||
            (filterType === "test" && !isDpp);

          return (
            validStatuses.includes(a.status || "") &&
            subAt >= pStart &&
            subAt < pEnd &&
            (!tenantSlug || a.tenantSlug === tenantSlug) &&
            (filterTest === "all" || a.testId === filterTest) &&
            (filterSubject === "all" || a.subject === filterSubject) &&
            matchesType
          );
        });

        const ranked = computeRankings(attempts);

        const map: Record<string, number> = {};
        ranked.forEach((row) => (map[row.studentId] = row.rank));

        if (!mounted) return;
        setPrevRankMap(map);
      } catch (e) {
        console.error("Prev rankings load failed:", e);
        if (!mounted) return;
        setPrevRankMap({});
      }
    }

    loadPrev();
    return () => {
      mounted = false;
    };
  }, [canLoad, educatorId, tenantSlug, filterTest, filterSubject, filterType]);

  // 3) Live leaderboard (current window)
  useEffect(() => {
    if (!canLoad) {
      setLoading(authLoading || tenantLoading);
      return;
    }

    setLoading(true);
    setLeaderboard([]);

    const DAYS = 30;
    const cur = windowRange(DAYS);
    const cStart = cur.start.toMillis();

    // Minimal query to avoid index errors
    const qCur = query(
      collection(db, "attempts"),
      where("educatorId", "==", educatorId!),
      limit(1000)
    );

    const unsub = onSnapshot(
      qCur,
      async (snap) => {
        try {
          let attempts = snap.docs.map((d) => d.data() as AttemptDoc);

          const validStatuses = ["completed", "submitted", "finished", "done"];

          // Client-side filtering
          attempts = attempts.filter((a) => {
            const subAt = a.submittedAt?.toMillis?.() || 0;

            // Classify attempt as DPP or Test
            const title = (a.testTitle || "").toLowerCase();
            const isDpp = title.includes("dpp") || title.includes("practice");
            const matchesType =
              filterType === "all" ||
              (filterType === "dpp" && isDpp) ||
              (filterType === "test" && !isDpp);

            return (
              validStatuses.includes(a.status || "") &&
              subAt >= cStart &&
              (!tenantSlug || a.tenantSlug === tenantSlug) &&
              (filterTest === "all" || a.testId === filterTest) &&
              (filterSubject === "all" || a.subject === filterSubject) &&
              matchesType
            );
          });

          const ranked = computeRankings(attempts);

          // Find current user's entry if not in top 50
          const myEntry = ranked.find((x) => x.studentId === firebaseUser!.uid);

          const top = ranked.slice(0, 50);
          const ids = top.map((x) => x.studentId);
          if (myEntry && !ids.includes(myEntry.studentId)) {
            ids.push(myEntry.studentId);
          }

          const profiles = await hydrateProfiles(ids);

          const rows: LeaderboardRow[] = ranked.map((x) => {
            const prevRank = prevRankMap[x.studentId];
            const rankChange = prevRank ? prevRank - x.rank : 0;
            const name = profiles[x.studentId]?.name || fallbackName(x.studentId);
            const avatar = profiles[x.studentId]?.avatar;
            return {
              studentId: x.studentId,
              name,
              avatar,
              rank: x.rank,
              score: Math.round(x.score),
              accuracy: x.accuracy,
              rankChange,
              isCurrentUser: x.studentId === firebaseUser!.uid,
            };
          });

          // Final leaderboard displays top 50 + current user if needed
          const filteredRows = rows.filter((r) => r.rank <= 50 || r.isCurrentUser);
          setLeaderboard(filteredRows);
          setLoading(false);
        } catch (e) {
          console.error("Rank processing failed:", e);
          setLeaderboard([]);
          setLoading(false);
        }
      },
      (err) => {
        console.error("Leaderboard query failed:", err);
        setLeaderboard([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [
    canLoad,
    educatorId,
    tenantSlug,
    firebaseUser,
    authLoading,
    tenantLoading,
    prevRankMap,
    filterTest,
    filterSubject,
    filterType,
  ]);

  const top3 = leaderboard.slice(0, 3);

  const clearFilters = () => {
    setFilterType("all");
    setFilterTest("all");
    setFilterSubject("all");
  };

  if (loading && leaderboard.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Rankings</h1>
          <p className="text-muted-foreground">See how you compare with others</p>
        </div>
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          Loading leaderboard…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold">Rankings</h1>
          <p className="text-muted-foreground">See how you compare with others in your coaching</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Filters
            </span>
          </div>

          <div className="inline-flex rounded-xl border border-border/80 bg-muted/40 p-1">
            <button
              onClick={() => {
                setFilterType("all");
                setFilterTest("all");
              }}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200",
                filterType === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Overall
            </button>
            <button
              onClick={() => {
                setFilterType("test");
                setFilterTest("all");
              }}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200",
                filterType === "test"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tests
            </button>
            <button
              onClick={() => {
                setFilterType("dpp");
                setFilterTest("all");
              }}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200",
                filterType === "dpp"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              DPPs
            </button>
          </div>

          <Select value={filterTest} onValueChange={setFilterTest}>
            <SelectTrigger className="h-9 w-[180px] rounded-xl bg-card">
              <SelectValue placeholder="Test Series" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Test Series</SelectItem>
              {availableTests.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="h-9 w-[150px] rounded-xl bg-card">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {availableSubjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(filterType !== "all" || filterTest !== "all" || filterSubject !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 px-2 text-muted-foreground hover:text-foreground"
            >
              <XCircle className="mr-1 h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <Card className="card-soft border-0">
          <CardContent className="py-12 text-center text-muted-foreground">
            No rankings found for the selected filters in the last 30 days.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top 3 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Rank 2 (Left on desktop) */}
            {top3[1] && (
              <div className="order-2 flex h-full flex-col justify-end md:order-1">
                <Card className="card-soft border-0 bg-gray-100 text-center dark:bg-gray-800/50">
                  <CardContent className="pb-8 pt-6">
                    <div className="relative inline-block">
                      <Avatar className="h-16 w-16 border-4 border-white shadow-lg dark:border-gray-700">
                        <AvatarImage src={top3[1].avatar} />
                        <AvatarFallback>{top3[1].name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-sm font-bold text-white shadow-md">
                        2
                      </div>
                    </div>
                    <p className="mx-auto mt-4 max-w-[150px] truncate font-semibold">
                      {top3[1].name}
                    </p>
                    <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">
                      {top3[1].score}
                    </p>
                    <p className="text-xs text-muted-foreground">{top3[1].accuracy}% accuracy</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Rank 1 (Center) */}
            {top3[0] && (
              <div className="order-1 md:order-2">
                <Card className="card-soft relative z-10 scale-105 border-0 border-2 border-yellow-200/50 bg-yellow-50 text-center shadow-xl dark:bg-yellow-900/10">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Trophy className="h-10 w-10 animate-bounce fill-yellow-500 text-yellow-500" />
                  </div>
                  <CardContent className="pb-10 pt-8">
                    <div className="relative inline-block">
                      <Avatar className="h-24 w-24 border-4 border-yellow-400 shadow-xl">
                        <AvatarImage src={top3[0].avatar} />
                        <AvatarFallback>{top3[0].name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-yellow-400 text-lg font-bold text-white shadow-md">
                        1
                      </div>
                    </div>
                    <p className="mx-auto mt-4 max-w-[200px] truncate text-lg font-bold">
                      {top3[0].name}
                    </p>
                    <p className="gradient-text text-4xl font-black">{top3[0].score}</p>
                    <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                      {top3[0].accuracy}% accuracy
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Rank 3 (Right) */}
            {top3[2] && (
              <div className="order-3 flex h-full flex-col justify-end md:order-3">
                <Card className="card-soft border-0 bg-orange-50 text-center dark:bg-orange-900/10">
                  <CardContent className="pb-8 pt-6">
                    <div className="relative inline-block">
                      <Avatar className="h-16 w-16 border-4 border-white shadow-lg dark:border-orange-900/30">
                        <AvatarImage src={top3[2].avatar} />
                        <AvatarFallback>{top3[2].name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-orange-400 text-sm font-bold text-white shadow-md">
                        3
                      </div>
                    </div>
                    <p className="mx-auto mt-4 max-w-[150px] truncate font-semibold">
                      {top3[2].name}
                    </p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {top3[2].score}
                    </p>
                    <p className="text-xs text-muted-foreground">{top3[2].accuracy}% accuracy</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Full Leaderboard */}
          <Card className="card-soft mt-8 overflow-hidden border-0">
            <CardHeader className="border-b border-border bg-muted/30">
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <Trophy className="h-5 w-5 text-primary" />
                Coaching Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-20 pl-6">Rank</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead className="text-center">Accuracy</TableHead>
                    <TableHead className="pr-6 text-center">Change</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {leaderboard.map((entry) => (
                    <TableRow
                      key={entry.studentId}
                      className={cn(
                        "group transition-colors",
                        entry.isCurrentUser
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <TableCell className="pl-6 font-bold">
                        {entry.rank <= 3 ? (
                          <div
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-full text-xs text-white",
                              entry.rank === 1
                                ? "bg-yellow-400"
                                : entry.rank === 2
                                  ? "bg-gray-400"
                                  : "bg-orange-400"
                            )}
                          >
                            {entry.rank}
                          </div>
                        ) : (
                          <span className="ml-2 text-muted-foreground">#{entry.rank}</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-border transition-transform group-hover:scale-105">
                            <AvatarImage src={entry.avatar} />
                            <AvatarFallback>{entry.name?.[0]}</AvatarFallback>
                          </Avatar>

                          <div className="flex flex-col">
                            <span
                              className={cn("font-semibold", entry.isCurrentUser && "text-primary")}
                            >
                              {entry.name}
                              {entry.isCurrentUser && " (You)"}
                            </span>
                            <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
                              Batch Learner
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <span className="text-lg font-bold tabular-nums">{entry.score}</span>
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-medium">{entry.accuracy}%</span>
                          <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${entry.accuracy}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="pr-6 text-center">
                        {entry.rankChange > 0 ? (
                          <div className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-bold text-green-600 dark:bg-green-900/20">
                            <TrendingUp className="h-3 w-3" />
                            {entry.rankChange}
                          </div>
                        ) : entry.rankChange < 0 ? (
                          <div className="inline-flex items-center gap-1 rounded-md bg-red-900/10 px-2 py-1 text-xs font-bold text-red-500">
                            <TrendingDown className="h-3 w-3" />
                            {Math.abs(entry.rankChange)}
                          </div>
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="border-t border-border bg-muted/20 p-4">
                <p className="text-center text-xs text-muted-foreground">
                  Leaderboard calculations are based on each student’s best attempt in the last 30
                  days. Ties are broken by total raw score followed by time taken.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
