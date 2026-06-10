import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import "../../pages/landing.css";

const PRIMARY = "#6C47FF";
const NAV_LINKS = ["Features", "How It Works", "Testimonials", "Contact"];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
        borderBottom: scrolled ? "1px solid rgba(108,71,255,0.08)" : "1px solid transparent",
        transition: "all 0.3s ease",
        boxShadow: scrolled ? "0 2px 24px rgba(108,71,255,0.07)" : "none",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
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
          {NAV_LINKS.map((l) => (
            <a
              key={l}
              href={`/#${l.toLowerCase().replace(/\s+/g, "-")}`}
              style={{
                fontFamily: "'Plus Jakarta Sans','Inter', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                color: "#3d3c47",
                textDecoration: "none",
                letterSpacing: "0.01em",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = PRIMARY)}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#3d3c47")}
            >
              {l}
            </a>
          ))}
          <a
            href="/#interest-widget"
            style={{
              padding: "9px 22px",
              background: PRIMARY,
              color: "#fff",
              borderRadius: 100,
              fontFamily: "'Plus Jakarta Sans','DM Sans',sans-serif",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
              transition: "opacity 0.2s",
              boxShadow: `0 4px 16px ${PRIMARY}40`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Book a Demo
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
            color: "#0f0e17",
          }}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div
          style={{
            background: "#fff",
            borderTop: "1px solid #f0eeff",
            padding: "16px 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <img src="/logo-compact.png" alt="Preparekaro.in" style={{ height: 40, width: 40 }} />
          {NAV_LINKS.map((l) => (
            <a
              key={l}
              href={`/#${l.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => setMobileOpen(false)}
              style={{ fontSize: 16, fontWeight: 500, color: "#3d3c47", textDecoration: "none" }}
            >
              {l}
            </a>
          ))}
          <a
            href="/#interest-widget"
            onClick={() => setMobileOpen(false)}
            style={{
              padding: "12px 22px",
              background: PRIMARY,
              color: "#fff",
              borderRadius: 100,
              fontWeight: 600,
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
