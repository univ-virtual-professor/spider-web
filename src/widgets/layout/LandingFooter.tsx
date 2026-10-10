import type { ReactNode } from "react";
import { Mail, Phone, MapPin, Linkedin, Instagram } from "lucide-react";

const PRIMARY = "#0066FF";
const DARK = "#050F26";

const FEATURE_LINKS = [
  { label: "AI Answer Sheet Evaluation", href: "/features/ai-answer-sheet-evaluation" },
  { label: "Student Performance Analysis", href: "/features/student-performance-analysis" },
  { label: "Personalised Practice Papers", href: "/features/personalised-practice-papers" },
  { label: "Test Generator", href: "/features/test-generator" },
  { label: "All Features", href: "/features" },
];
const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Data Security", href: "/privacy" },
];

export default function LandingFooter({ topContent }: { topContent?: ReactNode }) {
  return (
    <footer
      id="contact"
      style={{
        position: "relative",
        overflow: "hidden",
        background: DARK,
        padding: "80px 24px 32px",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {topContent}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1.3fr",
            gap: 32,
            marginBottom: 40,
          }}
          className="footer-grid"
        >
          <div>
            <img
              src="/logo.png"
              alt="PrepareKaro Logo"
              style={{
                height: 40,
                width: "auto",
                background: "#fff",
                borderRadius: 8,
                padding: "4px 8px",
                marginBottom: 16,
              }}
            />
            <p style={{ fontSize: 13.5, color: "#8b93ab", lineHeight: 1.7, maxWidth: 280 }}>
              AI-powered exam automation and evaluation for institutions — from scanned copy to
              published result.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              {[Linkedin, XLogo, Instagram].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: "#101a33",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8b93ab",
                    transition: "color 0.2s, background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#fff";
                    e.currentTarget.style.background = PRIMARY;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#8b93ab";
                    e.currentTarget.style.background = "#101a33";
                  }}
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                marginBottom: 16,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Features
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {FEATURE_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  style={{
                    fontSize: 13.5,
                    color: "#8b93ab",
                    textDecoration: "none",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#8b93ab")}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                marginBottom: 16,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Legal &amp; Office
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {LEGAL_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  style={{
                    fontSize: 13.5,
                    color: "#8b93ab",
                    textDecoration: "none",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#8b93ab")}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <MapPin size={16} color={PRIMARY} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: "#8b93ab", marginBottom: 2 }}>Address</div>
                <div style={{ fontSize: 13.5, color: "#d5d9e6", lineHeight: 1.5 }}>
                  396, Sheikh Sarai Phase II, South Delhi, Delhi -110017
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Phone size={16} color={PRIMARY} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: "#8b93ab", marginBottom: 2 }}>Contact</div>
                <a
                  href="tel:+919625394589"
                  style={{ fontSize: 13.5, color: "#d5d9e6", textDecoration: "none" }}
                >
                  +91 96253 94589 / +91 83199 37769
                </a>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Mail size={16} color={PRIMARY} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: "#8b93ab", marginBottom: 2 }}>Mail us</div>
                <a
                  href="mailto:info.univlive@gmail.com"
                  style={{ fontSize: 13.5, color: "#d5d9e6", textDecoration: "none" }}
                >
                  info.univlive@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #101a33",
            paddingTop: 20,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12.5, color: "#5c6785" }}>
            © 2026 UnivTechnologies. All rights reserved.
          </span>
          <span style={{ fontSize: 12.5, color: "#5c6785" }}>
            Built for institutions, by preparekaro.in
          </span>
        </div>
      </div>
    </footer>
  );
}

function XLogo({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
