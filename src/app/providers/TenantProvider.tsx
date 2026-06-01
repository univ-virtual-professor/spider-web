import React, { createContext, useContext, useEffect, useState } from "react";
import { getTenantSlugFromHostname } from "@shared/lib/tenant";
import { db } from "@shared/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@app/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";

export type TenantProfile = {
  educatorId: string;
  tenantSlug: string;
  coachingName?: string;
  instituteLogo?: string;
  tagline?: string;
  contact?: { phone?: string; email?: string; address?: string };
  socials?: Record<string, string | null>;
  websiteConfig?: any;
  builderConfig?: {
    sections: any[];
    themeKey: string;
    instituteName: string;
    instituteLogo?: string;
    themeOverrides?: any;
    publishedAt?: number;
    useGradient?: boolean;
    themeMode?: "preset" | "custom";
    customColor?: string;
  };
  testDefaults?: {
    attemptsAllowed?: number;
  };
  welcomeMessage?: { message?: string; isActive?: boolean };
  quotes?: string[];
};

type TenantContextValue = {
  tenant: TenantProfile | null;
  tenantSlug: string | null;
  isTenantDomain: boolean;
  loading: boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

async function fetchTenantProfile(tenantSlug: string | null): Promise<TenantProfile | null> {
  if (!tenantSlug) return null;

  // tenants/{slug} -> educatorId
  const mapSnap = await getDoc(doc(db, "tenants", tenantSlug));
  if (!mapSnap.exists()) return null;

  const map = mapSnap.data() as any;
  const educatorId = String(map?.educatorId || "").trim();
  if (!educatorId) return null;

  // educators/{id} -> metadata + website config
  const eduSnap = await getDoc(doc(db, "educators", educatorId));
  const data: any = eduSnap.exists() ? eduSnap.data() : {};
  const builderConfig = data?.builderConfig || null;
  const websiteConfig = data?.websiteConfig || {};

  return {
    educatorId,
    tenantSlug,
    coachingName: builderConfig?.instituteName || websiteConfig?.coachingName || data?.coachingName,
    instituteLogo: builderConfig?.instituteLogo || websiteConfig?.logoUrl || data?.photoURL,
    tagline: websiteConfig?.tagline || data?.tagline,
    contact: {
      phone:
        websiteConfig?.contact?.phone ||
        websiteConfig?.socials?.phone ||
        data?.contact?.phone ||
        data?.phone ||
        "",
      email:
        websiteConfig?.contact?.email ||
        websiteConfig?.socials?.email ||
        data?.contact?.email ||
        data?.email ||
        "",
      address: websiteConfig?.contact?.address || data?.contact?.address || data?.address || "",
    },
    socials: websiteConfig?.socials || data?.socials,
    websiteConfig,
    builderConfig: data?.builderConfig || null,
    testDefaults: data?.testDefaults || {},
    welcomeMessage: data?.welcomeMessage || null,
    quotes: Array.isArray(data?.quotes) ? data.quotes : [],
  };
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [isTenantDomain, setIsTenantDomain] = useState(false);

  useEffect(() => {
    const imp = !!sessionStorage.getItem("imp_session");
    const fromHostname = getTenantSlugFromHostname(window.location.hostname);

    if (fromHostname) {
      setTenantSlug(fromHostname);
      setIsTenantDomain(true);
      return;
    }

    // Only use profile.tenantSlug as fallback during admin impersonation (main domain, no hostname slug)
    if (imp && profile?.tenantSlug) {
      setTenantSlug(profile.tenantSlug);
      setIsTenantDomain(true);
      return;
    }

    setTenantSlug(null);
    setIsTenantDomain(false);
  }, [profile?.tenantSlug, authLoading]);

  const { data: tenant = null, isLoading } = useQuery({
    queryKey: ["tenantProfile", tenantSlug],
    queryFn: () => fetchTenantProfile(tenantSlug),
    enabled: tenantSlug !== null,
    // Provide a longer staleTime for highly static configuration data
    staleTime: 5 * 60 * 1000,
  });

  return (
    <TenantContext.Provider
      value={{
        tenant,
        tenantSlug,
        isTenantDomain,
        loading: authLoading || (isLoading && tenantSlug !== null),
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
