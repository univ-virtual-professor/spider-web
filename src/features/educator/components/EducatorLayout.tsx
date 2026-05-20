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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Zap,
  Database,
  BarChart3,
  ClipboardList,
  Users,
  Building2,
  UserCheck,
  Palette,
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

type SubItem = { icon: any; label: string; href: string };
type SidebarItem = { icon: any; label: string; href: string; badge?: number; children?: SubItem[] };

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { profile } = useAuth();
  const { isEmployee, hasPermission } = useEmployee();
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

  const sidebarItems = useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = [
      { icon: LayoutDashboard, label: "Dashboard", href: "/educator/dashboard" },
    ];

    if (!isEmployee || hasPermission("students.view")) {
      items.push({ icon: Users, label: "Batches", href: "/educator/batches" });
      items.push({ icon: UserCheck, label: "Students", href: "/educator/learners" });
    }

    if (!isEmployee || hasPermission("analytics.view")) {
      items.push({ icon: BarChart3, label: "Analytics", href: "/educator/analytics" });
    }

    // Build Test Series children based on permissions
    const testChildren: SubItem[] = [];
    if (!isEmployee || hasPermission("question_bank.view")) {
      testChildren.push({
        icon: Database,
        label: "Question Bank",
        href: "/educator/question-bank",
      });
    }
    if (!isEmployee || hasPermission("tests.create")) {
      testChildren.push({
        icon: ClipboardList,
        label: "Test Upload Request",
        href: "/educator/question-papers",
      });
      testChildren.push({ icon: Zap, label: "DPP Generator", href: "/educator/dpp" });
    }

    const showTests =
      !isEmployee ||
      hasPermission("tests.view") ||
      hasPermission("tests.create") ||
      testChildren.length > 0;
    if (showTests) {
      items.push({
        icon: FileText,
        label: "Test Series",
        href: "/educator/test-series",
        children: testChildren.length > 0 ? testChildren : undefined,
      });
    }

    if (!isEmployee || hasPermission("content.view")) {
      items.push({ icon: BookOpen, label: "Content", href: "/educator/content" });
    }

    // Billing and Organization are org-head only
    if (!isEmployee) {
      items.push({ icon: CreditCard, label: "Billing", href: "/educator/billing" });
      items.push({ icon: Building2, label: "Organization", href: "/educator/organization" });
    }

    if (!isEmployee || hasPermission("website.manage")) {
      items.push({
        icon: Palette,
        label: "Customize Website",
        href: "/educator/settings?builder=true",
      });
    }

    return items;
  }, [isEmployee, hasPermission]);

  const isActive = (href: string) => {
    if (href === "/educator/dashboard")
      return location.pathname === "/educator" || location.pathname === href;
    return location.pathname === href;
  };

  const isChildActive = (item: SidebarItem) =>
    !!item.children?.some((c) => location.pathname === c.href.split("?")[0]);

  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  useEffect(() => {
    sidebarItems.forEach((item) => {
      if (item.children?.some((c) => location.pathname === c.href)) {
        setExpandedItems((prev) => new Set([...prev, item.href]));
      }
    });
  }, [location.pathname, sidebarItems]);

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith("/educator/learners/")) return "Learner Deep Dive";
    if (location.pathname.startsWith("/educator/students/")) {
      const parts = location.pathname.split("/");
      if (parts.length > 3) return "Student Info";
    }
    const tail = location.pathname.split("/").pop() || "dashboard";
    return tail.replace(/-/g, " ");
  }, [location.pathname]);

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

  return (
    <div className="flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-background">
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden">
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
            "fixed left-0 top-0 z-50 h-[100dvh] w-64 border-r border-border bg-card transition-all duration-300 lg:static lg:top-0 lg:translate-x-0",
            sidebarCollapsed ? "lg:w-20" : "lg:w-64",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <Link
                to="/educator/dashboard"
                className={cn(
                  "flex items-center gap-2.5 overflow-hidden",
                  sidebarCollapsed && "lg:w-full lg:justify-center"
                )}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={instituteName || "Logo"}
                    className="h-9 w-9 rounded-md object-contain"
                  />
                ) : (
                  <img src="/logo-compact.png" alt="Logo" className="h-9 w-9 object-contain" />
                )}
                {!sidebarCollapsed && (
                  <span className="truncate font-display text-base font-bold text-foreground">
                    {instituteName || "UNIV.LIVE"}
                  </span>
                )}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
              {sidebarItems.map((item) => {
                const active = isActive(item.href);
                const childActive = isChildActive(item);
                const hasChildren = !!item.children?.length;
                const expanded = expandedItems.has(item.href);
                const parentHighlighted = active || (sidebarCollapsed && childActive);

                return (
                  <div key={item.href}>
                    <div
                      className={cn(
                        "relative flex items-center overflow-hidden rounded-lg",
                        parentHighlighted ? "text-primary-foreground" : "text-muted-foreground"
                      )}
                    >
                      {parentHighlighted && (
                        <motion.div
                          layoutId="activeTab"
                          className="gradient-bg absolute inset-0 rounded-lg"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <Link
                        to={item.href}
                        onClick={() => {
                          setSidebarOpen(false);
                          if (hasChildren && !sidebarCollapsed) toggleExpanded(item.href);
                        }}
                        className={cn(
                          "relative z-10 flex flex-1 items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors",
                          sidebarCollapsed && "lg:justify-center lg:px-2",
                          !parentHighlighted && "rounded-lg hover:bg-muted hover:text-foreground"
                        )}
                        title={sidebarCollapsed ? item.label : undefined}
                      >
                        <item.icon
                          className={cn("h-5 w-5 flex-shrink-0", parentHighlighted && "text-white")}
                        />
                        {!sidebarCollapsed && (
                          <span className={cn(parentHighlighted && "text-white")}>
                            {item.label}
                          </span>
                        )}
                        {!sidebarCollapsed && item.badge && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "ml-auto text-xs",
                              parentHighlighted && "bg-white/20 text-white"
                            )}
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                      {!sidebarCollapsed && hasChildren && (
                        <button
                          onClick={() => toggleExpanded(item.href)}
                          className={cn(
                            "relative z-10 mr-1 flex-shrink-0 rounded-md p-2 transition-colors",
                            parentHighlighted
                              ? "text-white/80 hover:bg-white/10 hover:text-white"
                              : "hover:bg-muted hover:text-foreground"
                          )}
                          aria-label={expanded ? "Collapse" : "Expand"}
                        >
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform duration-200",
                              expanded && "rotate-180"
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {!sidebarCollapsed && hasChildren && (
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="ml-4 mt-1 space-y-0.5 border-l border-border pb-1 pl-3">
                              {item.children!.map((child) => {
                                const childPath = child.href.split("?")[0];
                                const cActive = location.pathname === childPath;
                                return (
                                  <div key={child.href}>
                                    <Link
                                      to={child.href}
                                      onClick={() => setSidebarOpen(false)}
                                      className={cn(
                                        "relative flex items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
                                        cActive
                                          ? "text-primary-foreground"
                                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                      )}
                                    >
                                      {cActive && (
                                        <motion.div
                                          layoutId="activeTab"
                                          className="gradient-bg absolute inset-0 rounded-lg"
                                          transition={{
                                            type: "spring",
                                            bounce: 0.2,
                                            duration: 0.6,
                                          }}
                                        />
                                      )}
                                      <child.icon
                                        className={cn(
                                          "relative z-10 h-3.5 w-3.5 flex-shrink-0",
                                          cActive && "text-white"
                                        )}
                                      />
                                      <span
                                        className={cn("relative z-10", cActive && "text-white")}
                                      >
                                        {child.label}
                                      </span>
                                    </Link>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-border p-4">
              <Button
                variant="ghost"
                className={cn(
                  "w-full text-muted-foreground hover:text-destructive",
                  sidebarCollapsed ? "justify-center px-0" : "justify-start"
                )}
                onClick={handleLogout}
                title={sidebarCollapsed ? "Logout" : undefined}
              >
                <LogOut className={cn("h-5 w-5", !sidebarCollapsed && "mr-3")} />
                {!sidebarCollapsed && "Logout"}
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="hidden items-center gap-2 text-sm sm:flex">
                <span className="text-muted-foreground">Educator</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium capitalize text-foreground">{pageTitle}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/educator/settings")}
                title="Settings"
              >
                <Settings className="h-5 w-5 text-muted-foreground" />
              </Button>
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
                  <DropdownMenuItem onClick={() => navigate("/educator/messages")}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Help &amp; Support
                    {unreadMessages > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {unreadMessages}
                      </Badge>
                    )}
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

          <main className="flex-1 overflow-auto p-4 lg:p-6">
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
