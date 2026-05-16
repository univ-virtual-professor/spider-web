// src/themes/coaching/theme2/TenantHome.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  Menu,
  X,
  FileText,
  Star,
  Instagram,
  Youtube,
  Facebook,
  Linkedin,
  Twitter,
  Globe,
  MessageCircle,
  Send,
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
} from "lucide-react";

import { useTenant } from "@app/providers/TenantProvider";
import { useFavicon } from "@shared/hooks/useFavicon";

import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";

import { initials, isTruthyUrl } from "@/themes/coaching/shared/themeUtils";
import type { StatItem, TestimonialItem, FAQItem } from "@/themes/coaching/shared/themeTypes";

export default function TenantHomeTheme2() {
  const { tenant, loading } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const socials: Record<string, string> = useMemo(() => {
    const s = (config.socials || {}) as Record<string, string>;
    const cleaned: Record<string, string> = {};
    Object.entries(s).forEach(([k, v]) => {
      if (isTruthyUrl(v)) cleaned[k] = v.trim();
    });
    return cleaned;
  }, [config.socials]);

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

  // Updated Navigation
  const navLinks = [
    { label: "Home", href: "#top" },
    { label: "Features", href: "#features" },
    { label: "Contact Us", href: "#contact" },
  ];

  const socialIconMap: Record<string, any> = {
    instagram: Instagram,
    youtube: Youtube,
    facebook: Facebook,
    linkedin: Linkedin,
    twitter: Twitter,
    website: Globe,
    telegram: Send,
    whatsapp: MessageCircle,
    email: Mail,
    phone: Phone,
  };

  const socialLabelMap: Record<string, string> = {
    instagram: "Instagram",
    youtube: "YouTube",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    twitter: "X",
    website: "Website",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    email: "Email",
    phone: "Phone",
  };

  const buildSocialHref = (key: string, value: string) => {
    if (key === "email") {
      return value.startsWith("mailto:") ? value : `mailto:${value}`;
    }
    if (key === "phone") {
      return value.startsWith("tel:") ? value : `tel:${value}`;
    }
    return value;
  };

  // CUET Mock Data for "Our Tests"
  // const cuetSubjects = [
  //   { title: "English", totalTests: 440, freeTests: 1, lang: "English", attempts: "97341" },
  //   { title: "Economics", totalTests: 231, freeTests: 5, lang: "English", attempts: "47695" },
  //   { title: "Business Studies", totalTests: 214, freeTests: 5, lang: "English", attempts: "38535" },
  //   { title: "General Test", totalTests: 520, freeTests: 10, lang: "English", attempts: "125430" },
  //   { title: "Mathematics", totalTests: 310, freeTests: 4, lang: "English", attempts: "65200" },
  //   { title: "Physics", totalTests: 280, freeTests: 4, lang: "English", attempts: "54120" },
  // ];

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
            {/* Coaching Name */}
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
                SignUp
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
                  SignUp
                </Button>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20 lg:pb-32 lg:pt-32">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-4 lg:px-8">
          <div className="grid items-center gap-10 sm:gap-12 md:justify-center lg:grid-cols-2 lg:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="max-w-2xl"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-1.5 shadow-sm sm:mb-8">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                  {tagline}
                </span>
              </div>

              <h1 className="mb-6 text-3xl font-extrabold leading-[1.05] tracking-tighter text-zinc-950 sm:text-5xl lg:text-[64px]">
                Ace Your Exams
                <br />
                <span className="text-zinc-500">with {coachingName}</span>
              </h1>

              <div className="mb-10 flex flex-col gap-4 sm:flex-row">
                <a href="/signup" className="w-full sm:w-auto">
                  <Button className="w-full rounded-full bg-zinc-950 px-8 py-6 text-base font-semibold text-white shadow-xl shadow-zinc-900/10 hover:bg-zinc-800 sm:w-auto">
                    Get Started
                  </Button>
                </a>
              </div>

              {stats?.length > 0 && (
                <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:gap-6">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-orange-400 text-orange-400 sm:h-5 sm:w-5"
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 sm:gap-4">
                    {stats.slice(0, 2).map((s, idx) => (
                      <div key={idx} className="text-sm font-medium text-zinc-600">
                        <span className="font-bold text-zinc-950">{s.value}</span> {s.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
              className="relative w-full max-w-xl lg:ml-auto"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-100 shadow-2xl shadow-zinc-900/5">
                {heroImage ? (
                  <img src={heroImage} alt={coachingName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-zinc-400">
                    <FileText className="mb-3 h-12 w-12 opacity-50" />
                    <p className="text-sm font-medium">Add a hero image in settings</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* NEW FEATURES SECTION */}
      <section id="features" className="border-y border-zinc-100 bg-white py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <div className="mb-6 inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                WHY CHOOSE US
              </span>
            </div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
              Everything you need to <br className="hidden sm:block" /> dominate your exams
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="rounded-[2rem] border border-zinc-100 bg-[#FAFAFA] p-6 shadow-sm sm:p-8"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-bold text-zinc-950">
                Real Exam–Like Test Experience
              </h3>
              <p className="text-sm leading-relaxed text-zinc-500 sm:text-base">
                Feels exactly like the actual exam with authentic interface, timer, and navigation.
                Get comfortable before the real deal.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="rounded-[2rem] border border-zinc-100 bg-[#FAFAFA] p-6 shadow-sm sm:p-8"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-bold text-zinc-950">
                AI-Powered Advanced Analytics
              </h3>
              <p className="text-sm leading-relaxed text-zinc-500 sm:text-base">
                Question-wise accuracy, time taken per question/section, and clear identification of
                strengths and weak areas.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="rounded-[2rem] border border-zinc-100 bg-[#FAFAFA] p-6 shadow-sm sm:p-8"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-bold text-zinc-950">Time & accuracy insights</h3>
              <p className="text-sm leading-relaxed text-zinc-500 sm:text-base">
                Understand exactly where you lose time and make costly mistakes. Our platform
                highlights pacing issues to optimize your test strategy.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* NEW: WHAT WE STAND FOR */}
      <section className="bg-[#FAFAFA] py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="mb-6 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
                What we stand for
              </h2>
              <p className="mb-8 text-lg leading-relaxed text-zinc-600">
                We believe in transforming raw potential into undeniable results through systematic
                preparation and unwavering support.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                { title: "Proven Result", icon: BarChart3 },
                { title: "Expert faculty", icon: Users },
                { title: "Personalised Learning & Mentorship", icon: Target },
                { title: "1:1 Doubt Support", icon: BookOpen },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-900">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-zinc-950">{item.title}</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* UPDATED TESTIMONIALS */}
      <section id="reviews" className="bg-[#FAFAFA] py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <div className="mb-6 inline-flex items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                PROOF THAT IT WORKS
              </span>
            </div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
              Happy students sharing experiences :
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {(testimonials.length
              ? testimonials
              : [
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
                ]
            )
              .slice(0, 3)
              .map((t, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="flex flex-col items-center rounded-[2rem] border border-zinc-100 bg-white p-6 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-10"
                >
                  <div className="mb-6 flex gap-1">
                    {Array.from({ length: Math.max(1, Math.min(5, t.rating || 5)) }).map((_, i) => (
                      <Star key={i} className="h-6 w-6 fill-orange-400 text-orange-400" />
                    ))}
                  </div>

                  <p className="mb-8 flex-1 text-base leading-relaxed text-zinc-600 sm:text-lg">
                    "{t.text}"
                  </p>

                  <div className="flex w-full flex-col items-center gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border border-zinc-200">
                        <AvatarImage src={t.avatar} className="object-cover" />
                        <AvatarFallback className="bg-zinc-100 font-bold text-zinc-600">
                          {initials(t.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <p className="text-sm font-bold text-zinc-950">{t.name}</p>
                      </div>
                    </div>
                    {t.course && (
                      <div className="mt-2 w-full">
                        <span className="inline-block w-full truncate rounded-lg bg-indigo-50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-600">
                          {t.course}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
          </div>
        </div>
      </section>

      {/* NEW CONTACT SECTION */}
      <section id="contact" className="border-y border-zinc-100 bg-white py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="mb-6 inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                  GET IN TOUCH
                </span>
              </div>
              <h2 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl">
                Let's Talk.
              </h2>
              <p className="mb-10 max-w-md text-lg text-zinc-500">
                Have questions about the test series or need guidance on your preparation? Reach out
                directly.
              </p>
            </div>

            <div className="rounded-[2.5rem] border border-zinc-200 bg-[#FAFAFA] p-6 sm:p-12">
              <h3 className="mb-8 text-2xl font-bold text-zinc-950">Follow Our Socials</h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Object.entries(socials).length > 0 ? (
                  Object.entries(socials).map(([k, v]) => {
                    const Icon = socialIconMap[k];
                    if (!Icon || !v) return null;

                    const href = buildSocialHref(k, v);
                    const isExternal = !["email", "phone"].includes(k);

                    return (
                      <a
                        key={k}
                        href={href}
                        target={isExternal ? "_blank" : undefined}
                        rel={isExternal ? "noopener noreferrer" : undefined}
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-100 bg-white p-4 transition-all hover:-translate-y-1 hover:shadow-md sm:gap-3 sm:p-6"
                      >
                        <Icon className="h-7 w-7 text-zinc-700 sm:h-8 sm:w-8" />
                        <span className="text-center text-xs font-semibold text-zinc-900 sm:text-sm">
                          {socialLabelMap[k] || k}
                        </span>
                      </a>
                    );
                  })
                ) : (
                  <div className="col-span-full text-sm text-zinc-500">
                    Social links will appear here once added in settings.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NEW BOTTOM CTA CARD (Purple Gradient Style) */}
      <section className="bg-[#FAFAFA] py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-violet-500 to-indigo-500 p-7 text-center shadow-[0_20px_50px_rgb(99,102,241,0.2)] sm:rounded-[2.5rem] sm:p-12 lg:p-20">
            {/* Sparkles/Floating decorative elements */}
            <Sparkles className="absolute right-12 top-10 h-8 w-8 text-white/40" />
            <Sparkles className="absolute bottom-12 left-10 h-6 w-6 text-white/30" />

            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5" /> Start Today
              </div>

              <h2 className="mb-8 max-w-3xl text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:mb-10 sm:text-5xl md:text-6xl">
                Ready to Begin Your Journey at {coachingName}?
              </h2>

              <div className="flex w-full flex-col justify-center gap-4 sm:w-auto sm:flex-row">
                <Link to="/login?role=student" className="w-full sm:w-auto">
                  <Button className="w-full rounded-full bg-white px-8 py-5 text-base font-bold text-indigo-600 shadow-xl hover:bg-zinc-50 sm:px-10 sm:py-7 sm:text-lg">
                    Get Started For Free <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/courses" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="w-full rounded-full border-white/30 bg-transparent px-8 py-5 text-base font-bold text-white hover:bg-white/10 sm:px-10 sm:py-7 sm:text-lg"
                  >
                    Browse All Tests
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-200 bg-white pb-8 pt-12 sm:pt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 grid grid-cols-1 gap-10 sm:mb-16 md:grid-cols-4 md:gap-12">
            <div className="md:col-span-1">
              <div className="mb-4 flex items-center gap-2">
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
                <span className="text-xl font-bold tracking-tight text-zinc-950">
                  {coachingName}
                </span>
              </div>
              <p className="mb-6 text-sm leading-relaxed text-zinc-500">{tagline}</p>
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
              </ul>
            </div>

            <div>
              <h4 className="mb-4 font-bold text-zinc-950">Powered By</h4>
              <p className="mb-4 text-sm leading-relaxed text-zinc-500">
                Built on PREPAREKARO.IN to help educators scale their testing and reach.
              </p>
              <div className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-3 py-1"></div>
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
