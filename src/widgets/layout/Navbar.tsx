import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { SHOW_ANNOUNCEMENT } from "./AnnouncementBar";

const navLinks = [
  { name: "Home", path: "/" },
  { name: "Features", path: "/features" },
  { name: "Pricing", path: "/pricing" },
  { name: "Contact Us", path: "/contact" },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Keep header transparent only on the public home page; use solid background for app routes
  const isHomeRoute = location.pathname === "/";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  return (
    <header
      className={cn(
        "fixed left-0 right-0 z-50 transition-all duration-300",
        SHOW_ANNOUNCEMENT ? "top-[40px]" : "top-0",
        isScrolled
          ? "border-b border-border/50 bg-background/80 shadow-soft backdrop-blur-xl"
          : isHomeRoute
            ? "bg-transparent"
            : "bg-background"
      )}
    >
      <nav className="container-main flex items-center justify-between py-4">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img src="/logo.png" alt="PrepareKaro" className="h-16 w-auto" />
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden items-center gap-1 rounded-full bg-muted/50 px-2 py-1.5 backdrop-blur-sm md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                location.pathname === link.path
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              )}
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted md:hidden"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border bg-background/95 backdrop-blur-xl md:hidden"
          >
            <div className="container-main flex flex-col gap-2 py-4">
              <img src="/logo-compact.png" alt="PrepareKaro" className="mb-2 h-10 w-10" />
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={cn(
                    "rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                    location.pathname === link.path
                      ? "bg-primary/5 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
