import type { ReactNode } from "react";
import LandingNavbar from "./LandingNavbar";
import LandingFooter from "./LandingFooter";

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <LandingNavbar />
      <main style={{ paddingTop: 68 }}>{children}</main>
      <LandingFooter />
    </div>
  );
}
