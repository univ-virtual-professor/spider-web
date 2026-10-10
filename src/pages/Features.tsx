import { Link } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Layers,
  FileText,
  ListChecks,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  Monitor,
  Smartphone,
  Globe,
  Users,
  Trophy,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import LandingLayout from "@widgets/layout/LandingLayout";
import SEO from "@shared/components/SEO";
import {
  NAVY,
  ACCENT_500,
  ACCENT_50,
  Reveal,
  SectionHeading,
  Tight,
} from "@shared/components/landing/LandingPrimitives";

// Each card owns its own search intent and links to its dedicated feature page — see
// design.md's "one page per search" note and the four /features/* pages this hub links to.
type FeatureCardDef = { icon: LucideIcon; title: string; desc: string; href?: string };

const CORE_TOOLS: FeatureCardDef[] = [
  {
    icon: Camera,
    title: "AI Answer Sheet Evaluation",
    desc: "Scan handwritten copies and AI grades every answer step by step against your own rubric, with faculty review before release.",
    href: "/features/ai-answer-sheet-evaluation",
  },
  {
    icon: Layers,
    title: "Student Performance Analysis",
    desc: "Accuracy for every student, broken down by subject, chapter and topic, with a readiness score that pinpoints exactly where they're weak.",
    href: "/features/student-performance-analysis",
  },
  {
    icon: FileText,
    title: "Personalised Practice Papers",
    desc: "A practice paper generated from each student's own weak and strong topics — automatically, or the student picks the topics themselves.",
    href: "/features/personalised-practice-papers",
  },
  {
    icon: ListChecks,
    title: "Test Generator",
    desc: "Build a test by choosing subject, chapters and topics; the paper fills itself from your question bank, then ours. Schedule DPPs the same way.",
    href: "/features/test-generator",
  },
];

const ACADEMICS_TOOLS: FeatureCardDef[] = [
  {
    icon: BookOpen,
    title: "Curriculum",
    desc: "Modules and lessons per course, linked to notes, books and tests.",
  },
  {
    icon: CalendarClock,
    title: "Timetable",
    desc: "Weekly classes per batch with the teacher, subject and mode.",
  },
  {
    icon: ClipboardCheck,
    title: "Attendance",
    desc: "Marked per class from the timetable, with correction requests.",
  },
  {
    icon: Trophy,
    title: "Grades",
    desc: "Test scores and manual grades together on each student's record.",
  },
];

const TEST_PLATFORM_TOOLS: FeatureCardDef[] = [
  {
    icon: Monitor,
    title: "Proctored Desktop Exams",
    desc: "A locked-down desktop app for high-stakes exams, with face and phone detection.",
  },
  {
    icon: CalendarDays,
    title: "Scheduled DPPs",
    desc: "Daily practice papers generated and published to batches automatically, on a schedule.",
  },
  {
    icon: Trophy,
    title: "Rankings",
    desc: "Leaderboards by test and by batch to keep students motivated.",
  },
  {
    icon: Users,
    title: "Roles & Permissions",
    desc: "Every staff member sees only what their role and branch scope allows.",
  },
];

const EVERYWHERE_TOOLS: FeatureCardDef[] = [
  {
    icon: Globe,
    title: "White-Label Institute Website",
    desc: "Your institute's own branded site from ready themes — no developer needed.",
  },
  {
    icon: Smartphone,
    title: "Mobile App",
    desc: "Tests, reports, attendance and notifications on Android and iOS.",
  },
];

function FeatureCard({ feature }: { feature: FeatureCardDef }) {
  const body = (
    <>
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: ACCENT_50,
          color: ACCENT_500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <feature.icon size={20} />
      </span>
      <h3
        style={{
          marginTop: 16,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 18,
          fontWeight: 700,
          color: NAVY,
        }}
      >
        {feature.title}
      </h3>
      <p style={{ marginTop: 8, fontSize: 14.5, color: `${NAVY}8c`, lineHeight: 1.6 }}>
        {feature.desc}
      </p>
      {feature.href && (
        <span
          style={{
            marginTop: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13.5,
            fontWeight: 700,
            color: ACCENT_500,
          }}
        >
          Learn more <ArrowRight size={13} />
        </span>
      )}
    </>
  );
  const style: React.CSSProperties = {
    display: "block",
    background: "#fff",
    border: `1px solid ${NAVY}0d`,
    borderRadius: 20,
    padding: 24,
    height: "100%",
    boxSizing: "border-box",
    textDecoration: "none",
  };
  return feature.href ? (
    <Link to={feature.href} className="hover-lift-card" style={style}>
      {body}
    </Link>
  ) : (
    <div className="hover-lift-card" style={style}>
      {body}
    </div>
  );
}

function FeatureGrid({ features }: { features: FeatureCardDef[] }) {
  return (
    <div
      className="tools-grid"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 36 }}
    >
      {features.map((f, i) => (
        <Reveal key={f.title} delay={i * 50}>
          <FeatureCard feature={f} />
        </Reveal>
      ))}
    </div>
  );
}

export default function Features() {
  return (
    <LandingLayout>
      <SEO
        title="All PrepareKaro Features | Full Coaching Institute Platform"
        description="Every PrepareKaro feature in one place: AI answer-sheet evaluation, per-topic student analysis, personalised practice papers, a test generator, plus curriculum, attendance, timetable, proctored exams, rankings and a branded mobile app."
        canonical="https://preparekaro.in/features"
      />
      <section style={{ padding: "64px 24px 0", background: "#fff" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <Reveal style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h1
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(32px, 4vw, 48px)",
                color: NAVY,
                letterSpacing: "-0.5px",
                lineHeight: 1.15,
              }}
            >
              Everything your institute needs
              <Tight mark="," /> <span style={{ color: ACCENT_500 }}>in one platform</span>
            </h1>
            <p style={{ fontSize: 17, color: `${NAVY}8c`, marginTop: 18, lineHeight: 1.7 }}>
              PrepareKaro isn't just AI answer-sheet checking — it's a full test and academics
              platform, from evaluating a scanned copy to running your institute's classes every
              day.
            </p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: "48px 24px 80px", background: "#fff" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <SectionHeading
            badge="The Four Core Tools"
            title="From a scanned test to the next personalised paper"
            description="These four tools feed each other automatically — evaluation results flow into topic analysis, which drives personalised practice."
          />
          <FeatureGrid features={CORE_TOOLS} />
        </div>
      </section>

      <section style={{ padding: "80px 24px", background: "#F8FAFC" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <SectionHeading badge="Test Platform" title="Exams, results and practice at scale" />
          <FeatureGrid features={TEST_PLATFORM_TOOLS} />
        </div>
      </section>

      <section style={{ padding: "80px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <SectionHeading badge="Academics" title="Run your classes, not just your exams" />
          <FeatureGrid features={ACADEMICS_TOOLS} />
        </div>
      </section>

      <section style={{ padding: "80px 24px 96px", background: "#F8FAFC" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <SectionHeading badge="Everywhere" title="Your institute's own brand, on every screen" />
          <div
            className="tools-grid"
            style={{
              marginTop: 36,
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 18,
              maxWidth: 820,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {EVERYWHERE_TOOLS.map((f, i) => (
              <Reveal key={f.title} delay={i * 50}>
                <FeatureCard feature={f} />
              </Reveal>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 48 }}>
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
      </section>
    </LandingLayout>
  );
}
