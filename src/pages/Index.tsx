import { useState, useEffect } from "react";
import {
  ArrowRight,
  Check,
  X,
  Star,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Mail,
  Sparkles,
  Brain,
  BarChart3,
  BookOpen,
  FileText,
  Lightbulb,
  Share2,
  Globe,
  Pen,
  type LucideIcon,
} from "lucide-react";
import SEO from "@shared/components/SEO";
import LandingNavbar from "@widgets/layout/LandingNavbar";
import LandingFooter from "@widgets/layout/LandingFooter";
import "./landing.css";

const PRIMARY = "#6C47FF";
const ACCENT = "#A78BFA";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const HERO_TAGS = ["CUET", "JEE", "NEET", "UPSC", "CAT", "CBSE", "Abacus", "And many more..."];
const HERO_STATS: [string, string][] = [
  ["500+", "Institutes"],
  ["2L+", "Students"],
  ["10+", "Exams Supported"],
];
const DEMO_PERKS = [
  "Personalised walkthrough of all features",
  "Platform configured for your exam type",
  "Live Q&A with our academic team",
  "No commitment required",
];
const EXAM_OPTIONS = [
  "JEE (Main + Advanced)",
  "NEET",
  "CUET",
  "UPSC / Civil Services",
  "CAT / MBA",
  "State Board Exams",
  "CBSE Board Exams",
  "CA Foundation",
  "Other",
];

// ─── FEATURES DATA ────────────────────────────────────────────────────────────
type FeatureItem = { icon: LucideIcon; title: string; desc: string; color: string };

const FEATURES: FeatureItem[] = [
  {
    icon: BookOpen,
    title: "Question Bank",
    desc: "Both subjective and objective question sets, organized by topic and difficulty level.",
    color: "#6C47FF",
  },
  {
    icon: FileText,
    title: "Daily Practice Papers",
    desc: "Auto-generate DPPs based on topics selected by the teacher — personalized daily practice.",
    color: "#8B5CF6",
  },
  {
    icon: Lightbulb,
    title: "Content Library",
    desc: "Curated short notes and study material shared directly with students.",
    color: "#EC4899",
  },
  {
    icon: Share2,
    title: "Notes Sharing",
    desc: "Teachers can share notes and resources with their entire batch instantly.",
    color: "#F59E0B",
  },
  {
    icon: Globe,
    title: "Pan-India Test Series",
    desc: "Monthly all-India competitive test series to benchmark students nationally.",
    color: "#10B981",
  },
  {
    icon: Mail,
    title: "Monthly Parent Reports",
    desc: "Automated performance reports sent to parents every month — no manual effort.",
    color: "#3B82F6",
  },
  {
    icon: Pen,
    title: "AI Subjective Checking",
    desc: "AI evaluates written answers with feedback, saving teachers hours of work.",
    color: "#6C47FF",
  },
  {
    icon: Sparkles,
    title: "Personalised Test Papers",
    desc: "AI generates unique test papers per student based on their weak areas.",
    color: "#EC4899",
  },
  {
    icon: Brain,
    title: "AI Doubt Support",
    desc: "24/7 AI-powered doubt resolution so students never get stuck.",
    color: "#F59E0B",
  },
  {
    icon: BarChart3,
    title: "AI-Based Analytics",
    desc: "Deep performance insights — question-wise accuracy, time analysis, and weak area identification.",
    color: "#10B981",
  },
];

// ─── COMPARISON DATA ──────────────────────────────────────────────────────────
const COMPARISON_ROWS = [
  { feature: "Test Delivery", old: "Physical OMR sheets", univ: "Digital CBT — any device" },
  { feature: "Paper Checking", old: "Manual — hours of effort", univ: "AI-automated in seconds" },
  { feature: "Exam Coverage", old: "Single exam focus", univ: "Any exam — JEE, NEET, CUET, UPSC…" },
  { feature: "Question Types", old: "MCQ only", univ: "Subjective + Objective" },
  { feature: "Student Analytics", old: "Not available", univ: "AI-powered deep analytics" },
  { feature: "Doubt Support", old: "Limited to class hours", univ: "24/7 AI Doubt Support" },
  { feature: "Parent Reports", old: "Manual effort", univ: "Auto-sent every month" },
  { feature: "Test Papers", old: "Same paper for all", univ: "AI-personalised per student" },
  { feature: "Notes & Content", old: "WhatsApp / printouts", univ: "Centralised content library" },
];

// ─── TESTIMONIALS DATA ────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    name: "Rajesh Sharma",
    role: "Director, Pinnacle Academy",
    initials: "RS",
    text: "Preparekaro.in transformed how we run our JEE test series. The AI analytics helped our top students improve their weak subjects by 30% in just 2 months.",
    rating: 5,
  },
  {
    name: "Priya Menon",
    role: "Founder, NEET Guru Institute",
    initials: "PM",
    text: "We shifted from OMR sheets to Preparekaro.in and saved ₹8,000/month in paper costs alone. The parent report feature has increased trust dramatically.",
    rating: 5,
  },
  {
    name: "Arvind Khanna",
    role: "Centre Head, Career Catalyst",
    initials: "AK",
    text: "The personalised test papers are a game-changer. Each student gets targeted practice, and our results have improved across all batches this year.",
    rating: 5,
  },
  {
    name: "Sunita Patel",
    role: "Teacher, Excel Coaching",
    initials: "SP",
    text: "AI doubt support means I don't have to answer WhatsApp messages at midnight anymore. Students get instant answers and I get my life back!",
    rating: 5,
  },
];

// ─── HERO ─────────────────────────────────────────────────────────────────────
function HeroSection() {
  const [activeTag, setActiveTag] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveTag((p) => (p + 1) % HERO_TAGS.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        paddingTop: 68,
        background: "linear-gradient(160deg, #faf9ff 0%, #f3f0ff 50%, #ede8ff 100%)",
      }}
    >
      <div
        className="hero-grid"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "80px 24px",
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 64,
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: `${PRIMARY}12`,
              border: `1px solid ${PRIMARY}28`,
              borderRadius: 100,
              padding: "6px 16px",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: PRIMARY,
                boxShadow: `0 0 0 3px ${PRIMARY}30`,
              }}
            ></div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: PRIMARY,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              For Coaching Institutes
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "clamp(36px, 4.5vw, 58px)",
              fontWeight: 700,
              lineHeight: 1.12,
              color: "#0f0e17",
              marginBottom: 20,
              letterSpacing: "-1.5px",
            }}
          >
            Launch Your Own Institute
            <br />
            <span style={{ color: PRIMARY }}>Platform in Minutes</span>
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
            {HERO_TAGS.map((tag, i) => (
              <span
                key={tag}
                style={{
                  padding: "5px 14px",
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif",
                  background: activeTag === i ? PRIMARY : `${PRIMARY}0f`,
                  color: activeTag === i ? "#fff" : PRIMARY,
                  border: `1px solid ${activeTag === i ? PRIMARY : PRIMARY + "28"}`,
                  transition: "all 0.4s ease",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "#5a5970",
              marginBottom: 36,
              fontFamily: "'Inter', sans-serif",
              maxWidth: 480,
            }}
          >
            Preparekaro.in empowers coaching institutes to run their own branded exam platform for
            any competitive exam with AI-powered tools, question banks, and real-time analytics.
          </p>
          <div className="hero-cta" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a
              href="#interest-widget"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 28px",
                background: PRIMARY,
                color: "#fff",
                borderRadius: 100,
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
                boxShadow: `0 8px 32px ${PRIMARY}45`,
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 12px 40px ${PRIMARY}55`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = `0 8px 32px ${PRIMARY}45`;
              }}
            >
              Book a Demo <ArrowRight size={16} />
            </a>
            <a
              href="#features"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 28px",
                background: "#fff",
                color: "#0f0e17",
                borderRadius: 100,
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
                border: "1.5px solid #e5e2f5",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e2f5")}
            >
              Explore Features
            </a>
          </div>
          <div
            style={{
              display: "flex",
              gap: 28,
              marginTop: 44,
              paddingTop: 32,
              borderTop: "1px solid #e5e2f5",
              flexWrap: "wrap",
            }}
          >
            {HERO_STATS.map(([num, label]) => (
              <div key={label}>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 26,
                    color: "#0f0e17",
                    letterSpacing: "-1px",
                  }}
                >
                  {num}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#8b8aa0",
                    fontFamily: "'Inter', sans-serif",
                    marginTop: 2,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="hero-right" style={{ position: "relative" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 20,
              boxShadow: "0 32px 80px rgba(108,71,255,0.18), 0 4px 20px rgba(0,0,0,0.06)",
              overflow: "hidden",
              border: "1px solid rgba(108,71,255,0.1)",
            }}
          >
            <div
              style={{
                background: PRIMARY,
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", gap: 6 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.4)",
                    }}
                  ></div>
                ))}
              </div>
              <div
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  padding: "4px 12px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.85)",
                  fontFamily: "monospace",
                }}
              >
                yourcoaching.preparekaro.in
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 15,
                      color: "#0f0e17",
                    }}
                  >
                    Dashboard
                  </div>
                  <div style={{ fontSize: 11, color: "#8b8aa0" }}>Welcome back, Rahul Sir</div>
                </div>
                <div
                  style={{
                    background: `${PRIMARY}12`,
                    padding: "4px 12px",
                    borderRadius: 100,
                    fontSize: 11,
                    fontWeight: 600,
                    color: PRIMARY,
                  }}
                >
                  ● Live
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {[
                  ["1,240", "Students", "#6C47FF"],
                  ["48", "Tests Live", "#22c55e"],
                  ["94%", "Avg. Score", "#f59e0b"],
                ].map(([val, lbl, clr]) => (
                  <div
                    key={lbl}
                    style={{ background: "#f8f7ff", borderRadius: 10, padding: "10px 12px" }}
                  >
                    <div
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 18,
                        color: clr,
                      }}
                    >
                      {val}
                    </div>
                    <div style={{ fontSize: 10, color: "#8b8aa0", marginTop: 2 }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#f8f7ff", borderRadius: 10, padding: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#8b8aa0",
                    marginBottom: 8,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Recent Tests
                </div>
                {[
                  { name: "Physics DPP #12", exam: "JEE", status: "Live", clr: "#22c55e" },
                  { name: "Polity Mock #5", exam: "UPSC", status: "Scheduled", clr: "#f59e0b" },
                  { name: "Quant Practice", exam: "CAT", status: "Completed", clr: "#8b8aa0" },
                ].map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "7px 0",
                      borderBottom: i < 2 ? "1px solid #ede8ff" : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0f0e17" }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 10, color: "#8b8aa0" }}>{t.exam}</div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: t.clr,
                        background: t.clr + "18",
                        padding: "3px 8px",
                        borderRadius: 100,
                      }}
                    >
                      {t.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Floating badges */}
          <div
            style={{
              position: "absolute",
              top: -16,
              right: -20,
              background: "#fff",
              borderRadius: 14,
              padding: "10px 16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid #f0eeff",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#f0fdf4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={16} color="#22c55e" />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0f0e17" }}>AI Checking</div>
              <div style={{ fontSize: 10, color: "#8b8aa0" }}>Subjective papers</div>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 20,
              left: -24,
              background: "#fff",
              borderRadius: 14,
              padding: "10px 16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid #f0eeff",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#fdf4ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BarChart3 size={16} color={PRIMARY} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0f0e17" }}>Live Analytics</div>
              <div style={{ fontSize: 10, color: "#8b8aa0" }}>Real-time insights</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FEATURES ─────────────────────────────────────────────────────────────────
function FeaturesSection() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section id="features" style={{ padding: "100px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div
            style={{
              display: "inline-flex",
              background: `${PRIMARY}10`,
              border: `1px solid ${PRIMARY}20`,
              borderRadius: 100,
              padding: "5px 16px",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: PRIMARY,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Platform Features
            </span>
          </div>
          <h2
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: "clamp(28px,4vw,44px)",
              color: "#0f0e17",
              letterSpacing: "-1px",
              lineHeight: 1.15,
              marginBottom: 16,
            }}
          >
            Everything Your Coaching
            <br />
            Institute Needs
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "#5a5970",
              maxWidth: 520,
              margin: "0 auto",
              lineHeight: 1.7,
            }}
          >
            From question banks to AI-powered analytics — one platform to run your entire academic
            operation.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center" }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="feature-card"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: "calc(25% - 15px)",
                minWidth: 220,
                maxWidth: 320,
                flexGrow: 0,
                background: hovered === i ? `${f.color}06` : "#faf9ff",
                border: `1.5px solid ${hovered === i ? f.color + "30" : "#f0eeff"}`,
                borderRadius: 16,
                padding: "24px",
                cursor: "default",
                transition: "all 0.25s ease",
                transform: hovered === i ? "translateY(-3px)" : "none",
                boxShadow: hovered === i ? `0 12px 40px ${f.color}18` : "none",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${f.color}14`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                <f.icon size={20} color={f.color} />
              </div>
              <h3
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#0f0e17",
                  marginBottom: 8,
                  letterSpacing: "-0.3px",
                }}
              >
                {f.title}
              </h3>
              <p style={{ fontSize: 13.5, color: "#6b6a7e", lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── HOW IT WORKS (landing section) ──────────────────────────────────────────
function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "Tell Us About Your Institute",
      sub: "Share basic details — your coaching name, exam focus, and student count.",
      visual: (
        <div style={{ padding: 16 }}>
          <div style={{ background: "#f8f7ff", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: "#8b8aa0", marginBottom: 10, fontWeight: 600 }}>
              Institute Setup
            </div>
            {["Institute Name", "Exam Category", "No. of Students"].map((lbl, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "#8b8aa0", marginBottom: 3 }}>{lbl}</div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e2f5",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    color: "#0f0e17",
                  }}
                >
                  {["Bright Future Academy", "JEE / NEET / CUET", "1,200+"][i]}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      num: "02",
      title: "We Set Up Your Platform",
      sub: "Our team configures your branded portal within 24 hours — no tech knowledge needed.",
      visual: (
        <div style={{ padding: 16 }}>
          <div style={{ background: "#f8f7ff", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: "#8b8aa0", marginBottom: 10, fontWeight: 600 }}>
              Platform Setup
            </div>
            {[
              { label: "Domain configured", done: true },
              { label: "Branding applied", done: true },
              { label: "Question bank seeded", done: true },
              { label: "Teacher accounts ready", done: false },
            ].map((item, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: item.done ? "#22c55e" : "#e5e2f5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {item.done && <Check size={10} color="#fff" />}
                </div>
                <span style={{ fontSize: 12, color: item.done ? "#0f0e17" : "#8b8aa0" }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      num: "03",
      title: "Teachers Add Content",
      sub: "Upload questions, create DPPs, share notes, and schedule tests — all from one dashboard.",
      visual: (
        <div style={{ padding: 16 }}>
          <div style={{ background: "#f8f7ff", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: "#8b8aa0", marginBottom: 10, fontWeight: 600 }}>
              Teacher Dashboard
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                ["📚", "Question Bank"],
                ["📝", "Create DPP"],
                ["📄", "Share Notes"],
                ["📊", "View Analytics"],
              ].map(([emoji, label]) => (
                <div
                  key={label}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e2f5",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 11,
                    color: "#0f0e17",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{emoji}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      num: "04",
      title: "Students Learn & Grow",
      sub: "Students get personalised tests, AI doubt support, and monthly reports automatically.",
      visual: (
        <div style={{ padding: 16 }}>
          <div style={{ background: "#f8f7ff", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#8b8aa0", fontWeight: 600 }}>
                Student Progress
              </div>
              <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>↑ 18%</div>
            </div>
            {[
              ["Physics", 82],
              ["Math", 74],
              ["Chemistry", 91],
            ].map(([sub, pct]) => (
              <div key={String(sub)} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    color: "#8b8aa0",
                    marginBottom: 4,
                  }}
                >
                  <span>{sub}</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ background: "#e5e2f5", borderRadius: 100, height: 5 }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      background: PRIMARY,
                      borderRadius: 100,
                      height: "100%",
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <section
      id="how-it-works"
      style={{
        padding: "100px 24px",
        background: "linear-gradient(180deg, #f8f7ff 0%, #fff 100%)",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div
            style={{
              display: "inline-flex",
              background: `${PRIMARY}10`,
              border: `1px solid ${PRIMARY}20`,
              borderRadius: 100,
              padding: "5px 16px",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: PRIMARY,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              How It Works
            </span>
          </div>
          <h2
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: "clamp(28px,4vw,44px)",
              color: "#0f0e17",
              letterSpacing: "-1px",
              lineHeight: 1.15,
              marginBottom: 16,
            }}
          >
            From Enquiry to Live
            <br />
            Platform in 48 Hours
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 24,
          }}
        >
          {steps.map((s, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                borderRadius: 20,
                border: "1.5px solid #f0eeff",
                overflow: "hidden",
                boxShadow: "0 4px 24px rgba(108,71,255,0.06)",
              }}
            >
              <div style={{ padding: "20px 20px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: PRIMARY,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    {s.num}
                  </div>
                  <h3
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 15,
                      color: "#0f0e17",
                      letterSpacing: "-0.3px",
                      lineHeight: 1.3,
                    }}
                  >
                    {s.title}
                  </h3>
                </div>
                <p style={{ fontSize: 13, color: "#6b6a7e", lineHeight: 1.65, marginBottom: 12 }}>
                  {s.sub}
                </p>
              </div>
              {s.visual}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── COMPARISON ───────────────────────────────────────────────────────────────
function ComparisonSection() {
  return (
    <section id="comparison" style={{ padding: "100px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div
            style={{
              display: "inline-flex",
              background: `${PRIMARY}10`,
              border: `1px solid ${PRIMARY}20`,
              borderRadius: 100,
              padding: "5px 16px",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: PRIMARY,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Why Switch
            </span>
          </div>
          <h2
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: "clamp(28px,4vw,44px)",
              color: "#0f0e17",
              letterSpacing: "-1px",
              lineHeight: 1.15,
            }}
          >
            Traditional vs Preparekaro.in
          </h2>
        </div>
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            border: "1.5px solid #f0eeff",
            boxShadow: "0 8px 48px rgba(108,71,255,0.08)",
          }}
        >
          <div
            className="comparison-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1.5fr 1.5fr",
              background: "#faf9ff",
            }}
          >
            <div
              className="comparison-cell"
              style={{
                padding: "16px 24px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                fontSize: 13,
                color: "#8b8aa0",
              }}
            >
              Feature
            </div>
            <div
              className="comparison-cell"
              style={{
                padding: "16px 24px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 14,
                color: "#ef4444",
                borderLeft: "1px solid #f0eeff",
                textAlign: "center",
              }}
            >
              Traditional Method
            </div>
            <div
              className="comparison-cell"
              style={{
                padding: "16px 24px",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 14,
                color: PRIMARY,
                borderLeft: "1px solid #f0eeff",
                textAlign: "center",
                background: `${PRIMARY}06`,
              }}
            >
              Preparekaro.in Platform
            </div>
          </div>
          {COMPARISON_ROWS.map((r, i) => (
            <div
              key={i}
              className="comparison-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.5fr 1.5fr",
                borderTop: "1px solid #f0eeff",
                background: i % 2 === 0 ? "#fff" : "#fdf9ff",
              }}
            >
              <div
                className="comparison-cell"
                style={{ padding: "14px 24px", fontSize: 14, color: "#0f0e17", fontWeight: 500 }}
              >
                {r.feature}
              </div>
              <div
                className="comparison-cell"
                style={{
                  padding: "14px 24px",
                  fontSize: 13,
                  color: "#ef4444",
                  borderLeft: "1px solid #f0eeff",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <X size={14} color="#ef4444" />
                {r.old}
              </div>
              <div
                className="comparison-cell"
                style={{
                  padding: "14px 24px",
                  fontSize: 13,
                  color: "#16a34a",
                  borderLeft: "1px solid #f0eeff",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: `${PRIMARY}04`,
                }}
              >
                <Check size={14} color="#16a34a" />
                {r.univ}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────
function TestimonialsSection() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((p) => (p + 1) % TESTIMONIALS.length), 4000);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <section
      id="testimonials"
      style={{
        padding: "100px 24px",
        background: "linear-gradient(180deg, #f8f7ff 0%, #fff 100%)",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div
            style={{
              display: "inline-flex",
              background: `${PRIMARY}10`,
              border: `1px solid ${PRIMARY}20`,
              borderRadius: 100,
              padding: "5px 16px",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: PRIMARY,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Testimonials
            </span>
          </div>
          <h2
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: "clamp(28px,4vw,44px)",
              color: "#0f0e17",
              letterSpacing: "-1px",
              lineHeight: 1.15,
            }}
          >
            What Coaching Centers
            <br />
            Say About <span style={{ color: PRIMARY }}>Preparekaro.in</span>
          </h2>
        </div>
        <div
          className="testimonial-card"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "40px 48px",
            border: "1.5px solid #f0eeff",
            boxShadow: "0 8px 48px rgba(108,71,255,0.08)",
            marginBottom: 32,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 28,
              right: 36,
              fontFamily: "Georgia, serif",
              fontSize: 80,
              color: `${PRIMARY}14`,
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            "
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 20 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: PRIMARY,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                flexShrink: 0,
              }}
            >
              {TESTIMONIALS[active].initials}
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#0f0e17",
                }}
              >
                {TESTIMONIALS[active].name}
              </div>
              <div style={{ fontSize: 13, color: "#8b8aa0" }}>{TESTIMONIALS[active].role}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 3, marginBottom: 16 }}>
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={16} color="#F59E0B" fill="#F59E0B" />
            ))}
          </div>
          <p style={{ fontSize: 16, color: "#3d3c47", lineHeight: 1.75, fontStyle: "italic" }}>
            "{TESTIMONIALS[active].text}"
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20 }}>
          <button
            onClick={() => setActive((active - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1.5px solid #e5e2f5",
              background: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = PRIMARY;
              e.currentTarget.style.background = `${PRIMARY}10`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#e5e2f5";
              e.currentTarget.style.background = "#fff";
            }}
          >
            <ChevronLeft size={18} color="#3d3c47" />
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                style={{
                  width: i === active ? 28 : 8,
                  height: 8,
                  borderRadius: 100,
                  background: i === active ? PRIMARY : "#e5e2f5",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
              ></button>
            ))}
          </div>
          <button
            onClick={() => setActive((active + 1) % TESTIMONIALS.length)}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1.5px solid #e5e2f5",
              background: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = PRIMARY;
              e.currentTarget.style.background = `${PRIMARY}10`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#e5e2f5";
              e.currentTarget.style.background = "#fff";
            }}
          >
            <ChevronRight size={18} color="#3d3c47" />
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── INTEREST WIDGET ──────────────────────────────────────────────────────────
type FormState = {
  name: string;
  coaching: string;
  phone: string;
  email: string;
  exam: string;
  date: string;
};
type FormErrors = Partial<Record<keyof FormState, string>>;

function InterestWidgetSection() {
  const [form, setForm] = useState<FormState>({
    name: "",
    coaching: "",
    phone: "",
    email: "",
    exam: "",
    date: "",
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = "Required";
    if (!form.coaching.trim()) e.coaching = "Required";
    if (!form.phone.trim() || !/^[6-9]\d{9}$/.test(form.phone.replace(/\s/g, "")))
      e.phone = "Enter valid 10-digit mobile";
    if (!form.exam) e.exam = "Please select";
    return e;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_MONKEY_KING_API_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setStep(2);
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = (key: keyof FormState): React.CSSProperties => ({
    width: "100%",
    padding: "12px 14px",
    border: `1.5px solid ${errors[key] ? "#ef4444" : "#e5e2f5"}`,
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    color: "#0f0e17",
    background: "#fff",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#3d3c47",
    marginBottom: 6,
    display: "block",
    fontFamily: "'Inter', sans-serif",
  };

  return (
    <section id="interest-widget" style={{ padding: "100px 24px", background: "#0f0e17" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div
          className="widget-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                background: `${PRIMARY}25`,
                border: `1px solid ${PRIMARY}40`,
                borderRadius: 100,
                padding: "5px 16px",
                marginBottom: 24,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: ACCENT,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Get Started
              </span>
            </div>
            <h2
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: "clamp(28px,3.5vw,42px)",
                color: "#fff",
                letterSpacing: "-1px",
                lineHeight: 1.15,
                marginBottom: 20,
              }}
            >
              Ready to transform your coaching institute?
            </h2>
            <p style={{ fontSize: 15, color: "#9b9aae", lineHeight: 1.75, marginBottom: 36 }}>
              Schedule a personalised demo with our team. We'll show you exactly how Preparekaro.in
              can work for your institute and exam category.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {DEMO_PERKS.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: `${PRIMARY}30`,
                      border: `1px solid ${PRIMARY}50`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <Check size={11} color={ACCENT} />
                  </div>
                  <span style={{ fontSize: 14, color: "#c4c3d4", lineHeight: 1.6 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              padding: "36px 32px",
              boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
            }}
          >
            {step === 1 ? (
              <>
                <h3
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 22,
                    color: "#0f0e17",
                    marginBottom: 6,
                  }}
                >
                  Show Your Interest
                </h3>
                <p style={{ fontSize: 13, color: "#8b8aa0", marginBottom: 28 }}>
                  Fill in your details and we'll reach out to schedule your demo.
                </p>
                <form onSubmit={submit}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>
                        Your Name <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        style={inputStyle("name")}
                        placeholder="Rahul Gupta"
                        value={form.name}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, name: e.target.value }));
                          setErrors((p) => ({ ...p, name: "" }));
                        }}
                        onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                        onBlur={(e) =>
                          (e.target.style.borderColor = errors.name ? "#ef4444" : "#e5e2f5")
                        }
                      />
                      {errors.name && (
                        <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
                          {errors.name}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Coaching Name <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        style={inputStyle("coaching")}
                        placeholder="Bright Future Academy"
                        value={form.coaching}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, coaching: e.target.value }));
                          setErrors((p) => ({ ...p, coaching: "" }));
                        }}
                        onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                        onBlur={(e) =>
                          (e.target.style.borderColor = errors.coaching ? "#ef4444" : "#e5e2f5")
                        }
                      />
                      {errors.coaching && (
                        <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
                          {errors.coaching}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>
                      Mobile Number <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      style={inputStyle("phone")}
                      placeholder="9876543210"
                      value={form.phone}
                      type="tel"
                      onChange={(e) => {
                        setForm((p) => ({ ...p, phone: e.target.value }));
                        setErrors((p) => ({ ...p, phone: "" }));
                      }}
                      onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                      onBlur={(e) =>
                        (e.target.style.borderColor = errors.phone ? "#ef4444" : "#e5e2f5")
                      }
                    />
                    {errors.phone && (
                      <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
                        {errors.phone}
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Email (optional)</label>
                    <input
                      style={inputStyle("email")}
                      placeholder="rahul@brightfuture.in"
                      value={form.email}
                      type="email"
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                      onBlur={(e) => (e.target.style.borderColor = "#e5e2f5")}
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>
                      Exam Focus <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      style={
                        {
                          ...inputStyle("exam"),
                          appearance: "none",
                          cursor: "pointer",
                        } as React.CSSProperties
                      }
                      value={form.exam}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, exam: e.target.value }));
                        setErrors((p) => ({ ...p, exam: "" }));
                      }}
                      onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                      onBlur={(e) =>
                        (e.target.style.borderColor = errors.exam ? "#ef4444" : "#e5e2f5")
                      }
                    >
                      <option value="">Select your primary exam</option>
                      {EXAM_OPTIONS.map((ex) => (
                        <option key={ex} value={ex}>
                          {ex}
                        </option>
                      ))}
                    </select>
                    {errors.exam && (
                      <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
                        {errors.exam}
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={labelStyle}>Preferred Demo Date (optional)</label>
                    <input
                      style={inputStyle("date")}
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                      onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                      onBlur={(e) => (e.target.style.borderColor = "#e5e2f5")}
                    />
                  </div>
                  <button
                    type="submit"
                    style={{
                      width: "100%",
                      padding: "14px",
                      background: submitting ? `${PRIMARY}88` : PRIMARY,
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: submitting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      boxShadow: `0 8px 24px ${PRIMARY}40`,
                      transition: "opacity 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!submitting) e.currentTarget.style.opacity = "0.9";
                    }}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    {submitting ? (
                      <>
                        <div className="submit-spinner" />
                        Submitting…
                      </>
                    ) : (
                      <>
                        <Calendar size={16} /> Schedule My Demo
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    background: "#f0fdf4",
                    border: "2px solid #22c55e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                  }}
                >
                  <Check size={32} color="#22c55e" />
                </div>
                <h3
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 22,
                    color: "#0f0e17",
                    marginBottom: 10,
                  }}
                >
                  We've received your interest!
                </h3>
                <p style={{ fontSize: 14, color: "#6b6a7e", lineHeight: 1.65, marginBottom: 28 }}>
                  Thank you, <strong>{form.name}</strong>! Our team will reach out to{" "}
                  <strong>{form.coaching}</strong> within 24 hours to schedule your personalised
                  demo.
                </p>
                <div
                  style={{
                    background: "#f8f7ff",
                    borderRadius: 12,
                    padding: "16px 20px",
                    marginBottom: 20,
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#8b8aa0",
                      marginBottom: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Your Details
                  </div>
                  {(["name", "coaching", "phone", "exam"] as const)
                    .filter((k) => form[k])
                    .map((k) => (
                      <div
                        key={k}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ color: "#8b8aa0", textTransform: "capitalize" }}>
                          {k === "coaching" ? "Coaching" : k.charAt(0).toUpperCase() + k.slice(1)}
                        </span>
                        <span style={{ color: "#0f0e17", fontWeight: 500 }}>{form[k]}</span>
                      </div>
                    ))}
                </div>
                <button
                  onClick={() => {
                    setStep(1);
                    setForm({ name: "", coaching: "", phone: "", email: "", exam: "", date: "" });
                  }}
                  style={{
                    fontSize: 13,
                    color: PRIMARY,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                    textDecoration: "underline",
                  }}
                >
                  Submit another response
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function Index() {
  return (
    <>
      <SEO
        title="PrepareKaro: AI Test Series Platform for Coaching Institutes | JEE, NEET, CUET & More"
        description="Launch your AI-powered test series platform in minutes. PrepareKaro supports JEE, NEET, CUET, CBSE, State Board and all exam types — objective & subjective. Built for coaching institutes."
        canonical="https://preparekaro.in/"
      />
      <LandingNavbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <ComparisonSection />
      <TestimonialsSection />
      <InterestWidgetSection />
      <LandingFooter />
    </>
  );
}
