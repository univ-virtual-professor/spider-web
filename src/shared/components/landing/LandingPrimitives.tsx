import { useEffect, useRef, type ReactNode } from "react";

// Shared color tokens + building blocks for the marketing site's "today's PrepareKaro
// style" (navy/blue, Plus Jakarta Sans headings, Inter body, pill badges, pastel tints).
// Used by Index.tsx, Features.tsx, HowItWorks.tsx and the /features/* pages so the four
// pages stay visually consistent instead of each re-declaring the same constants.
export const NAVY = "#08183A";
export const ACCENT_500 = "#0066FF";
export const ACCENT_DEEP = "#0041A3";
export const ACCENT_50 = "#EEF4FF";
export const ACCENT_100 = "#DCE9FF";

// ─── SCROLL-REVEAL WRAPPER ────────────────────────────────────────────────────
export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
  id,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} id={id} className={`reveal ${className}`} style={style}>
      {children}
    </div>
  );
}

// ─── SHARED PILL / BADGE ──────────────────────────────────────────────────────
export function SectionBadge({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: dark ? "rgba(255,255,255,0.06)" : "#fff",
        border: `1px solid ${dark ? "rgba(255,255,255,0.15)" : ACCENT_100}`,
        borderRadius: 100,
        padding: "8px 14px",
        boxShadow: dark ? "none" : "0 2px 12px -2px rgba(8,24,58,0.08)",
      }}
    >
      <span
        className="pulse-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: ACCENT_500,
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: dark ? "#7FAEFF" : "#0052CC",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {label}
      </span>
    </span>
  );
}

// Plus Jakarta Sans at weight 800 renders a visible gap before a full stop ("."), because
// the glyph carries wide left-side-bearing at that weight. `TightStop` nudges just the
// period left so headlines that use sentence punctuation don't show that gap.
export function TightStop() {
  return <span style={{ marginLeft: "-0.07em" }}>.</span>;
}

// ─── SECTION HEADING ──────────────────────────────────────────────────────────
export function SectionHeading({
  badge,
  title,
  description,
  dark = false,
}: {
  badge: string;
  title: ReactNode;
  description?: ReactNode;
  dark?: boolean;
}) {
  return (
    <Reveal style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <SectionBadge label={badge} dark={dark} />
      </div>
      <h2
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(26px,3.5vw,40px)",
          color: dark ? "#fff" : NAVY,
          letterSpacing: "-0.5px",
          lineHeight: 1.25,
          marginTop: 16,
          marginBottom: 0,
        }}
      >
        {title}
      </h2>
      {description ? (
        <p
          style={{
            fontSize: 16,
            color: dark ? "rgba(255,255,255,0.55)" : `${NAVY}8c`,
            marginTop: 16,
            lineHeight: 1.7,
          }}
        >
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
