import { motion } from "framer-motion";
import { ButtonWithIcon } from "@shared/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router-dom";

export function HeroSection() {
  return (
    <section className="section-padding section-1 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-10 top-20 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-20 left-10 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="container-main relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left - Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Trust badge */}
            {/* <motion.div
              className="inline-flex items-center gap-3 bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-full px-5 py-2.5 mb-8"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="flex -space-x-2">
                {["T", "E", "R"].map((letter, i) => (
                  <div
                    key={letter}
                    className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-[10px] text-white font-bold border-2 border-background"
                    style={{ zIndex: 3 - i }}
                  >
                    {letter}
                  </div>
                ))}
              </div>
              <span className="text-sm font-semibold text-foreground">
                Trusted by 100+ educators
              </span>
            </motion.div> */}

            {/* Headline */}
            <h1 className="mb-6 text-balance text-4xl font-extrabold leading-[1.1] text-foreground sm:text-5xl lg:text-6xl">
              Launch Your Own CUET Test Platform in{" "}
              <span className="animate-pulse bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_auto] bg-clip-text text-transparent">
                Minutes
              </span>
            </h1>

            {/* Subtext */}
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-muted-foreground lg:text-xl">
              <strong className="text-foreground">Preparekaro.in</strong> is a CUET test series
              platform crafted by top academic teams and subject experts, built specifically for
              coaching centers.
            </p>

            {/* CTA Buttons */}
            <motion.div
              className="mb-10 flex flex-wrap gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Link to="/signup">
                <ButtonWithIcon variant="hero" size="xl" className="group">
                  Get Started for Free
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </ButtonWithIcon>
              </Link>
              <a
                href="https://calendly.com/info-univlive"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ButtonWithIcon variant="heroOutline" size="xl">
                  Book a Demo
                </ButtonWithIcon>
              </a>
            </motion.div>

            {/* Google Rating */}
            {/* <motion.div
              className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border shadow-soft inline-flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <div className="w-px h-6 bg-border" />
              <span className="text-muted-foreground text-sm">4.5+ Ratings on</span>
              <div className="flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="font-semibold text-foreground">Google</span>
              </div>
            </motion.div> */}
          </motion.div>

          {/* Right - YouTube Video */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            {/* Decorative elements */}
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-primary to-accent opacity-20 blur-2xl" />
            <div className="absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-gradient-to-br from-accent to-primary opacity-20 blur-2xl" />

            <div className="shadow-elevated group relative aspect-video overflow-hidden rounded-3xl border-2 border-border bg-gradient-to-br from-primary/5 to-accent/5">
              <iframe
                src="https://www.youtube.com/embed/KdVzlfhzDpc"
                title="Preparekaro.in Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full rounded-3xl"
              />

              {/* Play button overlay hint */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/90 shadow-lg">
                  <Play className="ml-1 h-6 w-6 text-white" fill="white" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
