import React from "react";
import {
  COMPONENT_REGISTRY,
  THEME_PRESETS,
  type ThemeKey,
  type Section,
  type Theme,
} from "@features/educator/InstituteBuilder";

type BuilderCanvasProps = {
  sections: Section[];
  themeKey?: ThemeKey | string;
  themeOverrides?: Partial<Theme>;
};

export default function BuilderCanvas({
  sections,
  themeKey = "indigo",
  themeOverrides = {},
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
  const baseTheme = THEME_PRESETS[safeThemeKey];
  const theme: Theme = { ...baseTheme, ...themeOverrides };

  return (
    <div style={{ background: theme.bg }}>
      {sections.map((section) => {
        const reg = COMPONENT_REGISTRY[section.type];
        if (!reg) return null;
        const Comp = reg.component;
        return (
          <Comp
            key={section.id}
            data={section.data || {}}
            theme={theme}
            selected={false}
            onClick={() => {}}
            previewMode
            isMobile={isMobile}
          />
        );
      })}
    </div>
  );
}
