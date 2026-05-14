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
import { collection, onSnapshot, query, where } from "firebase/firestore";
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
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export default function EducatorLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { profile } = useAuth();

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
          { icon: ClipboardList, label: "Admin Test Upload", href: "/educator/question-papers" },
          { icon: Zap, label: "DPP Generator", href: "/educator/dpp" },
        ],
      },
      { icon: BookOpen, label: "Content", href: "/educator/content" },
      { icon: CreditCard, label: "Billing & Plan", href: "/educator/billing" },
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
      if (next.has(href)) next.delete(href); else next.add(href);
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
    <div className="min-h-screen h-[100dvh] bg-background flex flex-col overflow-hidden">
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-[100dvh] w-64 bg-card border-r border-border transition-all duration-300 lg:translate-x-0 lg:static lg:top-0",
          sidebarCollapsed ? "lg:w-20" : "lg:w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="h-16 flex items-center justify-between px-4 border-b border-border">
            <Link to="/" className={cn("flex items-center gap-2", sidebarCollapsed && "lg:justify-center lg:w-full")}>
              <img src={sidebarCollapsed ? "/logo-compact.png" : "/logo.png"} alt="UNIV.LIVE" className={sidebarCollapsed ? "h-10 w-10 object-contain" : "h-10 w-auto"} />
            </Link>
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setSidebarCollapsed((prev) => !prev)}>
              {sidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
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
                  <div className={cn("relative flex items-center rounded-lg overflow-hidden", parentHighlighted ? "text-primary-foreground" : "text-muted-foreground")}>
                    {parentHighlighted && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 gradient-bg rounded-lg"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}

                    <Link
                      to={item.href}
                      onClick={() => { setSidebarOpen(false); if (hasChildren && !sidebarCollapsed) toggleExpanded(item.href); }}
                      className={cn(
                        "flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors relative z-10",
                        sidebarCollapsed && "lg:justify-center lg:px-2",
                        !parentHighlighted && "hover:text-foreground hover:bg-muted rounded-lg"
                      )}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <item.icon className={cn("h-5 w-5 flex-shrink-0", parentHighlighted && "text-white")} />
                      {!sidebarCollapsed && (
                        <span className={cn(parentHighlighted && "text-white")}>{item.label}</span>
                      )}
                      {!sidebarCollapsed && item.badge && (
                        <Badge variant="secondary" className={cn("ml-auto text-xs", parentHighlighted && "bg-white/20 text-white")}>
                          {item.badge}
                        </Badge>
                      )}
                    </Link>

                    {/* Chevron toggle — only when not collapsed and has children */}
                    {!sidebarCollapsed && hasChildren && (
                      <button
                        onClick={() => toggleExpanded(item.href)}
                        className={cn(
                          "relative z-10 p-2 mr-1 rounded-md transition-colors flex-shrink-0",
                          parentHighlighted ? "text-white/80 hover:text-white hover:bg-white/10" : "hover:bg-muted hover:text-foreground"
                        )}
                        aria-label={expanded ? "Collapse" : "Expand"}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
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
                          <div className="ml-4 pl-3 border-l border-border mt-1 space-y-0.5 pb-1">
                            {item.children!.map((child) => {
                              const childPath = child.href.split("?")[0];
                              const cActive = location.pathname === childPath;
                              return (
                                <div key={child.href}>
                                  <Link
                                    to={child.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={cn(
                                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 relative overflow-hidden",
                                      cActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                    )}
                                  >
                                    {cActive && (
                                      <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 gradient-bg rounded-lg"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                      />
                                    )}
                                    <child.icon className={cn("h-3.5 w-3.5 relative z-10 flex-shrink-0", cActive && "text-white")} />
                                    <span className={cn("relative z-10", cActive && "text-white")}>{child.label}</span>
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

          <div className="p-4 border-t border-border mt-auto">
            <Button
              variant="ghost"
              className={cn("w-full text-muted-foreground hover:text-destructive", sidebarCollapsed ? "justify-center px-0" : "justify-start")}
              onClick={handleLogout}
              title={sidebarCollapsed ? "Logout" : undefined}
            >
              <LogOut className={cn("h-5 w-5", !sidebarCollapsed && "mr-3")} />
              {!sidebarCollapsed && "Logout"}
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>

            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Educator</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-foreground capitalize">
                {pageTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/educator/settings")} title="Settings">
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
                  <span className="hidden sm:block text-sm font-medium">{educatorName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{educatorName}</span>
                    <span className="text-xs font-normal text-muted-foreground">{educatorEmail}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/educator/messages")}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Help &amp; Support
                  {unreadMessages > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">{unreadMessages}</Badge>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleViewWebsite}>
                  <Globe className="h-4 w-4 mr-2" />
                  View Website
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
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
