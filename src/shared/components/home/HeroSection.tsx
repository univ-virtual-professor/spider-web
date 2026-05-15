import { motion } from "framer-motion";
import { ArrowRight, Users, GraduationCap, Search } from "lucide-react";
import { Button } from "@shared/ui/button";

const stats = [
  { value: "25 Lakh+", label: "Students", bgColor: "bg-pastel-mint" },
  { value: "10 Lakh+", label: "App Downloads", bgColor: "bg-pastel-yellow" },
  { value: "1.8 Lakh+", label: "Teaching Hours", bgColor: "bg-pastel-lavender" },
  { value: "24,000+", label: "Learning Courses", bgColor: "bg-pastel-peach" },
];

const categories = [
  "Engineering Courses",
  "MBA Courses",
  "Language Courses",
  "SSC & PSC Courses",
  "Creative Courses",
  "Health & Nursing",
];

export default function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden pb-12 pt-20">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-pastel-cream dark:bg-background" />

      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-6 font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl"
            >
              <span className="gradient-text">Education</span> is the
              <br />
              Key of Success
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-8 max-w-lg text-lg leading-relaxed text-muted-foreground lg:text-xl"
            >
              Launch your AI-powered coaching website in just 6 hours. Advanced CBT practice
              platform for students. One platform, endless possibilities.
            </motion.p>

            {/* Search Bar Style CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative mb-8"
            >
              <div className="flex max-w-lg items-center gap-2 rounded-2xl border border-border/30 bg-card p-2 shadow-card">
                <div className="flex flex-1 items-center gap-3 px-4">
                  <Search className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Search Your Courses</span>
                </div>
                <Button variant="gradient" className="rounded-xl px-6">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            </motion.div>

            {/* Category Pills */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mb-10 flex flex-wrap gap-2"
            >
              {categories.map((category, index) => (
                <span
                  key={category}
                  className="cursor-pointer rounded-full border border-border/30 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50"
                >
                  {category}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Content - Hero Image/Illustration */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="relative"
          >
            {/* Main Hero Visual */}
            <div className="relative overflow-hidden rounded-[2rem] bg-pastel-mint p-6 dark:bg-surface lg:p-8">
              {/* Decorative elements */}
              <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-pastel-yellow dark:bg-pastel-yellow/30" />
              <div className="absolute bottom-8 left-8 h-12 w-12 rounded-full bg-pastel-lavender dark:bg-pastel-lavender/30" />

              {/* Hero Content */}
              <div className="relative z-10 py-8 text-center">
                <div className="gradient-bg mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full">
                  <GraduationCap className="h-12 w-12 text-white" />
                </div>
                <h3 className="mb-3 font-display text-xl font-bold">Your Coaching, Your Brand</h3>
                <p className="mx-auto mb-6 max-w-xs text-sm text-muted-foreground">
                  AI-generated professional websites for coaching institutes
                </p>

                {/* Mini Dashboard Preview */}
                <div className="mx-auto max-w-sm rounded-2xl border border-border/30 bg-card p-4 shadow-card">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="gradient-bg flex h-10 w-10 items-center justify-center rounded-full">
                      <span className="text-sm font-bold text-white">EA</span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold">Elite Academy</p>
                      <p className="text-xs text-muted-foreground">yourcoaching.preparekaro.in</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-pastel-mint p-2 text-center dark:bg-secondary">
                      <p className="gradient-text text-sm font-bold">1,247</p>
                      <p className="text-xs text-muted-foreground">Students</p>
                    </div>
                    <div className="rounded-xl bg-pastel-yellow p-2 text-center dark:bg-secondary">
                      <p className="gradient-text text-sm font-bold">156</p>
                      <p className="text-xs text-muted-foreground">Tests</p>
                    </div>
                    <div className="rounded-xl bg-pastel-lavender p-2 text-center dark:bg-secondary">
                      <p className="gradient-text text-sm font-bold">₹4.2L</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="absolute -left-4 top-1/4 animate-float rounded-2xl border border-border/30 bg-card p-4 shadow-card-hover"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pastel-mint dark:bg-secondary">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">50+</p>
                  <p className="text-xs text-muted-foreground">Institutes</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 lg:mt-24"
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:gap-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
                className={`${stat.bgColor} rounded-2xl p-6 text-center dark:bg-secondary lg:rounded-3xl`}
              >
                <p className="mb-1 font-display text-2xl font-bold text-foreground lg:text-3xl">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
