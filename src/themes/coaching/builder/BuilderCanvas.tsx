import React from "react";
import {
  COMPONENT_REGISTRY,
  THEME_PRESETS,
  createCustomTheme,
  type ThemeKey,
  type Section,
  type Theme,
} from "@features/educator/InstituteBuilder";

type BuilderCanvasProps = {
  sections: Section[];
  themeKey?: ThemeKey | string;
  themeMode?: "preset" | "custom";
  customColor?: string;
  useGradient?: boolean;
  tenantSlug?: string;
};

export default function BuilderCanvas({
  sections,
  themeKey = "indigo",
  themeMode = "preset",
  customColor = "",
  useGradient = false,
  tenantSlug,
}: BuilderCanvasProps) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const updateViewport = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const safeThemeKey = (themeKey in THEME_PRESETS ? themeKey : "indigo") as ThemeKey;
  const theme: Theme =
    themeMode === "custom" && customColor
      ? createCustomTheme(customColor, useGradient)
      : { ...THEME_PRESETS[safeThemeKey], useGradient };

  return (
    <div style={{ background: theme.bg }}>
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
      {sections.map((section) => {
        const reg = COMPONENT_REGISTRY[section.type];
        if (!reg) return null;
        const Comp = reg.component;
        return (
          <div key={section.id} id={section.id || section.type?.toLowerCase().replace(/\s+/g, "-")}>
            <Comp
              data={section.data || {}}
              theme={theme}
              selected={false}
              onClick={() => {}}
              previewMode
              mobile={isMobile}
              sections={sections}
              tenantSlug={tenantSlug}
            />
          </div>
        );
      })}
    </div>
  );
}
