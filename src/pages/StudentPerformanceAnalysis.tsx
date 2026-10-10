import { Layers, Target, TrendingUp, Users, ListChecks, BarChart3 } from "lucide-react";
import {
  FeaturePageShell,
  FeaturePageHero,
  FeatureBulletList,
  FeaturePageCTA,
} from "@shared/components/landing/FeaturePageLayout";

const BULLETS = [
  {
    icon: Layers,
    title: "Subject, chapter and topic accuracy",
    desc: "Every test a student takes rolls up into accuracy for each subject, chapter and topic — not just a total score.",
  },
  {
    icon: Target,
    title: "Weak and strong topics, ranked",
    desc: "Weak spots surface on their own, ranked from worst to best, so neither the student nor the teacher has to guess.",
  },
  {
    icon: TrendingUp,
    title: "Readiness score and weekly trend",
    desc: "A single readiness number per student, tracked week over week, with recent tests weighted more than older ones.",
  },
  {
    icon: BarChart3,
    title: "Next steps written for the student",
    desc: "Each report includes a plain-language strategy — what to revise next and why — not just a chart.",
  },
  {
    icon: ListChecks,
    title: "Feeds the next practice paper",
    desc: "Weak topics from this report are exactly what drives the student's next personalised practice paper.",
  },
  {
    icon: Users,
    title: "Batch view for teachers",
    desc: "Teachers see the same subject/chapter/topic breakdown rolled up across a whole batch, to spot patterns fast.",
  },
];

export default function StudentPerformanceAnalysis() {
  return (
    <FeaturePageShell
      seoTitle="Student Performance Analysis by Topic | PrepareKaro"
      seoDescription="PrepareKaro analyses every student by subject, chapter and topic across all their tests, with a readiness score and ranked weak spots — so teachers know exactly who needs help with what."
      canonical="https://preparekaro.in/features/student-performance-analysis"
    >
      <FeaturePageHero
        badge="Student Performance Analysis"
        h1={
          <>
            Find every student's weak topic,{" "}
            <span style={{ color: "#0066FF" }}>not just their score</span>
          </>
        }
        lede="PrepareKaro analyses every test a student takes and breaks their accuracy down by subject, chapter and topic — so weak spots are visible, ranked and backed by a readiness score."
      />
      <section style={{ padding: "0 24px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FeatureBulletList items={BULLETS} />
        </div>
      </section>
      <FeaturePageCTA text="See a real student's readiness score and weak-topic report." />
    </FeaturePageShell>
  );
}
