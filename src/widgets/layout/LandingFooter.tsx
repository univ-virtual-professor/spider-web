import { Mail, Phone } from "lucide-react";

const PRIMARY = "#6C47FF";
const FOOTER_LINKS = ["Features", "How It Works", "Testimonials", "Contact"];
const POLICY_LINKS = [
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Refunds & Cancellations", href: "/refunds" },
  { label: "Contact Us", href: "/contact" },
];

export default function LandingFooter() {
  return (
    <footer
      id="contact"
      style={{ background: "#0a0917", padding: "48px 24px 32px", borderTop: "1px solid #1a1830" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 24,
            marginBottom: 36,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 22,
                color: "#fff",
                letterSpacing: "-0.5px",
              }}
            >
              preparekaro<span style={{ color: PRIMARY }}>.</span>in
            </span>
            <p style={{ fontSize: 13, color: "#5a5970", marginTop: 8, maxWidth: 300 }}>
              Empowering coaching institutes across India with intelligent test platforms.
            </p>
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            {FOOTER_LINKS.map((l) => (
              <a
                key={l}
                href={`/#${l.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  fontSize: 14,
                  color: "#5a5970",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#5a5970")}
              >
                {l}
              </a>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 32 }}>
          <a
            href="mailto:info.univlive@gmail.com"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              color: "#9b9aae",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9b9aae")}
          >
            <Mail size={15} color={PRIMARY} />
            info.univlive@gmail.com
          </a>
          <a
            href="tel:+919625394589"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              color: "#9b9aae",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9b9aae")}
          >
            <Phone size={15} color={PRIMARY} />
            +91 96253 94589
          </a>
        </div>

        <div
          style={{
            borderTop: "1px solid #1a1830",
            paddingTop: 20,
            marginBottom: 20,
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          {POLICY_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                fontSize: 12,
                color: "#5a5970",
                textDecoration: "none",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#5a5970")}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div
          style={{
            borderTop: "1px solid #1a1830",
            paddingTop: 20,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 12, color: "#3d3c4a" }}>
            © {new Date().getFullYear()} Preparekaro.in. All rights reserved.
          </span>
          <span style={{ fontSize: 12, color: "#3d3c4a" }}>
            Made for India's coaching institutes 🇮🇳
          </span>
        </div>
      </div>
    </footer>
  );
}
