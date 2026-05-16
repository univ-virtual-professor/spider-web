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
  GitBranch,
  BookOpen,
  Zap,
  Database,
  BarChart3,
  UserPlus,
  ClipboardList,
  Layers,
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

type SubItem = {
  icon: any;
  label: string;
  href: string;
};

type SidebarItem = {
  icon: any;
  label: string;
  href: string;
  badge?: number;
  children?: SubItem[];
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ED";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function EducatorLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { profile } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const uid = profile?.uid;
    if (!uid) return;

    const docRef = doc(db, "educators", uid);
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.builderConfig?.logoUrl) {
          setLogoUrl(data.builderConfig.logoUrl);
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

  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      { icon: LayoutDashboard, label: "Dashboard", href: "/educator/dashboard" },
      {
        icon: GitBranch,
        label: "Student Management",
        href: "/educator/divisions",
        children: [
          { icon: UserPlus, label: "Invite", href: "/educator/learners?invite=1" },
          { icon: BarChart3, label: "Analytics", href: "/educator/analytics" },
        ],
      },
      {
        icon: FileText,
        label: "Test Series",
        href: "/educator/test-series",
        children: [
          { icon: Database, label: "Question Bank", href: "/educator/question-bank" },
          { icon: ClipboardList, label: "Test Upload Request", href: "/educator/question-papers" },
          { icon: Zap, label: "DPP Generator", href: "/educator/dpp" },
        ],
      },
      { icon: BookOpen, label: "Content", href: "/educator/content" },
      {
        icon: CreditCard,
        label: "Billing & Plan",
        href: "/educator/billing",
        children: [{ icon: Layers, label: "Seat Allocation", href: "/educator/seat-allocation" }],
      },
    ],
    []
  );

  const isActive = (href: string) => {
    if (href === "/educator/dashboard") {
      return location.pathname === "/educator" || location.pathname === href;
    }
    return location.pathname === href;
  };

  const isChildActive = (item: SidebarItem) =>
    !!item.children?.some((c) => location.pathname === c.href.split("?")[0]);

  // Expand all parent items that have children by default
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  // Auto-expand parent when navigating directly to a child route
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
    if (!tenantSlug) {
      navigate("/educator/website-settings");
      return;
    }

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
                to="/"
                className={cn(
                  "flex items-center gap-2",
                  sidebarCollapsed && "lg:w-full lg:justify-center"
                )}
              >
                <img
                  src={logoUrl || (sidebarCollapsed ? "/logo-compact.png" : "/logo.png")}
                  alt="UNIV.LIVE"
                  className={sidebarCollapsed ? "h-10 w-10 object-contain" : "h-10 w-auto"}
                />
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
                // In collapsed mode, highlight parent icon when a child route is active
                const parentHighlighted = active || (sidebarCollapsed && childActive);

                return (
                  <div key={item.href}>
                    {/* Parent row: link area + optional chevron button */}
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

                      {/* Chevron toggle — only when not collapsed and has children */}
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

                    {/* Sub-items — animated expand/collapse */}
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
