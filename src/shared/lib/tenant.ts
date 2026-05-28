const LOCAL_TENANT_KEY = "univ_local_tenant";

function sanitizeDomain(rawDomain: string): string {
  const cleaned = String(rawDomain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^\.+|\.+$/g, "")
    .replace(/^www\./, "");

  return cleaned || "preparekaro.in";
}

export function getConfiguredAppDomain(): string {
  return getConfiguredAppDomains()[0];
}

function getConfiguredAppDomains(): string[] {
  const fromList = String(import.meta.env.VITE_APP_DOMAINS || "")
    .split(",")
    .map((x) => sanitizeDomain(x))
    .filter(Boolean);

  const legacy = [
    import.meta.env.VITE_APP_DOMAIN as string | undefined,
    import.meta.env.VITE_APP_BASE_DOMAIN as string | undefined,
    "preparekaro.in",
  ]
    .map((x) => sanitizeDomain(String(x || "")))
    .filter(Boolean);

  const unique: string[] = [];
  for (const domain of [...fromList, ...legacy]) {
    if (!unique.includes(domain)) unique.push(domain);
  }
  return unique;
}

function normalizeSlug(value: string | null | undefined): string | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;

  // Keep slug format strict to avoid accidental host/query abuse.
  if (!/^[a-z0-9-]+$/.test(raw)) return null;
  return raw;
}

function getTenantFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return normalizeSlug(params.get("tenant"));
}

function isPreviewHost(hostname: string): boolean {
  return hostname.endsWith(".vercel.app");
}

function shouldAllowQueryFallbackOnAnyHost(): boolean {
  return (
    String(import.meta.env.VITE_ALLOW_QUERY_TENANT_FALLBACK || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".lvh.me")
  );
}

function isReservedSubdomain(subdomain: string): boolean {
  const defaults = ["www", "app", "admin", "api", "dev", "staging", "preview", "pay"];
  const extra = String(import.meta.env.VITE_RESERVED_SUBDOMAINS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  const reserved = new Set([...defaults, ...extra]);
  return reserved.has(subdomain);
}

export function getPersistedLocalTenant(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(LOCAL_TENANT_KEY);
}

export function persistLocalTenant(slug: string | null) {
  if (typeof window === "undefined") return;
  if (slug) {
    sessionStorage.setItem(LOCAL_TENANT_KEY, slug);
  } else {
    sessionStorage.removeItem(LOCAL_TENANT_KEY);
  }
}

function getBaseDomainFromHostname(hostname: string): string {
  const parts = hostname.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : hostname;
}

function findMatchingConfiguredDomain(hostname: string): string | null {
  const domains = getConfiguredAppDomains();
  let bestMatch: string | null = null;

  for (const domain of domains) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      if (!bestMatch || domain.length > bestMatch.length) {
        bestMatch = domain;
      }
    }
  }

  return bestMatch;
}

export function getTenantSlugFromHostname(hostnameArg?: string): string | null {
  const hostname = (
    hostnameArg || (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase();
  const tenantFromQuery = getTenantFromQuery();

  // LOCAL DEV SUPPORT
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    if (tenantFromQuery) {
      persistLocalTenant(tenantFromQuery);
      return tenantFromQuery;
    }
    return getPersistedLocalTenant();
  }

  // Support for wildcard localhost subdomains (e.g. coaching.localhost or coaching.lvh.me)
  if (hostname.endsWith(".localhost")) {
    return hostname.replace(".localhost", "");
  }
  if (hostname.endsWith(".lvh.me")) {
    return hostname.replace(".lvh.me", "");
  }

  const appDomain = findMatchingConfiguredDomain(hostname);

  if (!appDomain) {
    const parts = hostname.split(".");
    if (parts.length > 2) {
      const subdomain = parts[0];
      if (!isReservedSubdomain(subdomain)) {
        return normalizeSlug(subdomain);
      }
    }
    if (tenantFromQuery) {
      persistLocalTenant(tenantFromQuery);
      return tenantFromQuery;
    }
    return getPersistedLocalTenant();
  }

  const parts = hostname.split(".");
  const domainParts = appDomain.split(".");

  const hostSuffix = parts.slice(-domainParts.length).join(".");
  if (hostSuffix !== appDomain) {
    // Vercel preview domains can't use wildcard tenant subdomains by default,
    // so allow explicit ?tenant=slug for dev/staging validation.
    if (isPreviewHost(hostname) && tenantFromQuery) {
      persistLocalTenant(tenantFromQuery);
      return tenantFromQuery;
    }
    return null;
  }

  if (parts.length === domainParts.length) {
    if (tenantFromQuery) {
      persistLocalTenant(tenantFromQuery);
      return tenantFromQuery;
    }
    return null;
  }

  const subdomain = parts[0];
  if (isReservedSubdomain(subdomain)) {
    if (tenantFromQuery) {
      persistLocalTenant(tenantFromQuery);
      return tenantFromQuery;
    }
    return null;
  }

  return normalizeSlug(subdomain);
}

export function buildTenantUrl(tenantSlug: string, path = "/"): string {
  const normalizedSlug = normalizeSlug(tenantSlug);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!normalizedSlug) return normalizedPath;

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    const protocol = window.location.protocol || "https:";
    const host = window.location.host || hostname;

    if (isLocalHost(hostname) || isPreviewHost(hostname)) {
      const url = new URL(normalizedPath, `${protocol}//${host}`);
      url.searchParams.set("tenant", normalizedSlug);
      return url.toString();
    }

    const activeDomain =
      findMatchingConfiguredDomain(hostname) ?? getBaseDomainFromHostname(hostname);
    return `${protocol}//${normalizedSlug}.${activeDomain}${normalizedPath}`;
  }

  return `https://${normalizedSlug}.${getConfiguredAppDomain()}${normalizedPath}`;
}
