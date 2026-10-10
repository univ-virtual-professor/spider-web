import {
  ListChecks,
  SlidersHorizontal,
  Database,
  CalendarClock,
  FileCheck2,
  Layers3,
} from "lucide-react";
import {
  FeaturePageShell,
  FeaturePageHero,
  FeatureBulletList,
  FeaturePageCTA,
} from "@shared/components/landing/FeaturePageLayout";
import { Tight } from "@shared/components/landing/LandingPrimitives";

const BULLETS = [
  {
    icon: ListChecks,
    title: "Choose chapters and topics",
    desc: "Pick a subject, then the chapters and topics you want covered — the test is scoped to exactly what you choose.",
  },
  {
    icon: SlidersHorizontal,
    title: "Set difficulty and length",
    desc: "Control the difficulty mix and question count, and the paper is assembled to match.",
  },
  {
    icon: Database,
    title: "Fills from your bank first, then ours",
    desc: "Questions are pulled from your own question bank first; any gap is filled from PrepareKaro's bank so the test is never short.",
  },
  {
    icon: Layers3,
    title: "Objective and subjective papers",
    desc: "Build either type of paper the same way — by chapters and topics, not by hand-picking individual questions.",
  },
  {
    icon: FileCheck2,
    title: "Fill a whole test or just the gaps",
    desc: "Use it to generate an entire paper, or to fill the remaining slots in a test you've already started building manually.",
  },
  {
    icon: CalendarClock,
    title: "Scheduled daily practice papers",
    desc: "Set up a topic rotation and a schedule once, and DPPs are generated and published to your batches automatically.",
  },
];

export default function TestGenerator() {
  return (
    <FeaturePageShell
      seoTitle="Test Generator: Build Tests from Chapters & Topics | PrepareKaro"
      seoDescription="Generate objective or subjective tests by choosing subject, chapters and topics — PrepareKaro fills the paper from your question bank first, then its own, and can schedule daily practice papers automatically."
      canonical="https://preparekaro.in/features/test-generator"
    >
      <FeaturePageHero
        badge="Test Generator"
        h1={
          <>
            Build a test by choosing chapters
            <Tight mark="," />{" "}
            <span style={{ color: "#0066FF" }}>not by hand-picking questions</span>
          </>
        }
        lede="Pick a subject, the chapters and topics you want covered, the difficulty and the length — PrepareKaro fills the paper from your question bank first, then ours. Schedule the same thing as daily practice papers."
      />
      <section style={{ padding: "0 24px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FeatureBulletList items={BULLETS} />
        </div>
      </section>
      <FeaturePageCTA text="See a test generated from chosen chapters, in front of you." />
    </FeaturePageShell>
  );
}
