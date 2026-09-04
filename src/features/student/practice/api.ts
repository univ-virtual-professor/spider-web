// monkey-king personalized practice API — same pattern as StudentReports.tsx's
// fetchReport/triggerRecompute (VITE_MONKEY_KING_API_URL, Firebase ID token auth).

const API_BASE = import.meta.env.VITE_MONKEY_KING_API_URL as string;

export type WeakAreaFilter = {
  subject: string;
  chapter: string;
  topic: string;
  weighted_accuracy: number;
  attempt_count: number;
};

export type FilterTree = Record<string, { chapters: string[]; topics: string[] }>;

export type PersonalizedFilters = {
  filterTree: FilterTree;
  weakAreas: WeakAreaFilter[];
  reportStatus: "full" | "partial" | "no_data";
};

export type GenerateRequest = {
  mode: "auto" | "custom";
  subject?: string;
  chapters?: string[];
  topics?: string[];
  difficulty?: string;
  question_count: number;
};

async function monkeyKingFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const getPersonalizedFilters = (token: string) =>
  monkeyKingFetch(token, "/api/test/personalized/filters") as Promise<PersonalizedFilters>;

export const generatePersonalizedTest = (token: string, req: GenerateRequest) =>
  monkeyKingFetch(token, "/api/test/personalized/generate", {
    method: "POST",
    body: JSON.stringify(req),
  }) as Promise<{ testId: string }>;
