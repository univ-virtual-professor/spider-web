import { useState, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  Check,
  X,
  Camera,
  Layers,
  ShieldCheck,
  Share2,
  Copy,
  Flag,
  Star,
  CalendarDays,
  Bot,
  Clock,
  MessageCircle,
  Mail,
  Phone,
  FileText,
  ArrowUp,
  Play,
  Volume2,
  Maximize2,
  ListChecks,
  Smartphone,
  Globe,
  Users,
  type LucideIcon,
} from "lucide-react";
import SEO from "@shared/components/SEO";
import LandingNavbar from "@widgets/layout/LandingNavbar";
import LandingFooter from "@widgets/layout/LandingFooter";
import {
  NAVY,
  ACCENT_500,
  ACCENT_50,
  Reveal,
  SectionBadge,
  SectionHeading,
  TightStop,
} from "@shared/components/landing/LandingPrimitives";
import "./landing.css";

const NAVY_900 = "#08183A";
const GREEN_TEXT = "#4ADE80";
const GREEN_BG = "rgba(34,197,94,0.2)";
const RED_TEXT = "#F87171";
const RED_BG = "rgba(239,68,68,0.2)";
const AMBER_TEXT = "#FBBF24";
const YOUTUBE_VIDEO_ID = "QpPB4zU6Vuk";
const WHATSAPP_NUMBER = "919625394589";
const CONTACT_EMAIL = "info.univlive@gmail.com";
const CONTACT_PHONE = "+91 96253 94589";

// ─── STATS ────────────────────────────────────────────────────────────────────
type StatItem = { icon: LucideIcon; value: string; label: string };
const STATS: StatItem[] = [
  { icon: Camera, value: "95%+", label: "Evaluation Accuracy" },
  { icon: Layers, value: "5×", label: "Faster Than Manual Grading" },
  { icon: ShieldCheck, value: "35%", label: "Better Student Performance" },
  { icon: Share2, value: "1,000+", label: "Faculty Hours Saved" },
];

type CapabilityItem = { icon: LucideIcon; label: string; desc: string; color: string; bg: string };
const CAPABILITIES: CapabilityItem[] = [
  {
    icon: Copy,
    label: "Duplicate Copy Detection",
    desc: "Flags copies submitted more than once before grading begins.",
    color: "#7C3AED",
    bg: "#F3EEFF",
  },
  {
    icon: Flag,
    label: "Plagiarism Detection",
    desc: "Cross-checks answers to surface copied or matching responses.",
    color: "#E11D48",
    bg: "#FFF0F3",
  },
  {
    icon: Star,
    label: "Rubric-Based Grading",
    desc: "Every answer scored step-by-step against your own answer key.",
    color: "#D97706",
    bg: "#FFF7E6",
  },
  {
    icon: CalendarDays,
    label: "Results in 72 Hours",
    desc: "Scanned copies to a published result, guaranteed turnaround.",
    color: "#16A34A",
    bg: "#EEFCF3",
  },
];

// ─── AI EVALUATION BREAKDOWN STEPS ───────────────────────────────────────────
const AI_EVAL_STEPS = [
  {
    step: "STEP 1: Commenced Business",
    sub: "Initial capital and cash recorded",
    note: "Correctly recorded the initial capital and cash.",
    pct: 96,
    correct: true,
  },
  {
    step: "STEP 2: Purchased Goods",
    sub: "Goods on credit and cash",
    note: "Correctly recorded the purchase of goods on credit and cash.",
    pct: 94,
    correct: true,
  },
  {
    step: "STEP 3: Sold Goods",
    sub: "Revenue from sale",
    note: "The calculation of the new equation is incorrect; the balance does not match.",
    pct: 42,
    correct: false,
  },
  {
    step: "STEP 4: Received from Debtor",
    sub: "Cash received from debtor",
    note: "The calculation is incorrect; the equation does not balance.",
    pct: 38,
    correct: false,
  },
  {
    step: "STEP 5: Paid Creditor",
    sub: "Payment made to creditor",
    note: "The calculation is incorrect; the equation does not balance.",
    pct: 35,
    correct: false,
  },
  {
    step: "STEP 6: Withdrew Cash & Goods",
    sub: "Drawings and charity",
    note: "The final calculation is incorrect.",
    pct: 30,
    correct: false,
  },
];

// ─── HERO: PLATFORM TOUR CARD ─────────────────────────────────────────────────
// Auto-cycles Evaluate / Analyse / Personalise / Build every 5s; stops permanently once the
// visitor clicks a tab; never auto-cycles under prefers-reduced-motion.
type TourTabId = "evaluate" | "analyse" | "personalise" | "build";
const TOUR_TABS: { id: TourTabId; label: string; sub: string }[] = [
  { id: "evaluate", label: "Evaluate", sub: "AI checking" },
  { id: "analyse", label: "Analyse", sub: "Weak topics" },
  { id: "personalise", label: "Personalise", sub: "Own paper" },
  { id: "build", label: "Build", sub: "Topic tests" },
];

function TrackBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 7, background: "#F8FAFC", borderRadius: 100, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 100 }} />
    </div>
  );
}

function TourEvaluateView() {
  const steps = [
    {
      label: "Capital recorded",
      score: "1/1",
      note: "Initial capital and cash recorded correctly.",
      ok: true,
    },
    {
      label: "Credit purchase",
      score: "1/1",
      note: "Goods bought on credit recorded correctly.",
      ok: true,
    },
    {
      label: "Goods sold",
      score: "0/1",
      note: "Equation does not balance after the sale.",
      ok: false,
    },
    { label: "Received from debtor", score: "0/1", note: "Calculation is incorrect.", ok: false },
  ];
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
      className="tour-eval-grid"
    >
      <div
        className="scan-line-wrap"
        style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${NAVY}0d`, height: 290 }}
      >
        <img
          src="/ai-eval-demo-sheet.png"
          alt="Scanned handwritten answer sheet"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
        />
      </div>
      <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
        {steps.map((s) => (
          <div
            key={s.label}
            style={{
              border: `1px solid ${NAVY}0d`,
              borderLeft: `3px solid ${s.ok ? "#16A34A" : "#E11D48"}`,
              borderRadius: 10,
              padding: "9px 11px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <span>{s.label}</span>
              <span>{s.score}</span>
            </div>
            <p style={{ fontSize: 12, color: `${NAVY}8c`, marginTop: 2 }}>{s.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TourAnalyseView() {
  const topics = [
    { label: "Rotational motion", sub: "Physics, Mechanics", pct: 34, color: "#E11D48" },
    { label: "Chemical equilibrium", sub: "Chemistry, Physical", pct: 41, color: "#E11D48" },
    { label: "Definite integrals", sub: "Maths, Calculus", pct: 58, color: "#F59E0B" },
    { label: "Electrostatics", sub: "Physics, Electricity", pct: 79, color: "#16A34A" },
    { label: "Organic reactions", sub: "Chemistry, Organic", pct: 86, color: "#16A34A" },
  ];
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingBottom: 14,
          borderBottom: `1px solid ${NAVY}0d`,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: ACCENT_50,
            color: ACCENT_500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          AS
        </div>
        <div>
          <b style={{ display: "block", fontSize: 15, fontWeight: 700, color: NAVY }}>
            Aarav Sharma
          </b>
          <small style={{ color: `${NAVY}8c`, fontSize: 12.5 }}>JEE 2027, Batch B2, 14 tests</small>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <b style={{ display: "block", fontSize: 26, fontWeight: 800, color: ACCENT_500 }}>62</b>
          <small style={{ color: `${NAVY}8c` }}>Readiness</small>
        </div>
      </div>
      {topics.map((t, i) => (
        <div
          key={t.label}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 110px 40px",
            gap: 12,
            alignItems: "center",
            padding: "8px 0",
            fontSize: 13.5,
            borderBottom: i < topics.length - 1 ? `1px dashed ${NAVY}1a` : "none",
          }}
        >
          <span>
            {t.label}
            <small style={{ display: "block", fontSize: 11.5, color: `${NAVY}8c` }}>{t.sub}</small>
          </span>
          <TrackBar pct={t.pct} color={t.color} />
          <span style={{ textAlign: "right", fontWeight: 700, fontSize: 13.5 }}>{t.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function TourPersonaliseView() {
  const rows: { label: string; sub: string; count: number; color: string }[] = [
    { label: "Rotational motion", sub: "11 questions, easier start", count: 11, color: "#FB7185" },
    { label: "Chemical equilibrium", sub: "9 questions, easier start", count: 9, color: "#FB7185" },
    { label: "Definite integrals", sub: "7 questions, mixed", count: 7, color: "#FBBF24" },
    { label: "Electrostatics", sub: "3 questions, harder", count: 3, color: "#4ADE80" },
  ];
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <b style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Practice paper for Aarav</b>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 10px",
            borderRadius: 100,
            background: "#EEFCF3",
            color: "#15803D",
          }}
        >
          Ready, 30 questions
        </span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            padding: "10px 0",
            borderBottom: i < rows.length - 1 ? `1px solid ${NAVY}0d` : "none",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13.5,
              marginBottom: 6,
            }}
          >
            <span>{r.label}</span>
            <small style={{ color: `${NAVY}8c`, fontSize: 12 }}>{r.sub}</small>
          </div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {Array.from({ length: r.count }).map((_, k) => (
              <i key={k} style={{ width: 15, height: 19, borderRadius: 4, background: r.color }} />
            ))}
          </div>
        </div>
      ))}
      <div
        style={{
          marginTop: 12,
          fontSize: 12.5,
          color: `${NAVY}8c`,
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span>✓ From his weak topics</span>
        <span>✓ No repeats from recent tests</span>
      </div>
    </div>
  );
}

function TourBuildView() {
  const Opt = ({ label, on = false }: { label: string; on?: boolean }) => (
    <span
      style={{
        fontSize: 13,
        padding: "6px 11px",
        borderRadius: 100,
        border: `1.5px solid ${on ? ACCENT_500 : `${NAVY}1a`}`,
        background: on ? ACCENT_50 : "transparent",
        color: on ? "#0052CC" : NAVY,
        fontWeight: on ? 600 : 400,
      }}
    >
      {label}
    </span>
  );
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <b style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>New test, Batch J2</b>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 10px",
            borderRadius: 100,
            background: ACCENT_50,
            color: "#0052CC",
          }}
        >
          Auto-fill
        </span>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: `${NAVY}8c`,
            marginBottom: 7,
          }}
        >
          Subject
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <Opt label="Physics" />
          <Opt label="Chemistry" on />
          <Opt label="Maths" />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: `${NAVY}8c`,
            marginBottom: 7,
          }}
        >
          Chapters
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <Opt label="Chemical equilibrium" on />
          <Opt label="Ionic equilibrium" on />
          <Opt label="Thermodynamics" />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: `${NAVY}8c`,
            marginBottom: 7,
          }}
        >
          Difficulty and length
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <Opt label="Easy" />
          <Opt label="Medium" on />
          <Opt label="30 questions" on />
        </div>
      </div>
      <div
        style={{
          marginTop: 6,
          paddingTop: 14,
          borderTop: `1px solid ${NAVY}0d`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13.5,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span>
          <b>30 questions</b> filled from your bank and ours
        </span>
        <span
          style={{
            padding: "9px 16px",
            fontSize: 13.5,
            borderRadius: 10,
            background: ACCENT_500,
            color: "#fff",
            fontWeight: 600,
          }}
        >
          Create test
        </span>
      </div>
    </div>
  );
}

function PlatformTourCard() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || paused) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % TOUR_TABS.length), 5000);
    return () => clearInterval(timer);
  }, [paused]);

  const views: Record<TourTabId, ReactNode> = {
    evaluate: <TourEvaluateView />,
    analyse: <TourAnalyseView />,
    personalise: <TourPersonaliseView />,
    build: <TourBuildView />,
  };
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 24,
        border: `1px solid ${NAVY}0d`,
        background: "#fff",
        boxShadow: "0 30px 70px -30px rgba(8,24,58,0.35)",
        overflow: "hidden",
      }}
      aria-label="PrepareKaro platform tour"
    >
      <div
        role="tablist"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderBottom: `1px solid ${NAVY}0d`,
          background: "#F8FAFC",
        }}
      >
        {TOUR_TABS.map((tab, i) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === i}
            onClick={() => {
              setPaused(true);
              setActive(i);
            }}
            style={{
              border: 0,
              background: active === i ? "#fff" : "transparent",
              padding: "14px 8px 12px",
              cursor: "pointer",
              textAlign: "center",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 600,
              fontSize: 13.5,
              color: active === i ? NAVY : `${NAVY}8c`,
              position: "relative",
            }}
          >
            {tab.label}
            <small
              style={{
                display: "block",
                fontWeight: 500,
                fontSize: 11.5,
                color: `${NAVY}8c`,
                marginTop: 1,
              }}
            >
              {tab.sub}
            </small>
            {active === i && (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -1,
                  height: 3,
                  background: ACCENT_50,
                  overflow: "hidden",
                }}
              >
                {!reduce && !paused ? (
                  <i
                    key={active}
                    className="tour-progress-bar"
                    style={{ display: "block", height: "100%", background: ACCENT_500 }}
                  />
                ) : (
                  <i
                    style={{
                      display: "block",
                      height: "100%",
                      width: "100%",
                      background: ACCENT_500,
                    }}
                  />
                )}
              </span>
            )}
          </button>
        ))}
      </div>
      <div style={{ padding: 20, minHeight: 360 }}>{views[TOUR_TABS[active].id]}</div>
    </div>
  );
}

// ─── HERO ─────────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section
      style={{ position: "relative", overflow: "hidden", paddingTop: 136, paddingBottom: 96 }}
    >
      {/* ambient background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: -1,
          background: `linear-gradient(180deg, ${ACCENT_50}99 0%, #F8FAFC 55%, #fff 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: -1,
          backgroundImage: `radial-gradient(${NAVY}14 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 75%)",
          WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 75%)",
        }}
      />
      <div
        className="float-slow"
        style={{
          position: "absolute",
          top: -96,
          left: -96,
          width: 420,
          height: 420,
          background: "rgba(179,207,255,0.5)",
          borderRadius: "50%",
          zIndex: -1,
          filter: "blur(10px)",
        }}
      />
      <div
        className="float-slower"
        style={{
          position: "absolute",
          top: "33%",
          right: -128,
          width: 480,
          height: 480,
          background: "rgba(220,233,255,0.7)",
          borderRadius: "50%",
          zIndex: -1,
          filter: "blur(10px)",
        }}
      />

      <div
        className="hero-grid"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <Reveal>
          <SectionBadge label="AI-Powered Learning and Test Platform" />
          <h1
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(32px, 4vw, 54.4px)",
              fontWeight: 800,
              lineHeight: 1.1,
              color: NAVY,
              marginTop: 24,
              marginBottom: 0,
              letterSpacing: "-0.5px",
            }}
          >
            Check every test
            <TightStop /> Find every weak topic
            <TightStop />{" "}
            <span style={{ color: ACCENT_500 }}>
              Give every student their own practice
              <TightStop />
            </span>
          </h1>
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.7,
              color: `${NAVY}99`,
              marginTop: 24,
              marginBottom: 0,
              fontFamily: "'Inter', sans-serif",
              maxWidth: 520,
            }}
          >
            PrepareKaro evaluates answer sheets with AI, analyses every student by subject, chapter
            and topic, generates personalised practice papers from their weak spots, and builds
            tests from any chapters you choose — plus everything else you need to run your
            institute.
          </p>
          <div
            className="hero-cta"
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 32,
            }}
          >
            <a
              href="#interest-form"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 24px",
                background: NAVY,
                color: "#fff",
                borderRadius: 12,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                boxShadow: "0 4px 24px -4px rgba(8,24,58,0.4)",
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
            >
              Book a Demo <ArrowRight size={13} />
            </a>
            <a
              href="#tools"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                color: NAVY,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                padding: "14px 8px",
              }}
            >
              See how it works <ChevronDown size={13} />
            </a>
          </div>
          <div
            style={{
              marginTop: 30,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              fontSize: 13.5,
              color: `${NAVY}8c`,
            }}
          >
            Built for
            {["JEE", "NEET", "CUET", "CBSE", "State boards"].map((tag) => (
              <span
                key={tag}
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 600,
                  fontSize: 12.5,
                  color: NAVY,
                  background: "#fff",
                  border: `1px solid ${NAVY}1a`,
                  borderRadius: 100,
                  padding: "5px 11px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={150}>
          <PlatformTourCard />
        </Reveal>
      </div>
    </section>
  );
}

// ─── STATS GRID ───────────────────────────────────────────────────────────────
function StatsSection() {
  return (
    <section style={{ padding: "56px 24px 64px", background: "#fff" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          className="stats-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 20,
          }}
        >
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={(i % 4) * 70}>
              <div
                className="hover-lift-card"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.8)",
                  border: `1px solid ${NAVY}0d`,
                  borderRadius: 16,
                  padding: 24,
                  height: "100%",
                  boxSizing: "border-box",
                  boxShadow: "0 2px 12px -2px rgba(8,24,58,0.04)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -30,
                    right: -30,
                    width: 90,
                    height: 90,
                    borderRadius: "50%",
                    background: ACCENT_50,
                    zIndex: 0,
                  }}
                />
                <div
                  style={{
                    position: "relative",
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${ACCENT_500}, #0041A3)`,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 18,
                    boxShadow: `0 6px 16px -4px ${ACCENT_500}66`,
                  }}
                >
                  <s.icon size={19} />
                </div>
                <p
                  style={{
                    position: "relative",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 800,
                    fontSize: 30,
                    color: NAVY,
                    letterSpacing: "-0.5px",
                    lineHeight: 1.1,
                    marginBottom: 6,
                  }}
                >
                  {s.value}
                </p>
                <p
                  style={{
                    position: "relative",
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: `${NAVY}8c`,
                    lineHeight: 1.4,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {s.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <div
          className="stats-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginTop: 16,
          }}
        >
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.label} delay={(i % 4) * 70 + 80}>
              <div
                className="hover-lift-card"
                style={{
                  background: "#fff",
                  border: `1px solid ${NAVY}0d`,
                  borderRadius: 16,
                  padding: 20,
                  height: "100%",
                  boxSizing: "border-box",
                  boxShadow: "0 8px 24px -8px rgba(8,24,58,0.14)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: c.bg,
                    color: c.color,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 14,
                  }}
                >
                  <c.icon size={17} />
                </span>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: NAVY,
                    lineHeight: 1.3,
                    fontFamily: "'Inter', sans-serif",
                    marginBottom: 6,
                  }}
                >
                  {c.label}
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: `${NAVY}73`,
                    lineHeight: 1.55,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {c.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── ONE PLATFORM, FOUR TOOLS ─────────────────────────────────────────────────
type ToolCardDef = {
  key: string;
  title: string;
  desc: string;
  bullets: string[];
  href: string;
  icon: LucideIcon;
  variant: "navy" | "mint" | "lavender" | "peach";
};
const TOOL_CARDS: ToolCardDef[] = [
  {
    key: "analysis",
    title: "Detailed analysis for every student",
    desc: "Accuracy by subject, chapter and topic across all of a student's tests, with recent tests weighted more. Weak spots surface on their own.",
    bullets: [
      "Weak and strong topics, ranked",
      "Readiness score and weekly trend",
      "Next steps written for the student",
      "Batch view for teachers",
    ],
    href: "/features/student-performance-analysis",
    icon: Layers,
    variant: "navy",
  },
  {
    key: "personalise",
    title: "Personalised paper for each student",
    desc: "Generated from the student's own weaknesses and strengths. More questions where they struggle, an easier start, and a few from strong topics to stay sharp.",
    bullets: [
      "Automatic, or the student picks topics",
      "No question repeated from recent tests",
      "Results flow back into their report",
    ],
    href: "/features/personalised-practice-papers",
    icon: FileText,
    variant: "mint",
  },
  {
    key: "build",
    title: "Tests from chosen chapters and topics",
    desc: "Pick subject, chapters and topics, set the difficulty and length, and the paper fills itself from your question bank first, then ours.",
    bullets: [
      "Objective and subjective papers",
      "Fill a whole test or just the gaps",
      "Daily practice papers on a schedule",
    ],
    href: "/features/test-generator",
    icon: ListChecks,
    variant: "lavender",
  },
  {
    key: "evaluate",
    title: "AI evaluation of handwritten answer sheets",
    desc: "Scan the copies and every answer is marked step by step against your answer key and rubric. Faculty review, override and release results when they're ready.",
    bullets: [
      "Duplicate copy detection",
      "Plagiarism detection",
      "Rubric-based grading",
      "Release when ready",
    ],
    href: "/features/ai-answer-sheet-evaluation",
    icon: Camera,
    variant: "peach",
  },
];
const TOOL_VARIANT_STYLE: Record<
  ToolCardDef["variant"],
  {
    background: string;
    border: string;
    titleColor: string;
    descColor: string;
    iconBg: string;
    iconColor: string;
  }
> = {
  navy: {
    background: NAVY,
    border: NAVY,
    titleColor: "#fff",
    descColor: "#B8C2DE",
    iconBg: "rgba(255,255,255,0.1)",
    iconColor: "#7FAEFF",
  },
  mint: {
    background: "#EEFCF3",
    border: "#D7F3E2",
    titleColor: NAVY,
    descColor: `${NAVY}8c`,
    iconBg: "#fff",
    iconColor: "#16A34A",
  },
  lavender: {
    background: "#F3EEFF",
    border: "#E6DCFF",
    titleColor: NAVY,
    descColor: `${NAVY}8c`,
    iconBg: "#fff",
    iconColor: "#7C3AED",
  },
  peach: {
    background: "#FFF7E6",
    border: "#FBE7C2",
    titleColor: NAVY,
    descColor: `${NAVY}8c`,
    iconBg: "#fff",
    iconColor: "#D97706",
  },
};

function ToolCard({ tool }: { tool: ToolCardDef }) {
  const v = TOOL_VARIANT_STYLE[tool.variant];
  return (
    <Link
      to={tool.href}
      className="hover-lift-card"
      style={{
        display: "block",
        borderRadius: 24,
        padding: 28,
        border: `1px solid ${v.border}`,
        background: v.background,
        textDecoration: "none",
      }}
    >
      <span
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          background: v.iconBg,
          color: v.iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <tool.icon size={22} />
      </span>
      <h3
        style={{
          marginTop: 18,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.3,
          color: v.titleColor,
        }}
      >
        {tool.title}
      </h3>
      <p style={{ marginTop: 8, fontSize: 15, color: v.descColor, maxWidth: "46ch" }}>
        {tool.desc}
      </p>
      <ul
        style={{
          marginTop: 16,
          listStyle: "none",
          display: "grid",
          gap: 8,
          fontSize: 14,
          padding: 0,
        }}
      >
        {tool.bullets.map((b) => (
          <li
            key={b}
            style={{ display: "flex", alignItems: "flex-start", gap: 8, color: v.titleColor }}
          >
            <Check
              size={14}
              color={tool.variant === "navy" ? "#7FAEFF" : ACCENT_500}
              style={{ marginTop: 3, flexShrink: 0 }}
            />
            <span style={{ color: v.descColor }}>{b}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

function ToolsSection() {
  return (
    <section id="tools" style={{ padding: "80px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <SectionHeading
          badge="One Platform, Four Tools"
          title="From the exam hall to each student's next practice paper"
          description="Every test feeds the next step automatically, so teachers know who needs what, and students practise exactly what they're weak at."
        />
        <div
          className="tools-grid"
          style={{ marginTop: 52, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}
        >
          {TOOL_CARDS.map((t) => (
            <Reveal key={t.key}>
              <ToolCard tool={t} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── AI EVALUATION SHOWCASE ───────────────────────────────────────────────────
function AIEvaluationSection() {
  return (
    <section
      id="ai-showcase"
      style={{
        position: "relative",
        padding: "96px 24px",
        background: `linear-gradient(180deg, #fff 0%, ${ACCENT_50}4d 100%)`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 800,
          height: 800,
          background: "rgba(220,233,255,0.3)",
          borderRadius: "50%",
          zIndex: -1,
        }}
      />
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Reveal style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <SectionBadge label="Real AI Evaluation" />
          </div>
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(26px,3.5vw,40px)",
              color: NAVY,
              letterSpacing: "-0.5px",
              lineHeight: 1.25,
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            See How Our AI Evaluates Answer Sheets
          </h2>
          <p style={{ fontSize: 16, color: `${NAVY}8c`, marginTop: 16, lineHeight: 1.7 }}>
            A live example from an Accounting exam — the AI scans, analyzes, and grades each step
            with detailed feedback.
          </p>
        </Reveal>

        <div
          className="evaluation-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "3fr 2fr",
            gap: 32,
            alignItems: "stretch",
            marginTop: 64,
          }}
        >
          {/* Scanned copy panel */}
          <Reveal
            className="hover-lift-card"
            style={{
              position: "relative",
              background: "#fff",
              borderRadius: 24,
              border: `1px solid ${NAVY}0d`,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 24px -4px rgba(8,24,58,0.06)",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                zIndex: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                color: "#15803D",
                fontSize: 11.5,
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 100,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            >
              <FileText size={12} /> Original Scanned Copy
            </span>
            <span
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                zIndex: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(8,24,58,0.9)",
                backdropFilter: "blur(6px)",
                color: "#fff",
                fontSize: 11.5,
                fontWeight: 700,
                padding: "8px 14px",
                borderRadius: 100,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <span
                className="pulse-dot"
                style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }}
              />
              AI Evaluated
            </span>

            <div
              className="scan-line-wrap"
              style={{
                flex: 1,
                minHeight: 340,
                overflow: "hidden",
                background: "#F8FAFC",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 48,
                boxSizing: "border-box",
              }}
            >
              <img
                src="/ai-eval-demo-sheet.png"
                alt="Scanned student answer sheet"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center",
                }}
              />
            </div>
          </Reveal>

          {/* AI breakdown panel */}
          <Reveal
            delay={150}
            className="hover-lift-card"
            style={{
              background: NAVY_900,
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 4px 24px -4px rgba(8,24,58,0.06)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                padding: "16px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(0,102,255,0.2)",
                    color: "#7FAEFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bot size={14} />
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    AI Evaluation Breakdown
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    Step-by-step analysis
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#7FAEFF",
                  background: "rgba(0,102,255,0.2)",
                  borderRadius: 100,
                  padding: "4px 12px",
                }}
              >
                Real-time
              </span>
            </div>

            <div
              style={{
                maxHeight: 400,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                overflowY: "auto",
              }}
            >
              {AI_EVAL_STEPS.map((s, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          flexShrink: 0,
                          marginTop: 2,
                          background: s.correct ? GREEN_BG : RED_BG,
                          color: s.correct ? GREEN_TEXT : RED_TEXT,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {s.correct ? <Check size={12} /> : <X size={12} />}
                      </span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>
                          {s.step}
                        </div>
                        <div
                          style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", marginTop: 2 }}
                        >
                          {s.sub}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: s.correct ? GREEN_TEXT : RED_TEXT,
                            marginTop: 4,
                            fontWeight: 500,
                          }}
                        >
                          → {s.note}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: s.correct ? GREEN_TEXT : RED_TEXT,
                        background: s.correct ? GREEN_BG : RED_BG,
                        borderRadius: 100,
                        padding: "2px 8px",
                        flexShrink: 0,
                      }}
                    >
                      {s.pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.1)",
                padding: "16px 24px",
                background: "rgba(255,255,255,0.05)",
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {[
                  ["Accuracy", "92%", "#fff"],
                  ["Correct", "5/6", GREEN_TEXT],
                  ["Partial", "1/6", AMBER_TEXT],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <p
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 2,
                      }}
                    >
                      {label}
                    </p>
                    <p
                      style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 800,
                        fontSize: 17,
                        color,
                      }}
                    >
                      {val}
                    </p>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 10,
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                <Clock size={12} /> Evaluated in 2.4s
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ─── PLATFORM: ACADEMICS VS TEST PLATFORM ─────────────────────────────────────
type WorkspaceCardDef = { title: string; desc: string };
const TEST_PLATFORM_CARDS: WorkspaceCardDef[] = [
  {
    title: "Objective exams",
    desc: "Test series, scheduled tests and daily practice papers for each batch.",
  },
  {
    title: "Subjective exams",
    desc: "AI evaluation of scanned copies with faculty review before release.",
  },
  {
    title: "Proctored exams",
    desc: "A desktop app that locks the computer for the length of the exam.",
  },
  { title: "Student reports", desc: "Subject, chapter and topic analysis with a readiness score." },
  { title: "Practice for me", desc: "Personalised practice papers students generate themselves." },
  { title: "Rankings", desc: "Leaderboards by test and by batch to keep students motivated." },
];
const ACADEMICS_CARDS: WorkspaceCardDef[] = [
  {
    title: "Batches and students",
    desc: "Enrol students into courses and batches across branches.",
  },
  { title: "Curriculum", desc: "Modules and lessons with notes, books and linked tests." },
  { title: "Timetable", desc: "Weekly classes per batch with the teacher, subject and mode." },
  {
    title: "Attendance",
    desc: "Marked for each class from the timetable, with correction requests.",
  },
  { title: "Grades", desc: "Test scores and manual grades together on each student's record." },
  { title: "AI tutor", desc: "Students ask questions about their own study material." },
];
const EVERYWHERE_ITEMS: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Globe,
    title: "Your own branded website",
    desc: "Your institute's white-label site from ready themes, no developer needed.",
  },
  {
    icon: Smartphone,
    title: "Mobile app",
    desc: "Tests, reports, attendance and notifications on Android and iOS.",
  },
  {
    icon: Users,
    title: "Staff roles and branches",
    desc: "Each staff member sees only what their role and branch scope allows.",
  },
];

function WorkspaceCard({ card }: { card: WorkspaceCardDef }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${NAVY}0d`,
        borderRadius: 16,
        padding: 20,
      }}
    >
      <h4
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: NAVY,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {card.title}
      </h4>
      <p style={{ marginTop: 6, color: `${NAVY}8c`, fontSize: 14.5 }}>{card.desc}</p>
    </div>
  );
}

function PlatformSection() {
  const [workspace, setWorkspace] = useState<"test" | "academics">("test");
  const cards = workspace === "test" ? TEST_PLATFORM_CARDS : ACADEMICS_CARDS;

  return (
    <section id="platform" style={{ padding: "80px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <SectionHeading
          badge="Everything Else You Need"
          title="Run your whole institute on PrepareKaro"
          description="Two workspaces in one login: Academics for running classes every day, and the Test Platform for exams, results and practice."
        />

        <Reveal
          style={{
            marginTop: 48,
            background: "#F8FAFC",
            border: `1px solid ${NAVY}0d`,
            borderRadius: 24,
            padding: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 6px" }}>
            <div
              role="tablist"
              aria-label="Workspace"
              style={{
                display: "inline-flex",
                background: "#fff",
                border: `1px solid ${NAVY}0d`,
                borderRadius: 100,
                padding: 4,
                boxShadow: "0 2px 12px -2px rgba(8,24,58,0.08)",
              }}
            >
              <button
                role="tab"
                aria-selected={workspace === "academics"}
                onClick={() => setWorkspace("academics")}
                style={{
                  border: 0,
                  background: workspace === "academics" ? NAVY : "transparent",
                  color: workspace === "academics" ? "#fff" : `${NAVY}8c`,
                  padding: "9px 20px",
                  borderRadius: 100,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 600,
                  fontSize: 14.5,
                  cursor: "pointer",
                }}
              >
                Academics
              </button>
              <button
                role="tab"
                aria-selected={workspace === "test"}
                onClick={() => setWorkspace("test")}
                style={{
                  border: 0,
                  background: workspace === "test" ? NAVY : "transparent",
                  color: workspace === "test" ? "#fff" : `${NAVY}8c`,
                  padding: "9px 20px",
                  borderRadius: 100,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 600,
                  fontSize: 14.5,
                  cursor: "pointer",
                }}
              >
                Test Platform
              </button>
            </div>
          </div>
          <div
            className="tools-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: 14 }}
          >
            {cards.map((c) => (
              <WorkspaceCard key={c.title} card={c} />
            ))}
          </div>
        </Reveal>

        <div
          className="tools-grid"
          style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}
        >
          {EVERYWHERE_ITEMS.map((ev, i) => (
            <Reveal key={ev.title} delay={i * 60}>
              <div
                style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "6px 4px" }}
              >
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: ACCENT_50,
                    color: ACCENT_500,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ev.icon size={20} />
                </span>
                <div>
                  <h4
                    style={{
                      fontSize: 16.5,
                      fontWeight: 700,
                      color: NAVY,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {ev.title}
                  </h4>
                  <p style={{ fontSize: 14.5, color: `${NAVY}8c`, marginTop: 3 }}>{ev.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── MANUAL VS PREPAREKARO COMPARISON ─────────────────────────────────────────
const COMPARISON_ROWS: { label: string; manual: string; ai: string }[] = [
  {
    label: "Checking copies",
    manual: "15–20 minutes per answer sheet, by hand",
    ai: "AI grades every answer sheet in seconds, published within 72 hours",
  },
  {
    label: "Finding weak spots",
    manual: "No visibility below a total score",
    ai: "Automatic subject, chapter and topic breakdown for every student",
  },
  {
    label: "Practice",
    manual: "Same worksheet for the whole batch",
    ai: "Personalised paper built from each student's own weak spots",
  },
  {
    label: "Making tests",
    manual: "Hand-picking every question for a new test",
    ai: "Generated by choosing chapters and topics, from your own question bank first",
  },
  {
    label: "Consistency",
    manual: "Scores vary by evaluator mood, bias & fatigue",
    ai: "Same rubric applied to every paper, every time",
  },
];

function ComparisonSection() {
  return (
    <section style={{ padding: "80px 24px", background: "#F8FAFC" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Reveal style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <SectionBadge label="Why Switch" />
          </div>
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(26px,3.5vw,40px)",
              color: NAVY,
              letterSpacing: "-0.5px",
              lineHeight: 1.25,
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            Manual vs
            <TightStop /> <span style={{ color: ACCENT_500 }}>PrepareKaro</span>
          </h2>
          <p style={{ fontSize: 16, color: `${NAVY}8c`, marginTop: 16, lineHeight: 1.7 }}>
            The same evaluation work, without the bottleneck.
          </p>
        </Reveal>

        <Reveal
          className="hover-lift-card"
          style={{
            maxWidth: 860,
            margin: "48px auto 0",
            background: "#fff",
            border: `1px solid ${NAVY}0d`,
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 4px 24px -4px rgba(8,24,58,0.06)",
          }}
        >
          <div
            className="comparison-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              background: "#F8FAFC",
              borderBottom: `1px solid ${NAVY}0d`,
            }}
          >
            <div className="comparison-cell" style={{ padding: "16px 24px" }} />
            <div
              className="comparison-cell"
              style={{
                padding: "16px 20px",
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                color: `${NAVY}8c`,
              }}
            >
              Manual
            </div>
            <div
              className="comparison-cell"
              style={{
                padding: "16px 20px",
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                color: ACCENT_500,
                background: ACCENT_50,
              }}
            >
              PrepareKaro
            </div>
          </div>

          {COMPARISON_ROWS.map((r, i) => (
            <div
              key={r.label}
              className="comparison-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr",
                borderBottom: i < COMPARISON_ROWS.length - 1 ? `1px solid ${NAVY}0d` : "none",
              }}
            >
              <div
                className="comparison-cell"
                style={{
                  padding: "18px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: NAVY,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {r.label}
              </div>
              <div
                className="comparison-cell"
                style={{
                  padding: "18px 20px",
                  fontSize: 13.5,
                  color: `${NAVY}80`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 8,
                }}
              >
                <X size={13} color={RED_TEXT} style={{ flexShrink: 0 }} />
                <span>{r.manual}</span>
              </div>
              <div
                className="comparison-cell"
                style={{
                  padding: "18px 20px",
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: NAVY,
                  background: `${ACCENT_500}08`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 8,
                }}
              >
                <Check size={13} color="#16A34A" style={{ flexShrink: 0 }} />
                <span>{r.ai}</span>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ─── VIDEO TUTORIAL ───────────────────────────────────────────────────────────
function VideoTutorialSection() {
  const [playing, setPlaying] = useState(false);

  return (
    <section
      id="tutorial"
      style={{
        position: "relative",
        padding: "96px 24px",
        background: NAVY,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          backgroundImage: `radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(circle at 50% 40%, rgba(0,0,0,0.7) 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(circle at 50% 40%, rgba(0,0,0,0.7) 0%, transparent 70%)",
        }}
      />
      <div
        className="float-slow"
        style={{
          position: "absolute",
          top: -140,
          left: "50%",
          transform: "translateX(-50%)",
          width: 640,
          height: 640,
          background: `${ACCENT_500}22`,
          borderRadius: "50%",
          filter: "blur(60px)",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", maxWidth: 980, margin: "0 auto" }}>
        <Reveal style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <SectionBadge label="Platform Walkthrough" dark />
          </div>
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(26px,3.5vw,40px)",
              color: "#fff",
              letterSpacing: "-0.5px",
              lineHeight: 1.25,
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            See PrepareKaro <span style={{ color: "#7FAEFF" }}>in Action</span>
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,0.55)",
              marginTop: 16,
              lineHeight: 1.7,
            }}
          >
            A full walkthrough of scanning, AI evaluation, moderation, and result publishing —
            straight from the platform.
          </p>
        </Reveal>

        <Reveal delay={150} style={{ marginTop: 48 }}>
          <div
            className="hover-lift-card"
            style={{
              position: "relative",
              borderRadius: 24,
              overflow: "hidden",
              aspectRatio: "16 / 9",
              background: "#000",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            {playing ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0`}
                title="PrepareKaro Platform Tutorial"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
              />
            ) : (
              <button
                onClick={() => setPlaying(true)}
                aria-label="Play platform tutorial video"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  padding: 0,
                  border: "none",
                  cursor: "pointer",
                  background: "none",
                }}
              >
                <img
                  src={`https://img.youtube.com/vi/${YOUTUBE_VIDEO_ID}/maxresdefault.jpg`}
                  alt="PrepareKaro platform tutorial video thumbnail"
                  loading="lazy"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(180deg, rgba(8,24,58,0.15) 0%, rgba(8,24,58,0.55) 100%)",
                  }}
                />
                {/* fake browser-chrome top bar for polish */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "rgba(8,24,58,0.7)",
                      backdropFilter: "blur(6px)",
                      color: "#fff",
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: "6px 12px",
                      borderRadius: 100,
                    }}
                  >
                    <span
                      className="pulse-dot"
                      style={{ width: 6, height: 6, borderRadius: "50%", background: "#F87171" }}
                    />
                    Product Tour
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "rgba(8,24,58,0.7)",
                      backdropFilter: "blur(6px)",
                      color: "rgba(255,255,255,0.8)",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "6px 10px",
                      borderRadius: 100,
                    }}
                  >
                    <Volume2 size={11} /> HD <Maximize2 size={11} />
                  </span>
                </div>

                {/* play button */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span className="play-ring" style={{ position: "relative" }}>
                    <span
                      className="play-ring-pulse"
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.25)",
                      }}
                    />
                    <span
                      style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 84,
                        height: 84,
                        borderRadius: "50%",
                        background: "#fff",
                        boxShadow: "0 12px 40px -8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <Play size={30} fill={NAVY} color={NAVY} style={{ marginLeft: 4 }} />
                    </span>
                  </span>
                </div>

                <div
                  style={{
                    position: "absolute",
                    bottom: 20,
                    left: 24,
                    right: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 15,
                      color: "#fff",
                      textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                    }}
                  >
                    PrepareKaro — Full Platform Tutorial
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.85)",
                      background: "rgba(8,24,58,0.7)",
                      backdropFilter: "blur(6px)",
                      padding: "5px 10px",
                      borderRadius: 100,
                    }}
                  >
                    ▶ Watch on YouTube
                  </span>
                </div>
              </button>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── FAQ ───────────────────────────────────────────────────────────────────────
const FAQS: { q: string; a: string }[] = [
  {
    q: "Is our students' data secure?",
    a: "Yes. Scanned copies and results are encrypted in transit and at rest, and access is scoped per institution — no data is shared across tenants.",
  },
  {
    q: "How accurate is the AI grading?",
    a: "Our models score at 95%+ accuracy against your rubric. Every result also goes through a moderation layer where faculty can review and override any AI score before it's published.",
  },
  {
    q: "Can teachers override AI scores?",
    a: "Always. AI grading is a first pass, not a final word — faculty retain full control to review, adjust, and approve results through the moderation portal.",
  },
  {
    q: "What exam types and subjects are supported?",
    a: "Objective, subjective, and case-study questions across subjects and boards. Rubrics are mapped to your own answer keys, not a generic model.",
  },
  {
    q: "How long does evaluation actually take?",
    a: "Most batches are evaluated far faster, with a guaranteed turnaround of up to 72 hours from scanned copy to published result — even at scale.",
  },
  {
    q: "Do we need to change our existing workflow?",
    a: "No. You keep your existing question papers, answer keys, and exam process — we plug into the evaluation and result-publishing step.",
  },
];

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      style={{
        padding: "80px 24px",
        background: `linear-gradient(180deg, #fff 0%, ${ACCENT_50}4d 100%)`,
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <SectionBadge label="FAQ" />
          </div>
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(26px,3.5vw,40px)",
              color: NAVY,
              letterSpacing: "-0.5px",
              lineHeight: 1.25,
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            Frequently Asked Questions
          </h2>
        </Reveal>

        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 12 }}>
          {FAQS.map((f, i) => {
            const isOpen = openIndex === i;
            return (
              <Reveal key={f.q} delay={i * 40}>
                <div
                  style={{
                    background: "#fff",
                    border: `1px solid ${NAVY}0d`,
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: isOpen
                      ? "0 8px 24px -8px rgba(8,24,58,0.14)"
                      : "0 2px 12px -2px rgba(8,24,58,0.04)",
                    transition: "box-shadow 0.3s ease",
                  }}
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "18px 22px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: NAVY,
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {f.q}
                    </span>
                    <ChevronDown
                      size={18}
                      color={`${NAVY}80`}
                      style={{
                        flexShrink: 0,
                        transition: "transform 0.25s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    />
                  </button>
                  <div
                    style={{
                      maxHeight: isOpen ? 200 : 0,
                      opacity: isOpen ? 1 : 0,
                      overflow: "hidden",
                      transition: "max-height 0.3s ease, opacity 0.25s ease",
                    }}
                  >
                    <p
                      style={{
                        padding: "0 22px 20px",
                        fontSize: 13.5,
                        color: `${NAVY}8c`,
                        lineHeight: 1.7,
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {f.a}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── CTA + INTEREST FORM ──────────────────────────────────────────────────────
type CTAFormState = {
  name: string;
  email: string;
  phone: string;
  institution: string;
  message: string;
};

function CTASection() {
  const [form, setForm] = useState<CTAFormState>({
    name: "",
    email: "",
    phone: "",
    institution: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    border: "1.5px solid #e5e7ee",
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    color: NAVY,
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#4b5468",
    marginBottom: 6,
    display: "block",
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.institution.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_MONKEY_KING_API_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          coaching: form.institution,
          phone: form.phone,
          email: form.email,
          exam: form.message.trim() || "General Enquiry",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSubmitted(true);
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="interest-form"
      style={{ position: "relative", overflow: "hidden", padding: "80px 24px 0", background: NAVY }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          className="cta-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start" }}
        >
          <Reveal>
            <SectionBadge label="Built for Institutions, Trusted by Educators" dark />
            <h2
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(28px,3.5vw,42px)",
                color: "#fff",
                letterSpacing: "-1px",
                lineHeight: 1.15,
                marginTop: 24,
                marginBottom: 18,
              }}
            >
              Ready to Modernize Your Examination Workflow?
            </h2>
            <p
              style={{
                fontSize: 15.5,
                color: "rgba(255,255,255,0.5)",
                lineHeight: 1.75,
                marginBottom: 28,
                maxWidth: 440,
              }}
            >
              Every institution is unique. Get a personalized platform tailored to your specific
              requirements.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
              <a
                href="#interest-form-panel"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "13px 24px",
                  background: ACCENT_500,
                  color: "#fff",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14.5,
                  textDecoration: "none",
                }}
              >
                Get Quote <ArrowRight size={15} />
              </a>
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "13px 24px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14.5,
                  textDecoration: "none",
                }}
              >
                <MessageCircle size={15} /> Chat with Us
              </a>
            </div>
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.35)" }}>
              No fixed pricing tiers — every quote is scoped to your institution&apos;s scale and
              needs.
            </p>
          </Reveal>

          <Reveal
            id="interest-form-panel"
            delay={150}
            style={{
              background: "#fff",
              borderRadius: 24,
              padding: "28px 26px",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.4)",
            }}
          >
            {submitted ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "#f0fdf4",
                    border: "2px solid #22c55e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 18px",
                  }}
                >
                  <Check size={28} color="#22c55e" />
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
                  Thanks, {form.name}!
                </h3>
                <p style={{ fontSize: 13.5, color: "#6b7592", lineHeight: 1.6 }}>
                  We&apos;ll contact you within 24 hours.
                </p>
              </div>
            ) : (
              <>
                <h3
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 800,
                    fontSize: 21,
                    color: NAVY,
                    marginBottom: 4,
                  }}
                >
                  Interested in Our Platform?
                </h3>
                <p style={{ fontSize: 13, color: "#8b93ab", marginBottom: 22 }}>
                  Tell us about your institution and we&apos;ll get in touch with you.
                </p>
                <form onSubmit={submit}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Full Name</label>
                    <input
                      style={inputStyle}
                      placeholder="Your name"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Email Address</label>
                    <input
                      style={inputStyle}
                      type="email"
                      placeholder="your@email.com"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Phone Number</label>
                    <input
                      style={inputStyle}
                      type="tel"
                      placeholder="+91 XXXXXXXXXX"
                      value={form.phone}
                      onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Institution / Coaching Center</label>
                    <input
                      style={inputStyle}
                      placeholder="Your institution name"
                      value={form.institution}
                      onChange={(e) => setForm((p) => ({ ...p, institution: e.target.value }))}
                    />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Message</label>
                    <textarea
                      style={{
                        ...inputStyle,
                        minHeight: 84,
                        resize: "vertical",
                        fontFamily: "'Inter', sans-serif",
                      }}
                      placeholder="Tell us about your requirements..."
                      value={form.message}
                      onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      width: "100%",
                      padding: 14,
                      background: submitting ? `${ACCENT_500}88` : ACCENT_500,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: submitting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {submitting ? "Submitting…" : "Submit Interest"} <ArrowRight size={15} />
                  </button>
                  <p style={{ textAlign: "center", fontSize: 12, color: "#8b93ab", marginTop: 14 }}>
                    We&apos;ll contact you within 24 hours.
                  </p>
                </form>
              </>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ─── CONTACT CHANNELS ─────────────────────────────────────────────────────────
function ContactChannelsSection() {
  const channels = [
    {
      icon: MessageCircle,
      label: "Chat on WhatsApp",
      value: "Instant response",
      href: `https://wa.me/${WHATSAPP_NUMBER}`,
      gradient: "linear-gradient(135deg, #22C55E, #16A34A)",
    },
    {
      icon: Mail,
      label: "Email Us",
      value: CONTACT_EMAIL,
      href: `mailto:${CONTACT_EMAIL}`,
      gradient: `linear-gradient(135deg, ${ACCENT_500}, #0041A3)`,
    },
    {
      icon: Phone,
      label: "Call Us",
      value: CONTACT_PHONE,
      href: "tel:+919625394589",
      gradient: `linear-gradient(135deg, #7FAEFF, ${ACCENT_500})`,
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 16,
        marginBottom: 64,
      }}
      className="process-track"
    >
      {channels.map((c, i) => (
        <Reveal key={c.label} delay={i * 90}>
          <a
            href={c.href}
            target={c.href.startsWith("http") ? "_blank" : undefined}
            rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: "16px 20px",
              textDecoration: "none",
              transition: "background 0.2s, transform 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.07)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              e.currentTarget.style.transform = "";
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: c.gradient,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <c.icon size={18} />
            </span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{c.label}</p>
              <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.4)" }}>{c.value}</p>
            </div>
          </a>
        </Reveal>
      ))}
    </div>
  );
}

// ─── CALLBACK WIDGET ──────────────────────────────────────────────────────────
function CallbackSection() {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\s/g, ""))) {
      alert("Enter a valid 10-digit mobile number");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_MONKEY_KING_API_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Callback Request",
          coaching: "N/A",
          phone,
          exam: "Instant Callback Request",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setDone(true);
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Reveal
      style={{
        position: "relative",
        borderRadius: 24,
        border: "1px solid rgba(255,255,255,0.1)",
        background: `linear-gradient(90deg, ${ACCENT_500}1a, rgba(255,255,255,0.03), ${ACCENT_500}1a)`,
        padding: "28px 32px",
        marginBottom: 64,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h4
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 18,
            fontWeight: 700,
            color: "#fff",
            marginBottom: 4,
          }}
        >
          Request an Instant Call Back
        </h4>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          Share your number — our team will call within a few hours.
        </p>
      </div>
      {done ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: GREEN_TEXT,
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          <Check size={16} /> Thanks! We&apos;ll call you back shortly.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            style={{
              padding: "13px 16px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontSize: 14,
              minWidth: 260,
              outline: "none",
            }}
            placeholder="Your 10-digit mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 22px",
              background: ACCENT_500,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            Request Callback <Phone size={13} />
          </button>
        </div>
      )}
    </Reveal>
  );
}

// ─── SCROLL TO TOP ────────────────────────────────────────────────────────────
function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href="#top"
      aria-label="Back to top"
      className="scroll-top-btn"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: ACCENT_500,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 8px 24px -4px rgba(0,102,255,0.5)",
        zIndex: 90,
        textDecoration: "none",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.85)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <ArrowUp size={17} />
    </a>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function Index() {
  // The app sets a global `scroll-behavior: smooth` (src/index.css). Combined with this
  // page's scroll-triggered reveal animations, Chrome aborts in-flight smooth anchor scrolls
  // as soon as an IntersectionObserver mutates the DOM mid-scroll, landing far short of the
  // target section. Force instant scrolling on this page only so #anchor nav lands correctly.
  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, []);

  return (
    <>
      <SEO
        title="PrepareKaro | AI Test, Analysis & Practice Platform for Coaching Institutes"
        description="PrepareKaro is the full platform for coaching institutes: AI answer-sheet evaluation, per-topic student analysis, personalised practice papers, test generation from any chapter, plus curriculum, attendance, timetable, proctored exams and a branded app."
        canonical="https://preparekaro.in/"
      />
      <div id="top" />
      <LandingNavbar />
      <HeroSection />
      <StatsSection />
      <ToolsSection />
      <AIEvaluationSection />
      <PlatformSection />
      <ComparisonSection />
      <VideoTutorialSection />
      <FAQSection />
      <CTASection />
      <LandingFooter
        topContent={
          <>
            <ContactChannelsSection />
            <CallbackSection />
          </>
        }
      />
      <ScrollToTop />
    </>
  );
}
