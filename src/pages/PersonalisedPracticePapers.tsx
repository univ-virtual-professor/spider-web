import { FileText, Shuffle, ShieldCheck, Sliders, RefreshCw, LineChart } from "lucide-react";
import {
  FeaturePageShell,
  FeaturePageHero,
  FeatureBulletList,
  FeaturePageCTA,
} from "@shared/components/landing/FeaturePageLayout";

const BULLETS = [
  {
    icon: FileText,
    title: "Built from their own weak spots",
    desc: "The paper is generated from that student's own weak and strong topics, pulled straight from their performance report.",
  },
  {
    icon: Sliders,
    title: "More questions where they struggle",
    desc: "Weak topics get more questions and an easier start; strong topics get fewer, harder ones to keep the student sharp.",
  },
  {
    icon: Shuffle,
    title: "Automatic, or student-picked topics",
    desc: "Generate a paper automatically from weak areas, or let the student choose specific topics and a question count themselves.",
  },
  {
    icon: RefreshCw,
    title: "No repeats from recent tests",
    desc: "Questions the student has already seen in recent tests are excluded, so practice stays fresh.",
  },
  {
    icon: ShieldCheck,
    title: "Sampled from a real question pool",
    desc: "No generic AI-written questions — every question comes from a curated question bank mapped to board/exam syllabi.",
  },
  {
    icon: LineChart,
    title: "Results flow back into their report",
    desc: "Every attempt at a personalised paper updates the same subject/chapter/topic report it was generated from.",
  },
];

export default function PersonalisedPracticePapers() {
  return (
    <FeaturePageShell
      seoTitle="Personalised Practice Papers for Each Student | PrepareKaro"
      seoDescription="PrepareKaro generates a personalised practice paper for each student from their own weak and strong topics — automatically or student-picked, with nothing repeated from recent tests."
      canonical="https://preparekaro.in/features/personalised-practice-papers"
    >
      <FeaturePageHero
        badge="Personalised Practice Papers"
        h1={
          <>
            A practice paper built from{" "}
            <span style={{ color: "#0066FF" }}>each student's own weak spots</span>
          </>
        }
        lede="No more one worksheet for the whole batch. PrepareKaro generates a practice paper for each student from their own weaknesses and strengths, so every minute of practice closes a real gap."
      />
      <section style={{ padding: "0 24px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FeatureBulletList items={BULLETS} />
        </div>
      </section>
      <FeaturePageCTA text="See a personalised paper generated for a real student's weak topics." />
    </FeaturePageShell>
  );
}
