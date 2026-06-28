import { useEffect, useState } from "react";
import { collection, getDocs, query, where, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@shared/lib/firebase";

export type RawQBQ = {
  chapter: string;
  topics: string[];
  tags: string[];
};

type QBOptions = {
  chapters: string[];
  topics: string[];
  tags: string[];
  loading: boolean;
  rawQuestions: RawQBQ[];
};

type CacheResult = Omit<QBOptions, "loading">;

type CacheEntry = {
  result: CacheResult;
  fetchedAt: number;
  // In-flight promise so concurrent mounts piggyback instead of firing duplicate fetches
  promise?: Promise<CacheResult>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const EMPTY: CacheResult = { chapters: [], topics: [], tags: [], rawQuestions: [] };

function parseResult(docs: QueryDocumentSnapshot[]): CacheResult {
  const chapterSet = new Set<string>();
  const topicSet = new Set<string>();
  const tagSet = new Set<string>();
  const rawQuestions: RawQBQ[] = [];

  docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;

    const ch = data.chapter;
    const chapter = ch && typeof ch === "string" && ch.trim() ? ch.trim() : "";
    if (chapter) chapterSet.add(chapter);

    const docTopics: string[] = [];
    const t = data.topic;
    if (t && typeof t === "string" && t.trim()) {
      topicSet.add(t.trim());
      docTopics.push(t.trim());
    }
    const ts = data.topics;
    if (Array.isArray(ts)) {
      ts.forEach((tp) => {
        if (tp && typeof tp === "string" && tp.trim()) {
          topicSet.add(tp.trim());
          if (!docTopics.includes(tp.trim())) docTopics.push(tp.trim());
        }
      });
    }

    const docTags: string[] = [];
    const tgs = data.tags;
    if (Array.isArray(tgs)) {
      tgs.forEach((tag) => {
        if (tag && typeof tag === "string" && tag.trim()) {
          tagSet.add(tag.trim());
          docTags.push(tag.trim());
        }
      });
    }

    rawQuestions.push({ chapter, topics: docTopics, tags: docTags });
  });

  return {
    chapters: Array.from(chapterSet).sort(),
    topics: Array.from(topicSet).sort(),
    tags: Array.from(tagSet).sort(),
    rawQuestions,
  };
}

async function doFetch(subjectIds: string[] | undefined, educatorUid: string | undefined): Promise<CacheResult> {
  const docSets: QueryDocumentSnapshot[][] = [];

  // Root admin QB
  if (subjectIds === undefined) {
    const snap = await getDocs(collection(db, "question_bank"));
    docSets.push(snap.docs);
  } else if (subjectIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < subjectIds.length; i += 30) {
      chunks.push(subjectIds.slice(i, i + 30));
    }
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(collection(db, "question_bank"), where("subjectId", "in", chunk)))
      )
    );
    docSets.push(snaps.flatMap((snap) => snap.docs));
  }

  // Educator's own QB
  if (educatorUid) {
    const edSnap = await getDocs(collection(db, "educators", educatorUid, "question_bank"));
    docSets.push(edSnap.docs);
  }

  return parseResult(docSets.flat());
}

function getOrFetch(key: string, subjectIds: string[] | undefined, educatorUid: string | undefined): Promise<CacheResult> {
  const existing = cache.get(key);

  // Return in-flight promise if one exists (deduplicates concurrent mounts)
  if (existing?.promise) return existing.promise;

  // Return cached result wrapped in a resolved promise if still fresh
  if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(existing.result);
  }

  const promise = doFetch(subjectIds, educatorUid).then((result) => {
    cache.set(key, { result, fetchedAt: Date.now() });
    return result;
  });

  cache.set(key, { result: existing?.result ?? EMPTY, fetchedAt: existing?.fetchedAt ?? 0, promise });

  promise.finally(() => {
    // Clear the in-flight promise marker so future calls see the settled entry
    const entry = cache.get(key);
    if (entry?.promise === promise) {
      cache.set(key, { result: entry.result, fetchedAt: entry.fetchedAt });
    }
  });

  return promise;
}

/**
 * Fetches QB-derived filter options (chapters, topics, tags).
 * - subjectIds=undefined → fetch all from admin root QB (admin, no scoping)
 * - subjectIds=[] → empty (educator with no accessible subjects)
 * - subjectIds=[...] → filter admin root QB by those subject IDs
 * - educatorUid provided → also queries educators/{uid}/question_bank and merges results
 *
 * Results are cached in memory for 5 minutes and shared across all component instances
 * with the same key, so navigating between pages or mounting multiple consumers does
 * not trigger redundant Firestore reads.
 */
export function useQBOptions(subjectIds?: string[], educatorUid?: string): QBOptions {
  const key =
    (subjectIds === undefined ? "__all__" : JSON.stringify([...subjectIds].sort())) +
    "|" +
    (educatorUid ?? "");

  const isEmptyScope = Array.isArray(subjectIds) && subjectIds.length === 0 && !educatorUid;

  const getCachedResult = (): CacheResult | null => {
    if (isEmptyScope) return EMPTY;
    const entry = cache.get(key);
    if (entry && !entry.promise && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.result;
    return null;
  };

  const initial = getCachedResult();
  const [result, setResult] = useState<CacheResult>(initial ?? EMPTY);
  const [loading, setLoading] = useState(initial === null && !isEmptyScope);

  useEffect(() => {
    if (isEmptyScope) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }

    const cached = getCachedResult();
    if (cached) {
      setResult(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getOrFetch(key, subjectIds, educatorUid)
      .then((r) => {
        if (!cancelled) {
          setResult(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("useQBOptions:", e);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...result, loading };
}

/** Call after adding/editing questions to bust the in-memory filter cache. */
export function invalidateQBOptionsCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
