// src/themes/coaching/builder/TenantHome.tsx
//
// Renders the educator's public landing page using the sections they built
// in the Website Builder (InstituteBuilder.tsx). Reads builderConfig from
// the educators/{uid} Firestore document via TenantProvider.

import React from "react";
import { useTenant } from "@app/providers/TenantProvider";
import { useFavicon } from "@shared/hooks/useFavicon";
import { Link } from "react-router-dom";

import {
  THEME_PRESETS,
  createCustomTheme,
  type ThemeKey,
} from "@features/educator/InstituteBuilder";

import BuilderCanvas from "./BuilderCanvas";
import { Loader2, Phone } from "lucide-react";

export default function BuilderThemeHome() {
  const [isMobile, setIsMobile] = React.useState(false);
  const { tenant, loading } = useTenant();

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const coachingName = tenant?.coachingName || "Institute";
  const logoUrl = tenant?.instituteLogo;

  useFavicon(logoUrl, coachingName);
  const handleSectionScroll = React.useCallback((e: React.MouseEvent, target: string) => {
    if (!target.startsWith("#")) return;
    e.preventDefault();
    const id = target.substring(1);
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -52;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, []);

  React.useEffect(() => {
    const handleHashClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (
        anchor &&
        anchor.hash &&
        anchor.origin === window.location.origin &&
        anchor.pathname === window.location.pathname
      ) {
        handleSectionScroll(e as any, anchor.hash);
      }
    };
    window.addEventListener("click", handleHashClick);
    return () => window.removeEventListener("click", handleHashClick);
  }, [handleSectionScroll]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-3 h-6 w-6 animate-spin" />
        <span className="font-medium">Loading...</span>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 className="text-2xl font-bold">Coaching not found</h2>
        <p className="max-w-md text-muted-foreground">
          This coaching website does not exist. Check the URL or contact support.
        </p>
      </div>
    );
  }

  const builderConfig = tenant.builderConfig;
  const contactSection = builderConfig?.sections?.find((s: any) => s.type === "contact");
  const navbarPhone = contactSection?.data?.phone || tenant.contact?.phone;

  const themeKey = (builderConfig?.themeKey || "indigo") as ThemeKey;
  const useGradient = builderConfig?.useGradient || false;
  const themeMode = builderConfig?.themeMode || "preset";
  const customColor = builderConfig?.customColor || "";

  const theme =
    themeMode === "custom" && customColor
      ? createCustomTheme(customColor, useGradient)
      : { ...(THEME_PRESETS[themeKey] || THEME_PRESETS.indigo), useGradient };

  if (!builderConfig || !builderConfig.sections || builderConfig.sections.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div style={{ fontSize: 48 }}>🏗️</div>
        <h2 className="text-2xl font-bold">{coachingName}</h2>
        <p className="max-w-md text-muted-foreground">
          This website is being set up. Check back soon!
        </p>
        <Link
          to="/login"
          style={{
            background: theme.primary,
            color: "#fff",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Minimal nav with login link */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: theme.useGradient
            ? `linear-gradient(to right, ${theme.surface}, ${theme.bg})`
            : theme.surface,
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${theme.primary}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "0 16px" : "0 24px",
          height: 52,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={coachingName}
              style={{ height: 32, width: 32, borderRadius: 8, objectFit: "contain" }}
            />
          ) : (
            <div
              style={{
                height: 32,
                width: 32,
                borderRadius: 8,
                background: theme.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              {coachingName[0]?.toUpperCase() || "I"}
            </div>
          )}
          {!isMobile && (
            <span style={{ fontWeight: 700, fontSize: 15, color: theme.text || "#1a1a2e" }}>
              {coachingName}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {navbarPhone && (
            <a
              href={`tel:${navbarPhone}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: theme.text || "#1a1a2e",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                marginRight: 4,
              }}
            >
              <div
                style={{
                  width: isMobile ? 24 : 32,
                  height: isMobile ? 24 : 32,
                  borderRadius: "50%",
                  background: `${theme.primary}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Phone size={isMobile ? 12 : 14} color={theme.primary} />
              </div>
              <span style={{ fontSize: isMobile ? 12 : 14 }}>{navbarPhone}</span>
            </a>
          )}
          <Link
            to="/login"
            style={{
              background: theme.primary,
              color: "#fff",
              borderRadius: 8,
              padding: isMobile ? "4px 8px" : "6px 16px",
              fontSize: isMobile ? 11 : 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {isMobile ? "Login" : "Student Login"}
          </Link>
        </div>
      </nav>

      {/* Render the builder sections */}
      <BuilderCanvas
        sections={builderConfig.sections}
        themeKey={themeKey}
        useGradient={useGradient}
        themeMode={themeMode}
        customColor={customColor}
        tenantSlug={tenant.tenantSlug}
      />
    </div>
  );
}
