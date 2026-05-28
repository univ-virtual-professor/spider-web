import { motion } from "framer-motion";
import LandingLayout from "@widgets/layout/LandingLayout";
import SEO from "@shared/components/SEO";
import { UserPlus, Palette, Wand2, Clock, Rocket, Settings, ArrowRight } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

type Step = { icon: LucideIcon; title: string; description: string; duration: string };

const steps: Step[] = [
  {
    icon: UserPlus,
    title: "Create Your Account",
    description:
      "Sign up in under 2 minutes with your basic details. Choose your role as an educator or institution.",
    duration: "2 min",
  },
  {
    icon: Settings,
    title: "Complete Onboarding",
    description:
      "Fill in your coaching details, upload your logo, add courses, and set up your batches.",
    duration: "15 min",
  },
  {
    icon: Palette,
    title: "Choose Your Theme",
    description:
      "Select from beautifully designed templates. Customize colors to match your brand identity.",
    duration: "5 min",
  },
  {
    icon: Wand2,
    title: "AI Website Generation",
    description:
      "Our AI analyzes your inputs and generates a fully functional, SEO-optimized website.",
    duration: "~6 hours",
  },
  {
    icon: Clock,
    title: "Review & Customize",
    description:
      "Preview your generated website. Make final tweaks to content, images, and layout.",
    duration: "30 min",
  },
  {
    icon: Rocket,
    title: "Go Live!",
    description:
      "Publish your website on your branded subdomain. Start enrolling students immediately.",
    duration: "Instant",
  },
];

export default function HowItWorks() {
  return (
    <LandingLayout>
      <SEO
        title="How It Works — Launch Any Test Series in Minutes | PrepareKaro"
        description="See how PrepareKaro works: set up your coaching portal, create test series for JEE, NEET, CUET, CBSE and more, and track student performance — all in minutes with AI."
        canonical="https://preparekaro.in/how-it-works"
      />
      <div className="pb-20">
        {/* Hero */}
        <section className="container mx-auto px-4 py-16 text-center lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="mb-4 inline-block rounded-full bg-brand-start/10 px-4 py-1.5 text-sm font-medium text-brand-blue">
              How It Works
            </span>
            <h1 className="mb-6 font-display text-4xl font-bold sm:text-5xl lg:text-6xl">
              From Zero to <span className="gradient-text">Live Website</span>
              <br />
              in Just 6 Hours
            </h1>
            <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
              A simple, guided process to transform your coaching institute with AI-powered
              technology.
            </p>
          </motion.div>
        </section>

        {/* Timeline */}
        <section className="container mx-auto px-4 py-16 lg:px-8">
          <div className="mx-auto max-w-4xl">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative pb-12 pl-12 last:pb-0 lg:pl-16"
              >
                {index < steps.length - 1 && (
                  <div className="absolute bottom-0 left-[18px] top-12 w-0.5 bg-gradient-to-b from-brand-start to-brand-end lg:left-[22px]" />
                )}
                <div className="gradient-bg absolute left-0 flex h-10 w-10 items-center justify-center rounded-xl shadow-glow lg:h-12 lg:w-12">
                  <step.icon className="h-5 w-5 text-white lg:h-6 lg:w-6" />
                </div>
                <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-card transition-all hover:shadow-card-hover lg:p-8">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">{step.title}</h3>
                    <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground">
                      {step.duration}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="mb-6 font-display text-3xl font-bold">Ready to Get Started?</h2>
            <Button variant="hero" size="xl" asChild className="group">
              <Link to="/signup">
                Create Your Website Now
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </motion.div>
        </section>
      </div>
    </LandingLayout>
  );
}
