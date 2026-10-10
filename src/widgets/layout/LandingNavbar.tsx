import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import "../../pages/landing.css";

const PRIMARY = "#0066FF";
const NAVY = "#08183A";
const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "AI in Action", href: "/#ai-showcase" },
  { label: "Watch Demo", href: "/#tutorial" },
  { label: "Contact", href: "/contact" },
];
const FEATURE_LINKS = [
  { label: "All Features", href: "/features" },
  { label: "AI Answer Sheet Evaluation", href: "/features/ai-answer-sheet-evaluation" },
  { label: "Student Performance Analysis", href: "/features/student-performance-analysis" },
  { label: "Personalised Practice Papers", href: "/features/personalised-practice-papers" },
  { label: "Test Generator", href: "/features/test-generator" },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [mobileFeaturesOpen, setMobileFeaturesOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: scrolled ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: scrolled ? `1px solid ${NAVY}0d` : "1px solid transparent",
        transition: "all 0.3s ease",
        boxShadow: scrolled ? `0 2px 24px ${NAVY}10` : "none",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 24px 0 8px",
          height: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
        >
          <img src="/logo.png" alt="preparekaro.in" style={{ height: 68, width: "auto" }} />
        </a>

        <div className="desktop-nav" style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div
            style={{ position: "relative" }}
            onMouseEnter={() => setFeaturesOpen(true)}
            onMouseLeave={() => setFeaturesOpen(false)}
          >
            <a
              href="/features"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                color: featuresOpen ? NAVY : `${NAVY}b3`,
                textDecoration: "none",
                letterSpacing: "0.01em",
                transition: "color 0.2s",
              }}
            >
              Features
            </a>
            {featuresOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  paddingTop: 12,
                  minWidth: 260,
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    border: `1px solid ${NAVY}0d`,
                    borderRadius: 14,
                    boxShadow: "0 20px 44px -16px rgba(8,24,58,0.2)",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {FEATURE_LINKS.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: NAVY,
                        textDecoration: "none",
                        padding: "9px 12px",
                        borderRadius: 8,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          {NAV_LINKS.filter((l) => l.label !== "Home").map((l) => (
            <a
              key={l.label}
              href={l.href}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                color: `${NAVY}b3`,
                textDecoration: "none",
                letterSpacing: "0.01em",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = NAVY)}
              onMouseLeave={(e) => (e.currentTarget.style.color = `${NAVY}b3`)}
            >
              {l.label}
            </a>
          ))}
          <a
            href="/#interest-form"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 22px",
              background: PRIMARY,
              color: "#fff",
              borderRadius: 8,
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              transition: "opacity 0.2s",
              boxShadow: `0 4px 16px ${PRIMARY}40`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Book a Demo <ArrowRight size={15} />
          </a>
        </div>

        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="mobile-menu-btn"
          style={{
            display: "none",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: NAVY,
          }}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="mobile-menu-panel"
          style={{
            background: "#fff",
            borderTop: `1px solid ${NAVY}0d`,
            padding: "16px 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <img src="/logo-compact.png" alt="Preparekaro.in" style={{ height: 40, width: 40 }} />
          <div>
            <button
              onClick={() => setMobileFeaturesOpen((o) => !o)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 16,
                fontWeight: 600,
                color: NAVY,
                cursor: "pointer",
              }}
            >
              Features
              <Menu size={16} style={{ opacity: 0.4 }} />
            </button>
            {mobileFeaturesOpen && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginTop: 12,
                  paddingLeft: 12,
                }}
              >
                {FEATURE_LINKS.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      color: `${NAVY}b3`,
                      textDecoration: "none",
                    }}
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>
          {NAV_LINKS.filter((l) => l.label !== "Home").map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              style={{ fontSize: 16, fontWeight: 600, color: NAVY, textDecoration: "none" }}
            >
              {l.label}
            </a>
          ))}
          <a
            href="/#interest-form"
            onClick={() => setMobileOpen(false)}
            style={{
              padding: "12px 22px",
              background: PRIMARY,
              color: "#fff",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Book a Demo
          </a>
        </div>
      )}
    </nav>
  );
}
