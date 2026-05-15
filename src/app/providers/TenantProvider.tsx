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
  tagline?: string;
  contact?: { phone?: string; email?: string; address?: string };
  socials?: Record<string, string | null>;
  websiteConfig?: any;
  builderConfig?: {
    sections: any[];
    themeKey: string;
    instituteName: string;
    themeOverrides?: any;
    publishedAt?: number;
  };
  testDefaults?: {
    attemptsAllowed?: number;
  };
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
  const websiteConfig = data?.websiteConfig || {};

  return {
    educatorId,
    tenantSlug,
    coachingName: websiteConfig?.coachingName || data?.coachingName,
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
  };
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [isTenantDomain, setIsTenantDomain] = useState(false);

  useEffect(() => {
    const slugFromHostname = getTenantSlugFromHostname(window.location.hostname);

    if (slugFromHostname) {
      setTenantSlug(slugFromHostname);
      setIsTenantDomain(true);
      return;
    }

    if (profile?.tenantSlug) {
      setTenantSlug(profile.tenantSlug);
      setIsTenantDomain(false);
      return;
    }

    setTenantSlug(null);
    setIsTenantDomain(false);
  }, [profile?.tenantSlug]);

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
        loading: isLoading && tenantSlug !== null,
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
