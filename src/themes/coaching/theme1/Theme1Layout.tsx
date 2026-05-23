// src/themes/coaching/theme1/Theme1Layout.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  Linkedin,
  Menu,
  X,
  Moon,
  Sun,
  Globe,
  Send,
  MessageCircle,
} from "lucide-react";

import { useTenant } from "@app/providers/TenantProvider";
import { useFavicon } from "@shared/hooks/useFavicon";
import { Button } from "@shared/ui/button";

interface Theme1LayoutProps {
  children?: React.ReactNode;
}

export default function Theme1Layout({ children }: Theme1LayoutProps) {
  const { tenant } = useTenant();

  const config = tenant?.websiteConfig || {};
  const coachingName = tenant?.coachingName || "Your Institute";
  const tagline = config.tagline || tenant?.tagline || "";
  const socials = (config.socials || {}) as Record<string, string>;
  const logoUrl = tenant?.instituteLogo;

  // Set dynamic favicon + page title for this educator's subdomain
  useFavicon(logoUrl, coachingName);

  const phone = tenant?.contact?.phone || "";
  const email = tenant?.contact?.email || "";
  const address = tenant?.contact?.address || "";

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined" ? document.documentElement.classList.contains("dark") : false
  );

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const navItems = [
    { label: "Home", path: "/" },
    { label: "Courses", path: "/courses" },
    { label: "Login", path: "/login?role=student" },
  ];

  const socialIcons: Record<string, any> = {
    facebook: Facebook,
    twitter: Twitter,
    instagram: Instagram,
    youtube: Youtube,
    linkedin: Linkedin,
    website: Globe,
    telegram: Send,
    whatsapp: MessageCircle,
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Bar */}
      {(phone || email || Object.keys(socials || {}).length > 0) && (
        <div className="bg-muted/40 text-sm">
          <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-2">
            <div className="flex flex-wrap items-center gap-4">
              {phone ? <span>{phone}</span> : null}
              {email ? <span>{email}</span> : null}
            </div>

            <div className="flex items-center gap-3">
              {Object.entries(socials || {}).map(([platform, url]) => {
                const Icon = socialIcons[platform];
                if (!Icon || !url) return null;
                return (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary"
                    title={platform}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            {logoUrl ? (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
                <img
                  src={logoUrl}
                  alt={`${coachingName} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                🎓
              </div>
            )}
            <div>
              <div className="font-bold">{coachingName}</div>
              <div className="text-xs text-muted-foreground">{tagline}</div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.path}
                className="font-medium text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="rounded-md p-2">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <Link to="/login?role=student">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link to="/signup">
              <Button>Enroll Now</Button>
            </Link>

            {/* Mobile Toggle */}
            <button className="md:hidden" onClick={() => setMobileMenuOpen(true)}>
              <Menu />
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-background md:hidden">
            <div className="flex items-center justify-between border-b p-4">
              <span className="font-bold">{coachingName}</span>
              <button onClick={() => setMobileMenuOpen(false)}>
                <X />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-6">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-lg font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="mt-12 border-t bg-muted/30">
        <div className="container mx-auto grid gap-8 px-4 py-12 md:grid-cols-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              {logoUrl ? (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                  <img
                    src={logoUrl}
                    alt={`${coachingName} logo`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : null}
              <div className="font-bold">{coachingName}</div>
            </div>
            <p className="text-sm text-muted-foreground">{tagline}</p>
          </div>

          <div>
            <div className="mb-3 font-semibold">Quick Links</div>
            <ul className="space-y-2 text-sm">
              {navItems.map((item) => (
                <li key={item.label}>
                  <Link to={item.path}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-3 font-semibold">Contact</div>
            <p className="text-sm">{address || "Contact details not set"}</p>
            {phone ? <p className="text-sm">{phone}</p> : null}
            {email ? <p className="text-sm">{email}</p> : null}
          </div>

          <div>
            <div className="mb-3 font-semibold">Follow Us</div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(socials || {}).map(([platform, url]) => {
                const Icon = socialIcons[platform];
                if (!Icon || !url) return null;
                return (
                  <a key={platform} href={url} target="_blank" rel="noreferrer">
                    <Icon className="h-5 w-5" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t py-4 text-center text-sm">
          © {new Date().getFullYear()} {coachingName}. Powered by PREPAREKARO.IN
        </div>
      </footer>
    </div>
  );
}
