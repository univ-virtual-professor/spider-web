// src/themes/coaching/theme1/TenantHome.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Loader2,
  Menu,
  X,
  FileText,
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
  Search,
  Laptop,
  BrainCircuit,
  Clock,
  CheckCircle2,
  Users,
  Target,
  Award,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";
import { collection, documentId, getDocs, limit, orderBy, query, where } from "firebase/firestore";

import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";

import { initials, isTruthyUrl } from "@/themes/coaching/shared/themeUtils";
import type {
  StatItem,
  AchievementItem,
  FacultyItem,
  TestimonialItem,
  FAQItem,
  TestSeries,
} from "@/themes/coaching/shared/themeTypes";

export default function TenantHomeTheme2() {
  const { tenant, loading } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [featured, setFeatured] = useState<TestSeries[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);

  const config = tenant?.websiteConfig || {};
  const coachingName = config.coachingName || (tenant as any)?.coachingName || "Your Institute";
  const tagline = config.tagline || (tenant as any)?.tagline || "Learn smarter. Score higher.";
  const defaultHeroImage =
    "https://plus.unsplash.com/premium_photo-1683887034491-f58b4c4fca72?q=80&w=869&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";
  const finalHeroImage = config.heroImage || defaultHeroImage;
  const stats: StatItem[] = Array.isArray(config.stats) ? config.stats : [];
  const achievements: AchievementItem[] = Array.isArray(config.achievements)
    ? config.achievements
    : [];
  const faculty: FacultyItem[] = Array.isArray(config.faculty) ? config.faculty : [];
  const testimonials: TestimonialItem[] = Array.isArray(config.testimonials)
    ? config.testimonials
    : [];
  const faqs: FAQItem[] = Array.isArray(config.faqs) && config.faqs.length > 0 ? config.faqs : [];
  const educatorId = tenant?.educatorId;
  const featuredIds: string[] = Array.isArray(config.featuredTestIds) ? config.featuredTestIds : [];
  const featuredKey = featuredIds.join(",");

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
        if (rows.length > 0) setActiveTestId(rows[0].id);
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
      <div className="flex min-h-screen items-center justify-center bg-[#fcfaf8] text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading...
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fcfaf8] text-stone-900">
        <div className="px-6 text-center">
          <h2 className="text-3xl font-medium tracking-tight">Coaching not found</h2>
          <p className="mt-2 text-stone-500">
            This coaching website does not exist. Check the URL or contact support.
          </p>
        </div>
      </div>
    );
  }

  // UPDATED NAVIGATION LINKS
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

  // Mock Data for CUET Cards
  const cuetSubjects = [
    { name: "English", total: 440, free: 6, lang: "English", attempts: "87,241" },
    { name: "Economics", total: 231, free: 5, lang: "English, हिन्दी", attempts: "47,695" },
    { name: "Business Studies", total: 214, free: 5, lang: "English, हिन्दी", attempts: "38,535" },
    { name: "Mathematics", total: 310, free: 3, lang: "English, हिन्दी", attempts: "65,200" },
    { name: "Accountancy", total: 250, free: 4, lang: "English, हिन्दी", attempts: "41,000" },
    { name: "General Test", total: 500, free: 10, lang: "English, हिन्दी", attempts: "92,000" },
  ];

  return (
    <div
      id="top"
      className="min-h-screen bg-[#fcfaf8] font-sans text-stone-900 selection:bg-[#3424d1] selection:text-white"
    >
      {/* TOP INFO BAR */}
      <div className="hidden items-center justify-between bg-[#eb5a28] px-6 py-2 text-sm font-medium text-white/90 md:flex">
        <div className="flex items-center gap-6">
          {tenant.contact?.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4" /> {tenant.contact.phone}
            </div>
          )}
          {tenant.contact?.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> {tenant.contact.email}
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          {tenant.contact?.address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {tenant.contact.address}
            </div>
          )}
          <span className="hidden opacity-75 lg:inline-block">|</span>
          <span className="hidden lg:inline-block">Empowering Futures</span>
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-stone-200 bg-[#fcfaf8]/90 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3424d1] text-white shadow-sm">
              <span className="text-lg font-bold">
                {coachingName?.trim()?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
            <span className="text-xl font-medium tracking-tight text-stone-900">
              {coachingName}
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-[15px] font-medium text-stone-600 transition-colors hover:text-[#3424d1]"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button className="hidden items-center gap-2 text-[15px] font-medium text-stone-600 hover:text-stone-900 md:flex">
              <Search className="h-4 w-4" /> Search
            </button>
            <Link to="/login?role=student">
              <Button
                variant="outline"
                className="hidden rounded-full border-stone-300 px-6 font-medium text-stone-900 hover:bg-stone-100 lg:inline-flex"
              >
                Log in
              </Button>
            </Link>
            <Link to="/signup">
              <Button className="hidden rounded-full bg-[#1a1a1a] px-6 font-medium text-white hover:bg-[#333] sm:inline-flex">
                Apply Now
              </Button>
            </Link>

            <button className="text-stone-900 md:hidden" onClick={() => setMobileOpen((s) => !s)}>
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-stone-200 bg-[#fcfaf8] px-4 py-4 shadow-lg md:hidden">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="block border-b border-stone-100 px-4 py-3 text-lg font-medium text-stone-600 hover:text-[#3424d1]"
              >
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-3 pt-4">
              <Link to="/login?role=student" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" className="w-full rounded-full border-stone-300">
                  Log in
                </Button>
              </Link>
              <Link to="/signup" onClick={() => setMobileOpen(false)}>
                <Button className="w-full rounded-full bg-[#1a1a1a] text-white">Apply Now</Button>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden pb-24 pt-16 lg:pb-32 lg:pt-24">
        <div className="container mx-auto px-4 md:px-8">
          <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-5xl font-medium leading-[1.05] tracking-tight text-stone-900 sm:text-7xl lg:text-[5.5rem]"
            >
              Your Journey <br />
              Begins at {coachingName.split(" ")[0]}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 max-w-xl text-lg font-light leading-relaxed text-stone-500 sm:mt-8 sm:text-xl"
            >
              {tagline}. These words reflect a strong educational mission and personal growth
              journey in our programs.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-8 flex flex-col items-center gap-4 sm:mt-10 sm:flex-row"
            >
              <Link to="/signup">
                <Button
                  size="lg"
                  className="h-14 rounded-full bg-[#3424d1] px-8 text-base font-medium text-white hover:bg-[#281baf]"
                >
                  Start Your Journey
                </Button>
              </Link>
              <span className="mt-2 text-sm font-medium text-stone-500 sm:ml-4 sm:mt-0">
                Trusted by {stats[0]?.value || "thousands of"} students
              </span>
            </motion.div>
          </div>

          <div className="relative mt-16 h-[400px] w-full sm:h-[500px] lg:mt-0 lg:h-auto">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="z-0 mx-auto hidden h-[360px] w-[280px] overflow-hidden rounded-sm shadow-2xl lg:absolute lg:-left-4 lg:top-[-450px] lg:mx-0 lg:block lg:h-[440px] lg:w-[320px]"
            >
              <img src={finalHeroImage} alt="Students" className="h-full w-full object-cover" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="z-0 mx-auto mt-8 hidden h-[360px] w-[280px] overflow-hidden rounded-sm shadow-2xl lg:absolute lg:-right-4 lg:top-[-320px] lg:mx-0 lg:mt-0 lg:block lg:h-[400px] lg:w-[320px]"
            >
              <img
                src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=871&auto=format&fit=crop&ixlib=rb-4.1.0"
                alt="Hero Decoration"
                className="h-full w-full object-cover"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* NEW FEATURES SECTION */}
      <section id="features" className="border-y border-stone-200 bg-white py-24">
        <div className="container mx-auto px-4 md:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="text-4xl font-medium tracking-tight text-stone-900 sm:text-5xl">
              Powerful Features
            </h2>
            <p className="mt-4 text-lg font-light text-stone-500">
              Everything you need to succeed, built right into the platform.
            </p>
          </div>

          <div className="grid gap-10 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-100 bg-stone-50 p-8 transition-shadow hover:shadow-lg">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#3424d1]/10 text-[#3424d1]">
                <Laptop className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-medium text-stone-900">
                Real Exam–Like Test Experience
              </h3>
              <p className="font-light leading-relaxed text-stone-600">
                Feels exactly like the actual CUET exam with authentic interface, timer, and
                navigation.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-100 bg-stone-50 p-8 transition-shadow hover:shadow-lg">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#eb5a28]/10 text-[#eb5a28]">
                <BrainCircuit className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-medium text-stone-900">
                AI-Powered Advanced Analytics
              </h3>
              <p className="font-light leading-relaxed text-stone-600">
                Question-wise accuracy, time taken per question/section, and clear identification of
                strengths and weak areas.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-100 bg-stone-50 p-8 transition-shadow hover:shadow-lg">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-green-600/10 text-green-600">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-xl font-medium text-stone-900">Time & Accuracy Insights</h3>
              <p className="font-light leading-relaxed text-stone-600">
                Track your pacing across sections to eliminate guesswork, manage your time
                effectively, and optimize your performance under pressure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT WE STAND FOR SECTION */}
      <section className="bg-[#1c1815] py-24 text-[#f5f0e6]">
        <div className="container mx-auto px-4 md:px-8">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">
              What We Stand For
            </h2>
            <p className="mt-4 text-lg font-light text-stone-400">
              Our core pillars designed to ensure your absolute success.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div className="flex flex-col items-center p-6 text-center">
              <Award className="mb-4 h-12 w-12 text-[#eb5a28]" />
              <h3 className="text-xl font-medium text-white">Proven Result</h3>
            </div>
            <div className="flex flex-col items-center p-6 text-center">
              <Users className="mb-4 h-12 w-12 text-[#3424d1]" />
              <h3 className="text-xl font-medium text-white">Expert Faculty</h3>
            </div>
            <div className="flex flex-col items-center p-6 text-center">
              <Target className="mb-4 h-12 w-12 text-green-500" />
              <h3 className="text-xl font-medium text-white">Personalised Learning & Mentorship</h3>
            </div>
            <div className="flex flex-col items-center p-6 text-center">
              <ShieldCheck className="mb-4 h-12 w-12 text-blue-400" />
              <h3 className="text-xl font-medium text-white">1:1 Doubt Support</h3>
            </div>
          </div>
        </div>
      </section>

      {/* TEST SERIES SECTION (Combined Existing + New CUET Cards) */}
      <section id="tests" className="bg-[#fcfaf8] py-24">
        <div className="container mx-auto px-4 md:px-8">
          {/* Part 1: Existing Featured Programs */}
          <div className="mb-32">
            <h2 className="mb-16 text-4xl font-medium tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
              Our Academic Programs
            </h2>

            {loadingFeatured ? (
              <div className="flex justify-center py-20 text-stone-500">
                <Loader2 className="mr-3 h-6 w-6 animate-spin" /> Loading programs...
              </div>
            ) : featured.length === 0 ? (
              <div className="py-20 text-xl font-light text-stone-500">
                No featured programs available right now.
              </div>
            ) : (
              <div className="grid items-start gap-16 lg:grid-cols-2">
                <div className="sticky top-32 order-last aspect-square overflow-hidden rounded-sm bg-stone-100 shadow-xl lg:order-first lg:aspect-[4/5]">
                  {featured.find((f) => f.id === activeTestId)?.coverImage ? (
                    <img
                      key={activeTestId}
                      src={featured.find((f) => f.id === activeTestId)?.coverImage}
                      alt="Program cover"
                      className="h-full w-full object-cover duration-500 animate-in fade-in"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-stone-200 text-stone-400">
                      <FileText className="h-16 w-16 opacity-30" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col">
                  <div className="mb-12 flex flex-col">
                    {featured.slice(0, 6).map((t) => {
                      const isActive = t.id === activeTestId;
                      return (
                        <button
                          key={t.id}
                          onMouseEnter={() => setActiveTestId(t.id)}
                          onClick={() => setActiveTestId(t.id)}
                          className={`border-b border-stone-200 py-6 text-left transition-colors duration-300 ${
                            isActive
                              ? "border-stone-400 text-stone-900"
                              : "text-stone-400 hover:text-stone-600"
                          }`}
                        >
                          <h3 className="text-2xl font-medium tracking-tight sm:text-3xl">
                            {t.title}
                          </h3>
                        </button>
                      );
                    })}
                  </div>

                  <div className="min-h-[200px] rounded-sm border border-stone-100 bg-white p-8 shadow-sm">
                    {featured.map(
                      (t) =>
                        t.id === activeTestId && (
                          <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <h4 className="mb-3 text-xl font-medium">
                              Learn {t.subject || t.title} from the best
                            </h4>
                            <p className="mb-6 line-clamp-3 font-light leading-relaxed text-stone-600">
                              {t.description ||
                                "The program is designed to equip students with a strong foundation in the chosen subject, preparing them for advanced challenges."}
                            </p>
                            <div className="mt-auto flex items-center justify-between">
                              <span
                                className={`text-lg font-medium ${t.price === "Included" || t.price == 0 ? "text-[#eb5a28]" : "text-stone-900"}`}
                              >
                                {t.price === "Included" || t.price == 0
                                  ? "Free Access"
                                  : `₹${t.price}`}
                              </span>
                              <Link to="/login?role=student">
                                <Button className="rounded-full bg-[#1a1a1a] text-white hover:bg-[#333]">
                                  Apply Now
                                </Button>
                              </Link>
                            </div>
                          </motion.div>
                        )
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Part 2: NEW CUET Test Series Cards */}
          <div>
            <div className="mb-12 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-4xl font-medium tracking-tight text-stone-900 sm:text-5xl">
                  Subject-wise Test Series
                </h2>
                <p className="mt-4 text-lg font-light text-stone-500">
                  Master individual subjects with comprehensive mocks.
                </p>
              </div>
              <Link to="/login?role=student">
                <Button className="rounded-full bg-[#3424d1] px-6 text-white hover:bg-[#281baf]">
                  View All Subjects <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {cuetSubjects.map((subject, idx) => (
                <div
                  key={idx}
                  className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-6 transition-all hover:shadow-xl"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold text-stone-900">{subject.name}</h3>
                      <p className="mt-1 text-sm text-stone-500">{subject.total} Total Tests</p>
                    </div>
                    {/* Simulated Logo/Checkmark from inspiration image */}
                    <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-orange-500">
                      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-green-600"></div>
                      <CheckCircle2 className="relative z-10 h-6 w-6 text-white" />
                    </div>
                  </div>

                  <div className="mb-6">
                    <span className="inline-block rounded-sm bg-green-600 px-3 py-1 text-xs font-bold text-white">
                      {subject.free} Free Test(s)
                    </span>
                  </div>

                  <div className="mb-8 flex items-center gap-3">
                    <span className="flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs text-stone-600">
                      <FileText className="h-3 w-3" /> {subject.lang}
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs text-stone-600">
                      <Users className="h-3 w-3" /> {subject.attempts} attempted
                    </span>
                  </div>

                  <Link to="/login?role=student" className="mt-auto w-full">
                    <Button
                      variant="outline"
                      className="w-full rounded-xl border-stone-300 text-stone-700 transition-colors hover:border-[#3424d1] hover:bg-[#3424d1] hover:text-white"
                    >
                      Get Started
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS SECTION */}
      <section className="bg-white py-24">
        <div className="container mx-auto px-4 md:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-24">
            <div>
              <h2 className="text-5xl font-medium leading-[1.05] tracking-tight text-stone-900 sm:text-6xl lg:text-[4.5rem]">
                Happy students sharing experiences :
              </h2>
            </div>
            <div>
              <p className="mb-8 text-sm font-light uppercase tracking-widest text-stone-500">
                Inspired Journeys, Honest Reflections.
              </p>
              {!testimonials || testimonials.length === 0 ? (
                <p className="font-light text-stone-400">No reflections added yet.</p>
              ) : (
                <div className="space-y-16">
                  {testimonials.slice(0, 2).map((t, idx) => (
                    <motion.div
                      key={`${t.name}-${idx}`}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6 }}
                      className="flex flex-col gap-6"
                    >
                      <p className="text-2xl font-light leading-snug text-stone-800 sm:text-3xl">
                        "{t.text}"
                      </p>
                      <div className="mt-2 flex items-center gap-4">
                        <Avatar className="h-14 w-14 border border-stone-200">
                          <AvatarImage src={t.avatar} />
                          <AvatarFallback className="bg-stone-200 text-stone-600">
                            {initials(t.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-lg font-medium text-stone-900">{t.name}</p>
                          <p className="mt-0.5 text-sm text-stone-500">
                            {t.course || "Student"}
                            {t.rating ? ` • ${t.rating} Stars` : ""}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* NEW CONTACT SECTION */}
      <section id="contact" className="bg-[#1a1a1a] py-32 text-white">
        <div className="container mx-auto flex flex-col items-center px-4 text-center md:px-8">
          <h2 className="mb-6 text-5xl font-medium tracking-tight sm:text-7xl">Let's Talk.</h2>
          <p className="mb-16 max-w-2xl text-xl font-light text-stone-400">
            Have questions about our programs or need mentorship? Reach out directly to our team. We
            are here to help you succeed.
          </p>

          <div className="w-full max-w-4xl rounded-3xl border border-stone-800 bg-[#242424] p-10 shadow-2xl md:p-16">
            {tenant.contact?.email ? (
              <a
                href={`mailto:${tenant.contact.email}`}
                className="mb-8 block break-words text-3xl font-medium text-white transition-colors hover:text-[#3424d1] sm:text-4xl md:text-5xl"
              >
                {tenant.contact.email}
              </a>
            ) : (
              <p className="mb-8 text-2xl text-stone-500">Contact email not provided.</p>
            )}

            <div className="mt-8 flex flex-col items-center justify-center gap-8 border-t border-stone-700 pt-8 text-lg font-light text-stone-300 sm:flex-row">
              {tenant.contact?.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-[#eb5a28]" />
                  <span>{tenant.contact.phone}</span>
                </div>
              )}
              {tenant.contact?.address && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-[#eb5a28]" />
                  <span>{tenant.contact.address}</span>
                </div>
              )}
            </div>

            <div className="mt-12 flex justify-center gap-6">
              {Object.entries(socials).map(([k, v]) => {
                const Icon = socialIconMap[k];
                if (!Icon) return null;
                return (
                  <a
                    key={k}
                    href={v}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-stone-800 p-4 shadow-lg transition-all hover:scale-110 hover:bg-[#3424d1] hover:text-white"
                    title={k}
                  >
                    <Icon className="h-6 w-6" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* NEW PRE-FOOTER CTA CARD */}
      <section className="bg-[#fcfaf8] py-16">
        <div className="container mx-auto px-4 md:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#7a5af8] to-[#5b3cdd] p-10 text-center text-white shadow-2xl md:p-16">
            {/* Decorative background elements */}
            <div className="absolute left-0 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl"></div>
            <div className="absolute bottom-0 right-0 h-64 w-64 translate-x-1/2 translate-y-1/2 rounded-full bg-black/10 blur-3xl"></div>

            <div className="relative z-10 mx-auto max-w-3xl">
              <span className="mb-6 inline-block rounded-full border border-white/30 bg-white/20 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
                🚀 No Payment Required for Trial
              </span>
              <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
                Ready to Begin Your Journey at {coachingName}?
              </h2>
              <p className="mb-10 text-lg font-light text-white/80">
                Experience the real exam environment before you commit. Start your free trial today
                and access premium study material.
              </p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Link to="/login?role=student">
                  <Button className="w-full rounded-full bg-white px-8 py-6 text-lg font-semibold text-[#5b3cdd] shadow-lg transition-transform hover:scale-105 hover:bg-stone-100 sm:w-auto">
                    Get Started For Free <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="#contact">
                  <Button
                    variant="outline"
                    className="w-full rounded-full border-white/50 bg-transparent px-8 py-6 text-lg font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
                  >
                    Book a Demo
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#111] py-16 text-stone-400">
        <div className="container mx-auto px-4 md:px-8">
          <div className="mb-16 grid gap-12 md:grid-cols-4 md:gap-8">
            <div className="md:col-span-1">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-stone-900 shadow-sm">
                  <span className="text-lg font-bold">
                    {coachingName?.trim()?.[0]?.toUpperCase() || "U"}
                  </span>
                </div>
                <span className="text-2xl font-medium tracking-tight text-white">
                  {coachingName}
                </span>
              </div>
              <p className="font-light leading-relaxed text-stone-400">{tagline}</p>
            </div>

            <div>
              <h4 className="mb-6 text-sm font-medium uppercase tracking-wider text-white">
                Explore
              </h4>
              <div className="space-y-3 font-light">
                <a className="block cursor-pointer transition-colors hover:text-white" href="#top">
                  Home
                </a>
                <a
                  className="block cursor-pointer transition-colors hover:text-white"
                  href="#features"
                >
                  Features
                </a>
                <a
                  className="block cursor-pointer transition-colors hover:text-white"
                  href="#tests"
                >
                  Programs & Tests
                </a>
                <Link className="block transition-colors hover:text-white" to="/login?role=student">
                  Student Portal
                </Link>
              </div>
            </div>

            <div>
              <h4 className="mb-6 text-sm font-medium uppercase tracking-wider text-white">
                Contact Us
              </h4>
              <div className="space-y-4 font-light">
                {tenant.contact?.address && (
                  <p className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" />
                    <span>{tenant.contact.address}</span>
                  </p>
                )}
                {tenant.contact?.phone && (
                  <p className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-stone-500" />
                    <a
                      className="transition-colors hover:text-white"
                      href={`tel:${tenant.contact.phone}`}
                    >
                      {tenant.contact.phone}
                    </a>
                  </p>
                )}
                {tenant.contact?.email && (
                  <p className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-stone-500" />
                    <a
                      className="transition-colors hover:text-white"
                      href={`mailto:${tenant.contact.email}`}
                    >
                      {tenant.contact.email}
                    </a>
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-6 text-sm font-medium uppercase tracking-wider text-white">
                Connect
              </h4>
              <div className="mb-8 flex gap-4">
                {Object.entries(socials).map(([k, v]) => {
                  const Icon = socialIconMap[k];
                  if (!Icon) return null;
                  return (
                    <a
                      key={k}
                      href={v}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-stone-800 p-3 transition-all hover:bg-[#3424d1] hover:text-white"
                      title={k}
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  );
                })}
              </div>
              <p className="text-xs font-light text-stone-500">
                Powered by PREPAREKARO.IN to help educators publish and scale.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-stone-800 pt-8 text-xs font-light md:flex-row">
            <span>
              © {new Date().getFullYear()} {coachingName}. All rights reserved.
            </span>
            <div className="flex gap-6">
              <Link to="/privacy-policy" className="hover:text-white">
                Privacy Policy
              </Link>
              <Link to="/terms-of-use" className="hover:text-white">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
