// src/themes/coaching/theme2/TenantHome.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  Menu,
  X,
  Star,
  Phone,
  MapPin,
  Mail,
  Sparkles,
  Clock,
  Brain,
  BarChart3,
  Users,
  Target,
  BookOpen,
  UserPlus,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";

import { useTenant } from "@app/providers/TenantProvider";
import { useFavicon } from "@shared/hooks/useFavicon";

import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";

import { initials } from "@/themes/coaching/shared/themeUtils";
import type { StatItem, TestimonialItem, FAQItem } from "@/themes/coaching/shared/themeTypes";

export default function TenantHomeTheme2() {
  const { tenant, loading } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const config = tenant?.websiteConfig || {};
  const coachingName = config.coachingName || (tenant as any)?.coachingName || "Your Institute";
  const tagline = config.tagline || (tenant as any)?.tagline || "Learn smarter. Score higher.";
  const heroImage: string | undefined = config.heroImage;
  const logoUrl: string | undefined = config.logoUrl;

  useFavicon(logoUrl, coachingName);

  const stats: StatItem[] = Array.isArray(config.stats) ? config.stats : [];
  const testimonials: TestimonialItem[] = Array.isArray(config.testimonials)
    ? config.testimonials
    : [];
  const faqs: FAQItem[] =
    Array.isArray(config.faqs) && config.faqs.length > 0
      ? config.faqs
      : [
          {
            question: "How do I access the test series after purchase?",
            answer:
              "Once you purchase (or enroll if free), the test series appears in your student dashboard under 'My Tests'.",
          },
          {
            question: "Can I access content on mobile?",
            answer:
              "Yes. The platform is mobile-responsive and works smoothly on phones and tablets.",
          },
          {
            question: "Do you provide performance analytics?",
            answer: "Yes. Students get score insights and progress tracking inside the dashboard.",
          },
          {
            question: "Is there any demo / preview available?",
            answer:
              "Many educators provide free tests or previews. Check the Featured section or login to see what's included.",
          },
        ];

  const defaultTestimonials: TestimonialItem[] = useMemo(
    () => [
      {
        name: "Jason",
        text: "I've taken dozens of courses, but this is the only one that made improvement feel doable.",
        rating: 5,
        course: "Mock Test Package",
      },
      {
        name: "Laolu",
        text: "So clear and structured. I finally understood where to start and felt confident.",
        rating: 5,
        course: "Subject Test Series",
      },
      {
        name: "Danielle",
        text: "No fluff, just step-by-step guidance. This removed every excuse I had for waiting.",
        rating: 5,
        course: "Full Analytics Plan",
      },
    ],
    []
  );

  const displayTestimonials = (testimonials.length ? testimonials : defaultTestimonials).slice(
    0,
    3
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] text-zinc-500">
        <Loader2 className="mr-3 h-6 w-6 animate-spin" />
        <span className="font-medium">Loading your experience...</span>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB]">
        <div className="px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Coaching not found</h2>
          <p className="mt-3 text-lg text-zinc-500">
            This coaching website does not exist. Check the URL or contact support.
          </p>
        </div>
      </div>
    );
  }

  const navLinks = [
    { label: "Home", href: "#top" },
    { label: "Features", href: "#features" },
    { label: "Reviews", href: "#reviews" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#contact" },
  ];

  const howItWorksSteps = [
    {
      step: "01",
      icon: UserPlus,
      title: "Create Your Account",
      desc: "Sign up in seconds. No paperwork, no hassle — just pick your exam and get started.",
    },
    {
      step: "02",
      icon: BookOpen,
      title: "Take Practice Tests",
      desc: "Attempt full-length mock tests that mirror the real exam pattern, timing, and interface.",
    },
    {
      step: "03",
      icon: TrendingUp,
      title: "Track & Improve",
      desc: "Deep analytics highlight your weak zones so every revision session is laser-focused.",
    },
  ];

  return (
    <div
      id="top"
      className="min-h-screen overflow-x-hidden bg-[#FAFAFA] text-zinc-900 selection:bg-indigo-100 selection:text-indigo-900"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-zinc-200/50 bg-[#FAFAFA]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
            {logoUrl ? (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 sm:h-10 sm:w-10">
                <img
                  src={logoUrl}
                  alt={`${coachingName} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-sm sm:h-10 sm:w-10">
                <span className="text-base font-bold">
                  {coachingName?.trim()?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
            )}
            <span className="hidden max-w-[11rem] truncate text-base font-bold tracking-tight text-zinc-950 sm:max-w-[20rem] sm:text-xl lg:block">
              {coachingName}
            </span>
          </Link>

          <div className="hidden items-center gap-6 md:flex lg:gap-8">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm font-semibold text-zinc-600 transition-colors hover:text-zinc-950"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login?role=student">
              <Button
                variant="ghost"
                className="hidden rounded-full px-6 font-semibold hover:bg-zinc-100 md:inline-flex"
              >
                Log in
              </Button>
            </Link>
            <Link to="/signup">
              <Button className="hidden rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 sm:px-7 sm:py-2.5 sm:text-base md:inline-flex">
                Sign Up
              </Button>
            </Link>

            <button
              className="p-2 text-zinc-600 md:hidden"
              onClick={() => setMobileOpen((s) => !s)}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="absolute left-0 top-16 max-h-[calc(100vh-4rem)] w-full overflow-y-auto border-b border-zinc-200 bg-white p-4 shadow-xl sm:top-20 sm:max-h-[calc(100vh-5rem)] md:hidden">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-4 py-3 text-base font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-4 flex flex-col gap-2 px-2">
              <Link to="/login?role=student" onClick={() => setMobileOpen(false)}>
                <Button
                  variant="outline"
                  className="w-full rounded-full border-zinc-200 font-semibold"
                >
                  Log in
                </Button>
              </Link>
              <Link to="/signup">
                <Button className="w-full rounded-full bg-zinc-950 font-semibold text-white shadow-sm hover:bg-zinc-800">
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO SECTION */}
      <section
        className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20 lg:pb-32 lg:pt-32"
        style={{
          backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          backgroundColor: "#FAFAFA",
        }}
      >
        {/* gradient fade overlay so dots don't overwhelm */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FAFAFA]/60 via-transparent to-[#FAFAFA]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-4 lg:px-8">
          <div className="grid items-center gap-10 sm:gap-12 md:justify-center lg:grid-cols-2 lg:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="max-w-2xl"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 shadow-sm sm:mb-8">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                  {tagline}
                </span>
              </div>

              <h1 className="mb-6 text-3xl font-extrabold leading-[1.05] tracking-tighter text-zinc-950 sm:text-5xl lg:text-[64px]">
                Ace Your Exams
                <br />
                <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">
                  with {coachingName}
                </span>
              </h1>

              <p className="mb-8 max-w-lg text-base leading-relaxed text-zinc-500 sm:text-lg">
                Practice with real exam–pattern tests, get AI-powered insights on your weak areas,
                and hit your target score — all in one place.
              </p>

              <div className="mb-10 flex flex-col gap-3 sm:flex-row">
                <a href="/signup" className="w-full sm:w-auto">
                  <Button className="w-full rounded-full bg-zinc-950 px-8 py-6 text-base font-semibold text-white shadow-xl shadow-zinc-900/10 hover:bg-zinc-800 sm:w-auto">
                    Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
                <a href="#features" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="w-full rounded-full border-zinc-200 px-8 py-6 text-base font-semibold hover:bg-zinc-50 sm:w-auto"
                  >
                    See How It Works
                  </Button>
                </a>
              </div>

              {stats?.length > 0 && (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-orange-400 text-orange-400 sm:h-5 sm:w-5"
                      />
                    ))}
                  </div>
                  {stats.slice(0, 2).map((s, idx) => (
                    <div key={idx} className="text-sm font-medium text-zinc-600">
                      <span className="font-bold text-zinc-950">{s.value}</span> {s.label}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
              className="relative w-full max-w-xl lg:ml-auto"
            >
              {/* Decorative glow */}
              <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-indigo-100 to-violet-100 opacity-60 blur-2xl" />
              <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-100 shadow-2xl shadow-zinc-900/10">
                <img
                  src={heroImage || "/educator-default.png"}
                  alt={coachingName}
                  className="h-full w-full object-cover"
                />
              </div>
              {/* Floating badge */}
              <div className="absolute -bottom-4 -left-4 flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 shadow-lg sm:-bottom-5 sm:-left-5">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-bold text-zinc-800">AI-Powered Analytics</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* STATS STRIP (conditional) */}
      {stats.length > 0 && (
        <div className="border-y border-zinc-100 bg-white py-5">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
              {stats.map((s, idx) => (
                <div key={idx} className="flex flex-col items-center gap-0.5 text-center">
                  <span className="text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
                    {s.value}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FEATURES SECTION */}
      <section id="features" className="border-y border-zinc-100 bg-white py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <div className="mb-6 inline-flex items-center justify-center rounded-full bg-indigo-50 px-4 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                Why Choose Us
              </span>
            </div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
              Everything you need to{" "}
              <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">
                dominate your exams
              </span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Target,
                title: "Real Exam–Like Experience",
                desc: "Feels exactly like the actual exam — authentic interface, timer, and navigation. Get comfortable before the real deal.",
                color: "from-indigo-500 to-violet-500",
                bg: "bg-indigo-50",
                text: "text-indigo-600",
              },
              {
                icon: Brain,
                title: "AI-Powered Analytics",
                desc: "Question-wise accuracy, time per section, and clear identification of strengths and weak areas — all automated.",
                color: "from-violet-500 to-purple-500",
                bg: "bg-violet-50",
                text: "text-violet-600",
              },
              {
                icon: Clock,
                title: "Time & Accuracy Insights",
                desc: "Understand exactly where you lose time and make costly mistakes. Optimize your test strategy with data.",
                color: "from-purple-500 to-pink-500",
                bg: "bg-purple-50",
                text: "text-purple-600",
              },
            ].map((f, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="group relative overflow-hidden rounded-[2rem] border border-zinc-100 bg-[#FAFAFA] p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8"
              >
                {/* top gradient accent */}
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${f.color}`} />
                <div
                  className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${f.bg} ${f.text}`}
                >
                  <f.icon className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-zinc-950">{f.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-500 sm:text-base">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-gradient-to-b from-zinc-50 to-white py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <div className="mb-6 inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                How It Works
              </span>
            </div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
              Three steps to your best score
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {howItWorksSteps.map((step, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="group relative flex flex-col gap-5 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md sm:p-8"
              >
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-black tracking-tighter text-zinc-100 sm:text-5xl">
                    {step.step}
                  </span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                    <step.icon className="h-6 w-6" />
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-bold text-zinc-950">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-500 sm:text-base">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT WE STAND FOR */}
      <section className="bg-white py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="mb-6 inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                  Our Values
                </span>
              </div>
              <h2 className="mb-6 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
                What we stand for
              </h2>
              <p className="mb-8 max-w-md text-lg leading-relaxed text-zinc-500">
                We believe in transforming raw potential into undeniable results through systematic
                preparation and unwavering support.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  title: "Proven Results",
                  desc: "Track record that speaks for itself",
                  icon: BarChart3,
                },
                {
                  title: "Expert Faculty",
                  desc: "Guidance from subject matter experts",
                  icon: Users,
                },
                {
                  title: "Personalised Learning",
                  desc: "Tailored paths for every student",
                  icon: Target,
                },
                {
                  title: "1:1 Doubt Support",
                  desc: "Never get stuck on a concept again",
                  icon: BookOpen,
                },
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: idx * 0.08 }}
                  className="group flex flex-col gap-4 rounded-3xl border border-zinc-100 bg-[#FAFAFA] p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-indigo-100 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="mb-1 font-bold text-zinc-950">{item.title}</h4>
                    <p className="text-sm text-zinc-500">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="reviews" className="bg-[#FAFAFA] py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <div className="mb-6 inline-flex items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                Student Stories
              </span>
            </div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
              Proof that it works
            </h2>
          </div>

          {/* Featured testimonial + two smaller */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Featured */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative flex flex-col rounded-[2rem] bg-gradient-to-br from-indigo-600 to-violet-600 p-7 text-white shadow-xl shadow-indigo-900/20 sm:p-10 lg:col-span-1"
            >
              <Sparkles className="absolute right-8 top-8 h-6 w-6 text-white/30" />
              <div className="mb-6 flex gap-1">
                {Array.from({ length: displayTestimonials[0]?.rating || 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-orange-300 text-orange-300" />
                ))}
              </div>
              <p className="mb-8 flex-1 text-lg font-medium leading-relaxed text-white/90">
                "{displayTestimonials[0]?.text}"
              </p>
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 border-2 border-white/30">
                  <AvatarImage src={displayTestimonials[0]?.avatar} className="object-cover" />
                  <AvatarFallback className="bg-white/20 font-bold text-white">
                    {initials(displayTestimonials[0]?.name || "S")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-white">{displayTestimonials[0]?.name}</p>
                  {displayTestimonials[0]?.course && (
                    <p className="text-xs font-medium text-white/60">
                      {displayTestimonials[0].course}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Two smaller */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              {displayTestimonials.slice(1, 3).map((t, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: (idx + 1) * 0.1 }}
                  className="flex flex-col rounded-[2rem] border border-zinc-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-8"
                >
                  <div className="mb-4 flex gap-1">
                    {Array.from({ length: Math.max(1, Math.min(5, t.rating || 5)) }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-orange-400 text-orange-400" />
                    ))}
                  </div>
                  <p className="mb-6 flex-1 text-base leading-relaxed text-zinc-600">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-zinc-200">
                      <AvatarImage src={t.avatar} className="object-cover" />
                      <AvatarFallback className="bg-zinc-100 font-bold text-zinc-600">
                        {initials(t.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-bold text-zinc-950">{t.name}</p>
                      {t.course && <p className="text-xs font-medium text-zinc-400">{t.course}</p>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="border-y border-zinc-100 bg-white py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center sm:mb-16">
            <div className="mb-6 inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                FAQ
              </span>
            </div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
              Questions? Answered.
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {faqs.map((faq, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.06 }}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-[#FAFAFA]"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="text-base font-semibold text-zinc-900">{faq.question}</span>
                  {openFaq === idx ? (
                    <ChevronUp className="h-5 w-5 flex-shrink-0 text-indigo-600" />
                  ) : (
                    <ChevronDown className="h-5 w-5 flex-shrink-0 text-zinc-400" />
                  )}
                </button>
                {openFaq === idx && (
                  <div className="border-t border-zinc-200 px-6 pb-5 pt-4">
                    <p className="text-sm leading-relaxed text-zinc-500 sm:text-base">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT SECTION */}
      <section id="contact" className="bg-[#FAFAFA] py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="mb-6 inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                  Get In Touch
                </span>
              </div>
              <h2 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl">
                Let's Talk.
              </h2>
              <p className="mb-10 max-w-md text-lg text-zinc-500">
                Have questions about the test series or need guidance on your preparation? Reach out
                — we're here to help.
              </p>
            </div>

            <div className="rounded-[2.5rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
              <h3 className="mb-6 text-xl font-bold text-zinc-950">Contact Information</h3>
              <div className="flex flex-col gap-4">
                {tenant.contact?.phone ? (
                  <a
                    href={`tel:${tenant.contact.phone}`}
                    className="group flex items-center gap-4 rounded-2xl border border-zinc-100 bg-[#FAFAFA] px-5 py-4 transition-all hover:border-indigo-100 hover:bg-indigo-50"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Phone
                      </p>
                      <p className="font-semibold text-zinc-800">{tenant.contact.phone}</p>
                    </div>
                  </a>
                ) : null}

                {tenant.contact?.email ? (
                  <a
                    href={`mailto:${tenant.contact.email}`}
                    className="group flex items-center gap-4 rounded-2xl border border-zinc-100 bg-[#FAFAFA] px-5 py-4 transition-all hover:border-indigo-100 hover:bg-indigo-50"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Email
                      </p>
                      <p className="font-semibold text-zinc-800">{tenant.contact.email}</p>
                    </div>
                  </a>
                ) : null}

                {tenant.contact?.address ? (
                  <div className="flex items-start gap-4 rounded-2xl border border-zinc-100 bg-[#FAFAFA] px-5 py-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Address
                      </p>
                      <p className="font-semibold text-zinc-800">{tenant.contact.address}</p>
                    </div>
                  </div>
                ) : null}

                {!tenant.contact?.phone && !tenant.contact?.email && !tenant.contact?.address && (
                  <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-zinc-200 px-6 py-8 text-center">
                    <p className="text-sm font-medium text-zinc-400">
                      Contact details will appear here once configured in settings.
                    </p>
                    <p className="text-xs text-zinc-300">
                      Go to Educator Settings → Website → Contact Info
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="bg-white py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-7 text-center shadow-[0_20px_50px_rgb(99,102,241,0.25)] sm:rounded-[2.5rem] sm:p-12 lg:p-20">
            {/* Decorative orbs */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <Sparkles className="absolute right-10 top-8 h-8 w-8 text-white/30" />
            <Sparkles className="absolute bottom-10 left-8 h-6 w-6 text-white/20" />

            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5" /> Start Today — It's Free
              </div>

              <h2 className="mb-4 max-w-3xl text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl">
                Ready to Begin Your Journey?
              </h2>
              <p className="mb-10 max-w-xl text-lg text-white/70">
                Join thousands of students already scoring higher with {coachingName}.
              </p>

              <Link to="/login?role=student">
                <Button className="rounded-full bg-white px-10 py-6 text-base font-bold text-indigo-700 shadow-xl hover:bg-zinc-50 sm:px-14 sm:py-7 sm:text-lg">
                  Get Started For Free <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-200 bg-white pb-8 pt-12 sm:pt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 grid grid-cols-1 gap-10 sm:mb-16 md:grid-cols-4 md:gap-12">
            <div className="md:col-span-1">
              <div className="mb-3 flex items-center gap-2">
                {logoUrl ? (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                    <img
                      src={logoUrl}
                      alt={`${coachingName} logo`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white shadow-sm">
                    <span className="text-sm font-bold">
                      {coachingName?.trim()?.[0]?.toUpperCase() || "U"}
                    </span>
                  </div>
                )}
                <span className="text-lg font-bold tracking-tight text-zinc-950">
                  {coachingName}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-500">{tagline}</p>
            </div>

            <div>
              <h4 className="mb-4 font-bold text-zinc-950">Platform</h4>
              <ul className="space-y-3">
                <li>
                  <Link to="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-950">
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    to="/courses"
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-950"
                  >
                    Test Series
                  </Link>
                </li>
                <li>
                  <Link
                    to="/login?role=student"
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-950"
                  >
                    Student Login
                  </Link>
                </li>
                <li>
                  <Link
                    to="/signup"
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-950"
                  >
                    Create Account
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 font-bold text-zinc-950">Contact</h4>
              <ul className="space-y-3">
                {tenant.contact?.phone && (
                  <li>
                    <a
                      href={`tel:${tenant.contact.phone}`}
                      className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-950"
                    >
                      <Phone className="h-4 w-4" /> {tenant.contact.phone}
                    </a>
                  </li>
                )}
                {tenant.contact?.email && (
                  <li>
                    <a
                      href={`mailto:${tenant.contact.email}`}
                      className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-950"
                    >
                      <Mail className="h-4 w-4" /> {tenant.contact.email}
                    </a>
                  </li>
                )}
                {tenant.contact?.address && (
                  <li className="flex items-start gap-2 text-sm font-medium text-zinc-500">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{tenant.contact.address}</span>
                  </li>
                )}
                {!tenant.contact?.phone && !tenant.contact?.email && !tenant.contact?.address && (
                  <li className="text-sm text-zinc-400">Contact info not configured.</li>
                )}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 font-bold text-zinc-950">Powered By</h4>
              <p className="text-sm leading-relaxed text-zinc-500">
                Built on PrepareKaro to help educators scale their testing and reach.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-zinc-200 pt-8 text-center sm:gap-4 md:flex-row md:text-left">
            <p className="text-sm font-medium text-zinc-500">
              © {new Date().getFullYear()} {coachingName}. All rights reserved.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm font-medium text-zinc-500 sm:gap-6 md:justify-start">
              <Link to="/privacy-policy" className="hover:text-zinc-950">
                Privacy Policy
              </Link>
              <Link to="/terms-of-use" className="hover:text-zinc-950">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
