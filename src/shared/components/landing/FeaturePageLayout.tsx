import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";
import LandingLayout from "@widgets/layout/LandingLayout";
import SEO from "@shared/components/SEO";
import { NAVY, ACCENT_500, ACCENT_50, Reveal, SectionBadge } from "./LandingPrimitives";

// Shared shell for the four dedicated /features/* pages (ai-answer-sheet-evaluation,
// student-performance-analysis, personalised-practice-papers, test-generator). Each page
// owns one search intent, so only `badge`/`title`/`h1`/`lede` differ per page — the hero
// chrome, CTA and page-level SEO wiring stay identical across all four.
export function FeaturePageHero({
  badge,
  h1,
  lede,
}: {
  badge: string;
  h1: React.ReactNode;
  lede: string;
}) {
  return (
    <section style={{ padding: "64px 24px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
        <Reveal>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <SectionBadge label={badge} />
          </div>
          <h1
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(30px, 4vw, 46px)",
              color: NAVY,
              letterSpacing: "-0.5px",
              lineHeight: 1.18,
              marginTop: 20,
            }}
          >
            {h1}
          </h1>
          <p
            style={{
              fontSize: 17,
              color: `${NAVY}8c`,
              marginTop: 18,
              lineHeight: 1.7,
              maxWidth: 640,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {lede}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export function FeatureBulletList({
  items,
}: {
  items: { icon: LucideIcon; title: string; desc: string }[];
}) {
  return (
    <div
      className="tools-grid"
      style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18, marginTop: 36 }}
    >
      {items.map((item, i) => (
        <Reveal key={item.title} delay={i * 50}>
          <div
            className="hover-lift-card"
            style={{
              background: "#fff",
              border: `1px solid ${NAVY}0d`,
              borderRadius: 18,
              padding: 22,
              height: "100%",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: ACCENT_50,
                color: ACCENT_500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <item.icon size={18} />
            </span>
            <h3
              style={{
                marginTop: 14,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700,
                fontSize: 17,
                color: NAVY,
              }}
            >
              {item.title}
            </h3>
            <p style={{ marginTop: 6, fontSize: 14.5, color: `${NAVY}8c`, lineHeight: 1.6 }}>
              {item.desc}
            </p>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

export function FeaturePageCTA({ text }: { text: string }) {
  return (
    <section style={{ padding: "64px 24px 96px", background: "#fff", textAlign: "center" }}>
      <Reveal>
        <p style={{ fontSize: 16, color: `${NAVY}8c`, marginBottom: 20 }}>{text}</p>
        <Link
          to="/#interest-form"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 26px",
            background: NAVY,
            color: "#fff",
            borderRadius: 12,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 14.5,
            textDecoration: "none",
          }}
        >
          Book a Demo <ArrowRight size={14} />
        </Link>
      </Reveal>
    </section>
  );
}

export function FeaturePageShell({
  seoTitle,
  seoDescription,
  canonical,
  children,
}: {
  seoTitle: string;
  seoDescription: string;
  canonical: string;
  children: React.ReactNode;
}) {
  return (
    <LandingLayout>
      <SEO title={seoTitle} description={seoDescription} canonical={canonical} />
      {children}
    </LandingLayout>
  );
}
