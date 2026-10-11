import { useEffect, useMemo, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  Trophy,
  LifeBuoy,
  Settings,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  BookOpen,
  Bot,
  BarChart2,
  Lock,
  Sparkles,
  Layers,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  FileCheck2,
} from "lucide-react";
import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu";
import { cn } from "@shared/lib/utils";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { useAppTokenBootstrap } from "@shared/hooks/useAppTokenBootstrap";
import { db } from "@shared/lib/firebase";
import { doc, onSnapshot, collection, query, where, getDoc } from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";
import ImpersonationBanner from "@shared/components/ImpersonationBanner";
import NotificationBell from "@shared/components/NotificationBell";
import { WelcomeModal } from "./components/WelcomeModal";

// Student's design nav (BUILD-NOTES §04) — flat, no workspace switcher.
// "Live test" has no standalone route (it's only reachable with a testId from
// Tests & results) so it isn't a sidebar entry; everything else not listed
// here stays reachable from the "More" group.
type StudentNavItem = { icon: any; label: string; href: string };

const STUDENT_PRIMARY_NAV: StudentNavItem[] = [
  { icon: LayoutDashboard, label: "Home", href: "/student/dashboard" },
  { icon: Layers, label: "Courses", href: "/student/curriculum" },
  { icon: Sparkles, label: "Practice", href: "/student/practice" },
  { icon: FileText, label: "Tests & results", href: "/student/tests" },
  { icon: CalendarDays, label: "Exams", href: "/student/exam-schedule" },
  { icon: BarChart2, label: "Analysis", href: "/student/reports" },
  { icon: CalendarClock, label: "Timetable", href: "/student/timetable" },
  { icon: FileCheck2, label: "Report card", href: "/student/report-card" },
];

const STUDENT_MORE_NAV: StudentNavItem[] = [
  { icon: ClipboardList, label: "My Results", href: "/student/my-results" },
  { icon: CalendarCheck, label: "Attendance", href: "/student/attendance" },
  { icon: GraduationCap, label: "Grades", href: "/student/grades" },
  { icon: BookOpen, label: "Content", href: "/student/content" },
  { icon: Bot, label: "AI Tutor", href: "/student/chatbot" },
  { icon: Trophy, label: "Rankings", href: "/student/rankings" },
];

type UserDoc = {
  displayName?: string;
  name?: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  avatar?: string;
  batch?: string;
  batchName?: string;
  coachingName?: string;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function safeStr(v: any, fallback = "") {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function StudentLayoutInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  // See the matching effect in EducatorLayout.tsx for why this toggles on
  // <body> rather than relying on the layout root's own ds-scope class alone
  // — Radix Dialog/Select/Popover/DropdownMenu content portals to
  // document.body, and CSS custom properties only cascade through the real
  // DOM tree.
  useEffect(() => {
    document.body.classList.add("ds-scope");
    return () => document.body.classList.remove("ds-scope");
  }, []);

  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const { isReady: appTokenReady } = useAppTokenBootstrap();

  const uid = firebaseUser?.uid || null;
  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  // Welcome splash — show once per session before the page renders
  const [splashDone, setSplashDone] = useState(() => {
    if (!educatorId) return true;
    return !!sessionStorage.getItem(`wm_seen_${educatorId}`);
  });

  const showSplash =
    !isApp &&
    !splashDone &&
    !tenantLoading &&
    !!tenant?.welcomeMessage?.isActive &&
    !!tenant.welcomeMessage.message &&
    !!educatorId;

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [instituteName, setInstituteName] = useState<string | null>(null);

  useEffect(() => {
    if (!educatorId) return;

    const docRef = doc(db, "educators", educatorId);
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();

        // Resolve logo url
        const resolvedLogo = data.builderConfig?.instituteLogo || null;

        // Resolve institute/coaching name
        const resolvedName = data.builderConfig?.instituteName || null;

        setLogoUrl(resolvedLogo);
        setInstituteName(resolvedName);

        // Also set favicon dynamically!
        if (resolvedLogo) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.getElementsByTagName("head")[0].appendChild(link);
          }
          link.href = resolvedLogo;
        }

        // Also set tab title dynamically!
        if (resolvedName) {
          document.title = `${resolvedName}`;
        }
      }
    });
  }, [educatorId]);

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [unreadThreadsCount, setUnreadThreadsCount] = useState(0);
  const [seatActive, setSeatActive] = useState(false);
  const [seatLoading, setSeatLoading] = useState(true);

  // Live user profile from users/{uid}
  useEffect(() => {
    if (!uid) {
      setUserDoc(null);
      return;
    }

    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UserDoc) : null) as UserDoc | null;
        setUserDoc(data);
      },
      (err) => {
        console.error(err);
        setUserDoc(null);
      }
    );

    return () => unsub();
  }, [uid]);

  // Seat access: lock whole profile if no active billing seat
  useEffect(() => {
    if (!uid || !educatorId) {
      setSeatLoading(false);
      return;
    }
    setSeatLoading(true);
    const unsub = onSnapshot(
      doc(db, "educators", educatorId, "billingSeats", uid),
      (snap) => {
        const s = String((snap.data() as any)?.status || "").toLowerCase();
        setSeatActive(s === "active");
        setSeatLoading(false);
      },
      () => {
        setSeatActive(false);
        setSeatLoading(false);
      }
    );
    return () => unsub();
  }, [uid, educatorId]);

  // Live unread badge for messages (count threads with unreadCountStudent > 0)
  useEffect(() => {
    if (!uid || !educatorId) {
      setUnreadThreadsCount(0);
      return;
    }

    const qUnread = query(
      collection(db, "support_threads"),
      where("studentId", "==", uid),
      where("educatorId", "==", educatorId),
      where("unreadCountStudent", ">", 0)
    );

    const unsub = onSnapshot(
      qUnread,
      (snap) => {
        setUnreadThreadsCount(snap.size);
      },
      (err) => {
        console.error(err);
        setUnreadThreadsCount(0);
      }
    );

    return () => unsub();
  }, [uid, educatorId]);

  const displayName = useMemo(() => {
    return (
      safeStr(userDoc?.displayName) ||
      safeStr(userDoc?.name) ||
      safeStr(profile?.displayName) ||
      safeStr(firebaseUser?.displayName) ||
      "Student"
    );
  }, [userDoc, profile, firebaseUser]);

  const firstName = useMemo(() => displayName.split(" ")[0] || "Student", [displayName]);

  const displayEmail = useMemo(() => {
    return (
      safeStr(firebaseUser?.email) || safeStr(userDoc?.email) || safeStr(profile?.email) || "—"
    );
  }, [firebaseUser, userDoc, profile]);

  const avatarUrl = useMemo(() => {
    return (
      safeStr(userDoc?.photoURL) ||
      safeStr(userDoc?.avatar) ||
      safeStr(firebaseUser?.photoURL) ||
      ""
    );
  }, [userDoc, firebaseUser, profile]);

  const batchLabel = useMemo(() => {
    return safeStr(userDoc?.batchName) || safeStr(userDoc?.batch) || "Batch";
  }, [userDoc, profile, tenant]);

  const isActive = (href: string) => {
    if (href === "/student/tests") return location.pathname.startsWith("/student/tests");
    if (href === "/student/my-results") {
      return (
        location.pathname.startsWith("/student/my-results") ||
        location.pathname.startsWith("/student/results/") ||
        location.pathname.startsWith("/student/attempts") ||
        location.pathname.startsWith("/student/exam-results")
      );
    }
    return location.pathname === href;
  };

  const activeLabel = useMemo(() => {
    const match = [...STUDENT_PRIMARY_NAV, ...STUDENT_MORE_NAV].find((item) => isActive(item.href));
    return match?.label || location.pathname.split("/").pop()?.replace(/-/g, " ") || "Home";
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      navigate("/login"); // adjust if your route differs
    } catch (e) {
      console.error(e);
    }
  };

  if (authLoading || tenantLoading || (isApp && !appTokenReady)) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  if (showSplash) {
    return (
      <WelcomeModal
        message={tenant!.welcomeMessage!.message!}
        instituteName={instituteName || tenant!.coachingName || "Your Institute"}
        instituteLogo={logoUrl || tenant!.instituteLogo}
        primaryColor={tenant!.builderConfig?.customColor || "#6366f1"}
        educatorId={educatorId!}
        onDone={() => setSplashDone(true)}
      />
    );
  }

  if (isApp) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    );
  }

  // Root fixed height + overflow hidden => only main scrolls
  return (
    <div className="ds-scope flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-background text-foreground print:h-auto print:min-h-0 print:overflow-visible">
      <div className="print:hidden">
        <ImpersonationBanner />
      </div>
      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
        {/* Mobile Overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar: sticky + no scroll */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 h-[100dvh] w-[236px] border-r border-ds-ink/[.09] bg-ds-surface transition-transform duration-300 lg:static lg:translate-x-0 print:hidden",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-full flex-col overflow-hidden">
            {/* Logo Section */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ds-ink/[.07] px-[18px] py-[14px]">
              <Link to="/student/dashboard" className="flex items-center gap-2.5 overflow-hidden">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={instituteName || "Logo"}
                    className="h-[30px] w-[30px] rounded-md object-contain"
                  />
                ) : (
                  <img
                    src="/logo-compact.png"
                    alt="Logo"
                    className="h-[30px] w-[30px] object-contain"
                  />
                )}
                <span className="truncate font-ds-sans text-[13px] font-semibold text-ds-ink">
                  {instituteName || "PrepareKaro"}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Student Info */}
            <div className="shrink-0 border-b border-ds-ink/[.07] p-3">
              <div className="flex items-center gap-2.5 rounded-[7px] bg-ds-fill p-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback>{initials(displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-ds-sans text-[12px] font-semibold text-ds-ink">
                    {displayName}
                  </p>
                  <p className="truncate font-ds-sans text-[11px] text-ds-ink/50">{batchLabel}</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
              {STUDENT_PRIMARY_NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 font-ds-sans text-[13px] font-medium transition-colors",
                      active
                        ? "bg-ds-fill text-ds-ink"
                        : "text-ds-ink/70 hover:bg-ds-fill/60 hover:text-ds-ink"
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}

              <div className="mt-3 border-t border-ds-ink/[.07] pt-3">
                <div className="px-2.5 pb-1.5 font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/40">
                  More
                </div>
                {STUDENT_MORE_NAV.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 font-ds-sans text-[13px] font-medium transition-colors",
                        active
                          ? "bg-ds-fill text-ds-ink"
                          : "text-ds-ink/60 hover:bg-ds-fill/60 hover:text-ds-ink"
                      )}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Logout */}
            <div className="shrink-0 space-y-2 border-t border-ds-ink/[.07] p-3">
              <Button
                variant="ghost"
                className="w-full justify-start text-ds-ink/70 hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="mr-3 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Navbar */}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-ds-ink/[.09] bg-ds-surface px-4 lg:px-[22px] print:hidden">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>

              {/* Breadcrumb */}
              <div className="hidden items-center font-ds-mono text-[12px] text-ds-ink/45 sm:flex">
                Student / {activeLabel}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="rounded-xl text-muted-foreground hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>

              {/* Notifications */}
              {profile?.uid && (
                <NotificationBell
                  uid={profile.uid}
                  supportThreadCount={unreadThreadsCount}
                  supportThreadLink="/student/messages"
                />
              )}

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 rounded-xl px-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={avatarUrl} />
                      <AvatarFallback>{initials(displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium sm:block">{firstName}</span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="rounded-xl">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{displayName}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {displayEmail}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link
                      to="/student/messages"
                      className="flex w-full items-center justify-between"
                    >
                      <div className="flex items-center">
                        <LifeBuoy className="mr-2 h-4 w-4" />
                        Help
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/student/settings" className="flex w-full items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* ONLY this scrolls */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 print:overflow-visible print:p-0">
            {!seatLoading && !seatActive ? (
              <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-foreground">Account Locked</h2>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Your seat has not been activated yet. Please contact your educator to get
                    access.
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="mt-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Logout
                </button>
              </div>
            ) : (
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Outlet />
              </motion.div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function StudentLayout() {
  return <StudentLayoutInner />;
}
