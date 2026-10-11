import { useEffect, useMemo, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Globe,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  BookOpen,
  Zap,
  BarChart3,
  ClipboardList,
  Users,
  Building2,
  UserCheck,
  Palette,
  Files,
  AlertTriangle,
  ClipboardCheck,
  FileCheck2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Layers,
  Database,
  UserPlus,
} from "lucide-react";
import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu";
import { cn, stringToColor } from "@shared/lib/utils";
import { buildTenantUrl } from "@shared/lib/tenant";
import { useAuth } from "@app/providers/AuthProvider";
import { signOut } from "firebase/auth";
import { auth, db } from "@shared/lib/firebase";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import ImpersonationBanner from "@shared/components/ImpersonationBanner";
import NotificationBell from "@shared/components/NotificationBell";
import EducatorBroadcastModal from "./EducatorBroadcastModal";
import { EmployeeProvider, useEmployee } from "@shared/contexts/EmployeeContext";
import { PERMISSIONS, type Permission } from "@shared/lib/rolesConfig";
import { useAppTokenBootstrap } from "@shared/hooks/useAppTokenBootstrap";

// Owner / Faculty / Ops per BUILD-NOTES §02 — Student has its own layout
// (StudentLayout.tsx). Resolved from what already exists: the org head (not
// an employee) is Owner; an employee on the "Front Desk / Ops" role template
// is Ops; any other educator employee is Faculty.
export type EducatorPortalRole = "Owner" | "Faculty" | "Ops";

type SidebarItem = {
  icon: any;
  label: string;
  href: string;
  badge?: number;
};

type NavCatalogItem = {
  icon: any;
  href: string;
  /** Always a readable default — never the raw href — used whenever `roleLabel` has no
   *  entry for the current role (e.g. when the item shows up in another role's "More"
   *  group, or to disambiguate two items that share a generic name there). */
  label: string;
  /** Per-role override matching the design's exact wording for that role's primary nav. */
  roleLabel?: Partial<Record<EducatorPortalRole, string>>;
  ownerOnly?: boolean;
  anyOf?: Permission[];
  enabled?: boolean;
  badge?: number;
};

// Exact per-role primary-nav order from the design's NAV constant
// (Desktop Portal.dc.html, BUILD-NOTES §04) — a flat href list rather than
// navCatalog's own array order, since each role orders the same items
// differently.
//
// Omitted deliberately (see design.md):
// - "Create test" (fa_create): a dialog reached from the "Tests & grading" page, not a
//   standalone route.
// - "Sheet review": the per-sheet drill-down (/educator/exam-grading/:examId/review/:sheetId),
//   like "Live test" on the student side — not a top-level screen.
// - "Student analysis" on Faculty's primary nav (owner's call): in the design it's actually
//   per-student (an Analysis tab on that student's detail page), not a standalone list for
//   Faculty today. /educator/analytics stays reachable from More as "Analytics".
const PRIMARY_NAV_ORDER: Record<EducatorPortalRole, string[]> = {
  Owner: [
    "/educator/dashboard",
    "/educator/batches",
    "/educator/organization",
    "/educator/billing",
    "/educator/website-pages",
  ],
  Faculty: [
    "/educator/dashboard",
    "/educator/batches",
    "/educator/curriculum",
    "/educator/attendance",
    "/educator/exam-grading",
    "/educator/exam-schedule",
    "/educator/scheduled-dpps",
    "/educator/students",
  ],
  Ops: [
    "/educator/timetable",
    "/educator/exam-schedule",
    "/educator/enrolments",
    "/educator/students",
    "/educator/attendance-overview",
  ],
};

function resolveLabel(item: NavCatalogItem, role: EducatorPortalRole) {
  return item.roleLabel?.[role] ?? item.label;
}

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ED";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// Inner layout that can use useEmployee() since it's inside EmployeeProvider
function EducatorLayoutInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [examConfig, setExamConfig] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Radix Dialog/Select/Popover/DropdownMenu content portals to document.body,
  // outside this component's own DOM subtree — a CSS-variable scope on the
  // layout root alone never reaches it (custom properties cascade through the
  // real DOM tree, not the React tree). Toggling the same class on <body>
  // while this layout is mounted makes portaled content a descendant of an
  // element that carries it too, so it picks up the design-system tokens.
  useEffect(() => {
    document.body.classList.add("ds-scope");
    return () => document.body.classList.remove("ds-scope");
  }, []);

  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const { isReady: appTokenReady } = useAppTokenBootstrap();

  const { profile } = useAuth();
  const { isEmployee, hasPermission, empLoading, roleName } = useEmployee();
  const role: EducatorPortalRole = !isEmployee
    ? "Owner"
    : roleName === "Front Desk / Ops"
      ? "Ops"
      : "Faculty";
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [instituteName, setInstituteName] = useState<string | null>(null);

  useEffect(() => {
    const uid = profile?.uid;
    if (!uid) return;

    const docRef = doc(db, "educators", uid);
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();

        // Resolve logo url
        const resolvedLogo = data.builderConfig?.instituteLogo || null;

        // Resolve institute/coaching name
        const resolvedName = data.builderConfig?.instituteName || null;

        setLogoUrl(resolvedLogo);
        setInstituteName(resolvedName);
        setExamConfig(data.examConfig ?? null);

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
  }, [profile?.uid]);

  const educatorName = profile?.displayName || profile?.fullName || "Educator";
  const educatorEmail = profile?.email || "No email";
  const tenantSlug = profile?.tenantSlug || "";
  const photoURL = profile?.photoURL;
  const userInitials = initials(educatorName);

  useEffect(() => {
    const uid = profile?.uid;
    if (!uid) {
      setUnreadMessages(0);
      return;
    }

    const unreadQuery = query(collection(db, "support_threads"), where("educatorId", "==", uid));
    const unsub = onSnapshot(
      unreadQuery,
      (snap) => {
        let total = 0;
        snap.docs.forEach((docSnap) => {
          total += Number((docSnap.data() as any)?.unreadCountEducator || 0);
        });
        setUnreadMessages(total);
      },
      () => setUnreadMessages(0)
    );
    return () => unsub();
  }, [profile?.uid]);

  useEffect(() => {
    const uid = profile?.uid;
    if (!uid) {
      setPendingReviewCount(0);
      return;
    }
    const q = query(
      collection(db, "attempts"),
      where("educatorId", "==", uid),
      where("pendingManualReviewCount", ">", 0)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setPendingReviewCount(snap.size),
      () => {}
    );
    return () => unsub();
  }, [profile?.uid]);

  // Flat nav catalog (BUILD-NOTES §04 screen map): item metadata (icon, label,
  // permission) keyed by href. Which items are "primary" for a role, and in
  // what order, comes from PRIMARY_NAV_ORDER above, not this array's order.
  // An item an employee can't reach per their role permissions is omitted
  // entirely, not disabled.
  const navCatalog = useMemo<NavCatalogItem[]>(() => {
    const objectiveEnabled = examConfig?.objective?.enabled ?? true;

    return [
      {
        icon: LayoutDashboard,
        href: "/educator/dashboard",
        label: "Dashboard",
        roleLabel: { Owner: "Overview", Faculty: "Today" },
      },
      {
        icon: Users,
        href: "/educator/enrolments",
        label: "Enrolments",
        anyOf: [PERMISSIONS.ENROLMENTS_VIEW, PERMISSIONS.ENROLMENTS_MANAGE],
      },
      {
        icon: Users,
        href: "/educator/batches",
        label: "Batches",
        roleLabel: { Faculty: "My batches" },
        anyOf: [PERMISSIONS.STUDENTS_VIEW],
      },
      {
        icon: UserCheck,
        href: "/educator/students",
        label: "Students",
        anyOf: [PERMISSIONS.STUDENTS_VIEW],
      },
      {
        icon: UserPlus,
        href: "/educator/learners",
        label: "Invite students",
        anyOf: [PERMISSIONS.STUDENTS_VIEW],
      },
      {
        icon: CalendarCheck,
        href: "/educator/attendance",
        label: "Attendance (mark)",
        roleLabel: { Faculty: "Attendance" },
        anyOf: [PERMISSIONS.STUDENTS_VIEW],
      },
      {
        icon: CalendarCheck,
        href: "/educator/attendance-overview",
        label: "Attendance overview",
        roleLabel: { Ops: "Attendance" },
        anyOf: [PERMISSIONS.STUDENTS_VIEW],
      },
      {
        icon: CalendarClock,
        href: "/educator/timetable",
        label: "Timetable",
        anyOf: [PERMISSIONS.STUDENTS_VIEW],
      },
      {
        icon: Layers,
        href: "/educator/curriculum",
        label: "Curriculum",
        anyOf: [PERMISSIONS.CONTENT_VIEW],
      },
      {
        icon: BarChart3,
        href: "/educator/analytics",
        label: "Analytics",
        anyOf: [PERMISSIONS.ANALYTICS_VIEW],
      },
      {
        icon: FileText,
        href: "/educator/testing",
        label: "Testing overview",
        enabled: objectiveEnabled,
        anyOf: [
          PERMISSIONS.TESTS_VIEW,
          PERMISSIONS.TESTS_CREATE,
          PERMISSIONS.QB_VIEW,
          PERMISSIONS.DPPS_MANAGE,
        ],
      },
      {
        icon: FileText,
        href: "/educator/test-series",
        label: "Test series",
        enabled: objectiveEnabled,
        anyOf: [
          PERMISSIONS.TESTS_VIEW,
          PERMISSIONS.TESTS_CREATE,
          PERMISSIONS.QB_VIEW,
          PERMISSIONS.DPPS_MANAGE,
        ],
      },
      {
        icon: CalendarDays,
        href: "/educator/exam-schedule",
        label: "Exam schedule",
        anyOf: [PERMISSIONS.TESTS_VIEW, PERMISSIONS.TESTS_CREATE, PERMISSIONS.TESTS_PUBLISH],
      },
      {
        icon: FileCheck2,
        href: "/educator/exam-grading",
        label: "Tests & grading",
        anyOf: [PERMISSIONS.TESTS_VIEW],
      },
      {
        icon: Zap,
        href: "/educator/dpp",
        label: "DPP generator",
        anyOf: [PERMISSIONS.DPPS_MANAGE],
      },
      {
        icon: Zap,
        href: "/educator/scheduled-dpps",
        label: "Daily practice",
        anyOf: [PERMISSIONS.DPPS_MANAGE],
      },
      {
        icon: Building2,
        href: "/educator/organization",
        label: "Staff & access",
        ownerOnly: true,
      },
      {
        icon: CreditCard,
        href: "/educator/billing",
        label: "Subscription & seats",
        ownerOnly: true,
      },
      {
        icon: Palette,
        href: "/educator/website-pages",
        label: "Portal & branding",
        anyOf: [PERMISSIONS.WEBSITE_MANAGE],
      },
      {
        icon: BookOpen,
        href: "/educator/content",
        label: "Content",
        anyOf: [PERMISSIONS.CONTENT_VIEW],
      },
      {
        icon: Database,
        href: "/educator/question-bank",
        label: "Question Bank",
        anyOf: [PERMISSIONS.QB_VIEW],
      },
      {
        icon: ClipboardList,
        href: "/educator/question-papers",
        label: "Test Upload Request",
        anyOf: [PERMISSIONS.TESTS_CREATE],
      },
      {
        icon: AlertTriangle,
        href: "/educator/reported-questions",
        label: "Reported Questions",
        anyOf: [PERMISSIONS.TESTS_VIEW],
      },
      {
        icon: ClipboardCheck,
        href: "/educator/review-submissions",
        label: "Review Answers",
        anyOf: [PERMISSIONS.TESTS_VIEW],
        badge: pendingReviewCount || undefined,
      },
      {
        icon: Files,
        href: "/educator/access-codes",
        label: "Access Codes",
        anyOf: [PERMISSIONS.CODES_VIEW],
      },
    ];
  }, [examConfig, pendingReviewCount]);

  const visibleNavCatalog = useMemo(() => {
    if (isEmployee && empLoading) return [];
    return navCatalog.filter((item) => {
      if (item.enabled === false) return false;
      if (!isEmployee) return true;
      if (item.ownerOnly) return false;
      if (!item.anyOf || item.anyOf.length === 0) return true;
      return item.anyOf.some((p) => hasPermission(p));
    });
  }, [navCatalog, isEmployee, empLoading, hasPermission]);

  const primaryNav = useMemo<SidebarItem[]>(() => {
    const byHref = new Map(visibleNavCatalog.map((item) => [item.href, item]));
    return PRIMARY_NAV_ORDER[role]
      .map((href) => byHref.get(href))
      .filter((item): item is NavCatalogItem => !!item)
      .map((item) => ({
        icon: item.icon,
        href: item.href,
        label: resolveLabel(item, role),
        badge: item.badge,
      }));
  }, [visibleNavCatalog, role]);

  // Routes reachable but not part of this role's design nav (BUILD-NOTES §02:
  // "Routes that exist but aren't in the design's nav ... stay reachable from
  // a short 'More' group at the bottom of the sidebar so no feature is lost").
  const moreNav = useMemo<SidebarItem[]>(() => {
    const primaryHrefs = new Set(PRIMARY_NAV_ORDER[role]);
    return visibleNavCatalog
      .filter((item) => !primaryHrefs.has(item.href))
      .map((item) => ({
        icon: item.icon,
        href: item.href,
        label: resolveLabel(item, role),
        badge: item.badge,
      }));
  }, [visibleNavCatalog, role]);

  const isActive = (href: string) => {
    if (href === "/educator/dashboard")
      return location.pathname === "/educator" || location.pathname === href;
    return location.pathname === href;
  };

  const activeLabel = useMemo(() => {
    const match = [...primaryNav, ...moreNav].find((item) => isActive(item.href));
    if (match) return match.label;
    if (location.pathname.startsWith("/educator/learners/")) return "Learner Deep Dive";
    if (location.pathname.startsWith("/educator/students/")) {
      const parts = location.pathname.split("/");
      if (parts.length > 3) return "Student Info";
    }
    const tail = location.pathname.split("/").pop() || "dashboard";
    return tail.replace(/-/g, " ");
  }, [primaryNav, moreNav, location.pathname]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login?role=educator");
    } catch (error) {
      console.error(error);
    }
  };

  const handleViewWebsite = () => {
    if (!tenantSlug) return;
    window.open(buildTenantUrl(tenantSlug, "/"), "_blank");
  };

  if (isApp && !appTokenReady) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  if (isApp) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="ds-scope flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-background text-foreground print:h-auto print:min-h-0 print:overflow-visible">
      <div className="print:hidden">
        <ImpersonationBanner />
      </div>
      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
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

        <aside
          className={cn(
            "fixed left-0 top-0 z-50 h-[100dvh] w-[236px] border-r border-ds-ink/[.09] bg-ds-surface transition-transform duration-300 lg:static lg:top-0 lg:translate-x-0 print:hidden",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-ds-ink/[.07] px-[18px] py-[14px]">
              <Link to="/educator/dashboard" className="flex items-center gap-2.5 overflow-hidden">
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

            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
              {isEmployee && empLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted-foreground" />
                </div>
              ) : (
                <>
                  {primaryNav.map((item) => {
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
                        {item.badge ? (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {item.badge}
                          </Badge>
                        ) : null}
                      </Link>
                    );
                  })}

                  {moreNav.length > 0 && (
                    <div className="mt-3 border-t border-ds-ink/[.07] pt-3">
                      <div className="px-2.5 pb-1.5 font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/40">
                        More
                      </div>
                      {moreNav.map((item) => {
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
                            {item.badge ? (
                              <Badge variant="secondary" className="ml-auto text-xs">
                                {item.badge}
                              </Badge>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </nav>

            <div className="space-y-2 border-t border-ds-ink/[.07] p-3">
              {(!isEmployee || hasPermission(PERMISSIONS.MESSAGES_VIEW)) && (
                <Button
                  variant="ghost"
                  className="w-full justify-start text-ds-ink/70 hover:text-ds-ink"
                  onClick={() => {
                    setSidebarOpen(false);
                    navigate("/educator/messages");
                  }}
                >
                  <div className="relative mr-3 flex items-center">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex flex-1 items-center justify-between">
                    <span>Help & Support</span>
                    {unreadMessages > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {unreadMessages}
                      </Badge>
                    )}
                  </div>
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start text-ds-ink/70 hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="mr-3 h-4 w-4" />
                Logout
              </Button>
              <div className="flex items-center gap-2.5 px-1 pt-1">
                <Avatar className="h-[30px] w-[30px]">
                  {photoURL && <AvatarImage src={photoURL} />}
                  <AvatarFallback style={{ backgroundColor: stringToColor(userInitials) }}>
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-ds-sans text-[12px] font-semibold text-ds-ink">
                    {educatorName}
                  </div>
                  <div className="truncate font-ds-sans text-[11px] text-ds-ink/50">{role}</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ds-ink/[.09] bg-ds-surface px-4 lg:px-[22px] print:hidden">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="hidden items-center font-ds-mono text-[12px] text-ds-ink/45 sm:flex">
                {role} / {activeLabel}
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {profile?.uid && (
                <NotificationBell
                  uid={profile.uid}
                  canBroadcast
                  onBroadcast={() => setBroadcastOpen(true)}
                />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <Avatar className="h-8 w-8">
                      {photoURL && <AvatarImage src={photoURL} />}
                      <AvatarFallback style={{ backgroundColor: stringToColor(userInitials) }}>
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium sm:block">{educatorName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{educatorName}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {educatorEmail}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {!isEmployee && (
                    <>
                      <DropdownMenuItem onClick={() => navigate("/educator/billing")}>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Billing
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/educator/organization")}>
                        <Building2 className="mr-2 h-4 w-4" />
                        Organization
                      </DropdownMenuItem>
                    </>
                  )}
                  {(!isEmployee || hasPermission(PERMISSIONS.WEBSITE_MANAGE)) && (
                    <>
                      <DropdownMenuItem onClick={() => navigate("/educator/settings?builder=true")}>
                        <Palette className="mr-2 h-4 w-4" />
                        Customize Website
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/educator/website-pages")}>
                        <Files className="mr-2 h-4 w-4" />
                        Website Pages
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/educator/settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleViewWebsite}>
                    <Globe className="mr-2 h-4 w-4" />
                    View Website
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

          <main className="flex-1 overflow-auto p-4 lg:p-6 print:overflow-visible print:p-0">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>

      {profile?.uid && (
        <EducatorBroadcastModal
          open={broadcastOpen}
          onOpenChange={setBroadcastOpen}
          educatorId={profile.uid}
        />
      )}
    </div>
  );
}

export default function EducatorLayout() {
  return (
    <EmployeeProvider>
      <EducatorLayoutInner />
    </EmployeeProvider>
  );
}
