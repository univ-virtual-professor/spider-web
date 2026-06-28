import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@shared/lib/firebase";

export type RawQBQ = {
  chapter: string;
  topics: string[];
  tags: string[];
};

export type QBCrossRefs = {
  chapterTopics:  Record<string, string[]>;
  chapterTags:    Record<string, string[]>;
  topicChapters:  Record<string, string[]>;
  topicTags:      Record<string, string[]>;
  tagChapters:    Record<string, string[]>;
  tagTopics:      Record<string, string[]>;
};

const EMPTY_CROSS_REFS: QBCrossRefs = {
  chapterTopics: {},
  chapterTags:   {},
  topicChapters: {},
  topicTags:     {},
  tagChapters:   {},
  tagTopics:     {},
};

type QBOptions = {
  chapters:     string[];
  topics:       string[];
  tags:         string[];
  loading:      boolean;
  rawQuestions: RawQBQ[];
  crossRefs:    QBCrossRefs;
};

type CacheResult = Omit<QBOptions, "loading">;

type CacheEntry = {
  result:    CacheResult;
  fetchedAt: number;
  promise?:  Promise<CacheResult>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const EMPTY: CacheResult = {
  chapters:     [],
  topics:       [],
  tags:         [],
  rawQuestions: [],
  crossRefs:    EMPTY_CROSS_REFS,
};

function parsePairs(pairs: string[], sep = "::"): [string, string][] {
  return pairs
    .map((p) => p.split(sep) as [string, string])
    .filter(([a, b]) => a && b);
}

function buildCrossRefs(data: Record<string, unknown>): QBCrossRefs {
  const chTpPairs = parsePairs((data.ch_tp_pairs as string[] | undefined) ?? []);
  const chTgPairs = parsePairs((data.ch_tg_pairs as string[] | undefined) ?? []);
  const tpTgPairs = parsePairs((data.tp_tg_pairs as string[] | undefined) ?? []);

  const chapterTopics:  Record<string, Set<string>> = {};
  const chapterTags:    Record<string, Set<string>> = {};
  const topicChapters:  Record<string, Set<string>> = {};
  const topicTags:      Record<string, Set<string>> = {};
  const tagChapters:    Record<string, Set<string>> = {};
  const tagTopics:      Record<string, Set<string>> = {};

  for (const [ch, tp] of chTpPairs) {
    (chapterTopics[ch]  ??= new Set()).add(tp);
    (topicChapters[tp]  ??= new Set()).add(ch);
  }
  for (const [ch, tg] of chTgPairs) {
    (chapterTags[ch]    ??= new Set()).add(tg);
    (tagChapters[tg]    ??= new Set()).add(ch);
  }
  for (const [tp, tg] of tpTgPairs) {
    (topicTags[tp]      ??= new Set()).add(tg);
    (tagTopics[tg]      ??= new Set()).add(tp);
  }

  const toRecord = (m: Record<string, Set<string>>): Record<string, string[]> =>
    Object.fromEntries(Object.entries(m).map(([k, s]) => [k, Array.from(s).sort()]));

  return {
    chapterTopics:  toRecord(chapterTopics),
    chapterTags:    toRecord(chapterTags),
    topicChapters:  toRecord(topicChapters),
    topicTags:      toRecord(topicTags),
    tagChapters:    toRecord(tagChapters),
    tagTopics:      toRecord(tagTopics),
  };
}

async function doFetch(
  subjectIds: string[] | undefined,
  educatorUid: string | undefined
): Promise<CacheResult> {
  const chSet = new Set<string>();
  const tpSet = new Set<string>();
  const tgSet = new Set<string>();
  const allDocs: Record<string, unknown>[] = [];

  const merge = (data: Record<string, unknown>) => {
    (data.chapters as string[] | undefined ?? []).forEach((v) => v && chSet.add(v));
    (data.topics   as string[] | undefined ?? []).forEach((v) => v && tpSet.add(v));
    (data.tags     as string[] | undefined ?? []).forEach((v) => v && tgSet.add(v));
    allDocs.push(data);
  };

  // Admin QB index (always read when subjectIds given or admin context)
  if (subjectIds === undefined) {
    const snaps = await getDocs(collection(db, "question_bank_meta"));
    snaps.forEach((d) => merge(d.data() as Record<string, unknown>));
  } else if (subjectIds.length > 0) {
    const snaps = await Promise.all(
      subjectIds.map((id) => getDoc(doc(db, "question_bank_meta", id)))
    );
    snaps.forEach((d) => d.exists() && merge(d.data() as Record<string, unknown>));
  }

  // Educator's own QB index (merged on top)
  if (educatorUid) {
    const snap = await getDoc(
      doc(db, "educators", educatorUid, "question_bank_meta", "summary")
    );
    if (snap.exists()) merge(snap.data() as Record<string, unknown>);
  }

  // Merge cross-refs from all docs
  const mergedCrossRef: Record<string, unknown> = {
    ch_tp_pairs: allDocs.flatMap((d) => (d.ch_tp_pairs as string[] | undefined) ?? []),
    ch_tg_pairs: allDocs.flatMap((d) => (d.ch_tg_pairs as string[] | undefined) ?? []),
    tp_tg_pairs: allDocs.flatMap((d) => (d.tp_tg_pairs as string[] | undefined) ?? []),
  };

  return {
    chapters:     Array.from(chSet).sort(),
    topics:       Array.from(tpSet).sort(),
    tags:         Array.from(tgSet).sort(),
    rawQuestions: [],
    crossRefs:    buildCrossRefs(mergedCrossRef),
  };
}

function getOrFetch(
  key: string,
  subjectIds: string[] | undefined,
  educatorUid: string | undefined
): Promise<CacheResult> {
  const existing = cache.get(key);

  if (existing?.promise) return existing.promise;

  if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(existing.result);
  }

  const promise = doFetch(subjectIds, educatorUid).then((result) => {
    cache.set(key, { result, fetchedAt: Date.now() });
    return result;
  });

  cache.set(key, { result: existing?.result ?? EMPTY, fetchedAt: existing?.fetchedAt ?? 0, promise });

  promise.finally(() => {
    const entry = cache.get(key);
    if (entry?.promise === promise) {
      cache.set(key, { result: entry.result, fetchedAt: entry.fetchedAt });
    }
  });

  return promise;
}

/**
 * Returns QB filter options (chapters, topics, tags, crossRefs) by reading
 * lightweight precomputed index documents — never scans the full question_bank.
 *
 * crossRefs enables cascading filters (e.g. pick chapter → see only valid topics)
 * without needing rawQuestions in memory.
 *
 * skip=true returns EMPTY immediately — use while useAccessibleCourses is loading
 * to prevent double-fire reads.
 */
export function useQBOptions(
  subjectIds?: string[],
  educatorUid?: string,
  skip = false
): QBOptions {
  const key =
    (subjectIds === undefined ? "__all__" : JSON.stringify([...subjectIds].sort())) +
    "|" +
    (educatorUid ?? "");

  const isEmptyScope = !skip && Array.isArray(subjectIds) && subjectIds.length === 0 && !educatorUid;

  const getCachedResult = (): CacheResult | null => {
    if (skip || isEmptyScope) return EMPTY;
    const entry = cache.get(key);
    if (entry && !entry.promise && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.result;
    return null;
  };

  const initial = getCachedResult();
  const [result, setResult] = useState<CacheResult>(initial ?? EMPTY);
  const [loading, setLoading] = useState(!skip && initial === null && !isEmptyScope);

  useEffect(() => {
    if (skip) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }

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

    return () => { cancelled = true; };
  }, [key, skip]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...result, loading };
}

export function invalidateQBOptionsCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
