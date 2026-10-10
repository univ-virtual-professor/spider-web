import { Link } from "react-router-dom";
import { FileText, Camera, Layers, Sparkles, ArrowRight, type LucideIcon } from "lucide-react";
import LandingLayout from "@widgets/layout/LandingLayout";
import SEO from "@shared/components/SEO";
import {
  NAVY,
  ACCENT_500,
  ACCENT_50,
  Reveal,
  SectionHeading,
} from "@shared/components/landing/LandingPrimitives";

type LoopStep = {
  icon: LucideIcon;
  num: string;
  title: string;
  description: string;
  href?: string;
};

// The full loop the ticket asks for: test -> AI evaluation -> topic analysis -> personalised
// practice. This replaces the previous version of this page, which only covered the AI
// evaluation step.
const LOOP_STEPS: LoopStep[] = [
  {
    icon: FileText,
    num: "01",
    title: "Run a test",
    description:
      "Schedule an objective or subjective test series, or generate one instantly by choosing subject, chapters and topics — the paper fills itself from your question bank, then ours.",
    href: "/features/test-generator",
  },
  {
    icon: Camera,
    num: "02",
    title: "AI evaluates every answer",
    description:
      "For subjective papers, scan the handwritten copies and AI grades every answer step by step against your rubric. Faculty review and release results, usually within 72 hours.",
    href: "/features/ai-answer-sheet-evaluation",
  },
  {
    icon: Layers,
    num: "03",
    title: "Topic analysis pinpoints weak spots",
    description:
      "Every result feeds the student's report: accuracy by subject, chapter and topic, weighted toward recent tests, with a readiness score and the exact topics dragging it down.",
    href: "/features/student-performance-analysis",
  },
  {
    icon: Sparkles,
    num: "04",
    title: "Personalised practice closes the gap",
    description:
      "A practice paper is generated from that student's own weak topics — more questions where they struggle, an easier start, nothing repeated from recent tests.",
    href: "/features/personalised-practice-papers",
  },
];

export default function HowItWorks() {
  return (
    <LandingLayout>
      <SEO
        title="How PrepareKaro Works: Test, Evaluate, Analyse, Practice"
        description="The PrepareKaro loop for coaching institutes: run a test, AI evaluates every answer, topic-level analysis finds each student's weak spots, and a personalised practice paper closes the gap."
        canonical="https://preparekaro.in/how-it-works"
      />
      <div style={{ paddingBottom: 96 }}>
        <section style={{ padding: "64px 24px 24px", background: "#fff" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
            <Reveal>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#fff",
                    border: `1px solid ${ACCENT_50}`,
                    borderRadius: 100,
                    padding: "8px 14px",
                    boxShadow: "0 2px 12px -2px rgba(8,24,58,0.08)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#0052CC",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  How It Works
                </span>
              </div>
              <h1
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(32px, 4vw, 48px)",
                  color: NAVY,
                  letterSpacing: "-0.5px",
                  lineHeight: 1.15,
                  marginTop: 20,
                }}
              >
                One test in, a personalised plan <span style={{ color: ACCENT_500 }}>out</span>
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
                PrepareKaro connects four steps into one loop, so every test a student takes makes
                their next practice paper better.
              </p>
            </Reveal>
          </div>
        </section>

        <section style={{ padding: "48px 24px", background: "#fff" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {LOOP_STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 80}>
                <div
                  style={{
                    position: "relative",
                    paddingLeft: 64,
                    paddingBottom: index < LOOP_STEPS.length - 1 ? 40 : 0,
                  }}
                >
                  {index < LOOP_STEPS.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 23,
                        top: 48,
                        bottom: 0,
                        width: 2,
                        background: ACCENT_50,
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: `linear-gradient(135deg, ${ACCENT_500}, #0041A3)`,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontWeight: 800,
                      fontSize: 14,
                      boxShadow: "0 4px 24px -4px rgba(8,24,58,0.25)",
                    }}
                  >
                    {step.num}
                  </div>
                  <div
                    className="hover-lift-card"
                    style={{
                      background: "#fff",
                      border: `1px solid ${NAVY}0d`,
                      borderRadius: 18,
                      padding: 24,
                      boxShadow: "0 2px 12px -2px rgba(8,24,58,0.04)",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}
                    >
                      <step.icon size={18} color={ACCENT_500} />
                      <h3
                        style={{
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: 19,
                          color: NAVY,
                        }}
                      >
                        {step.title}
                      </h3>
                    </div>
                    <p style={{ fontSize: 15, color: `${NAVY}8c`, lineHeight: 1.7 }}>
                      {step.description}
                    </p>
                    {step.href && (
                      <Link
                        to={step.href}
                        style={{
                          marginTop: 12,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: ACCENT_500,
                          textDecoration: "none",
                        }}
                      >
                        See how it works <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <SectionHeading
          badge="Ready When You Are"
          title="See the full loop on your own courses"
          description="Book a demo and we'll walk through evaluation, topic analysis and personalised practice with your own batches."
        />
        <div style={{ textAlign: "center", marginTop: 32 }}>
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
        </div>
      </div>
    </LandingLayout>
  );
}
