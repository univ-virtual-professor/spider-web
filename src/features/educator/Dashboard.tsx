import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Check,
  BarChart3,
  Users,
  Plus,
  CreditCard,
  Zap,
  CalendarClock,
  CalendarRange,
  BookOpenCheck,
  Clock,
  Key,
} from "lucide-react";
import { Link } from "react-router-dom";

import CheatActivityFeed from "./components/CheatActivityFeed";
import ActiveTestsFeed from "./components/ActiveTestsFeed";
import { collection, doc, onSnapshot, getDocs } from "firebase/firestore";

import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { buildTenantUrl } from "@shared/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";

type EducatorProfileDoc = {
  displayName?: string;
  fullName?: string;
  name?: string;
  coachingName?: string;
  tenantSlug?: string;
  planName?: string;
  seatLimit?: number;
  usedSeats?: number;
  allowedCourseIds?: string[];
};

interface Assignment {
  id: string;
  testTitle: string;
  batchName: string;
  accessType: "scheduled" | "access_code";
  startTime: any;
  endTime: any;
  expiresAt: any;
  accessCode: string | null;
}

function toMs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return null;
}

function fmtCountdown(ms: number): string {
  const s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function EducatorDashboard() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const uid = firebaseUser?.uid || null;
  const educatorId = profile?.educatorId || uid;

  const [educatorDoc, setEducatorDoc] = useState<EducatorProfileDoc | null>(null);
  const [usedSeatsCount, setUsedSeatsCount] = useState(0);
  const [poolSeatTotal, setPoolSeatTotal] = useState(0);
  const [poolPlanName, setPoolPlanName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [allowedCourseNames, setAllowedCourseNames] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "live" | "upcoming">("live");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!educatorId) return;

    const unsubEdu = onSnapshot(
      doc(db, "educators", educatorId),
      (snap) => setEducatorDoc(snap.exists() ? (snap.data() as EducatorProfileDoc) : null),
      () => setEducatorDoc(null)
    );

    const unsubSeats = onSnapshot(
      collection(db, "educators", educatorId, "billingSeats"),
      (snap) => {
        setUsedSeatsCount(
          snap.docs.filter((d) => String(d.data()?.status || "").toLowerCase() === "active").length
        );
        setLoaded(true);
      },
      () => {
        setUsedSeatsCount(0);
        setLoaded(true);
      }
    );

    const unsubPools = onSnapshot(
      collection(db, "educators", educatorId, "seatPools"),
      (snap) => {
        setPoolSeatTotal(snap.docs.reduce((s, d) => s + (Number(d.data().totalSeats) || 0), 0));
        setPoolPlanName(snap.docs[0]?.data().planName || null);
      },
      () => {
        setPoolSeatTotal(0);
        setPoolPlanName(null);
      }
    );

    const unsubAssignments = onSnapshot(
      collection(db, "educators", educatorId, "batchAssignments"),
      (snap) => {
        setAssignments(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              testTitle: String(data.testTitle || "Untitled"),
              batchName: String(data.batchName || ""),
              accessType: data.accessType === "access_code" ? "access_code" : "scheduled",
              startTime: data.startTime || null,
              endTime: data.endTime || null,
              expiresAt: data.expiresAt || null,
              accessCode: data.accessCode ? String(data.accessCode) : null,
            };
          })
        );
      }
    );

    return () => {
      unsubEdu();
      unsubSeats();
      unsubPools();
      unsubAssignments();
    };
  }, [educatorId]);

  useEffect(() => {
    const ids = educatorDoc?.allowedCourseIds;
    if (!ids || ids.length === 0) {
      setAllowedCourseNames([]);
      return;
    }
    getDocs(collection(db, "courses"))
      .then((snap) => {
        setAllowedCourseNames(
          snap.docs.filter((d) => ids.includes(d.id)).map((d) => (d.data() as any).name || d.id)
        );
      })
      .catch(() => setAllowedCourseNames([]));
  }, [educatorDoc?.allowedCourseIds]);

  const classified = useMemo(() => {
    return assignments.map((a) => {
      const t = a.testTitle.toLowerCase();
      const isDpp = t.includes("dpp") || t.includes("practice");
      const startMs = toMs(a.startTime);
      const endMs = toMs(a.endTime);
      const expMs = toMs(a.expiresAt);

      let status: "live" | "upcoming" | "past" | "code_active" | "code_expired";
      if (a.accessType === "access_code") {
        status = !expMs || expMs > now ? "code_active" : "code_expired";
      } else {
        if (!startMs) status = "upcoming";
        else if (endMs && endMs < now) status = "past";
        else if (startMs <= now && (!endMs || endMs >= now)) status = "live";
        else status = "upcoming";
      }

      return { ...a, isDpp, startMs, endMs, expMs, status };
    });
  }, [assignments, now]);

  const liveItems = useMemo(() => classified.filter((a) => a.status === "live"), [classified]);
  const upcomingItems = useMemo(
    () =>
      classified
        .filter((a) => a.status === "upcoming")
        .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0)),
    [classified]
  );
  const codeActiveItems = useMemo(
    () => classified.filter((a) => a.status === "code_active"),
    [classified]
  );
  const allItems = useMemo(
    () => [...liveItems, ...upcomingItems, ...codeActiveItems],
    [liveItems, upcomingItems, codeActiveItems]
  );

  const liveTests = liveItems.filter((a) => !a.isDpp).length;
  const liveDpps = liveItems.filter((a) => a.isDpp).length;
  const upcomingTests = upcomingItems.filter((a) => !a.isDpp).length;
  const upcomingDpps = upcomingItems.filter((a) => a.isDpp).length;

  const displayItems =
    activeTab === "all" ? allItems : activeTab === "live" ? liveItems : upcomingItems;

  const coachingName =
    String(
      educatorDoc?.coachingName ||
        educatorDoc?.displayName ||
        educatorDoc?.name ||
        profile?.displayName ||
        "Your Coaching"
    ).trim() || "Your Coaching";

  const coachingSlug = String(educatorDoc?.tenantSlug || profile?.tenantSlug || "").trim();
  const coachingUrl = coachingSlug ? buildTenantUrl(coachingSlug, "/") : "";

  const planName = poolPlanName || "Free Tier";
  const seatLimit = poolSeatTotal;
  const usedSeats = usedSeatsCount;
  const vacantSeats = Math.max(0, seatLimit - usedSeats);

  async function handleCopyUrl() {
    if (!coachingUrl) return;
    try {
      await navigator.clipboard.writeText(coachingUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      /* clipboard may be blocked */
    }
  }

  if (authLoading || (!loaded && !!educatorId)) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  if (!educatorId) {
    return <div className="py-12 text-center text-muted-foreground">Please login as Educator</div>;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="gradient-bg rounded-2xl p-5 text-white md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold md:text-2xl">Welcome back, {coachingName}!</h2>
            <p className="mt-1 text-sm text-white/80">Here's your coaching at a glance.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full shrink-0 border border-white/30 bg-white/15 text-white hover:bg-white/25 md:w-auto"
            onClick={handleCopyUrl}
            disabled={!coachingUrl}
          >
            {copiedUrl ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy Coaching URL
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tests & DPPs summary cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link to="/educator/scheduled-tests" className="group block h-full">
          <Card className="flex h-full flex-col border-border/50 transition-all duration-200 hover:border-primary/40 hover:shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold transition-colors group-hover:text-primary">
                  Tests
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Live and upcoming</p>
              </div>
              <div className="rounded-full bg-primary/10 p-2.5 text-primary">
                <CalendarRange className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="flex items-baseline gap-4">
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-3xl font-bold tracking-tight">{liveTests}</h3>
                  <span className="text-sm font-medium text-green-600">Live</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-2xl font-bold tracking-tight text-muted-foreground">
                    {upcomingTests}
                  </h3>
                  <span className="text-sm font-medium text-muted-foreground">Upcoming</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/educator/scheduled-dpps" className="group block h-full">
          <Card className="flex h-full flex-col border-border/50 transition-all duration-200 hover:border-primary/40 hover:shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold transition-colors group-hover:text-primary">
                  DPPs
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Live and upcoming</p>
              </div>
              <div className="rounded-full bg-primary/10 p-2.5 text-primary">
                <BookOpenCheck className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="flex items-baseline gap-4">
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-3xl font-bold tracking-tight">{liveDpps}</h3>
                  <span className="text-sm font-medium text-green-600">Live</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-2xl font-bold tracking-tight text-muted-foreground">
                    {upcomingDpps}
                  </h3>
                  <span className="text-sm font-medium text-muted-foreground">Upcoming</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Assessments Overview */}
      <Card className="border-border/50">
        <CardHeader className="border-b border-border/40 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Assessments</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                Live, upcoming, and access-code assignments across all batches
              </CardDescription>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="h-8 rounded-lg">
                <TabsTrigger value="all" className="h-7 rounded-md px-2.5 text-xs">
                  All
                  {allItems.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                      {allItems.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="live" className="h-7 rounded-md px-2.5 text-xs">
                  Live
                  {liveItems.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-green-600">
                      {liveItems.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="upcoming" className="h-7 rounded-md px-2.5 text-xs">
                  Upcoming
                  {upcomingItems.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {upcomingItems.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Stat chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 dark:border-green-800/40 dark:bg-green-950/20">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                {liveTests} Live Tests
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 dark:border-green-800/40 dark:bg-green-950/20">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                {liveDpps} Live DPPs
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 dark:border-amber-800/40 dark:bg-amber-950/20">
              <CalendarClock className="h-3 w-3 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {upcomingTests} Upcoming Tests
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 dark:border-amber-800/40 dark:bg-amber-950/20">
              <CalendarClock className="h-3 w-3 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {upcomingDpps} Upcoming DPPs
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Zap className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {activeTab === "live"
                  ? "No tests live right now"
                  : activeTab === "upcoming"
                    ? "No upcoming tests"
                    : "No active assignments"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Assign tests to batches from Test Series
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {displayItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.testTitle}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.batchName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
                      {item.isDpp ? "DPP" : "Test"}
                    </Badge>

                    {item.status === "live" && (
                      <Badge className="rounded-full border-none bg-green-500/10 px-2 py-0 text-[10px] text-green-600">
                        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                        Live
                        {item.endMs && (
                          <span className="ml-1 opacity-70">
                            · ends {fmtCountdown(item.endMs - now)}
                          </span>
                        )}
                      </Badge>
                    )}

                    {item.status === "upcoming" && (
                      <Badge
                        variant="outline"
                        className="rounded-full px-2 py-0 text-[10px] text-primary"
                      >
                        <Clock className="mr-1 h-2.5 w-2.5" />
                        {item.startMs ? `in ${fmtCountdown(item.startMs - now)}` : "Upcoming"}
                      </Badge>
                    )}

                    {item.status === "code_active" && (
                      <Badge
                        variant="outline"
                        className="rounded-full border-amber-300 px-2 py-0 text-[10px] text-amber-700"
                      >
                        <Key className="mr-1 h-2.5 w-2.5" />
                        {item.accessCode}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Feeds */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CheatActivityFeed />
        <ActiveTestsFeed />
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Seats &amp; Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Active Plan</p>
              <p className="mt-0.5 font-semibold">{planName || "No plan"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Seats</p>
              <p className="mt-0.5 font-semibold">{seatLimit}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enrolled</p>
              <p className="mt-0.5 font-semibold">{usedSeats}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vacant</p>
              <p
                className={`mt-0.5 font-semibold ${vacantSeats === 0 ? "text-destructive" : "text-green-500"}`}
              >
                {vacantSeats}
              </p>
            </div>
          </div>
          {allowedCourseNames.length > 0 && (
            <div className="mt-5 border-t border-border/50 pt-4">
              <p className="mb-2 text-xs text-muted-foreground">Allowed Courses</p>
              <div className="flex flex-wrap gap-1.5">
                {allowedCourseNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="hidden border-border/50 md:block">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link to="/educator/test-series">
                <Plus className="h-4 w-4" />
                Create Test
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link to="/educator/students">
                <Users className="h-4 w-4" />
                View Learners
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link to="/educator/analytics">
                <BarChart3 className="h-4 w-4" />
                View Analytics
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
