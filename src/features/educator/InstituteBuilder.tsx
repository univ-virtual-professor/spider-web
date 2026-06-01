import { useState, useEffect, useRef } from "react";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import {
  Monitor,
  Smartphone,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Brain,
  Target,
  Trophy,
  Clock,
  Star,
  Award,
  Book,
  Users,
  CheckCircle2,
  ArrowRight,
  Zap,
  Instagram,
  Youtube,
  Facebook,
  Twitter,
  Linkedin,
  Globe,
  Github,
  Phone,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────
export type ThemeKey =
  | "indigo"
  | "emerald"
  | "crimson"
  | "slate"
  | "amber"
  | "violet"
  | "midnight"
  | "forest"
  | "ocean"
  | "rose"
  | "sky"
  | "teal"
  | "premium"
  | "charcoal"
  | "plum"
  | "mint"
  | "coffee"
  | "steel"
  | "cyber"
  | "earth"
  | "berry"
  | "sunset"
  | "cyan"
  | "lemon"
  | "lavender";

export interface Theme {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  text: string;
  surface: string;
  useGradient?: boolean;
}

export interface Section {
  id: string;
  type: string;
  data: Record<string, any>;
}

interface ComponentProps {
  data: Record<string, any>;
  theme: Theme;
  selected: boolean;
  onClick: () => void;
  previewMode?: boolean;
  instituteName?: string;
  instituteLogo?: string;
  mobile?: boolean;
  useGradient?: boolean;
  sections?: Section[];
}

const ICON_MAP: Record<string, any> = {
  Brain,
  Target,
  Trophy,
  Clock,
  Star,
  Award,
  Book,
  Users,
  CheckCircle2,
  ArrowRight,
  Zap,
};

const ICON_OPTIONS = [
  { name: "Brain", icon: "🧠" },
  { name: "Target", icon: "🎯" },
  { name: "Trophy", icon: "🏆" },
  { name: "Clock", icon: "🕒" },
  { name: "Star", icon: "⭐" },
  { name: "Award", icon: "🏅" },
  { name: "Book", icon: "📖" },
  { name: "Users", icon: "👥" },
  { name: "CheckCircle2", icon: "✅" },
  { name: "ArrowRight", icon: "➡️" },
  { name: "Zap", icon: "⚡" },
];

interface EditorField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "image" | "cta-link" | "icon";
  options?: string[];
  arrayKey?: string;
  subKey?: string;
}

function resolveCtaUrl(url?: string) {
  if (!url) return "#";
  const trimmed = String(url).trim();
  if (!trimmed) return "#";
  // Section anchor (e.g. #courses) — pass through as-is
  if (trimmed.startsWith("#")) return trimmed;
  if (trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://"))
    return trimmed;
  return `https://${trimmed}`;
}

export function createCustomTheme(primaryHex: string, useGradient?: boolean): Theme {
  const hex = primaryHex.startsWith("#") ? primaryHex : `#${primaryHex}`;
  const isValid = /^#([0-9A-F]{3}){1,2}$/i.test(hex);
  const base = isValid ? hex : "#4f46e5";

  const lighten = (color: string, percent: number) => {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    return (
      "#" +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)
    );
  };

  return {
    primary: base,
    secondary: lighten(base, 20),
    accent: "#f59e0b",
    bg: lighten(base, 94),
    text: "#1e1b4b",
    surface: "#ffffff",
    useGradient,
  };
}

function handleCtaClick(e: React.MouseEvent, url?: string) {
  e.stopPropagation();
  const target = resolveCtaUrl(url);
  if (target === "#") return;

  // Smooth scroll to a canvas section anchor
  if (target.startsWith("#")) {
    const id = target.substring(1);

    // 1. Try finding by ID (stable unique ID)
    // 2. Fallback to data-section-type (legacy type-based anchors)
    const el = document.getElementById(id) || document.querySelector(`[data-section-type="${id}"]`);

    if (el) {
      // 52px for live sticky nav, 80px for builder header
      const yOffset = document.getElementById("builder-preview-scroll") ? -80 : -52;

      const scrollContainer = document.getElementById("builder-preview-scroll");

      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const relativeTop = elRect.top - containerRect.top + scrollContainer.scrollTop + yOffset;
        scrollContainer.scrollTo({
          top: relativeTop,
          behavior: "smooth",
        });
      } else {
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({
          top: y,
          behavior: "smooth",
        });
      }
    } else {
      console.warn(`[CTA Debug] Failed to find scroll target for ${target}`);
    }
    return;
  }

  if (target.startsWith("/")) {
    window.location.href = target;
    return;
  }
  window.open(target, "_blank", "noopener,noreferrer");
}

const SOCIAL_ICONS: Record<string, any> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  twitter: Twitter,
  linkedin: Linkedin,
  website: Globe,
  github: Github,
  whatsapp: MessageCircle,
};

// ── Theme Presets ────────────────────────────────────────────
export const THEME_PRESETS: Record<ThemeKey, Theme> = {
  indigo: {
    primary: "#4f46e5",
    secondary: "#818cf8",
    accent: "#f59e0b",
    bg: "#f8f8ff",
    text: "#1e1b4b",
    surface: "#fff",
  },
  emerald: {
    primary: "#059669",
    secondary: "#34d399",
    accent: "#f59e0b",
    bg: "#f0fdf4",
    text: "#064e3b",
    surface: "#fff",
  },
  crimson: {
    primary: "#dc2626",
    secondary: "#f87171",
    accent: "#f59e0b",
    bg: "#fff8f8",
    text: "#7f1d1d",
    surface: "#fff",
  },
  slate: {
    primary: "#0f172a",
    secondary: "#475569",
    accent: "#3b82f6",
    bg: "#f8fafc",
    text: "#0f172a",
    surface: "#fff",
  },
  amber: {
    primary: "#b45309",
    secondary: "#f59e0b",
    accent: "#0369a1",
    bg: "#fffbeb",
    text: "#78350f",
    surface: "#fff",
  },
  violet: {
    primary: "#7c3aed",
    secondary: "#a78bfa",
    accent: "#ec4899",
    bg: "#faf5ff",
    text: "#3b0764",
    surface: "#fff",
  },
  midnight: {
    primary: "#1e293b",
    secondary: "#64748b",
    accent: "#38bdf8",
    bg: "#f1f5f9",
    text: "#0f172a",
    surface: "#fff",
  },
  forest: {
    primary: "#065f46",
    secondary: "#10b981",
    accent: "#f59e0b",
    bg: "#f0fdfa",
    text: "#064e3b",
    surface: "#fff",
  },
  ocean: {
    primary: "#0369a1",
    secondary: "#0ea5e9",
    accent: "#f43f5e",
    bg: "#f0f9ff",
    text: "#0c4a6e",
    surface: "#fff",
  },
  rose: {
    primary: "#9f1239",
    secondary: "#e11d48",
    accent: "#fbbf24",
    bg: "#fff1f2",
    text: "#4c0519",
    surface: "#fff",
  },
  sky: {
    primary: "#0ea5e9",
    secondary: "#7dd3fc",
    accent: "#f59e0b",
    bg: "#f0f9ff",
    text: "#0c4a6e",
    surface: "#fff",
  },
  teal: {
    primary: "#0d9488",
    secondary: "#5eead4",
    accent: "#f43f5e",
    bg: "#f0fdfa",
    text: "#134e4a",
    surface: "#fff",
  },
  premium: {
    primary: "#111827",
    secondary: "#374151",
    accent: "#d4af37",
    bg: "#f9fafb",
    text: "#111827",
    surface: "#fff",
  },
  charcoal: {
    primary: "#36454f",
    secondary: "#708090",
    accent: "#ff7f50",
    bg: "#f5f5f5",
    text: "#2c3e50",
    surface: "#fff",
  },
  plum: {
    primary: "#581c87",
    secondary: "#a855f7",
    accent: "#22c55e",
    bg: "#faf5ff",
    text: "#3b0764",
    surface: "#fff",
  },
  mint: {
    primary: "#059669",
    secondary: "#6ee7b7",
    accent: "#ef4444",
    bg: "#ecfdf5",
    text: "#064e3b",
    surface: "#fff",
  },
  coffee: {
    primary: "#451a03",
    secondary: "#92400e",
    accent: "#0ea5e9",
    bg: "#fffbeb",
    text: "#451a03",
    surface: "#fff",
  },
  steel: {
    primary: "#334155",
    secondary: "#64748b",
    accent: "#f97316",
    bg: "#f8fafc",
    text: "#0f172a",
    surface: "#fff",
  },
  cyber: {
    primary: "#8b5cf6",
    secondary: "#d946ef",
    accent: "#06b6d4",
    bg: "#0f172a",
    text: "#f8fafc",
    surface: "#1e293b",
  },
  earth: {
    primary: "#166534",
    secondary: "#4ade80",
    accent: "#854d0e",
    bg: "#f0fdf4",
    text: "#064e3b",
    surface: "#fff",
  },
  berry: {
    primary: "#be123c",
    secondary: "#fb7185",
    accent: "#10b981",
    bg: "#fff1f2",
    text: "#4c0519",
    surface: "#fff",
  },
  sunset: {
    primary: "#ea580c",
    secondary: "#fb923c",
    accent: "#6366f1",
    bg: "#fff7ed",
    text: "#7c2d12",
    surface: "#fff",
  },
  cyan: {
    primary: "#0891b2",
    secondary: "#67e8f9",
    accent: "#f43f5e",
    bg: "#ecfeff",
    text: "#164e63",
    surface: "#fff",
  },
  lemon: {
    primary: "#a16207",
    secondary: "#eab308",
    accent: "#8b5cf6",
    bg: "#fefce8",
    text: "#713f12",
    surface: "#fff",
  },
  lavender: {
    primary: "#6d28d9",
    secondary: "#a78bfa",
    accent: "#f59e0b",
    bg: "#f5f3ff",
    text: "#4c1d95",
    surface: "#fff",
  },
};

// ── Editor Fields ────────────────────────────────────────────
const EDITOR_FIELDS: Record<string, EditorField[]> = {
  hero: [
    { key: "variant", label: "Layout", type: "select", options: ["centered", "split", "carousel"] },
    { key: "badge", label: "Badge Text", type: "text" },
    { key: "headline", label: "Headline", type: "textarea" },
    { key: "subtext", label: "Sub-text", type: "textarea" },
    { key: "cta1", label: "Primary CTA", type: "text" },
    { key: "cta1Url", label: "Primary CTA Link", type: "cta-link" },
    { key: "cta2", label: "Secondary CTA", type: "text" },
    { key: "cta2Url", label: "Secondary CTA Link", type: "cta-link" },
  ],
  courses: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
    { key: "ctaUrl", label: "Enroll Button Link", type: "cta-link" },
  ],
  faculty: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
    { key: "photo", label: "Member Photos", type: "image", arrayKey: "faculty", subKey: "photo" },
  ],
  results: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
  ],
  testimonials: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
  ],
  gallery: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
    { key: "image", label: "Gallery Images", type: "image", arrayKey: "items", subKey: "image" },
  ],
  faq: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
  ],
  announcement: [
    { key: "label", label: "Label", type: "text" },
    { key: "text", label: "Announcement Text", type: "textarea" },
    { key: "cta", label: "Button Text", type: "text" },
    { key: "ctaUrl", label: "Button Link", type: "cta-link" },
  ],
  pricing: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
    { key: "cta", label: "Button Text", type: "text" },
    { key: "ctaUrl", label: "Button Link", type: "cta-link" },
  ],
  video: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
  ],
  contact: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
    { key: "phone", label: "Phone Number", type: "text" },
    { key: "email", label: "Email", type: "text" },
    { key: "address", label: "Address", type: "text" },
    { key: "cta", label: "Button Text", type: "text" },
    { key: "ctaUrl", label: "Button Link", type: "cta-link" },
  ],
  batches: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
    { key: "cta", label: "Button Text", type: "text" },
    { key: "ctaUrl", label: "Button Link", type: "cta-link" },
  ],
  trust: [],
  app: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
    { key: "desc", label: "Description", type: "textarea" },
    { key: "image", label: "App Screenshot", type: "image" },
    { key: "playStoreUrl", label: "Play Store Link", type: "text" },
    { key: "appStoreUrl", label: "App Store Link", type: "text" },
  ],
  about: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
    { key: "desc", label: "Description", type: "textarea" },
    { key: "image", label: "Mission Image", type: "image" },
  ],
  live: [
    { key: "title", label: "Class Title", type: "text" },
    { key: "subject", label: "Subject", type: "text" },
    { key: "viewers", label: "Viewers Count", type: "text" },
    { key: "cta", label: "Button Text", type: "text" },
    { key: "ctaUrl", label: "Button Link", type: "text" },
  ],
  stats: [],
  blog: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Section Title", type: "text" },
  ],
  countdown: [
    { key: "eyebrow", label: "Eyebrow Text", type: "text" },
    { key: "title", label: "Timer Title", type: "text" },
    { key: "cta", label: "Button Text", type: "text" },
    { key: "ctaUrl", label: "Button Link", type: "cta-link" },
  ],
  footer: [],
};

// ── 20 Website Components ────────────────────────────────────

function HeroCarouselSlide({
  images,
  placeholder,
  style,
}: {
  images: string[];
  placeholder: React.CSSProperties;
  style?: React.CSSProperties;
}) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % images.length);
        setFade(true);
      }, 300);
    }, 3500);
    return () => clearInterval(t);
  }, [images.length]);

  if (!images.length) {
    return (
      <div
        style={{
          ...placeholder,
          ...style,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: "rgba(255,255,255,0.08)",
          border: "2px dashed rgba(255,255,255,0.35)",
          borderRadius: (placeholder as any).borderRadius ?? 16,
        }}
      >
        {/* Image icon */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
          Hero Image
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            textAlign: "center",
            maxWidth: 160,
            lineHeight: 1.5,
          }}
        >
          Upload an image from the editor panel on the right
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", ...style }}>
      <img
        src={images[idx]}
        alt={`Hero ${idx + 1}`}
        style={{
          ...placeholder,
          objectFit: "cover",
          opacity: fade ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
      {images.length > 1 && (
        <>
          <div
            style={{
              position: "absolute",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 8,
            }}
          >
            {images.map((_, i) => (
              <div
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx(i);
                  setFade(true);
                }}
                style={{
                  width: i === idx ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.45)",
                  transition: "all 0.3s",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFade(false);
              setTimeout(() => {
                setIdx((idx - 1 + images.length) % images.length);
                setFade(true);
              }, 200);
            }}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.35)",
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.5)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.35)")}
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFade(false);
              setTimeout(() => {
                setIdx((idx + 1) % images.length);
                setFade(true);
              }, 200);
            }}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.35)",
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.5)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.35)")}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

function HeroComponent({
  data,
  theme: t,
  selected,
  onClick,
  previewMode,
  instituteName,
  instituteLogo,
  mobile,
}: ComponentProps) {
  const variant = data.variant || "centered";
  // heroImages array; fall back to legacy heroImage single string
  const rawImages: string[] = Array.isArray(data.heroImages)
    ? data.heroImages.filter(Boolean)
    : data.heroImage
      ? [data.heroImage]
      : [];

  // Full-width carousel variant slides across the entire hero
  const isCarousel = variant === "carousel";
  const isSplit = variant === "split";

  const s: Record<string, React.CSSProperties> = {
    wrapper: {
      position: "relative",
      background: isCarousel
        ? rawImages.length > 0
          ? "transparent"
          : `linear-gradient(135deg, ${t.primary}22 0%, ${t.primary}11 100%)`
        : t.useGradient
          ? `linear-gradient(135deg, ${t.primary} 0%, ${t.primary}ee 40%, ${t.secondary}dd 100%)`
          : `linear-gradient(135deg, ${t.primary}ee 0%, ${t.primary}aa 60%, ${t.secondary}55 100%)`,
      padding: isCarousel
        ? "20px 0"
        : mobile
          ? "40px 20px"
          : variant === "centered"
            ? "80px 40px"
            : "60px 40px",
      display: "flex",
      // Mobile: always column. On wider containers split = row, else column.
      flexDirection: isSplit ? "row" : "column",
      alignItems: isCarousel ? "stretch" : "center",
      gap: isCarousel ? 0 : 40,
      cursor: "pointer",
      outline: selected ? `3px solid ${t.accent}` : "none",
      outlineOffset: -3,
      overflow: "hidden",
      minHeight: 400,
      flexWrap: "wrap", // wraps to column on narrow containers
    },
    badge: {
      display: "inline-block",
      background: "rgba(255,255,255,0.15)",
      border: "1px solid rgba(255,255,255,0.3)",
      color: "#fff",
      borderRadius: 20,
      padding: "4px 14px",
      fontSize: mobile ? 11 : 12,
      fontWeight: 600,
      letterSpacing: 1,
      marginBottom: 16,
    },
    headline: {
      fontSize: mobile ? (variant === "centered" ? 28 : 24) : variant === "centered" ? 48 : 40,
      fontWeight: 800,
      color: "#fff",
      lineHeight: 1.1,
      marginBottom: 16,
      textAlign: variant === "centered" ? "center" : "left",
    },
    sub: {
      fontSize: mobile ? 14 : 18,
      color: "rgba(255,255,255,0.85)",
      marginBottom: 32,
      maxWidth: 560,
      textAlign: variant === "centered" ? "center" : "left",
      lineHeight: 1.6,
    },
    ctaRow: {
      display: "flex",
      gap: 12,
      justifyContent: variant === "centered" ? "center" : "flex-start",
      flexWrap: "wrap",
    },
    primaryBtn: {
      background: "#fff",
      color: t.primary,
      border: "none",
      borderRadius: 10,
      padding: mobile ? "10px 20px" : "14px 28px",
      fontSize: mobile ? 13 : 15,
      fontWeight: 700,
      cursor: "pointer",
    },
    secondaryBtn: {
      background: "transparent",
      color: "#fff",
      border: "2px solid rgba(255,255,255,0.5)",
      borderRadius: 10,
      padding: mobile ? "10px 20px" : "14px 28px",
      fontSize: mobile ? 13 : 15,
      fontWeight: 600,
      cursor: "pointer",
    },
    statsRow: {
      display: "flex",
      gap: mobile ? 16 : 32,
      marginTop: mobile ? 24 : 40,
      justifyContent: variant === "centered" ? "center" : "flex-start",
    },
    imagePlaceholder: {
      width: 490,
      height: 290,
      background: "rgba(255,255,255,0.1)",
      borderRadius: 16,
      border: "2px dashed rgba(255,255,255,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,0.5)",
      fontSize: 12,
      flexShrink: 0,
    },
    decor1: {
      position: "absolute",
      top: -60,
      right: -60,
      width: 240,
      height: 240,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.05)",
      pointerEvents: "none",
    },
    decor2: {
      position: "absolute",
      bottom: -80,
      left: -40,
      width: 300,
      height: 300,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.04)",
      pointerEvents: "none",
    },
  };

  // Text content block reused by split and carousel
  const textBlock = (align: "left" | "center") => (
    <div
      style={{
        flex: 1,
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        minWidth: 220,
      }}
    >
      {(instituteLogo || instituteName) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 32,
            alignSelf: align === "center" ? "center" : "flex-start",
          }}
        >
          {instituteLogo && (
            <img
              src={instituteLogo}
              alt="logo"
              style={{ height: 40, width: "auto", objectFit: "contain" }}
            />
          )}
          <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>
            {instituteName}
          </span>
        </div>
      )}
      <span style={s.badge}>
        {data.badge || (isCarousel ? "🎯 India's #1 Coaching Platform" : "🎯 Top Ranked Institute")}
      </span>
      <div style={{ ...s.headline, textAlign: align }}>
        {data.headline ||
          (isCarousel
            ? "Crack IIT-JEE & NEET with Expert Guidance"
            : "Your Dream Rank Starts Here")}
      </div>
      <div style={{ ...s.sub, textAlign: align }}>
        {data.subtext || "Expert faculty, AI tools, and a proven system to help you succeed."}
      </div>
      <div style={{ ...s.ctaRow, justifyContent: align === "center" ? "center" : "flex-start" }}>
        <button
          style={{ ...s.primaryBtn, cursor: previewMode ? "pointer" : "default" }}
          onClick={previewMode ? (e) => handleCtaClick(e, data.cta1Url) : undefined}
        >
          {data.cta1 || "Enroll Now"}
        </button>
        <button
          style={{ ...s.secondaryBtn, cursor: previewMode ? "pointer" : "default" }}
          onClick={previewMode ? (e) => handleCtaClick(e, data.cta2Url) : undefined}
        >
          {data.cta2 || "View Courses"}
        </button>
      </div>

      {/* ── Social-proof stats bar ── */}
      {(() => {
        const stats: { num: string; label: string }[] = data.stats || [
          { num: "25+", label: "Years of Experience" },
          { num: "10000+", label: "Students Guided" },
        ];
        if (!stats.length) return null;
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: mobile ? 12 : 20,
              marginTop: mobile ? 16 : 24,
              flexWrap: "wrap",
            }}
          >
            {/* Stat pills */}
            {stats.map((st: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {(() => {
                  const IconComp = ICON_MAP[st.icon];
                  if (!IconComp) return null;
                  return <IconComp size={mobile ? 14 : 16} color="#fff" style={{ opacity: 0.8 }} />;
                })()}
                <span style={{ fontSize: mobile ? 13 : 15, fontWeight: 800, color: "#fff" }}>
                  {st.num}
                </span>
                <span style={{ fontSize: mobile ? 11 : 13, color: "rgba(255,255,255,0.75)" }}>
                  {st.label}
                </span>
                {i < stats.length - 1 && (
                  <div
                    style={{
                      width: 1,
                      height: 16,
                      background: "rgba(255,255,255,0.2)",
                      marginLeft: 6,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );

  return (
    <div
      style={s.wrapper}
      onClick={onClick}
      className={isSplit ? "ib-hero-split" : isCarousel ? "ib-hero-carousel" : ""}
    >
      <div style={s.decor1} />
      <div style={s.decor2} />

      {variant === "centered" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
          <span style={s.badge}>{data.badge || "🎯 India's #1 Coaching Platform"}</span>
          <div style={s.headline}>
            {data.headline || "Crack IIT-JEE & NEET with Expert Guidance"}
          </div>
          <div style={s.sub}>
            {data.subtext ||
              "Join 50,000+ students who cracked their dream exam with our proven methodology."}
          </div>
          <div style={s.ctaRow}>
            <button
              style={{ ...s.primaryBtn, cursor: previewMode ? "pointer" : "default" }}
              onClick={previewMode ? (e) => handleCtaClick(e, data.cta1Url) : undefined}
            >
              {data.cta1 || "Start Free Trial"}
            </button>
            <button
              style={{ ...s.secondaryBtn, cursor: previewMode ? "pointer" : "default" }}
              onClick={previewMode ? (e) => handleCtaClick(e, data.cta2Url) : undefined}
            >
              {data.cta2 || "Watch Demo"}
            </button>
          </div>
          <div style={s.statsRow}>
            {(
              data.stats || [
                { num: "50K+", label: "Students" },
                { num: "98%", label: "Success Rate" },
                { num: "15+", label: "Years" },
              ]
            ).map((st: any, i: number) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: mobile ? 20 : 28, fontWeight: 800, color: "#fff" }}>
                  {st.num}
                </div>
                <div
                  style={{
                    fontSize: mobile ? 10 : 12,
                    color: "rgba(255,255,255,0.7)",
                    marginTop: 2,
                  }}
                >
                  {st.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSplit && (
        <>
          {textBlock("left")}
          <HeroCarouselSlide
            images={rawImages}
            placeholder={s.imagePlaceholder as React.CSSProperties}
            style={{ flexShrink: 0 }}
          />
        </>
      )}

      {isCarousel && (
        <div
          style={{
            width: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            padding: mobile ? "0 16px" : "0 40px",
            zIndex: 1,
          }}
        >
          <HeroCarouselSlide
            images={rawImages}
            placeholder={
              {
                ...s.imagePlaceholder,
                width: "100%",
                height: "auto",
                aspectRatio: mobile ? "16/9" : "21/6",
                minHeight: mobile ? 180 : 300,
                borderRadius: mobile ? 16 : 24,
              } as React.CSSProperties
            }
            style={{
              width: "100%",
              borderRadius: mobile ? 16 : 24,
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
            }}
          />
        </div>
      )}
    </div>
  );
}

function CourseCatalogComponent({
  data,
  theme: t,
  selected,
  onClick,
  previewMode,
  mobile,
}: ComponentProps) {
  const courses = data.courses || [
    {
      name: "JEE Main & Advanced",
      tag: "Engineering",
      students: "2400",
      duration: "2 Years",
      price: "₹45,000",
    },
    {
      name: "NEET Foundation",
      tag: "Medical",
      students: "1800",
      duration: "1 Year",
      price: "₹38,000",
    },
    {
      name: "Class 10 Board Prep",
      tag: "School",
      students: "3200",
      duration: "1 Year",
      price: "₹22,000",
    },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.bg,
        padding: mobile ? "40px 20px" : "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: mobile ? 24 : 40 }}>
        <div
          style={{
            fontSize: mobile ? 12 : 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Our Programs"}
        </div>
        <div style={{ fontSize: mobile ? 24 : 34, fontWeight: 800, color: t.text }}>
          {data.title || "Courses Designed to Get You Results"}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))",
          gap: mobile ? 16 : 24,
        }}
      >
        {courses.map((c: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              background: t.surface,
              borderRadius: 16,
              padding: mobile ? 20 : 24,
              boxShadow: "0 2px 20px rgba(0,0,0,0.06)",
              border: `1px solid ${t.primary}15`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: t.primary,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {c.tag}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.text, marginBottom: 12 }}>
              {c.name}
            </div>
            {c.price ? (
              <>
                <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>👤 {c.students}</span>
                  <span style={{ fontSize: 12, color: "#666" }}>🕐 {c.duration}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "auto",
                  }}
                >
                  <span style={{ fontSize: 20, fontWeight: 800, color: t.primary }}>{c.price}</span>
                  <button
                    style={{
                      background: t.primary,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: previewMode ? "pointer" : "default",
                    }}
                    onClick={previewMode ? (e) => handleCtaClick(e, data.ctaUrl) : undefined}
                  >
                    Enroll
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "auto",
                }}
              >
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>👤 {c.students}</span>
                  <span style={{ fontSize: 12, color: "#666" }}>🕐 {c.duration}</span>
                </div>
                <button
                  style={{
                    background: t.primary,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: previewMode ? "pointer" : "default",
                  }}
                  onClick={previewMode ? (e) => handleCtaClick(e, data.ctaUrl) : undefined}
                >
                  Enroll
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FacultyComponent({ data, theme: t, selected, onClick }: ComponentProps) {
  const faculty = data.faculty || [
    { name: "Dr. Rajesh Kumar", subject: "Physics", exp: "15 yrs", tag: "IIT Delhi Alumni" },
    { name: "Priya Sharma", subject: "Chemistry", exp: "12 yrs", tag: "AIIMS Topper" },
    { name: "Amit Verma", subject: "Mathematics", exp: "18 yrs", tag: "IIT Bombay Alumni" },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        padding: "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Expert Faculty"}
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: t.text }}>
          {data.title || "Learn from the Best in the Country"}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 24,
        }}
      >
        {faculty.map((f: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              textAlign: "center",
              padding: 24,
              background: t.bg,
              borderRadius: 20,
              border: `1px solid ${t.primary}10`,
            }}
          >
            {f.photo ? (
              <img
                src={f.photo}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  objectFit: "cover",
                  margin: "0 auto 16px",
                  display: "block",
                }}
                alt={f.name}
              />
            ) : (
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${t.primary}33, ${t.secondary}33)`,
                  margin: "0 auto 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `3px solid ${t.primary}30`,
                  fontSize: 10,
                  color: t.primary,
                }}
              >
                photo
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 4 }}>
              {f.name}
            </div>
            <div style={{ fontSize: 13, color: t.primary, fontWeight: 600, marginBottom: 8 }}>
              {f.subject}
            </div>
            <div
              style={{
                fontSize: 12,
                background: `${t.primary}10`,
                color: t.primary,
                borderRadius: 20,
                padding: "3px 10px",
                display: "inline-block",
              }}
            >
              {f.tag}
            </div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{f.exp} experience</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsComponent({ data, theme: t, selected, onClick }: ComponentProps) {
  const results = data.results || [
    { name: "Arjun Singh", rank: "AIR 47", exam: "JEE Advanced 2024", tag: "IIT Bombay" },
    { name: "Sneha Patel", rank: "AIR 12", exam: "NEET 2024", tag: "AIIMS Delhi" },
  ];
  const stats = data.stats || [
    { num: "127", label: "IIT Selections 2024" },
    { num: "89", label: "NEET Selections 2024" },
    { num: "98%", label: "Board Toppers" },
    { num: "15+", label: "Years of Excellence" },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: `linear-gradient(135deg, ${t.primary} 0%, ${t.text} 100%)`,
        padding: "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: t.secondary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Our Results"}
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: "#fff" }}>
          {data.title || "Proven Track Record of Excellence"}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 16,
          marginBottom: 48,
          textAlign: "center",
        }}
      >
        {stats.map((s: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{ padding: 20, background: "rgba(255,255,255,0.08)", borderRadius: 16 }}
          >
            {(() => {
              const IconComp = ICON_MAP[s.icon];
              if (!IconComp) return null;
              return <IconComp size={32} color={t.secondary} style={{ marginBottom: 8 }} />;
            })()}
            <div style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>{s.num}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {results.map((r: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              background: "rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: 20,
              border: "1px solid rgba(255,255,255,0.15)",
              textAlign: "center",
            }}
          >
            {r.photo ? (
              <img
                src={r.photo}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  objectFit: "cover",
                  margin: "0 auto 12px",
                  display: "block",
                  border: `2px solid ${t.secondary}`,
                }}
                alt={r.name}
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.1)",
                  margin: "0 auto 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  color: t.secondary,
                  fontWeight: 800,
                  border: `1px solid ${t.secondary}33`,
                }}
              >
                {r.name?.[0] || "S"}
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 800, color: t.secondary }}>{r.rank}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 4 }}>
              {r.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
              {r.exam}
            </div>
            <div
              style={{
                fontSize: 11,
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                borderRadius: 20,
                padding: "2px 10px",
                display: "inline-block",
                marginTop: 8,
              }}
            >
              {r.tag}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestimonialsComponent({ data, theme: t, selected, onClick }: ComponentProps) {
  const reviews = data.reviews || [
    {
      name: "Priya M.",
      role: "IIT Delhi, CS 2024",
      text: "The faculty here is exceptional. Got AIR 234!",
    },
    {
      name: "Karan S.",
      role: "AIIMS Delhi, MBBS 2024",
      text: "Best coaching for NEET. The test series were game changers.",
    },
    {
      name: "Ananya R.",
      role: "Class 12, Batch 2025",
      text: "The AI doubt chatbot saved me so many hours during exams.",
    },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.bg,
        padding: "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Student Stories"}
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: t.text }}>
          {data.title || "What Our Students Say"}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 24,
        }}
      >
        {reviews.map((r: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              background: t.surface,
              borderRadius: 20,
              padding: 28,
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              border: `1px solid ${t.primary}10`,
              position: "relative",
            }}
          >
            <div
              style={{
                fontSize: 40,
                color: t.primary,
                opacity: 0.2,
                lineHeight: 1,
                marginBottom: 12,
              }}
            >
              "
            </div>
            <div style={{ fontSize: 14, color: "#555", lineHeight: 1.7, marginBottom: 20 }}>
              {r.text}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {r.photo ? (
                <img
                  src={r.photo}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                  alt={r.name}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: `${t.primary}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: t.primary,
                  }}
                >
                  {(r.name || "S")
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .substring(0, 2)}
                </div>
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{r.name}</div>
                <div style={{ fontSize: 12, color: t.primary }}>{r.role}</div>
              </div>
            </div>
            <div style={{ position: "absolute", top: 20, right: 20, display: "flex", gap: 2 }}>
              {Array.from({ length: 5 }).map((_, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 12,
                    color: idx < (Number(r.rating) || 5) ? t.accent : "#e5e7eb",
                  }}
                >
                  ★
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GalleryComponent({ data, theme: t, selected, onClick }: ComponentProps) {
  const items = data.items || [
    { caption: "Annual Result Celebration" },
    { caption: "Lab Sessions" },
    { caption: "Faculty Workshop" },
    { caption: "Online Class Setup" },
    { caption: "Award Ceremony" },
    { caption: "Student Orientation" },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        padding: "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Campus Life"}
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: t.text }}>
          {data.title || "Life at Our Institute"}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {items.map((item: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              borderRadius: 12,
              aspectRatio: "4/3",
              background: `repeating-linear-gradient(45deg, ${t.primary}08, ${t.primary}08 10px, ${t.primary}04 10px, ${t.primary}04 20px)`,
              border: `1px dashed ${t.primary}30`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              overflow: "hidden",
            }}
          >
            {item.image ? (
              <img
                src={item.image}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }}
                alt={item.caption}
              />
            ) : (
              <>
                <div style={{ fontSize: 10, color: t.primary, opacity: 0.5 }}>photo</div>
                <div style={{ fontSize: 11, color: t.text, opacity: 0.6 }}>{item.caption}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FAQComponent({ data, theme: t, selected, onClick }: ComponentProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqs = data.faqs || [
    {
      q: "What is the batch size?",
      a: "We maintain small batch sizes of 30-40 students for personalized attention.",
    },
    {
      q: "Do you offer online classes?",
      a: "Yes! Both live online and recorded sessions available.",
    },
    {
      q: "What is your fee structure?",
      a: "Fee varies by course. EMI options and scholarships available.",
    },
    {
      q: "Is there doubt clearing?",
      a: "Daily doubt sessions, AI chatbot 24/7, and dedicated faculty hours.",
    },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.bg,
        padding: "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: t.primary,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {data.eyebrow || "FAQ"}
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: t.text }}>
            {data.title || "Frequently Asked Questions"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {faqs.map((faq: any, i: number) => (
            <div
              key={i}
              style={{
                background: t.surface,
                borderRadius: 14,
                border: `1px solid ${openIdx === i ? t.primary : t.primary + "15"}`,
                overflow: "hidden",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setOpenIdx(openIdx === i ? null : i);
              }}
            >
              <div
                style={{
                  padding: "18px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{faq.q}</span>
                <span
                  style={{
                    fontSize: 20,
                    color: t.primary,
                    transform: openIdx === i ? "rotate(45deg)" : "none",
                    transition: "transform 0.2s",
                  }}
                >
                  +
                </span>
              </div>
              {openIdx === i && (
                <div
                  style={{ padding: "0 24px 18px", fontSize: 14, color: "#666", lineHeight: 1.7 }}
                >
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnnouncementComponent({
  data,
  theme: t,
  selected,
  onClick,
  previewMode,
  mobile,
}: ComponentProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: `${t.primary}10`,
        borderLeft: `4px solid ${t.primary}`,
        padding: mobile ? "16px 20px" : "16px 40px",
        display: "flex",
        flexDirection: mobile ? "column" : "row",
        alignItems: mobile ? "flex-start" : "center",
        gap: mobile ? 12 : 16,
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 20 }}>📢</span>
        {mobile && (
          <span style={{ fontSize: 13, fontWeight: 700, color: t.primary }}>
            {data.label || "Announcement"}
          </span>
        )}
      </div>
      <div style={{ flex: 1 }}>
        {!mobile && (
          <span style={{ fontSize: 13, fontWeight: 700, color: t.primary, marginRight: 8 }}>
            {data.label || "New Batch Starting:"}
          </span>
        )}
        <span style={{ fontSize: 13, color: t.text, lineHeight: 1.5 }}>
          {data.text || "JEE 2026 Dropper Batch begins June 1st. Limited seats available."}
        </span>
      </div>
      <button
        style={{
          background: t.primary,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: previewMode ? "pointer" : "default",
          whiteSpace: "nowrap",
          width: mobile ? "100%" : "auto",
        }}
        onClick={previewMode ? (e) => handleCtaClick(e, data.ctaUrl) : undefined}
      >
        {data.cta || "Register Now"}
      </button>
    </div>
  );
}

function PricingComponent({
  data,
  theme: t,
  selected,
  onClick,
  previewMode,
  mobile,
}: ComponentProps) {
  const plans = data.plans || [
    {
      name: "Foundation",
      price: "₹15,000",
      period: "/year",
      features: ["Live Classes", "Recorded Lectures", "Test Series"],
      popular: false,
    },
    {
      name: "Pro",
      price: "₹35,000",
      period: "/year",
      features: ["Everything in Foundation", "AI Doubt Bot", "Mentorship", "Mock Tests"],
      popular: true,
    },
    {
      name: "Elite",
      price: "₹65,000",
      period: "/year",
      features: ["Everything in Pro", "1-on-1 Sessions", "Rank Predictor"],
      popular: false,
    },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.bg,
        padding: mobile ? "40px 20px" : "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: mobile ? 24 : 40 }}>
        <div
          style={{
            fontSize: mobile ? 12 : 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Pricing"}
        </div>
        <div style={{ fontSize: mobile ? 24 : 34, fontWeight: 800, color: t.text }}>
          {data.title || "Simple, Transparent Pricing"}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: mobile ? 20 : 24,
          maxWidth: 860,
          margin: "0 auto",
          paddingTop: mobile ? 20 : 0,
        }}
      >
        {plans.map((p: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              background: p.popular ? t.primary : t.surface,
              borderRadius: 20,
              padding: mobile ? 24 : 28,
              position: "relative",
              boxShadow: p.popular ? `0 12px 40px ${t.primary}40` : "0 2px 16px rgba(0,0,0,0.06)",
              border: p.popular ? "none" : `1px solid ${t.primary}10`,
              transform: p.popular && !mobile ? "scale(1.04)" : "none",
            }}
          >
            {p.popular && (
              <div
                style={{
                  position: "absolute",
                  top: -12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: t.accent,
                  color: "#fff",
                  borderRadius: 20,
                  padding: "4px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  zIndex: 1,
                }}
              >
                Most Popular
              </div>
            )}
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: p.popular ? "rgba(255,255,255,0.8)" : t.primary,
                marginBottom: 8,
              }}
            >
              {p.name}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}>
              <span
                style={{
                  fontSize: mobile ? 30 : 36,
                  fontWeight: 800,
                  color: p.popular ? "#fff" : t.text,
                }}
              >
                {p.price}
              </span>
              <span style={{ fontSize: 13, color: p.popular ? "rgba(255,255,255,0.6)" : "#999" }}>
                {p.period}
              </span>
            </div>
            {p.features.map((f: string, fi: number) => (
              <div
                key={fi}
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
              >
                <span
                  style={{ color: p.popular ? "rgba(255,255,255,0.7)" : t.primary, fontSize: 14 }}
                >
                  ✓
                </span>
                <span
                  style={{ fontSize: 13, color: p.popular ? "rgba(255,255,255,0.85)" : "#555" }}
                >
                  {f}
                </span>
              </div>
            ))}
            <button
              style={{
                width: "100%",
                marginTop: 24,
                padding: 12,
                borderRadius: 10,
                border: p.popular ? "2px solid rgba(255,255,255,0.4)" : `2px solid ${t.primary}`,
                background: p.popular ? "rgba(255,255,255,0.1)" : "transparent",
                color: p.popular ? "#fff" : t.primary,
                fontSize: 14,
                fontWeight: 700,
                cursor: previewMode ? "pointer" : "default",
              }}
              onClick={previewMode ? (e) => handleCtaClick(e, data.ctaUrl) : undefined}
            >
              {data.cta || "Get Started"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoComponent({ data, theme: t, selected, onClick }: ComponentProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        padding: "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Watch & Learn"}
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: t.text, marginBottom: 32 }}>
          {data.title || "See How We Transform Students"}
        </div>
        <div
          style={{
            borderRadius: 20,
            background: `repeating-linear-gradient(45deg, ${t.primary}08, ${t.primary}08 10px, ${t.primary}04 10px, ${t.primary}04 20px)`,
            border: `2px dashed ${t.primary}30`,
            aspectRatio: "16/9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: t.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 8px 32px ${t.primary}60`,
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "14px solid transparent",
                borderBottom: "14px solid transparent",
                borderLeft: "24px solid #fff",
                marginLeft: 6,
              }}
            ></div>
          </div>
          <div style={{ fontSize: 11, color: t.primary, opacity: 0.5 }}>
            video embed / youtube url
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactFormComponent({ data, theme: t, selected, onClick, previewMode }: ComponentProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: t.bg,
        padding: "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 40,
          maxWidth: 900,
          margin: "0 auto",
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: t.primary,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {data.eyebrow || "Get in Touch"}
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: t.text, marginBottom: 16 }}>
            {data.title || "Book a Free Counselling Session"}
          </div>
          {[
            { icon: "📞", label: data.phone || "+91 98765 43210" },
            { icon: "✉️", label: data.email || "hello@institute.com" },
            { icon: "📍", label: data.address || "123 Education Hub, Delhi" },
          ].map((c, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}
            >
              <span style={{ fontSize: 16 }}>{c.icon}</span>
              <span style={{ fontSize: 14, color: t.text }}>{c.label}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            background: t.surface,
            borderRadius: 20,
            padding: 32,
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
          {["Full Name", "Phone Number", "Email Address", "Course Interest"].map((label, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 6 }}>
                {label}
              </div>
              <div
                style={{
                  height: 40,
                  borderRadius: 8,
                  border: `1.5px solid ${t.primary}25`,
                  background: t.bg,
                }}
              ></div>
            </div>
          ))}
          <button
            style={{
              width: "100%",
              padding: 13,
              background: t.primary,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: previewMode ? "pointer" : "default",
            }}
            onClick={previewMode ? (e) => handleCtaClick(e, data.ctaUrl) : undefined}
          >
            {data.cta || "Submit Enquiry"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchScheduleComponent({
  data,
  theme: t,
  selected,
  onClick,
  previewMode,
  mobile,
}: ComponentProps) {
  const batches = data.batches || [
    {
      name: "JEE 2026 Morning Batch",
      time: "Mon–Sat, 7:00 AM – 10:00 AM",
      seats: "8 seats left",
      mode: "Hybrid",
      tag: "Filling Fast",
    },
    {
      name: "NEET Weekend Intensive",
      time: "Sat–Sun, 9:00 AM – 5:00 PM",
      seats: "15 seats left",
      mode: "Online",
      tag: "New",
    },
    {
      name: "Class 10 Evening Batch",
      time: "Mon–Fri, 5:00 PM – 7:30 PM",
      seats: "12 seats left",
      mode: "Offline",
      tag: "",
    },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        padding: mobile ? "40px 20px" : "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: mobile ? 24 : 40 }}>
        <div
          style={{
            fontSize: mobile ? 12 : 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Upcoming Batches"}
        </div>
        <div style={{ fontSize: mobile ? 24 : 34, fontWeight: 800, color: t.text }}>
          {data.title || "Find Your Perfect Schedule"}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 800,
          margin: "0 auto",
        }}
      >
        {batches.map((b: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              background: t.bg,
              borderRadius: 14,
              padding: mobile ? "16px" : "20px 24px",
              display: "flex",
              flexDirection: mobile ? "column" : "row",
              alignItems: mobile ? "flex-start" : "center",
              gap: mobile ? 16 : 24,
              border: `1px solid ${t.primary}10`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%" }}>
              <div
                style={{
                  width: mobile ? 40 : 48,
                  height: mobile ? 40 : 48,
                  borderRadius: 12,
                  background: `${t.primary}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: mobile ? 16 : 20,
                  flexShrink: 0,
                }}
              >
                📅
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: mobile ? 14 : 15, fontWeight: 700, color: t.text }}>
                    {b.name}
                  </span>
                  {b.tag && !mobile && (
                    <span
                      style={{
                        fontSize: 10,
                        background: t.accent,
                        color: "#fff",
                        borderRadius: 20,
                        padding: "2px 8px",
                        fontWeight: 700,
                      }}
                    >
                      {b.tag}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: mobile ? 12 : 13, color: "#666" }}>{b.time}</div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                gap: 12,
              }}
            >
              <div style={{ textAlign: "left", flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: t.primary, fontWeight: 600, marginBottom: 4 }}>
                  {b.seats}
                  {mobile && b.tag && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        background: t.accent,
                        color: "#fff",
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontWeight: 700,
                      }}
                    >
                      {b.tag}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    background: `${t.primary}15`,
                    color: t.primary,
                    borderRadius: 6,
                    padding: "2px 8px",
                    display: "inline-block",
                  }}
                >
                  {b.mode}
                </div>
              </div>
              <button
                style={{
                  background: t.primary,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: mobile ? "8px 16px" : "10px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: previewMode ? "pointer" : "default",
                  flexShrink: 0,
                }}
                onClick={previewMode ? (e) => e.stopPropagation() : undefined}
              >
                Enroll
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrustBadgesComponent({ data, theme: t, selected, onClick }: ComponentProps) {
  const badges = data.badges || [
    { label: "ISO Certified", sub: "Quality Education" },
    { label: "AICTE Approved", sub: "Govt. Recognition" },
    { label: "15+ Years", sub: "Of Excellence" },
    { label: "50,000+", sub: "Students Trained" },
    { label: "98% Success", sub: "Rate Consistent" },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        padding: 40,
        borderTop: `1px solid ${t.primary}10`,
        borderBottom: `1px solid ${t.primary}10`,
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          flexWrap: "wrap",
        }}
      >
        {badges.map((b: any, i: number) => {
          const IconComp = ICON_MAP[b.icon] || CheckCircle2;
          return (
            <div key={i} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: `${t.secondary}15`,
                  border: `2px solid ${t.secondary}20`,
                  margin: "0 auto 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconComp size={24} color={t.secondary} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{b.label}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{b.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppDownloadComponent({ data, theme: t, selected, onClick, mobile }: ComponentProps) {
  const storeLinks = [
    {
      label: "App Store",
      url: data.appStoreUrl,
      icon: (
        <svg viewBox="0 0 384 512" width="18" fill="currentColor">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-31.4-73.7-100.8-21.7-131.9zM281.7 81.9c15-18.4 25-44.1 22.1-69.8-21.8 1.3-48.4 15-64.1 33.7-14 16.4-26.1 43.1-22.1 67.8 24.3 2 49-11.4 64.1-31.7z" />
        </svg>
      ),
    },
    {
      label: "Google Play",
      url: data.playStoreUrl,
      icon: (
        <svg viewBox="0 0 512 512" width="18" fill="currentColor">
          <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      onClick={onClick}
      style={{
        background: `linear-gradient(135deg, ${t.text} 0%, ${t.primary} 100%)`,
        padding: mobile ? "40px 20px" : "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: mobile ? "column" : "row",
          alignItems: "center",
          gap: mobile ? 32 : 48,
          maxWidth: 1000,
          margin: "0 auto",
        }}
      >
        <div style={{ flex: 1, textAlign: mobile ? "center" : "left" }}>
          <div
            style={{
              fontSize: mobile ? 12 : 13,
              fontWeight: 700,
              color: t.secondary,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            {data.eyebrow || "Mobile App"}
          </div>
          <div
            style={{
              fontSize: mobile ? 28 : 36,
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            {data.title || "Learn Anytime, Anywhere"}
          </div>
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.7)",
              marginBottom: 32,
              lineHeight: 1.7,
              maxWidth: mobile ? "100%" : 500,
            }}
          >
            {data.desc ||
              "Download our app for offline lectures, live classes, test series, and AI doubt solving on the go."}
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: mobile ? "center" : "flex-start",
              flexWrap: "wrap",
            }}
          >
            {storeLinks.map((store, i) => (
              <a
                key={i}
                href={store.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                  borderRadius: 14,
                  padding: "10px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  textDecoration: "none",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{ color: "#fff" }}>{store.icon}</div>
                <div style={{ textAlign: "left" }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: "rgba(255,255,255,0.6)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Download on
                  </div>
                  <div style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>{store.label}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
        <div
          style={{
            width: mobile ? 200 : 240,
            aspectRatio: "9/16",
            background: data.image
              ? `url(${data.image}) center/cover no-repeat`
              : "rgba(255,255,255,0.08)",
            borderRadius: 32,
            border: data.image ? "none" : "2px dashed rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          }}
        >
          {!data.image && "app screenshot"}
        </div>
      </div>
    </div>
  );
}

function AboutComponent({ data, theme: t, selected, onClick, mobile }: ComponentProps) {
  const milestones = data.milestones || [
    { year: "2009", text: "Founded with 30 students" },
    { year: "2014", text: "Launched online platform" },
    { year: "2019", text: "Crossed 10,000 students" },
    { year: "2024", text: "50,000+ students, 15 centers" },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        padding: mobile ? "40px 20px" : "80px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: mobile ? "column" : "row",
          alignItems: "center",
          gap: mobile ? 32 : 60,
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <div style={{ flex: 1, textAlign: mobile ? "center" : "left" }}>
          <div
            style={{
              fontSize: mobile ? 12 : 13,
              fontWeight: 700,
              color: t.primary,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {data.eyebrow || "Our Story"}
          </div>
          <div
            style={{
              fontSize: mobile ? 28 : 36,
              fontWeight: 800,
              color: t.text,
              marginBottom: 20,
              lineHeight: 1.2,
            }}
          >
            {data.title || "Transforming Lives Through Education"}
          </div>
          <div
            style={{
              fontSize: 15,
              color: "#666",
              lineHeight: 1.8,
              marginBottom: 32,
              maxWidth: mobile ? "100%" : 560,
            }}
          >
            {data.desc ||
              "We started with a simple belief: every student deserves world-class education. Join us on our journey to empower the next generation of leaders."}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobile ? "1fr" : "1fr 1fr",
              gap: 20,
            }}
          >
            {milestones.map((m: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                  background: mobile ? t.bg : "transparent",
                  padding: mobile ? "12px 16px" : 0,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: t.primary,
                    background: `${t.primary}10`,
                    padding: "4px 12px",
                    borderRadius: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.year}
                </div>
                <div style={{ fontSize: 14, color: t.text, fontWeight: 500 }}>{m.text}</div>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            width: "100%",
            aspectRatio: mobile ? "16/9" : "4/3",
            background: data.image
              ? `url(${data.image}) center/cover no-repeat`
              : `repeating-linear-gradient(45deg, ${t.primary}08, ${t.primary}08 10px, transparent 10px, transparent 20px)`,
            borderRadius: 24,
            border: data.image ? "none" : `2px dashed ${t.primary}20`,
            boxShadow: data.image ? "0 20px 40px rgba(0,0,0,0.12)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: t.primary,
            opacity: data.image ? 1 : 0.6,
          }}
        >
          {!data.image && "Mission Image"}
        </div>
      </div>
    </div>
  );
}

function LiveClassComponent({
  data,
  theme: t,
  selected,
  onClick,
  previewMode,
  mobile,
}: ComponentProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        padding: mobile ? "16px 20px" : "32px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div
        className="ib-card"
        style={{
          background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
          borderRadius: 20,
          padding: mobile ? "16px" : "28px 32px",
          display: "flex",
          flexDirection: mobile ? "column" : "row",
          flexWrap: "wrap",
          alignItems: mobile ? "stretch" : "center",
          textAlign: mobile ? "center" : "left",
          gap: mobile ? 12 : 24,
          overflow: "hidden",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff" }}></div>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>
            LIVE NOW
          </span>
        </div>
        <div style={{ flex: 1, width: mobile ? "100%" : "auto", minWidth: 0 }}>
          <div
            style={{
              fontSize: mobile ? 20 : 18,
              fontWeight: 700,
              color: "#fff",
              marginBottom: 8,
              lineHeight: 1.3,
            }}
          >
            {data.title || "Thermodynamics - JEE Advanced Level | Dr. Rajesh Kumar"}
          </div>
          <div style={{ fontSize: mobile ? 14 : 13, color: "rgba(255,255,255,0.7)" }}>
            {data.subject || "Physics"} · {data.viewers || "1,247"} students watching
          </div>
        </div>
        <button
          style={{
            background: "#fff",
            color: "#dc2626",
            border: "none",
            borderRadius: 10,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
            cursor: previewMode ? "pointer" : "default",
            flexShrink: 0,
            width: mobile ? "100%" : "auto",
            marginTop: mobile ? 8 : 0,
          }}
          onClick={previewMode ? (e) => handleCtaClick(e, data.ctaUrl) : undefined}
        >
          {data.cta || "Join Class"}
        </button>
      </div>
    </div>
  );
}

function StatsComponent({ data, theme: t, selected, onClick, mobile }: ComponentProps) {
  const stats = data.stats || [
    { num: "50,000+", label: "Students Enrolled", icon: "🎓" },
    { num: "500+", label: "Expert Faculty", icon: "👨‍🏫" },
    { num: "98%", label: "Success Rate", icon: "🏆" },
    { num: "15+", label: "Years of Excellence", icon: "⭐" },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.bg,
        padding: mobile ? "40px 20px" : "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: mobile ? 24 : 40 }}>
        <div
          style={{
            fontSize: mobile ? 12 : 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Our Impact"}
        </div>
        <div style={{ fontSize: mobile ? 24 : 34, fontWeight: 800, color: t.text }}>
          {data.title || "Numbers that Speak for Our Excellence"}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: mobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(150px, 1fr))",
          gap: mobile ? 12 : 20,
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        {stats.map((s: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              textAlign: "center",
              padding: mobile ? "16px 8px" : "32px 16px",
              background: t.surface,
              borderRadius: 20,
              boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
              border: `1px solid ${t.primary}10`,
            }}
          >
            {(() => {
              const IconComp = ICON_MAP[s.icon];
              if (!IconComp) return null;
              return (
                <IconComp
                  size={mobile ? 28 : 44}
                  color={t.secondary}
                  style={{ marginBottom: mobile ? 8 : 16, marginInline: "auto" }}
                />
              );
            })()}
            <div style={{ fontSize: mobile ? 22 : 36, fontWeight: 800, color: t.secondary }}>
              {s.num}
            </div>
            <div style={{ fontSize: mobile ? 11 : 13, color: "#666", marginTop: mobile ? 4 : 6 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlogComponent({ data, theme: t, selected, onClick, mobile }: ComponentProps) {
  const posts = data.posts || [
    { title: "JEE Advanced 2025 Syllabus Changes", date: "Apr 28, 2025", tag: "JEE" },
    { title: "NEET 2025 Cut-off Predictions", date: "Apr 22, 2025", tag: "NEET" },
    { title: "How to Build a 6-Month Study Plan", date: "Apr 15, 2025", tag: "Strategy" },
  ];
  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        padding: mobile ? "40px 20px" : "60px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: mobile ? 24 : 40 }}>
        <div
          style={{
            fontSize: mobile ? 12 : 13,
            fontWeight: 700,
            color: t.primary,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {data.eyebrow || "Latest Updates"}
        </div>
        <div style={{ fontSize: mobile ? 24 : 34, fontWeight: 800, color: t.text }}>
          {data.title || "News & Study Resources"}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))",
          gap: mobile ? 20 : 24,
        }}
      >
        {posts.map((p: any, i: number) => (
          <div
            key={i}
            className="ib-card"
            style={{
              borderRadius: 16,
              overflow: "hidden",
              border: `1px solid ${t.primary}10`,
              background: t.bg,
            }}
          >
            <div
              style={{
                height: 140,
                background: `repeating-linear-gradient(45deg, ${t.primary}06, ${t.primary}06 10px, transparent 10px, transparent 20px)`,
                border: `2px dashed ${t.primary}20`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: t.primary,
                opacity: 0.5,
              }}
            >
              blog image
            </div>
            <div style={{ padding: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  background: `${t.primary}10`,
                  color: t.primary,
                  borderRadius: 20,
                  padding: "2px 10px",
                  display: "inline-block",
                  marginBottom: 10,
                  fontWeight: 600,
                }}
              >
                {p.tag}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: t.text,
                  lineHeight: 1.4,
                  marginBottom: 10,
                }}
              >
                {p.title}
              </div>
              <div style={{ fontSize: 12, color: "#999" }}>{p.date}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CountdownComponent({
  data,
  theme: t,
  selected,
  onClick,
  previewMode,
  mobile,
}: ComponentProps) {
  const [time, setTime] = useState({ d: 12, h: 8, m: 34, s: 56 });
  useEffect(() => {
    const interval = setInterval(() => {
      setTime((prev) => {
        let { d, h, m, s } = prev;
        s--;
        if (s < 0) {
          s = 59;
          m--;
        }
        if (m < 0) {
          m = 59;
          h--;
        }
        if (h < 0) {
          h = 23;
          d--;
        }
        if (d < 0) d = 0;
        return { d, h, m, s };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div
      onClick={onClick}
      style={{
        background: `${t.primary}08`,
        padding: mobile ? "40px 20px" : "48px 40px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: t.primary,
          letterSpacing: 2,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {data.eyebrow || "Admissions Closing Soon"}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: t.text, marginBottom: 28 }}>
        {data.title || "JEE 2026 Batch Registration Ends In"}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: mobile ? 12 : 20,
          marginBottom: 32,
          flexWrap: "wrap",
        }}
      >
        {(
          [
            ["Days", time.d],
            ["Hours", time.h],
            ["Minutes", time.m],
            ["Seconds", time.s],
          ] as [string, number][]
        ).map(([label, val]) => (
          <div
            key={label}
            style={{
              textAlign: "center",
              background: t.surface,
              borderRadius: 16,
              padding: mobile ? "12px 16px" : "20px 24px",
              minWidth: mobile ? 70 : 80,
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
              border: `1px solid ${t.primary}15`,
            }}
          >
            <div
              style={{
                fontSize: mobile ? 28 : 40,
                fontWeight: 800,
                color: t.primary,
                lineHeight: 1,
              }}
            >
              {String(val).padStart(2, "0")}
            </div>
            <div
              style={{
                fontSize: mobile ? 10 : 12,
                color: "#6b7280",
                marginTop: 4,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
      <button
        style={{
          background: t.primary,
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "14px 36px",
          fontSize: 16,
          fontWeight: 700,
          cursor: previewMode ? "pointer" : "default",
        }}
        onClick={previewMode ? (e) => handleCtaClick(e, data.ctaUrl) : undefined}
      >
        {data.cta || "Register Before It's Too Late"}
      </button>
    </div>
  );
}

function FooterComponent({
  data,
  theme: t,
  selected,
  onClick,
  instituteName,
  instituteLogo,
  sections = [],
}: ComponentProps) {
  const { tenant } = useTenant();

  // 1. Social Links
  const socialLinks = data.socialLinks || [];
  const validSocials = socialLinks.filter((s: any) => s.platform && s.url).slice(0, 4);

  // 2. Dynamic Courses
  const courseSection = sections.find((s) => s.type === "courses");
  const footerCourses = (courseSection?.data?.courses || []).slice(0, 6);

  // 3. Institute Links
  const SECTION_LABELS: Record<string, string> = {
    about: "About Us",
    faculty: "Faculty",
    results: "Results",
    blog: "Blog",
    faq: "FAQ",
    gallery: "Gallery",
    testimonials: "Testimonials",
    contact: "Contact",
  };

  const instituteLinks = sections
    .filter((s) => SECTION_LABELS[s.type])
    .map((s) => ({
      label: SECTION_LABELS[s.type],
      id: s.id,
    }));

  // 4. Contact Sync from Footer Component Data
  const contact = {
    phone: data.phone || "",
    email: data.email || "",
    whatsapp: data.whatsapp || "",
    address: data.address || "",
  };
  const hasContact = contact.phone || contact.email || contact.whatsapp || contact.address;

  return (
    <div
      onClick={onClick}
      style={{
        background: t.primary,
        padding: "60px 40px 30px",
        cursor: "pointer",
        outline: selected ? `3px solid ${t.accent}` : "none",
        outlineOffset: -3,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 48,
          marginBottom: 60,
        }}
      >
        {/* Brand Column */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {instituteLogo && (
              <img
                src={instituteLogo}
                alt="logo"
                style={{ height: 36, width: "auto", objectFit: "contain" }}
              />
            )}
            <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>
              {instituteName || data.name || "Apex Institute"}
            </div>
          </div>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.7,
              marginBottom: 24,
              maxWidth: 300,
            }}
          >
            {data.tagline ||
              "Providing quality education and empowering students for a brighter future."}
          </p>

          {validSocials.length > 0 && (
            <div style={{ display: "flex", gap: 12 }}>
              {validSocials.map((social: any, i: number) => {
                const Icon = SOCIAL_ICONS[social.platform.toLowerCase()];
                if (!Icon) return null;
                const url = social.url.startsWith("http") ? social.url : `https://${social.url}`;
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      transition: "all 0.2s",
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <Icon size={20} />
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Courses Column */}
        {footerCourses.length > 0 && (
          <div>
            <h4
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                marginBottom: 24,
              }}
            >
              Popular Courses
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {footerCourses.map((course: any, i: number) => (
                <div
                  key={i}
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                >
                  {course.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Institute Links Column */}
        {instituteLinks.length > 0 && (
          <div>
            <h4
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                marginBottom: 24,
              }}
            >
              Quick Links
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {instituteLinks.map((link, i) => (
                <div
                  key={i}
                  onClick={(e) => handleCtaClick(e, `#${link.id}`)}
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                >
                  {link.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact Column */}
        {hasContact && (
          <div>
            <h4
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                marginBottom: 24,
              }}
            >
              Contact Us
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    textDecoration: "none",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                >
                  <Phone size={16} /> {contact.phone}
                </a>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    textDecoration: "none",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                >
                  <Globe size={16} /> {contact.email}
                </a>
              )}
              {contact.whatsapp && (
                <a
                  href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    textDecoration: "none",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                >
                  <MessageCircle size={16} /> WhatsApp Us
                </a>
              )}
              {contact.address && (
                <a
                  href={contact.address}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    textDecoration: "none",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                >
                  <MapPin size={16} /> {contact.address}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.1)",
          paddingTop: 30,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 20,
        }}
      >
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
          © {new Date().getFullYear()} {instituteName || data.name || "Apex Institute"}. All rights
          reserved.
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
          Powered by PREPAREKARO.IN
        </p>
      </div>
    </div>
  );
}

// ── Component Registry ───────────────────────────────────────
export const COMPONENT_REGISTRY: Record<
  string,
  {
    label: string;
    icon: string;
    component: React.FC<ComponentProps>;
    defaultData: Record<string, any>;
  }
> = {
  hero: {
    label: "Hero Banner",
    icon: "🚀",
    component: HeroComponent,
    defaultData: { variant: "centered" },
  },
  courses: {
    label: "Course Catalog",
    icon: "📚",
    component: CourseCatalogComponent,
    defaultData: {},
  },
  faculty: {
    label: "Faculty Team",
    icon: "👨‍🏫",
    component: FacultyComponent,
    defaultData: {
      faculty: [
        { name: "Dr. Rajesh Kumar", subject: "Physics", exp: "15 yrs", tag: "IIT Delhi Alumni" },
        { name: "Priya Sharma", subject: "Chemistry", exp: "12 yrs", tag: "AIIMS Topper" },
        { name: "Amit Verma", subject: "Mathematics", exp: "18 yrs", tag: "IIT Bombay Alumni" },
      ],
    },
  },
  results: { label: "Results", icon: "🏆", component: ResultsComponent, defaultData: {} },
  testimonials: {
    label: "Testimonials",
    icon: "💬",
    component: TestimonialsComponent,
    defaultData: {},
  },
  gallery: {
    label: "Photo Gallery",
    icon: "🖼️",
    component: GalleryComponent,
    defaultData: {
      items: [
        { caption: "Annual Result Celebration" },
        { caption: "Lab Sessions" },
        { caption: "Faculty Workshop" },
        { caption: "Online Class Setup" },
        { caption: "Award Ceremony" },
        { caption: "Student Orientation" },
      ],
    },
  },
  faq: { label: "FAQ Accordion", icon: "❓", component: FAQComponent, defaultData: {} },
  announcement: {
    label: "Announcement",
    icon: "📢",
    component: AnnouncementComponent,
    defaultData: {},
  },
  pricing: { label: "Pricing Plans", icon: "💰", component: PricingComponent, defaultData: {} },
  video: { label: "Video Section", icon: "▶️", component: VideoComponent, defaultData: {} },
  contact: { label: "Contact Form", icon: "📞", component: ContactFormComponent, defaultData: {} },
  batches: {
    label: "Batch Schedule",
    icon: "📅",
    component: BatchScheduleComponent,
    defaultData: {},
  },
  trust: { label: "Trust Badges", icon: "✅", component: TrustBadgesComponent, defaultData: {} },
  app: { label: "App Download", icon: "📱", component: AppDownloadComponent, defaultData: {} },
  about: { label: "About / Mission", icon: "ℹ️", component: AboutComponent, defaultData: {} },
  live: { label: "Live Class Banner", icon: "🔴", component: LiveClassComponent, defaultData: {} },
  stats: { label: "Stats Counter", icon: "📊", component: StatsComponent, defaultData: {} },
  blog: { label: "Blog / News", icon: "📰", component: BlogComponent, defaultData: {} },
  countdown: {
    label: "Countdown Timer",
    icon: "⏱️",
    component: CountdownComponent,
    defaultData: {},
  },
  footer: { label: "Footer", icon: "📋", component: FooterComponent, defaultData: {} },
};

const COMPONENT_GROUPS = [
  { label: "Essential", keys: ["hero", "announcement", "stats", "trust", "countdown", "live"] },
  { label: "Content", keys: ["courses", "faculty", "results", "testimonials", "gallery", "faq"] },
  { label: "Info", keys: ["about", "pricing", "batches", "video", "blog"] },
  { label: "Convert", keys: ["contact", "app", "footer"] },
];

// ── Draggable Library Item ───────────────────────────────────
function LibraryItem({
  type,
  entry,
  onAdd,
}: {
  type: string;
  entry: (typeof COMPONENT_REGISTRY)[string];
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${type}`,
    data: { isLibrary: true, componentType: type },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onAdd}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        cursor: "grab",
        background: isDragging ? "rgba(99,102,241,0.08)" : "transparent",
        border: "1px solid transparent",
        transition: "all 0.15s",
        opacity: isDragging ? 0.5 : 1,
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        if (!isDragging) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{entry.icon}</span>
      <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{entry.label}</span>
    </div>
  );
}

// ── Sortable Canvas Section ──────────────────────────────────
function SortableSection({
  section,
  selected,
  onSelect,
  onDelete,
  onMoveUp,
  onMoveDown,
  theme,
  previewMode,
  instituteName,
  instituteLogo,
  mobile,
  sections,
}: {
  section: Section;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  theme: Theme;
  previewMode: boolean;
  instituteName: string;
  instituteLogo: string;
  mobile: boolean;
  sections: Section[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const Comp = COMPONENT_REGISTRY[section.type]?.component;
  if (!Comp) return null;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: "relative",
      }}
    >
      {!previewMode && selected && (
        <div
          style={{ position: "absolute", top: 8, right: 8, zIndex: 10, display: "flex", gap: 4 }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            title="Move up"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: "rgba(255,255,255,0.9)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            title="Move down"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: "rgba(255,255,255,0.9)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <ChevronDown size={14} />
          </button>
          <div
            {...listeners}
            {...attributes}
            title="Drag to reorder"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: "rgba(255,255,255,0.9)",
              cursor: "grab",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <GripVertical size={14} />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete section"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: "#fee2e2",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <Trash2 size={14} color="#dc2626" />
          </button>
        </div>
      )}
      <Comp
        data={section.data}
        theme={theme}
        selected={!previewMode && selected}
        onClick={previewMode ? () => {} : onSelect}
        previewMode={previewMode}
        instituteName={instituteName}
        instituteLogo={instituteLogo}
        mobile={mobile}
        sections={sections}
      />
    </div>
  );
}

// ── Canvas Drop Zone ─────────────────────────────────────────
function CanvasDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-drop-zone" });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 120,
        background: isOver ? "rgba(99,102,241,0.06)" : "transparent",
        borderRadius: 8,
        transition: "background 0.15s",
      }}
    >
      {children}
    </div>
  );
}

// ── Left Sidebar ─────────────────────────────────────────────
function LeftSidebar({
  sections,
  onAdd,
  selectedId,
  onSelectSection,
  onDeleteSection,
  themeKey,
  setThemeKey,
  instituteName,
  setInstituteName,
  instituteLogo,
  setInstituteLogo,
  uid,
  collapsed,
  onToggleCollapse,
  mobile = false,
  useGradient,
  setUseGradient,
  themeMode,
  setThemeMode,
  customColor,
  setCustomColor,
}: {
  sections: Section[];
  onAdd: (type: string) => void;
  selectedId: string | null;
  onSelectSection: (id: string) => void;
  onDeleteSection: (id: string) => void;
  themeKey: ThemeKey;
  setThemeKey: (k: ThemeKey) => void;
  instituteName: string;
  setInstituteName: (n: string) => void;
  instituteLogo: string;
  setInstituteLogo: (u: string) => void;
  uid: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobile?: boolean;
  useGradient: boolean;
  setUseGradient: (g: boolean) => void;
  themeMode: "preset" | "custom";
  setThemeMode: (m: "preset" | "custom") => void;
  customColor: string;
  setCustomColor: (c: string) => void;
}) {
  const [tab, setTab] = useState<"components" | "layers" | "settings">("components");
  const [search, setSearch] = useState("");
  const [showMoreThemes, setShowMoreThemes] = useState(false);

  const filtered = search.trim()
    ? Object.entries(COMPONENT_REGISTRY).filter(([, v]) =>
        v.label.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  if (collapsed && !mobile) {
    const iconKeys = COMPONENT_GROUPS.flatMap((g) => g.keys);
    return (
      <div
        style={{
          width: 72,
          background: "#fff",
          borderRight: "1px solid rgba(0,0,0,0.07)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 52,
            borderBottom: "1px solid rgba(0,0,0,0.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <button
            onClick={onToggleCollapse}
            title="Expand panel"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {iconKeys.map((key) => {
            const entry = COMPONENT_REGISTRY[key];
            return (
              <button
                key={key}
                title={entry.label}
                onClick={() => onAdd(key)}
                style={{
                  height: 36,
                  borderRadius: 8,
                  border: "1px solid transparent",
                  background: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#fff";
                }}
              >
                {entry.icon}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: mobile ? "100%" : 260,
        background: "#fff",
        borderRight: "1px solid rgba(0,0,0,0.07)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
        {(
          [
            { id: "components", label: "Add", icon: "＋" },
            { id: "layers", label: "Layers", icon: "≡" },
            { id: "settings", label: "Site", icon: "⚙" },
          ] as const
        ).map((t2) => (
          <button
            key={t2.id}
            onClick={() => setTab(t2.id)}
            style={{
              flex: 1,
              padding: "10px 4px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              color: tab === t2.id ? "#6366f1" : "rgba(0,0,0,0.35)",
              borderBottom: tab === t2.id ? "2px solid #6366f1" : "2px solid transparent",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 14 }}>{t2.icon}</span>
            <span>{t2.label}</span>
          </button>
        ))}
        <button
          onClick={onToggleCollapse}
          title="Minimize panel"
          style={{
            width: 36,
            border: "none",
            borderLeft: "1px solid rgba(0,0,0,0.07)",
            background: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0,0,0,0.45)",
          }}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
        {tab === "components" && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search components…"
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.1)",
                fontSize: 12,
                marginBottom: 12,
                outline: "none",
                background: "#f9f9f9",
              }}
            />
            {filtered
              ? filtered.map(([key, entry]) => (
                  <LibraryItem key={key} type={key} entry={entry} onAdd={() => onAdd(key)} />
                ))
              : COMPONENT_GROUPS.map((group) => (
                  <div key={group.label} style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "rgba(0,0,0,0.3)",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        padding: "4px 10px",
                        marginBottom: 4,
                      }}
                    >
                      {group.label}
                    </div>
                    {group.keys.map((key) => (
                      <LibraryItem
                        key={key}
                        type={key}
                        entry={COMPONENT_REGISTRY[key]}
                        onAdd={() => onAdd(key)}
                      />
                    ))}
                  </div>
                ))}
          </>
        )}

        {tab === "layers" &&
          (sections.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "rgba(0,0,0,0.3)",
                fontSize: 13,
              }}
            >
              No sections yet.
              <br />
              Add from the Add tab.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {sections.map((sec, i) => (
                <div
                  key={sec.id}
                  onClick={() => onSelectSection(sec.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: selectedId === sec.id ? "rgba(99,102,241,0.1)" : "transparent",
                    border:
                      selectedId === sec.id
                        ? "1px solid rgba(99,102,241,0.3)"
                        : "1px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 14 }}>{COMPONENT_REGISTRY[sec.type]?.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#374151", flex: 1 }}>
                    {COMPONENT_REGISTRY[sec.type]?.label}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(0,0,0,0.3)" }}>#{i + 1}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSection(sec.id);
                    }}
                    style={{
                      padding: 4,
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      color: "#dc2626",
                      opacity: 0.6,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ))}

        {tab === "settings" && (
          <div style={{ padding: "4px 4px" }}>
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(0,0,0,0.4)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Institute Logo
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: "#f3f4f6",
                    border: "1px solid rgba(0,0,0,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {instituteLogo ? (
                    <img
                      src={instituteLogo}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <span style={{ fontSize: 20 }}>🏫</span>
                  )}
                </div>
                <input
                  id="global-logo-upload"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !uid) return;
                    try {
                      const res = await uploadToImageKit(
                        file,
                        `logo-${Date.now()}-${file.name}`,
                        `/website-assets/${uid}`,
                        "website"
                      );
                      setInstituteLogo(res.url);
                    } catch (err: any) {
                      toast.error("Logo upload failed");
                    }
                  }}
                />
                <button
                  onClick={() => document.getElementById("global-logo-upload")?.click()}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {instituteLogo ? "Change Logo" : "Upload Logo"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(0,0,0,0.4)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Institute Name
              </div>
              <input
                value={instituteName}
                onChange={(e) => setInstituteName(e.target.value)}
                placeholder="Your Institute Name"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.12)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(0,0,0,0.4)",
                  marginBottom: 10,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Color Theme
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {(Object.keys(THEME_PRESETS) as ThemeKey[])
                  .slice(0, showMoreThemes ? 25 : 10)
                  .map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setThemeKey(key);
                        setThemeMode("preset");
                        setCustomColor("");
                      }}
                      title={key}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: THEME_PRESETS[key].primary,
                        border:
                          themeMode === "preset" && themeKey === key
                            ? "3px solid #6366f1"
                            : "3px solid transparent",
                        outline:
                          themeMode === "preset" && themeKey === key ? `2px solid #6366f1` : "none",
                        outlineOffset: 2,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        opacity: themeMode === "custom" ? 0.5 : 1,
                      }}
                    />
                  ))}
              </div>
              <button
                onClick={() => setShowMoreThemes(!showMoreThemes)}
                style={{
                  marginTop: 12,
                  background: "none",
                  border: "none",
                  color: "#4f46e5",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 0,
                }}
              >
                {showMoreThemes ? "Show Less" : `Show More`}
              </button>
              {themeMode === "preset" && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "rgba(0,0,0,0.4)",
                    textTransform: "capitalize",
                  }}
                >
                  Selected Preset: {themeKey}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 24,
                padding: "16px 12px",
                background: "rgba(99,102,241,0.04)",
                borderRadius: 12,
                border: "1px solid rgba(99,102,241,0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e1b4b" }}>Use Gradients</div>
                <button
                  onClick={() => setUseGradient(!useGradient)}
                  style={{
                    width: 38,
                    height: 20,
                    borderRadius: 20,
                    background: useGradient ? "#4f46e5" : "#e5e7eb",
                    border: "none",
                    position: "relative",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "#fff",
                      position: "absolute",
                      top: 3,
                      left: useGradient ? 21 : 3,
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                  />
                </button>
              </div>
              <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", lineHeight: 1.4 }}>
                Adds premium glassmorphism gradients to your site sections based on your theme.
              </div>
            </div>

            {/* Custom Brand Color */}
            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(0,0,0,0.45)",
                  marginBottom: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Custom Brand Color
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#1e1b4b" }}>
                      Primary Hex Code
                    </label>
                    {themeMode === "custom" && (
                      <div
                        style={{
                          fontSize: 10,
                          background: "#e0e7ff",
                          color: "#4338ca",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        ACTIVE
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background:
                          themeMode === "custom" ? customColor || "#4f46e5" : "transparent",
                        border: "1px solid rgba(0,0,0,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        color: "rgba(0,0,0,0.2)",
                      }}
                    >
                      {!customColor && "🎨"}
                    </div>
                    <input
                      type="text"
                      value={customColor}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomColor(val);
                        if (val.length >= 4) setThemeMode("custom");
                      }}
                      placeholder="#4f46e5"
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border:
                          themeMode === "custom"
                            ? "2px solid #6366f1"
                            : "1px solid rgba(0,0,0,0.12)",
                        fontSize: 13,
                        outline: "none",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", marginTop: 8 }}>
                    Enter a hex code to dynamically generate a complete theme for your site.
                  </div>
                </div>

                {themeMode === "custom" && (
                  <button
                    onClick={() => {
                      setThemeMode("preset");
                      setCustomColor("");
                    }}
                    style={{
                      marginTop: 8,
                      background: "none",
                      border: "none",
                      color: "#dc2626",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                      padding: 0,
                    }}
                  >
                    Switch back to Preset Themes
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Right Panel ──────────────────────────────────────────────
function RightPanel({
  section,
  onUpdate,
  onUpdateArrayItem,
  onReplaceData,
  uid,
  sections = [],
  mobile = false,
}: {
  section: Section | null;
  onUpdate: (key: string, value: string) => void;
  onUpdateArrayItem: (arrayKey: string, index: number, subKey: string, value: string) => void;
  onReplaceData: (data: Record<string, any>) => void;
  uid: string | null;
  sections?: Section[];
  mobile?: boolean;
}) {
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  async function handleUpload(
    file: File,
    fieldKey: string,
    arrayKey?: string,
    index?: number,
    subKey?: string
  ) {
    const uploadKey = arrayKey != null && index != null ? `${fieldKey}-${index}` : fieldKey;
    setUploading((prev) => ({ ...prev, [uploadKey]: true }));
    try {
      const res = await uploadToImageKit(
        file,
        `builder-${Date.now()}-${file.name}`,
        `/website-assets/${uid}`,
        "website"
      );
      if (arrayKey != null && index != null && subKey != null) {
        onUpdateArrayItem(arrayKey, index, subKey, res.url);
      } else {
        onUpdate(fieldKey, res.url);
      }
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading((prev) => ({ ...prev, [uploadKey]: false }));
    }
  }

  if (!section) {
    return (
      <div
        style={{
          width: mobile ? "100%" : 260,
          background: "#fff",
          borderLeft: "1px solid rgba(0,0,0,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24, color: "rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
          <div style={{ fontSize: 13 }}>
            Click a section
            <br />
            to edit its content
          </div>
        </div>
      </div>
    );
  }

  const fields = EDITOR_FIELDS[section.type] || [];
  const reg = COMPONENT_REGISTRY[section.type];
  const updateSection = (nextData: Record<string, any>) => onReplaceData(nextData);

  function updateArrayField(arrayKey: string, index: number, key: string, value: any) {
    const arr = [...(section.data[arrayKey] || [])];
    const nextItem = { ...(arr[index] || {}), [key]: value };
    if (arrayKey === "plans" && key === "featuresText") {
      nextItem.features = String(value)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    arr[index] = nextItem;
    updateSection({ ...section.data, [arrayKey]: arr });
  }

  function addArrayItem(arrayKey: string, emptyItem: Record<string, any>) {
    const arr = [...(section.data[arrayKey] || [])];
    arr.push(emptyItem);
    updateSection({ ...section.data, [arrayKey]: arr });
  }

  function removeArrayItem(arrayKey: string, index: number) {
    const arr = [...(section.data[arrayKey] || [])];
    arr.splice(index, 1);
    updateSection({ ...section.data, [arrayKey]: arr });
  }

  function renderField(label: string, key: string, type: "text" | "textarea" = "text") {
    return (
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(0,0,0,0.45)",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </div>
        {type === "textarea" ? (
          <textarea
            value={section.data[key] || ""}
            onChange={(e) => onUpdate(key, e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.12)",
              fontSize: 13,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        ) : (
          <input
            type="text"
            value={section.data[key] || ""}
            onChange={(e) => onUpdate(key, e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.12)",
              fontSize: 13,
              outline: "none",
            }}
          />
        )}
      </div>
    );
  }

  function renderArrayEditor(
    title: string,
    arrayKey: string,
    itemFields: Array<{
      key: string;
      label: string;
      type?: "text" | "textarea" | "image" | "icon" | "select";
      options?: string[];
      subKey?: string;
    }>,
    emptyItem: Record<string, any>
  ) {
    const items = section.data[arrayKey] || [];
    return (
      <div style={{ marginTop: 12, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(0,0,0,0.45)",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item: any, i: number) => (
            <div
              key={i}
              style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: 10 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>Item {i + 1}</div>
                <button
                  onClick={() => removeArrayItem(arrayKey, i)}
                  style={{
                    border: "none",
                    background: "#fee2e2",
                    color: "#b91c1c",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
              {itemFields.map((f) => (
                <div key={f.key} style={{ marginBottom: 8 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: "rgba(0,0,0,0.5)",
                      marginBottom: 4,
                    }}
                  >
                    {f.label}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      value={
                        f.key === "featuresText"
                          ? (item.featuresText ??
                            (Array.isArray(item.features) ? item.features.join(", ") : ""))
                          : item[f.key] || ""
                      }
                      onChange={(e) => updateArrayField(arrayKey, i, f.key, e.target.value)}
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "7px 9px",
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: 12,
                        resize: "vertical",
                      }}
                    />
                  ) : f.type === "image" ? (
                    <div>
                      {item[f.key] && (
                        <img
                          src={item[f.key]}
                          alt={f.label}
                          style={{
                            width: "100%",
                            height: 80,
                            objectFit: "cover",
                            borderRadius: 6,
                            marginBottom: 6,
                          }}
                        />
                      )}
                      <input
                        id={`img-upload-${section.id}-${arrayKey}-${f.key}-${i}`}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const uploadKey = `${arrayKey}-${f.key}-${i}`;
                          setUploading((prev) => ({ ...prev, [uploadKey]: true }));
                          try {
                            const res = await uploadToImageKit(
                              file,
                              `builder-${Date.now()}-${file.name}`,
                              `/website-assets/${uid}`,
                              "website"
                            );
                            updateArrayField(arrayKey, i, f.key, res.url);
                          } catch (err: any) {
                            toast.error(err?.message || "Upload failed");
                          } finally {
                            setUploading((prev) => ({ ...prev, [uploadKey]: false }));
                            e.target.value = "";
                          }
                        }}
                      />
                      <button
                        onClick={() =>
                          document
                            .getElementById(`img-upload-${section.id}-${arrayKey}-${f.key}-${i}`)
                            ?.click()
                        }
                        style={{
                          width: "100%",
                          padding: "7px 9px",
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.15)",
                          background: "#f9f9f9",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        Upload
                      </button>
                    </div>
                  ) : f.type === "icon" ? (
                    <select
                      value={item[f.key] || ""}
                      onChange={(e) => updateArrayField(arrayKey, i, f.key, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 9px",
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: 12,
                        background: "#fff",
                      }}
                    >
                      <option value="">Select Icon</option>
                      {ICON_OPTIONS.map((opt) => (
                        <option key={opt.name} value={opt.name}>
                          {opt.icon} {opt.name}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "select" ? (
                    <select
                      value={item[f.key] || (f.options ? f.options[0] : "")}
                      onChange={(e) => updateArrayField(arrayKey, i, f.key, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 9px",
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: 12,
                        background: "#fff",
                      }}
                    >
                      {f.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={
                        f.key === "featuresText"
                          ? (item.featuresText ??
                            (Array.isArray(item.features) ? item.features.join(", ") : ""))
                          : item[f.key] || ""
                      }
                      onChange={(e) => updateArrayField(arrayKey, i, f.key, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 9px",
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: 12,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
          <button
            onClick={() => addArrayItem(arrayKey, emptyItem)}
            style={{
              border: "1px dashed rgba(79,70,229,0.5)",
              background: "#eef2ff",
              color: "#3730a3",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Add {title.slice(0, -1)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: mobile ? "100%" : 260,
        background: "#fff",
        borderLeft: "1px solid rgba(0,0,0,0.07)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>{reg?.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{reg?.label}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {fields.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "24px 0",
              color: "rgba(0,0,0,0.3)",
              fontSize: 13,
            }}
          >
            No editable fields for this section.
          </div>
        ) : (
          fields.map((field) => (
            <div key={field.key} style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(0,0,0,0.45)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {field.label}
              </label>
              {field.type === "select" ? (
                <select
                  value={section.data[field.key] || field.options![0]}
                  onChange={(e) => onUpdate(field.key, e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: 13,
                    outline: "none",
                    background: "#fff",
                  }}
                >
                  {field.options!.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={section.data[field.key] || ""}
                  onChange={(e) => onUpdate(field.key, e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: 13,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              ) : field.type === "image" ? (
                field.arrayKey ? (
                  // Array-item images (faculty photos, gallery images)
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {(section.data[field.arrayKey] || []).map((item: any, i: number) => {
                      const uploadKey = `${field.key}-${i}`;
                      const isUploading = uploading[uploadKey] || false;
                      const currentUrl: string = item[field.subKey!] || "";
                      const itemLabel = item.name || item.caption || `Item ${i + 1}`;
                      const inputId = `img-upload-${section.id}-${field.key}-${i}`;
                      return (
                        <div
                          key={i}
                          style={{
                            border: "1px solid rgba(0,0,0,0.08)",
                            borderRadius: 8,
                            padding: 10,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              color: "rgba(0,0,0,0.5)",
                              marginBottom: 6,
                              fontWeight: 500,
                            }}
                          >
                            {itemLabel}
                          </div>
                          {currentUrl && (
                            <img
                              src={currentUrl}
                              alt={itemLabel}
                              style={{
                                width: "100%",
                                height: 80,
                                objectFit: "cover",
                                borderRadius: 6,
                                marginBottom: 6,
                              }}
                            />
                          )}
                          <input
                            id={inputId}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file)
                                await handleUpload(
                                  file,
                                  field.key,
                                  field.arrayKey,
                                  i,
                                  field.subKey
                                );
                              e.target.value = "";
                            }}
                          />
                          <button
                            disabled={isUploading}
                            onClick={() => document.getElementById(inputId)?.click()}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1px solid rgba(0,0,0,0.15)",
                              background: "#f9f9f9",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: isUploading ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              opacity: isUploading ? 0.7 : 1,
                            }}
                          >
                            {isUploading ? (
                              <>
                                <Loader2 size={12} className="animate-spin" /> Uploading…
                              </>
                            ) : (
                              "Upload"
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Top-level image (e.g. heroImage)
                  (() => {
                    const isUploading = uploading[field.key] || false;
                    const currentUrl: string = section.data[field.key] || "";
                    const inputId = `img-upload-${section.id}-${field.key}`;
                    return (
                      <div>
                        {currentUrl && (
                          <img
                            src={currentUrl}
                            alt={field.label}
                            style={{
                              width: "100%",
                              height: 100,
                              objectFit: "cover",
                              borderRadius: 8,
                              marginBottom: 8,
                            }}
                          />
                        )}
                        <input
                          id={inputId}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) await handleUpload(file, field.key);
                            e.target.value = "";
                          }}
                        />
                        <button
                          disabled={isUploading}
                          onClick={() => document.getElementById(inputId)?.click()}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid rgba(0,0,0,0.15)",
                            background: "#f9f9f9",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: isUploading ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            opacity: isUploading ? 0.7 : 1,
                          }}
                        >
                          {isUploading ? (
                            <>
                              <Loader2 size={14} className="animate-spin" /> Uploading…
                            </>
                          ) : (
                            "Upload"
                          )}
                        </button>
                      </div>
                    );
                  })()
                )
              ) : field.type === "cta-link" ? (
                (() => {
                  const raw: string = section.data[field.key] || "";
                  const isSection = raw.startsWith("#");
                  // Build section options from canvas sections (excluding current)
                  const sectionOptions = sections
                    .filter((s) => s.id !== section.id)
                    .map((s, idx) => ({
                      value: `#${s.id}`,
                      label: `${COMPONENT_REGISTRY[s.type]?.label || s.type} ${sections.filter((x) => x.type === s.type).length > 1 ? `(Section ${idx + 1})` : ""}`,
                    }));
                  return (
                    <div>
                      {/* Toggle */}
                      <div
                        style={{
                          display: "flex",
                          gap: 0,
                          marginBottom: 8,
                          borderRadius: 8,
                          overflow: "hidden",
                          border: "1px solid rgba(0,0,0,0.12)",
                        }}
                      >
                        {(["section", "external"] as const).map((mode) => {
                          const active = mode === "section" ? isSection : !isSection;
                          return (
                            <button
                              key={mode}
                              onClick={() => {
                                if (mode === "section") {
                                  const first = sectionOptions[0]?.value || "";
                                  onUpdate(field.key, first);
                                } else {
                                  onUpdate(field.key, "");
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: "6px 0",
                                border: "none",
                                background: active ? "#6366f1" : "#f9f9f9",
                                color: active ? "#fff" : "rgba(0,0,0,0.45)",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                letterSpacing: 0.3,
                              }}
                            >
                              {mode === "section" ? "⬇ Scroll to Section" : "🔗 External URL"}
                            </button>
                          );
                        })}
                      </div>
                      {isSection ? (
                        sectionOptions.length === 0 ? (
                          <div
                            style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", padding: "4px 2px" }}
                          >
                            No other sections on canvas yet.
                          </div>
                        ) : (
                          <select
                            value={raw}
                            onChange={(e) => onUpdate(field.key, e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid rgba(0,0,0,0.12)",
                              fontSize: 13,
                              outline: "none",
                              background: "#fff",
                            }}
                          >
                            {sectionOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )
                      ) : (
                        <input
                          type="text"
                          value={raw}
                          onChange={(e) => onUpdate(field.key, e.target.value)}
                          placeholder="https://example.com"
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid rgba(0,0,0,0.12)",
                            fontSize: 13,
                            outline: "none",
                          }}
                        />
                      )}
                    </div>
                  );
                })()
              ) : (
                <input
                  type="text"
                  value={section.data[field.key] || ""}
                  onChange={(e) => onUpdate(field.key, e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              )}
            </div>
          ))
        )}
        {section.type === "hero" &&
          (section.data.variant === "split" || section.data.variant === "carousel") &&
          (() => {
            const heroImages: string[] = Array.isArray(section.data.heroImages)
              ? section.data.heroImages
              : section.data.heroImage
                ? [section.data.heroImage]
                : [];
            const uploadingKey = (i: number) => `heroImages-${i}`;
            return (
              <div
                style={{ marginTop: 12, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)" }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(0,0,0,0.45)",
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Hero Images{" "}
                  {heroImages.length > 1 ? `(${heroImages.length} — carousel)` : "(add 1 or more)"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {heroImages.map((url, i) => {
                    const isUpl = uploading[uploadingKey(i)] || false;
                    const inputId = `hero-img-upload-${section.id}-${i}`;
                    return (
                      <div
                        key={i}
                        style={{
                          border: "1px solid rgba(0,0,0,0.08)",
                          borderRadius: 8,
                          padding: 8,
                        }}
                      >
                        <img
                          src={url}
                          alt={`Hero ${i + 1}`}
                          style={{
                            width: "100%",
                            height: 72,
                            objectFit: "cover",
                            borderRadius: 6,
                            marginBottom: 6,
                          }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            id={inputId}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploading((prev) => ({ ...prev, [uploadingKey(i)]: true }));
                              try {
                                const res = await uploadToImageKit(
                                  file,
                                  `builder-${Date.now()}-${file.name}`,
                                  `/website-assets/${uid}`,
                                  "website"
                                );
                                const next = [...heroImages];
                                next[i] = res.url;
                                onReplaceData({ ...section.data, heroImages: next });
                              } catch (err: any) {
                                toast.error(err?.message || "Upload failed");
                              } finally {
                                setUploading((prev) => ({ ...prev, [uploadingKey(i)]: false }));
                                e.target.value = "";
                              }
                            }}
                          />
                          <button
                            disabled={isUpl}
                            onClick={() => document.getElementById(inputId)?.click()}
                            style={{
                              flex: 1,
                              padding: "5px 8px",
                              borderRadius: 6,
                              border: "1px solid rgba(0,0,0,0.15)",
                              background: "#f9f9f9",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: isUpl ? "not-allowed" : "pointer",
                            }}
                          >
                            {isUpl ? "Uploading…" : "Replace"}
                          </button>
                          <button
                            onClick={() => {
                              const next = heroImages.filter((_, j) => j !== i);
                              onReplaceData({ ...section.data, heroImages: next });
                            }}
                            style={{
                              padding: "5px 8px",
                              borderRadius: 6,
                              border: "none",
                              background: "#fee2e2",
                              color: "#b91c1c",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Add new image */}
                  {(() => {
                    const newInputId = `hero-img-new-${section.id}`;
                    const isUpl = uploading["heroImages-new"] || false;
                    return (
                      <>
                        <input
                          id={newInputId}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploading((prev) => ({ ...prev, "heroImages-new": true }));
                            try {
                              const res = await uploadToImageKit(
                                file,
                                `builder-${Date.now()}-${file.name}`,
                                `/website-assets/${uid}`,
                                "website"
                              );
                              const next = [...heroImages, res.url];
                              onReplaceData({ ...section.data, heroImages: next });
                            } catch (err: any) {
                              toast.error(err?.message || "Upload failed");
                            } finally {
                              setUploading((prev) => ({ ...prev, "heroImages-new": false }));
                              e.target.value = "";
                            }
                          }}
                        />
                        <button
                          disabled={isUpl}
                          onClick={() => document.getElementById(newInputId)?.click()}
                          style={{
                            border: "1px dashed rgba(79,70,229,0.5)",
                            background: "#eef2ff",
                            color: "#3730a3",
                            borderRadius: 8,
                            padding: "8px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: isUpl ? "not-allowed" : "pointer",
                          }}
                        >
                          {isUpl
                            ? "Uploading…"
                            : `+ Add Image${heroImages.length > 0 ? " (carousel)" : ""}`}
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })()}
        {section.type === "hero" &&
          renderArrayEditor(
            "Hero Stats",
            "stats",
            [
              { key: "num", label: "Value" },
              { key: "label", label: "Label" },
              { key: "icon", label: "Icon", type: "icon" },
            ],
            { num: "", label: "", icon: "" }
          )}
        {section.type === "courses" &&
          renderArrayEditor(
            "Courses",
            "courses",
            [
              { key: "name", label: "Name" },
              { key: "tag", label: "Tag" },
              { key: "students", label: "Students" },
              { key: "duration", label: "Duration" },
              { key: "price", label: "Price" },
            ],
            { name: "", tag: "", students: "", duration: "", price: "" }
          )}
        {section.type === "faculty" &&
          renderArrayEditor(
            "Faculty",
            "faculty",
            [
              { key: "name", label: "Name" },
              { key: "subject", label: "Subject" },
              { key: "exp", label: "Experience" },
              { key: "tag", label: "Tag" },
              { key: "photo", label: "Photo", type: "image" },
            ],
            { name: "", subject: "", exp: "", tag: "", photo: "" }
          )}
        {section.type === "results" && (
          <>
            {renderArrayEditor(
              "Result Cards",
              "results",
              [
                { key: "name", label: "Name" },
                { key: "rank", label: "Rank" },
                { key: "exam", label: "Exam" },
                { key: "tag", label: "Tag" },
                { key: "photo", label: "Photo", type: "image" },
                { key: "icon", label: "Icon", type: "icon" },
              ],
              { name: "", rank: "", exam: "", tag: "", photo: "", icon: "" }
            )}
            {renderArrayEditor(
              "Result Stats",
              "stats",
              [
                { key: "num", label: "Value" },
                { key: "label", label: "Label" },
                { key: "icon", label: "Icon", type: "icon" },
              ],
              { num: "", label: "", icon: "" }
            )}
          </>
        )}
        {section.type === "testimonials" && (
          <>
            {renderField("Eyebrow", "eyebrow")}
            {renderField("Title", "title")}
            {renderArrayEditor(
              "Testimonials",
              "reviews",
              [
                { key: "name", label: "Name" },
                { key: "role", label: "Role" },
                { key: "text", label: "Review", type: "textarea" },
                { key: "photo", label: "Photo", type: "image" },
                {
                  key: "rating",
                  label: "Rating (1-5)",
                  type: "select",
                  options: ["1", "2", "3", "4", "5"],
                },
              ],
              { name: "", role: "", text: "", photo: "", rating: "5" }
            )}
          </>
        )}
        {section.type === "gallery" &&
          renderArrayEditor(
            "Gallery Items",
            "items",
            [
              { key: "caption", label: "Caption" },
              { key: "image", label: "Image", type: "image" },
            ],
            { caption: "", image: "" }
          )}
        {section.type === "faq" &&
          renderArrayEditor(
            "FAQs",
            "faqs",
            [
              { key: "q", label: "Question" },
              { key: "a", label: "Answer", type: "textarea" },
            ],
            { q: "", a: "" }
          )}
        {section.type === "pricing" &&
          renderArrayEditor(
            "Plans",
            "plans",
            [
              { key: "name", label: "Plan Name" },
              { key: "price", label: "Price" },
              { key: "period", label: "Period" },
              { key: "featuresText", label: "Features (comma-separated)" },
            ],
            { name: "", price: "", period: "", featuresText: "" }
          )}
        {section.type === "batches" &&
          renderArrayEditor(
            "Batches",
            "batches",
            [
              { key: "name", label: "Name" },
              { key: "time", label: "Time" },
              { key: "seats", label: "Seats" },
              { key: "mode", label: "Mode" },
              { key: "tag", label: "Tag" },
            ],
            { name: "", time: "", seats: "", mode: "", tag: "" }
          )}
        {section.type === "trust" &&
          renderArrayEditor(
            "Badges",
            "badges",
            [
              { key: "label", label: "Label" },
              { key: "sub", label: "Subtext" },
              { key: "icon", label: "Icon", type: "icon" },
            ],
            { label: "", sub: "", icon: "CheckCircle2" }
          )}
        {section.type === "about" &&
          renderArrayEditor(
            "Milestones",
            "milestones",
            [
              { key: "year", label: "Year" },
              { key: "text", label: "Text" },
            ],
            { year: "", text: "" }
          )}
        {section.type === "stats" && (
          <>
            {renderField("Eyebrow", "eyebrow")}
            {renderField("Title", "title")}
            {renderArrayEditor(
              "Counters",
              "stats",
              [
                { key: "num", label: "Value" },
                { key: "label", label: "Label" },
                { key: "icon", label: "Icon", type: "icon" },
              ],
              { num: "", label: "", icon: "" }
            )}
          </>
        )}
        {section.type === "footer" && (
          <>
            {renderField("Institute Name", "name")}
            {renderField("Tagline", "tagline", "textarea")}
            <div
              style={{
                marginTop: 20,
                padding: 12,
                background: "rgba(0,0,0,0.02)",
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(0,0,0,0.4)",
                  marginBottom: 12,
                  textTransform: "uppercase",
                }}
              >
                Contact Details
              </div>
              {renderField("Phone", "phone")}
              {renderField("Email", "email")}
              {renderField("WhatsApp", "whatsapp")}
              {renderField("Address", "address")}
            </div>
            {renderArrayEditor(
              "Social Links",
              "socialLinks",
              [
                {
                  key: "platform",
                  label: "Platform",
                  type: "select",
                  options: ["Instagram", "YouTube", "Facebook", "Twitter", "LinkedIn", "Website"],
                },
                { key: "url", label: "URL" },
              ],
              { platform: "Instagram", url: "" }
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Default sections shown to educators who haven't configured their site yet ──
const DEFAULT_SECTIONS: Section[] = [
  { id: "d_hero", type: "hero", data: { variant: "centered" } },
  { id: "d_stats", type: "stats", data: {} },
  { id: "d_courses", type: "courses", data: {} },
  { id: "d_faculty", type: "faculty", data: {} },
  { id: "d_results", type: "results", data: {} },
  { id: "d_testimonials", type: "testimonials", data: {} },
  { id: "d_faq", type: "faq", data: {} },
  { id: "d_contact", type: "contact", data: {} },
  { id: "d_footer", type: "footer", data: {} },
];

// ── Main Builder ─────────────────────────────────────────────
let _secId = 0;
function newId() {
  return `sec_${Date.now()}_${++_secId}`;
}

export default function InstituteBuilder() {
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid || null;

  const [sections, setSections] = useState<Section[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [themeKey, setThemeKey] = useState<ThemeKey>("emerald");
  const [instituteName, setInstituteName] = useState("My Institute");
  const [instituteLogo, setInstituteLogo] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"canvas" | "sections" | "editor">("canvas");
  const [useGradient, setUseGradient] = useState(false);
  const [themeMode, setThemeMode] = useState<"preset" | "custom">("preset");
  const [customColor, setCustomColor] = useState("");
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  const theme: Theme =
    themeMode === "custom" && customColor
      ? createCustomTheme(customColor, useGradient)
      : { ...THEME_PRESETS[themeKey], useGradient };

  // Load from Firestore
  useEffect(() => {
    if (!uid) {
      setLoaded(true);
      return;
    }
    getDoc(doc(db, "educators", uid))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data() as any;
          const cfg = d.builderConfig;
          setSections(cfg?.sections?.length ? cfg.sections : DEFAULT_SECTIONS);
          if (cfg?.themeKey) setThemeKey(cfg.themeKey as ThemeKey);
          if (cfg?.instituteName) setInstituteName(cfg.instituteName);
          if (cfg?.instituteLogo) setInstituteLogo(cfg.instituteLogo);
          if (cfg?.useGradient !== undefined) setUseGradient(cfg.useGradient);
          if (cfg?.themeMode) setThemeMode(cfg.themeMode);
          if (cfg?.customColor) setCustomColor(cfg.customColor);
          else
            setInstituteName(
              d.coachingName || d.displayName || profile?.displayName || "My Institute"
            );
        } else {
          setSections(DEFAULT_SECTIONS);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [uid]);

  // Auto-save with debounce
  useEffect(() => {
    if (!uid || !loaded) return;
    clearTimeout(saveTimeout.current);
    setSaving(true);
    saveTimeout.current = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, "educators", uid),
          {
            builderConfig: {
              sections,
              themeKey,
              instituteName,
              instituteLogo,
              useGradient,
              themeMode,
              customColor,
            },
          },
          { merge: true }
        );
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => clearTimeout(saveTimeout.current);
  }, [
    sections,
    themeKey,
    instituteName,
    instituteLogo,
    useGradient,
    themeMode,
    customColor,
    uid,
    loaded,
  ]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const updateViewportState = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobileViewport(mobile);
      if (!mobile) setMobilePanel("canvas");
    };
    updateViewportState();
    window.addEventListener("resize", updateViewportState);
    return () => window.removeEventListener("resize", updateViewportState);
  }, []);

  useEffect(() => {
    if (isMobileViewport && selectedId) setMobilePanel("editor");
  }, [isMobileViewport, selectedId]);

  function addSection(type: string, afterId?: string | null) {
    const reg = COMPONENT_REGISTRY[type];
    if (!reg) return;
    const newSec: Section = { id: newId(), type, data: { ...reg.defaultData } };
    setSections((prev) => {
      if (!afterId) return [...prev, newSec];
      const idx = prev.findIndex((s) => s.id === afterId);
      const arr = [...prev];
      arr.splice(idx === -1 ? arr.length : idx + 1, 0, newSec);
      return arr;
    });
    setSelectedId(newSec.id);
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeData = active.data.current as
      | { isLibrary?: boolean; componentType?: string }
      | undefined;

    if (activeData?.isLibrary) {
      const type = activeData.componentType!;
      const overId = over.id as string;
      const reg = COMPONENT_REGISTRY[type];
      if (!reg) return;
      const newSec: Section = { id: newId(), type, data: { ...reg.defaultData } };
      setSections((prev) => {
        if (overId === "canvas-drop-zone") return [...prev, newSec];
        const idx = prev.findIndex((s) => s.id === overId);
        const arr = [...prev];
        arr.splice(idx === -1 ? arr.length : idx + 1, 0, newSec);
        return arr;
      });
      setSelectedId(newSec.id);
    } else {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setSections((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  }

  function updateSectionData(key: string, value: string) {
    if (!selectedId) return;
    setSections((prev) =>
      prev.map((s) => (s.id === selectedId ? { ...s, data: { ...s.data, [key]: value } } : s))
    );
  }

  function updateSectionArrayItem(arrayKey: string, index: number, subKey: string, value: string) {
    if (!selectedId) return;
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== selectedId) return s;
        const arr = [...(s.data[arrayKey] || [])];
        arr[index] = { ...arr[index], [subKey]: value };
        return { ...s, data: { ...s.data, [arrayKey]: arr } };
      })
    );
  }

  function replaceSectionData(nextData: Record<string, any>) {
    if (!selectedId) return;
    setSections((prev) => prev.map((s) => (s.id === selectedId ? { ...s, data: nextData } : s)));
  }

  async function handlePublish() {
    if (!uid || publishing) return;
    setPublishing(true);
    try {
      await setDoc(
        doc(db, "educators", uid),
        {
          builderConfig: {
            sections,
            themeKey,
            instituteName,
            instituteLogo,
            useGradient,
            publishedAt: Date.now(),
          },
          websiteConfig: {
            homepageSource: "builder",
          },
        },
        { merge: true }
      );
      toast.success("Site published!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to publish site.");
    } finally {
      setPublishing(false);
    }
  }

  function deleteSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function moveSection(id: string, dir: "up" | "down") {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      return arrayMove(prev, idx, newIdx);
    });
  }

  function handleResetCanvas() {
    setSections([]);
    setSelectedId(null);
    setShowResetModal(false);
    toast.success("Canvas reset successfully.");
  }

  const selectedSection = sections.find((s) => s.id === selectedId) || null;

  const canvasContent = (
    <div style={{ background: theme.bg }}>
      {sections.length === 0 && (
        <div
          style={{
            minHeight: 300,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "rgba(0,0,0,0.25)",
            fontSize: 14,
            textAlign: "center",
            padding: 40,
          }}
        >
          <div style={{ fontSize: 48 }}>🏗️</div>
          <div style={{ fontWeight: 600 }}>Start building your website</div>
          <div style={{ fontSize: 13 }}>
            Drag & drop components from the left panel,
            <br />
            or click any component to add it to your page.
          </div>
        </div>
      )}
      <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {sections.map((sec) => (
          <div key={sec.id} id={sec.id} data-section-type={sec.type}>
            <SortableSection
              section={sec}
              selected={selectedId === sec.id}
              onSelect={() => setSelectedId(sec.id)}
              onDelete={() => deleteSection(sec.id)}
              onMoveUp={() => moveSection(sec.id, "up")}
              onMoveDown={() => moveSection(sec.id, "down")}
              theme={theme}
              previewMode={previewMode}
              instituteName={instituteName}
              instituteLogo={instituteLogo}
              mobile={previewDevice === "mobile"}
              sections={sections}
            />
          </div>
        ))}
      </SortableContext>
      <CanvasDropZone>{sections.length === 0 && <div style={{ height: 120 }} />}</CanvasDropZone>
    </div>
  );

  if (!loaded) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 400,
          color: "rgba(0,0,0,0.4)",
          fontSize: 14,
        }}
      >
        Loading builder…
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <style>
        {`
          .ib-card {
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .ib-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 30px rgba(0,0,0,0.12) !important;
          }
        `}
      </style>
      <div
        className="-m-4 lg:-m-6"
        style={{
          height: "calc(100dvh - 64px)",
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#f0f0f5",
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            minHeight: isMobileViewport ? 44 : 52,
            background: "#fff",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            padding: isMobileViewport ? "4px 8px" : "8px 12px",
            gap: isMobileViewport ? 4 : 8,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: isMobileViewport ? 4 : 6 }}>
            <span style={{ fontSize: isMobileViewport ? 11 : 10 }}>🏫</span>
            <span
              style={{ fontSize: isMobileViewport ? 11 : 13, fontWeight: 600, color: "#1a1a2e" }}
            >
              {instituteName}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          {saving && (
            <span style={{ fontSize: isMobileViewport ? 9 : 11, color: "rgba(0,0,0,0.3)" }}>
              Saving…
            </span>
          )}

          {/* Edit / Preview toggle */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.06)",
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}
          >
            {(["Edit", "Preview"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setPreviewMode(mode === "Preview");
                  if (mode === "Edit") setSelectedId(null);
                }}
                style={{
                  padding: isMobileViewport ? "4px 8px" : "5px 14px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontSize: isMobileViewport ? 10 : 12,
                  fontWeight: 600,
                  background: (previewMode ? mode === "Preview" : mode === "Edit")
                    ? "rgba(99,102,241,0.85)"
                    : "transparent",
                  color: (previewMode ? mode === "Preview" : mode === "Edit")
                    ? "#fff"
                    : "rgba(0,0,0,0.4)",
                  transition: "all 0.15s",
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Device toggle (preview mode only) */}
          {previewMode && (
            <div
              style={{
                display: "flex",
                background: "rgba(0,0,0,0.06)",
                borderRadius: 8,
                padding: 2,
                gap: 2,
              }}
            >
              <button
                onClick={() => setPreviewDevice("desktop")}
                title="Desktop view"
                style={{
                  width: isMobileViewport ? 26 : 32,
                  height: isMobileViewport ? 24 : 28,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: previewDevice === "desktop" ? "#fff" : "transparent",
                  boxShadow: previewDevice === "desktop" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <Monitor
                  size={isMobileViewport ? 12 : 15}
                  color={previewDevice === "desktop" ? "#4f46e5" : "rgba(0,0,0,0.35)"}
                />
              </button>
              <button
                onClick={() => setPreviewDevice("mobile")}
                title="Mobile view"
                style={{
                  width: isMobileViewport ? 26 : 32,
                  height: isMobileViewport ? 24 : 28,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: previewDevice === "mobile" ? "#fff" : "transparent",
                  boxShadow: previewDevice === "mobile" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                }}
              >
                <Smartphone
                  size={isMobileViewport ? 12 : 15}
                  color={previewDevice === "mobile" ? "#4f46e5" : "rgba(0,0,0,0.35)"}
                />
              </button>
            </div>
          )}

          <div
            style={{
              width: isMobileViewport ? 14 : 20,
              height: isMobileViewport ? 14 : 20,
              borderRadius: "50%",
              background: theme.primary,
              border: "2px solid rgba(0,0,0,0.12)",
              flexShrink: 0,
            }}
          />
          {isMobileViewport && !previewMode && (
            <>
              <button
                onClick={() => setMobilePanel("sections")}
                style={{
                  background: mobilePanel === "sections" ? "#4f46e5" : "#fff",
                  color: mobilePanel === "sections" ? "#fff" : "#111827",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 8,
                  padding: "5px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Sections
              </button>
              <button
                onClick={() => setMobilePanel("editor")}
                style={{
                  background: mobilePanel === "editor" ? "#4f46e5" : "#fff",
                  color: mobilePanel === "editor" ? "#fff" : "#111827",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 8,
                  padding: "5px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Editor
              </button>
              <button
                onClick={() => setMobilePanel("canvas")}
                style={{
                  background: mobilePanel === "canvas" ? "#4f46e5" : "#fff",
                  color: mobilePanel === "canvas" ? "#fff" : "#111827",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 8,
                  padding: "5px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Canvas
              </button>
            </>
          )}
          <button
            onClick={() => setShowResetModal(true)}
            disabled={sections.length === 0}
            style={{
              background: "#fff",
              color: "#b91c1c",
              border: "1px solid rgba(185,28,28,0.25)",
              borderRadius: 8,
              padding: isMobileViewport ? "5px 6px" : "7px 12px",
              fontSize: isMobileViewport ? 10 : 12,
              fontWeight: 700,
              cursor: sections.length === 0 ? "not-allowed" : "pointer",
              opacity: sections.length === 0 ? 0.5 : 1,
            }}
          >
            Reset Canvas
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: isMobileViewport ? "5px 10px" : "7px 18px",
              fontSize: isMobileViewport ? 11 : 13,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 12px rgba(99,102,241,0.4)",
              opacity: publishing ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: isMobileViewport ? 3 : 6,
            }}
          >
            {publishing ? (
              <>
                <Loader2 size={isMobileViewport ? 12 : 14} className="animate-spin" /> Publishing…
              </>
            ) : (
              "Publish Site →"
            )}
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left Sidebar — hidden in preview */}
          {!previewMode && (!isMobileViewport || mobilePanel === "sections") && (
            <LeftSidebar
              sections={sections}
              onAdd={(type) => addSection(type, selectedId)}
              selectedId={selectedId}
              onSelectSection={setSelectedId}
              onDeleteSection={deleteSection}
              themeKey={themeKey}
              setThemeKey={setThemeKey}
              instituteName={instituteName}
              setInstituteName={setInstituteName}
              instituteLogo={instituteLogo}
              setInstituteLogo={setInstituteLogo}
              uid={uid}
              collapsed={leftPanelCollapsed}
              onToggleCollapse={() => setLeftPanelCollapsed((prev) => !prev)}
              mobile={isMobileViewport}
              useGradient={useGradient}
              setUseGradient={setUseGradient}
              themeMode={themeMode}
              setThemeMode={setThemeMode}
              customColor={customColor}
              setCustomColor={setCustomColor}
            />
          )}

          {/* Canvas */}
          <div
            id="builder-preview-scroll"
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              display:
                !isMobileViewport || previewMode || mobilePanel === "canvas" ? "block" : "none",
            }}
          >
            {previewMode && previewDevice === "mobile" ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "24px 16px",
                  minHeight: "100%",
                }}
              >
                <div
                  style={{
                    width: 390,
                    flexShrink: 0,
                    borderRadius: 36,
                    overflow: "hidden",
                    boxShadow: "0 0 0 10px #1a1a2e, 0 30px 80px rgba(0,0,0,0.4)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      height: 28,
                      background: "#1a1a2e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div style={{ width: 80, height: 6, borderRadius: 3, background: "#333" }} />
                  </div>
                  <div style={{ maxHeight: "70vh", overflowY: "auto" }}>{canvasContent}</div>
                  <div style={{ height: 20, background: "#1a1a2e" }} />
                </div>
              </div>
            ) : (
              canvasContent
            )}
          </div>

          {/* Right Panel — hidden in preview */}
          {!previewMode && (!isMobileViewport || mobilePanel === "editor") && (
            <RightPanel
              section={selectedSection}
              onUpdate={updateSectionData}
              onUpdateArrayItem={updateSectionArrayItem}
              onReplaceData={replaceSectionData}
              uid={uid}
              sections={sections}
              mobile={isMobileViewport}
            />
          )}
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeId &&
          activeId.startsWith("lib:") &&
          (() => {
            const type = activeId.replace("lib:", "");
            const entry = COMPONENT_REGISTRY[type];
            return entry ? (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 10,
                  padding: "10px 16px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#374151",
                  border: "2px solid #6366f1",
                }}
              >
                <span>{entry.icon}</span>
                <span>{entry.label}</span>
              </div>
            ) : null;
          })()}
        {activeId &&
          !activeId.startsWith("lib:") &&
          (() => {
            const sec = sections.find((s) => s.id === activeId);
            if (!sec) return null;
            const Comp = COMPONENT_REGISTRY[sec.type]?.component;
            return Comp ? (
              <div
                style={{
                  opacity: 0.85,
                  transform: "scale(0.97)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                  pointerEvents: "none",
                }}
              >
                <Comp
                  data={sec.data}
                  theme={theme}
                  selected={false}
                  onClick={() => {}}
                  instituteName={instituteName}
                  instituteLogo={instituteLogo}
                  mobile={previewDevice === "mobile"}
                  sections={sections}
                />
              </div>
            ) : null;
          })()}
      </DragOverlay>
      {showResetModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setShowResetModal(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
              Reset entire canvas?
            </div>
            <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6, marginBottom: 18 }}>
              This will remove all sections from the builder canvas. This action cannot be undone.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setShowResetModal(false)}
                style={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  color: "#111827",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleResetCanvas}
                style={{
                  border: "none",
                  background: "#b91c1c",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
