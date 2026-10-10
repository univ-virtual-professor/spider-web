import { Camera, Copy, Flag, Star, Eye, CalendarDays } from "lucide-react";
import {
  FeaturePageShell,
  FeaturePageHero,
  FeatureBulletList,
  FeaturePageCTA,
} from "@shared/components/landing/FeaturePageLayout";
import { Tight } from "@shared/components/landing/LandingPrimitives";

const BULLETS = [
  {
    icon: Camera,
    title: "Scan at scale",
    desc: "Snap photos or upload PDFs of handwritten answer sheets in bulk, page by page or all at once, straight from a phone.",
  },
  {
    icon: Star,
    title: "Rubric-based grading",
    desc: "Every answer is scored step by step against your own answer key and marking scheme — objective and subjective questions alike.",
  },
  {
    icon: Copy,
    title: "Duplicate copy detection",
    desc: "Flags copies submitted more than once before grading begins, so duplicates never get double-counted.",
  },
  {
    icon: Flag,
    title: "Plagiarism detection",
    desc: "Cross-checks answers across the batch to surface copied or matching responses for review.",
  },
  {
    icon: Eye,
    title: "Faculty review and override",
    desc: "AI grading is a first pass, not a final word. Teachers can review, adjust and approve every result before it's released.",
  },
  {
    icon: CalendarDays,
    title: "Results in 72 hours",
    desc: "A guaranteed turnaround from scanned copy to published, student-facing result — even at scale.",
  },
];

export default function AiAnswerSheetEvaluation() {
  return (
    <FeaturePageShell
      seoTitle="AI Answer Sheet Evaluation for Coaching Institutes | PrepareKaro"
      seoDescription="PrepareKaro's AI evaluates handwritten answer sheets step by step against your own rubric, with duplicate and plagiarism detection, faculty review, and results published within 72 hours."
      canonical="https://preparekaro.in/features/ai-answer-sheet-evaluation"
    >
      <FeaturePageHero
        badge="AI Answer Sheet Evaluation"
        h1={
          <>
            AI-graded answer sheets
            <Tight mark="," /> <span style={{ color: "#0066FF" }}>reviewed by your faculty</span>
          </>
        }
        lede="Scan handwritten copies and let AI mark every answer against your own answer key and rubric — with duplicate and plagiarism checks, and faculty always in control before a result goes out."
      />
      <section style={{ padding: "0 24px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FeatureBulletList items={BULLETS} />
        </div>
      </section>
      <FeaturePageCTA text="See AI evaluation working on your own answer sheets." />
    </FeaturePageShell>
  );
}
