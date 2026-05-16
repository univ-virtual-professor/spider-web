// src/themes/coaching/theme3/TenantHome.tsx
import { useEffect, useMemo, useState } from "react";
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
  Mail,
  Quote,
  MonitorPlay,
  BrainCircuit,
  Clock,
  Target,
  Users,
  MessageSquare,
  BookOpen,
} from "lucide-react";

import { useTenant } from "@app/providers/TenantProvider";
import { useFavicon } from "@shared/hooks/useFavicon";
import { db } from "@shared/lib/firebase";
import { collection, documentId, getDocs, limit, orderBy, query, where } from "firebase/firestore";

import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";

import { initials, isTruthyUrl } from "@/themes/coaching/shared/themeUtils";
import type { FacultyItem, TestimonialItem, TestSeries } from "@/themes/coaching/shared/themeTypes";

export default function TenantHomeTheme2() {
  const { tenant, loading } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [featured, setFeatured] = useState<TestSeries[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);

  const config = tenant?.websiteConfig || {};
  const coachingName = config.coachingName || (tenant as any)?.coachingName || "Your Institute";
  const tagline = config.tagline || (tenant as any)?.tagline || "Learn smarter. Score higher.";
  const logoUrl: string | undefined = config.logoUrl;
  const faculty: FacultyItem[] = Array.isArray(config.faculty) ? config.faculty : [];
  const testimonials: TestimonialItem[] = Array.isArray(config.testimonials)
    ? config.testimonials
    : [];
  const educatorId = tenant?.educatorId;
  const featuredIds: string[] = Array.isArray(config.featuredTestIds) ? config.featuredTestIds : [];
  const featuredKey = featuredIds.join(",");

  useFavicon(logoUrl, coachingName);

  const socials: Record<string, string> = useMemo(() => {
    const s = (config.socials || {}) as Record<string, string>;
    const cleaned: Record<string, string> = {};
    Object.entries(s).forEach(([k, v]) => {
      if (isTruthyUrl(v)) cleaned[k] = v.trim();
    });
    return cleaned;
  }, [config.socials]);

  useEffect(() => {
    if (!educatorId) return;

    async function loadFeatured() {
      setLoadingFeatured(true);
      try {
        let qRef;

        if (featuredIds.length > 0) {
          const safeIds = featuredIds.slice(0, 10);
          qRef = query(
            collection(db, "educators", educatorId, "my_tests"),
            where(documentId(), "in", safeIds)
          );
        } else {
          qRef = query(
            collection(db, "educators", educatorId, "my_tests"),
            orderBy("createdAt", "desc"),
            limit(4)
          );
        }

        const snap = await getDocs(qRef);
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as TestSeries[];

        setFeatured(rows);
      } catch {
        setFeatured([]);
      } finally {
        setLoadingFeatured(false);
      }
    }

    loadFeatured();
  }, [educatorId, featuredKey]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-neutral-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-500" />
        Loading...
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <div className="px-6 text-center">
          <h2 className="text-2xl font-bold">Coaching not found</h2>
          <p className="mt-2 text-neutral-400">
            This coaching website does not exist. Check the URL or contact support.
          </p>
        </div>
      </div>
    );
  }

  // UPDATED NAVIGATION
  const navLinks = [
    { label: "Home", href: "#top" },
    { label: "Features", href: "#features" },
    { label: "Test Series", href: "#tests" },
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
  };

  // CUET Subjects hardcoded for the "Our Tests" section
  const cuetSubjects = [
    "English",
    "General Test",
    "Physics",
    "Chemistry",
    "Mathematics",
    "Biology",
    "Accountancy",
    "Economics",
    "Business Studies",
    "History",
    "Political Science",
    "Geography",
  ];

  return (
    <div
      id="top"
      className="min-h-screen scroll-smooth bg-[#0a0a0a] font-sans text-neutral-200 selection:bg-orange-500/30 selection:text-white"
    >
      {/* Background Grid Pattern */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.03]" />

      {/* FLOATING NAVBAR */}
      <div className="fixed left-1/2 top-6 z-50 w-[95%] max-w-5xl -translate-x-1/2">
        <nav className="flex items-center justify-between rounded-full border border-neutral-800 bg-[#111111]/90 px-4 py-3 shadow-2xl backdrop-blur-md">
          <Link to="/" className="flex items-center gap-2.5 pl-2">
            {logoUrl ? (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900">
                <img
                  src={logoUrl}
                  alt={`${coachingName} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white shadow-sm">
                <span className="text-sm font-bold">
                  {coachingName?.trim()?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
            )}
            <span className="hidden text-base font-semibold text-white sm:block">
              {coachingName}
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm font-medium text-neutral-400 transition-colors hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3 pr-1">
            <Link to="/login?role=student">
              <Button
                size="sm"
                className="hidden rounded-full border-none bg-orange-600 px-6 text-white transition-all hover:bg-orange-700 md:inline-flex"
              >
                Login <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>

            <button className="text-neutral-300 md:hidden" onClick={() => setMobileOpen((s) => !s)}>
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </nav>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="absolute left-0 top-16 flex w-full flex-col gap-2 rounded-2xl border border-neutral-800 bg-[#111111]/95 p-4 shadow-2xl backdrop-blur-xl md:hidden">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <Link to="/login?role=student" onClick={() => setMobileOpen(false)} className="mt-2">
              <Button
                size="sm"
                className="w-full rounded-full border-none bg-orange-600 py-5 text-white hover:bg-orange-700"
              >
                Login
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden px-4 pb-20 pt-40 lg:pb-32 lg:pt-52">
        <div className="pointer-events-none absolute left-1/2 top-1/4 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-orange-600/10 blur-[120px]" />

        <div className="container relative mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center space-y-6"
          >
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-[#151515] px-4 py-1.5 text-xs font-medium text-neutral-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
              {tagline}
            </div>

            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[80px]">
              Unlock your potential <br className="hidden sm:block" />
              with <span className="text-orange-500">{coachingName}</span>.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400 md:text-xl">
              Explore structured test series, expert faculty guidance, and performance insights —
              all designed to move your score up.
            </p>

            <div className="flex w-full flex-col justify-center gap-4 pt-8 sm:flex-row">
              <Link to="/login?role=student">
                <Button
                  size="lg"
                  className="w-full rounded-full border-none bg-orange-600 px-8 py-6 text-base text-white transition-transform hover:scale-105 hover:bg-orange-700 sm:w-auto"
                >
                  Enroll Today <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#tests">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full rounded-full border-neutral-700 bg-neutral-900/50 px-8 py-6 text-base text-white hover:bg-neutral-800 hover:text-white sm:w-auto"
                >
                  Explore Tests
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* NEW SECTION: WHAT WE STAND FOR */}
      <section className="border-y border-neutral-800/50 bg-[#0f0f0f] py-16">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">
              What We Stand For
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800/60 bg-[#141414] p-6 transition-colors hover:border-orange-500/30">
              <Target className="mb-4 h-8 w-8 text-orange-500" />
              <h3 className="font-semibold text-white">Proven Results</h3>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800/60 bg-[#141414] p-6 transition-colors hover:border-orange-500/30">
              <Users className="mb-4 h-8 w-8 text-orange-500" />
              <h3 className="font-semibold text-white">Expert Faculty</h3>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800/60 bg-[#141414] p-6 transition-colors hover:border-orange-500/30">
              <BookOpen className="mb-4 h-8 w-8 text-orange-500" />
              <h3 className="font-semibold text-white">Personalised Mentorship</h3>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800/60 bg-[#141414] p-6 transition-colors hover:border-orange-500/30">
              <MessageSquare className="mb-4 h-8 w-8 text-orange-500" />
              <h3 className="font-semibold text-white">1:1 Doubt Support</h3>
            </div>
          </div>
        </div>
      </section>

      {/* NEW FEATURES SECTION */}
      <section id="features" className="relative bg-[#0a0a0a] py-24">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-6 text-3xl font-bold text-white md:text-5xl">
              Designed for <span className="text-orange-500">Maximum Impact</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-neutral-400">
              Everything you need to master your exams, built right into the platform.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="group relative overflow-hidden rounded-3xl border border-neutral-800 bg-[#121212] p-8 transition-colors hover:bg-[#161616]">
              <div className="absolute right-0 top-0 p-6 opacity-10 transition-opacity group-hover:opacity-20">
                <MonitorPlay className="h-24 w-24 text-orange-500" />
              </div>
              <MonitorPlay className="relative z-10 mb-6 h-10 w-10 text-orange-500" />
              <h3 className="relative z-10 mb-4 text-2xl font-bold text-white">
                Real Exam–Like Test Experience
              </h3>
              <p className="relative z-10 leading-relaxed text-neutral-400">
                Feels exactly like the actual CUET exam with an authentic interface, realistic
                timer, and seamless navigation. Practice in the exact environment you'll face on
                test day.
              </p>
            </div>

            <div className="group relative overflow-hidden rounded-3xl border border-neutral-800 bg-[#121212] p-8 transition-colors hover:bg-[#161616]">
              <div className="absolute right-0 top-0 p-6 opacity-10 transition-opacity group-hover:opacity-20">
                <BrainCircuit className="h-24 w-24 text-orange-500" />
              </div>
              <BrainCircuit className="relative z-10 mb-6 h-10 w-10 text-orange-500" />
              <h3 className="relative z-10 mb-4 text-2xl font-bold text-white">
                AI-Powered Advanced Analytics
              </h3>
              <p className="relative z-10 leading-relaxed text-neutral-400">
                Question-wise accuracy, time taken per question/section, and clear identification of
                strengths and weak areas. Let data drive your study plan.
              </p>
            </div>

            <div className="group relative overflow-hidden rounded-3xl border border-neutral-800 bg-[#121212] p-8 transition-colors hover:bg-[#161616]">
              <div className="absolute right-0 top-0 p-6 opacity-10 transition-opacity group-hover:opacity-20">
                <Clock className="h-24 w-24 text-orange-500" />
              </div>
              <Clock className="relative z-10 mb-6 h-10 w-10 text-orange-500" />
              <h3 className="relative z-10 mb-4 text-2xl font-bold text-white">
                Time & Accuracy Insights
              </h3>
              <p className="relative z-10 leading-relaxed text-neutral-400">
                Pinpoint exactly where you lose time. Master your pacing, eliminate guesswork, and
                optimize your test-taking strategy to maximize your final score.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* EXAM CENTER / TEST SERIES */}
      <section id="tests" className="relative border-t border-neutral-800/50 bg-[#0c0c0c] py-24">
        <div className="container relative mx-auto max-w-6xl px-4">
          {/* Featured Tests Sub-section */}
          <div className="mb-24">
            <div className="mb-10 flex items-center justify-between">
              <div>
                <h2 className="mb-2 text-3xl font-bold text-white">Featured Series</h2>
                <p className="text-neutral-400">Hand-picked by our experts.</p>
              </div>
            </div>

            {loadingFeatured ? (
              <div className="flex justify-center py-20 text-neutral-500">
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-orange-500" />
                Loading curriculum...
              </div>
            ) : featured.length === 0 ? (
              <div className="rounded-2xl border border-neutral-800 bg-[#111] py-12 text-center text-neutral-500">
                No featured series available right now.
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {featured.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-[#141414] transition-all hover:border-neutral-600"
                  >
                    <div className="relative aspect-video overflow-hidden bg-[#1a1a1a]">
                      {t.coverImage ? (
                        <img
                          src={t.coverImage}
                          alt={t.title}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-neutral-600">
                          <FileText className="h-10 w-10 opacity-40" />
                        </div>
                      )}
                      {t.subject && (
                        <div className="absolute left-3 top-3">
                          <span className="rounded border border-white/10 bg-black/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                            {t.subject}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-grow flex-col p-5">
                      <h3 className="mb-2 line-clamp-2 text-lg font-bold text-white">{t.title}</h3>
                      <div className="mt-auto flex items-center justify-between pt-4">
                        <span className="text-base font-bold text-orange-500">
                          {t.price === "Included" || t.price == 0 ? "Free" : `$${t.price}`}
                        </span>
                        <Link to="/login?role=student">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-auto p-0 text-white hover:bg-orange-500/10 hover:text-orange-500"
                          >
                            View <ArrowRight className="ml-1 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New Section: Our Tests (Subject-wise) */}
          <div>
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-white md:text-5xl">Our Tests</h2>
              <p className="text-lg text-neutral-400">
                Subject-wise mock tests designed specifically for CUET.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cuetSubjects.map((subject, idx) => (
                <div
                  key={idx}
                  className="group flex min-h-[160px] flex-col justify-between rounded-2xl border border-neutral-800 bg-[#121212] p-5 transition-all hover:bg-[#181818]"
                >
                  <div>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10 text-orange-500">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <Badge
                        variant="outline"
                        className="border-neutral-700 font-normal text-neutral-400"
                      >
                        CUET
                      </Badge>
                    </div>
                    <h3 className="mb-1 text-xl font-bold text-white">{subject}</h3>
                    <p className="text-sm text-neutral-500">Chapter-wise & Full Mocks</p>
                  </div>

                  <div className="mt-4 flex justify-end border-t border-neutral-800/60 pt-4 opacity-80 transition-opacity group-hover:opacity-100">
                    <Link to="/login?role=student" className="w-full">
                      <Button
                        size="sm"
                        className="w-full rounded-xl border-none bg-white/5 text-white transition-colors hover:bg-orange-600"
                      >
                        Get Started
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* REVIEWS / TESTIMONIALS */}
      <section id="reviews" className="border-t border-neutral-800/50 py-24">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-white md:text-5xl">
              Happy students sharing experiences :
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {(testimonials.length ? testimonials : []).slice(0, 6).map((t, idx) => (
              <div
                key={idx}
                className="relative rounded-3xl border border-neutral-800 bg-[#121212] p-8"
              >
                <Quote className="absolute right-6 top-6 h-8 w-8 text-orange-500/20" />

                <div className="mb-6 flex items-center gap-4">
                  <Avatar className="h-12 w-12 border border-neutral-700">
                    <AvatarImage src={t.avatar} />
                    <AvatarFallback className="bg-neutral-800 text-neutral-300">
                      {initials(t.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-white">{t.name}</p>
                    <p className="text-xs text-neutral-500">{t.course || "Student"}</p>
                  </div>
                </div>

                <div className="mb-4 flex items-center gap-1">
                  {Array.from({ length: Math.max(1, Math.min(5, t.rating || 5)) }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-orange-500 text-orange-500" />
                  ))}
                </div>

                <p className="text-sm italic leading-relaxed text-neutral-300">"{t.text}"</p>
              </div>
            ))}
          </div>

          {(!testimonials || testimonials.length === 0) && (
            <div className="rounded-3xl border border-neutral-800 bg-[#111] p-10 text-center text-sm text-neutral-500">
              No reviews available yet.
            </div>
          )}
        </div>
      </section>

      {/* NEW CONTACT SECTION */}
      <section
        id="contact"
        className="relative overflow-hidden border-t border-neutral-800/50 bg-[#0c0c0c] py-32"
      >
        {/* Decorative background blurs */}
        <div className="pointer-events-none absolute right-0 top-0 h-[500px] w-[500px] rounded-full bg-orange-600/5 blur-[150px]" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-[500px] w-[500px] rounded-full bg-neutral-600/5 blur-[150px]" />

        <div className="container relative mx-auto max-w-4xl px-4 text-center">
          <Badge className="mb-8 rounded-full border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-orange-500 hover:bg-orange-500/20">
            Get In Touch
          </Badge>
          <h2 className="mb-6 text-4xl font-bold text-white md:text-6xl">Let's connect.</h2>
          <p className="mx-auto mb-12 max-w-2xl text-xl text-neutral-400">
            Have questions about the courses or need guidance? Reach out to us directly or follow us
            on our social channels.
          </p>

          <div className="flex flex-col items-center justify-center gap-8 rounded-[3rem] border border-neutral-800/60 bg-[#141414]/50 p-12 backdrop-blur-sm">
            {tenant.contact?.email && (
              <a
                href={`mailto:${tenant.contact.email}`}
                className="group flex flex-col items-center gap-4 text-2xl font-semibold text-white transition-colors hover:text-orange-500 sm:flex-row md:text-4xl"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 transition-colors group-hover:border-orange-500/50">
                  <Mail className="h-8 w-8 text-neutral-400 group-hover:text-orange-500" />
                </div>
                {tenant.contact.email}
              </a>
            )}

            {!tenant.contact?.email && (
              <div className="text-2xl font-medium text-neutral-500">
                Contact information not provided.
              </div>
            )}

            <div className="my-4 h-[1px] w-24 bg-neutral-800" />

            <div className="flex flex-wrap justify-center gap-4">
              {Object.entries(socials).map(([k, v]) => {
                const Icon = socialIconMap[k];
                if (!Icon) return null;
                return (
                  <a
                    key={k}
                    href={v}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-400 shadow-lg transition-all hover:scale-110 hover:border-orange-600 hover:bg-orange-600 hover:text-white"
                    title={k}
                  >
                    <Icon className="h-6 w-6" />
                  </a>
                );
              })}
              {Object.keys(socials).length === 0 && (
                <span className="text-sm text-neutral-500">No social links configured.</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* NEW ELEGANT BOTTOM CTA CARD */}
      <section className="relative border-t border-neutral-800/50 px-4 py-24">
        <div className="container mx-auto max-w-5xl">
          <div className="group relative overflow-hidden rounded-[3rem] border border-neutral-700/50 bg-gradient-to-br from-[#1c1c1c] via-[#111111] to-[#0a0a0a] p-10 text-center shadow-[0_0_80px_rgba(234,88,12,0.05)] md:p-20">
            {/* Inner subtle glow */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-600/10 opacity-70 blur-[100px] transition-opacity group-hover:opacity-100" />

            <div className="relative z-10 flex flex-col items-center">
              <h2 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
                Ready to Begin Your Journey <br /> at{" "}
                <span className="text-orange-500">{coachingName}</span>?
              </h2>
              <p className="mb-10 max-w-2xl text-lg text-neutral-400 md:text-xl">
                Join thousands of students who have already transformed their preparation strategy.
                Get instant access to our premium content.
              </p>
              <Link to="/login?role=student">
                <Button
                  size="lg"
                  className="rounded-full border-none bg-orange-600 px-12 py-8 text-xl font-semibold text-white shadow-[0_0_40px_rgba(234,88,12,0.3)] transition-all hover:scale-105 hover:bg-orange-500"
                >
                  Get Started <ArrowRight className="ml-3 h-6 w-6" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-neutral-800 bg-[#050505] pb-8 pt-16">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-16 grid gap-12 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="mb-4 flex items-center gap-2">
                {logoUrl ? (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900">
                    <img
                      src={logoUrl}
                      alt={`${coachingName} logo`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white">
                    <span className="text-sm font-bold">
                      {coachingName?.trim()?.[0]?.toUpperCase() || "U"}
                    </span>
                  </div>
                )}
                <div className="text-xl font-bold text-white">{coachingName}</div>
              </div>
              <p className="mb-6 max-w-xs text-sm text-neutral-500">{tagline}</p>
            </div>

            <div>
              <div className="mb-6 font-semibold text-white">Navigation</div>
              <div className="space-y-4 text-sm text-neutral-400">
                {navLinks.map((l) => (
                  <a
                    key={l.label}
                    className="block transition-colors hover:text-orange-500"
                    href={l.href}
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-6 font-semibold text-white">Legal</div>
              <div className="space-y-4 text-sm text-neutral-400">
                <Link to="/terms-of-use" className="block transition-colors hover:text-white">
                  Terms of Service
                </Link>
                <Link to="/privacy-policy" className="block transition-colors hover:text-white">
                  Privacy Policy
                </Link>
                <a href="#" className="block transition-colors hover:text-white">
                  Refund Policy
                </a>
              </div>
            </div>

            <div>
              <div className="mb-6 font-semibold text-white">Powered By</div>
              <div className="text-sm leading-relaxed text-neutral-400">
                PREPAREKARO.IN helps educators publish test series, onboard students, and track
                progress at scale.
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-neutral-800 pt-8 text-sm text-neutral-600 md:flex-row">
            <span>
              © {new Date().getFullYear()} {coachingName}. All rights reserved.
            </span>
            <span>
              Built with <span className="font-medium text-neutral-500">PREPAREKARO.IN</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
