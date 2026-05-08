/**
 * autoFillEngine — shared, group-aware question selection logic.
 *
 * Both TestSeries.handleAutoFill and QuestionsManager.generateAutoFillDraft
 * delegate to buildAutoFillSelection so the algorithm is consistent.
 *
 * Group contract: when a candidate from a question_group is chosen, the ENTIRE
 * group is taken or the group is skipped (no partial comprehension blocks).
 */

export type Difficulty = "easy" | "medium" | "hard";

/** Minimal shape both callers agree on. Extra fields are passed through untouched. */
export type PoolQuestion = {
  id: string;
  difficulty?: string;
  subject?: string;
  subjectName?: string;
  topic?: string;
  topics?: string[];
  tags?: string[];
  questionType?: string;
  format?: string;
  difficultyLevel?: number;
  groupId?: string;
  groupOrder?: number;
  [key: string]: unknown;
};

export type SectionConstraints = {
  id: string;
  name: string;
  questionsCount: number;
  subject?: string;
  topics?: string[];
  tags?: string[];
  format?: string;
  /** 0–1 scale matching question_bank difficultyLevel */
  difficultyLevel?: number;
  /** Accepted deviation from difficultyLevel (default 0.25) */
  difficultyTolerance?: number;
  /** Which group types are allowed; default = all */
  groupTypes?: Array<"comprehension" | "case_study" | "individual">;
};

/** One group's metadata for group-aware selection. */
export type GroupManifest = {
  groupId: string;
  type: "comprehension" | "case_study";
  questionCount: number;
};

export type AutoFillOptions = {
  /** If set, only pick questions whose topic matches at least one of these */
  topicFilter?: Set<string>;
  /** If set, only pick questions whose subject matches */
  subjectFilter?: Set<string>;
  /** IDs already in the test (never re-add) */
  excludeIds?: Set<string>;
  /** Difficulty mix: 0–1 weights; don't need to sum to 1 */
  difficultyMix?: { easy: number; medium: number; hard: number };
};

export type AutoFillResult = {
  chosen: PoolQuestion[];
  /** Per-section diagnostics for coverage toasts */
  coverage: Array<{
    sectionId: string;
    sectionName: string;
    needed: number;
    found: number;
    shortfall: number;
  }>;
};

// ─── helpers ────────────────────────────────────────────────────────────────

function seededShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function allocateByWeight(
  total: number,
  weights: Array<{ key: string; weight: number }>
): Record<string, number> {
  const sumW = weights.reduce((s, w) => s + w.weight, 0);
  if (!sumW) return {};

  const alloc: Record<string, number> = {};
  let remaining = total;
  const sorted = [...weights].sort((a, b) => b.weight - a.weight);

  for (let i = 0; i < sorted.length; i++) {
    const { key, weight } = sorted[i];
    const isLast = i === sorted.length - 1;
    const share = isLast ? remaining : Math.round((weight / sumW) * total);
    alloc[key] = Math.min(share, remaining);
    remaining -= alloc[key];
  }

  return alloc;
}

function difficultyBucket(q: PoolQuestion): Difficulty {
  const raw = String(q.difficulty || q.difficultyLevel || "").toLowerCase();
  if (raw === "easy") return "easy";
  if (raw === "hard") return "hard";
  // numeric difficultyLevel (0–1)
  const n = Number(q.difficultyLevel);
  if (Number.isFinite(n)) {
    if (n <= 0.33) return "easy";
    if (n >= 0.67) return "hard";
    return "medium";
  }
  return "medium";
}

function matchesSectionConstraints(q: PoolQuestion, s: SectionConstraints): boolean {
  // Subject hard filter
  if (s.subject) {
    const qSub = String(q.subjectName || q.subject || "").trim().toLowerCase();
    if (!qSub || qSub !== s.subject.trim().toLowerCase()) return false;
  }

  // Format hard filter
  if (s.format) {
    const qFmt = String(q.questionType || q.format || "").trim();
    if (qFmt && qFmt !== s.format) return false;
  }

  // Topics hard filter (question must match at least one)
  if (s.topics?.length) {
    const qTopics = new Set<string>([
      ...(Array.isArray(q.topics) ? q.topics : []),
      ...(q.topic ? [q.topic as string] : []),
    ]);
    if (!s.topics.some((t) => qTopics.has(t))) return false;
  }

  // Tags hard filter (question must share at least one)
  if (s.tags?.length) {
    const qTags = new Set<string>(Array.isArray(q.tags) ? (q.tags as string[]) : []);
    if (!s.tags.some((t) => qTags.has(t))) return false;
  }

  // Difficulty tolerance filter (only applied when difficultyLevel is a number on section)
  if (s.difficultyLevel != null) {
    const tolerance = s.difficultyTolerance ?? 0.25;
    const qLevel = Number(q.difficultyLevel);
    if (Number.isFinite(qLevel)) {
      if (Math.abs(qLevel - s.difficultyLevel) > tolerance) return false;
    }
  }

  return true;
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Select questions from a flat pool respecting:
 *   - per-section hard constraints (subject, format, topics, tags, difficulty)
 *   - question group integrity (comprehension/case_study blocks come whole)
 *   - global difficulty mix target
 *   - exclude already-used IDs
 *
 * Returns chosen questions (ordered by section, then group order) plus
 * per-section coverage diagnostics so callers can show toasts.
 */
export function buildAutoFillSelection(
  pool: PoolQuestion[],
  groupManifests: Map<string, GroupManifest>,
  sections: SectionConstraints[],
  options: AutoFillOptions = {}
): AutoFillResult {
  const { topicFilter, subjectFilter, excludeIds = new Set(), difficultyMix } = options;

  const coverage: AutoFillResult["coverage"] = [];
  const chosen: PoolQuestion[] = [];
  const globalUsed = new Set<string>(excludeIds);

  // Build a lookup of groupId → all questions in this pool belonging to that group
  const groupQuestionsMap = new Map<string, PoolQuestion[]>();
  for (const q of pool) {
    if (!q.groupId) continue;
    if (!groupQuestionsMap.has(q.groupId)) groupQuestionsMap.set(q.groupId, []);
    groupQuestionsMap.get(q.groupId)!.push(q);
  }

  for (const section of sections) {
    const needed = Math.max(0, Number(section.questionsCount) || 0);
    if (!needed) {
      coverage.push({ sectionId: section.id, sectionName: section.name, needed: 0, found: 0, shortfall: 0 });
      continue;
    }

    // Allowed group types for this section
    const allowedGroupTypes = new Set<string>(
      section.groupTypes ?? ["comprehension", "case_study", "individual"]
    );

    // Candidate pool: all pool questions NOT yet globally used, matching constraints
    const candidates = pool.filter((q) => {
      if (globalUsed.has(q.id)) return false;

      // Global pre-filters (from UI, applied across all sections)
      if (topicFilter?.size) {
        const qTopics = new Set([
          ...(Array.isArray(q.topics) ? q.topics : []),
          ...(q.topic ? [q.topic as string] : []),
        ]);
        if (![...topicFilter].some((t) => qTopics.has(t))) return false;
      }
      if (subjectFilter?.size && !subjectFilter.has(String(q.subject || q.subjectName || ""))) return false;

      // Section-level hard filters
      if (!matchesSectionConstraints(q, section)) return false;

      // Group type filter
      if (q.groupId) {
        const manifest = groupManifests.get(q.groupId);
        if (manifest && !allowedGroupTypes.has(manifest.type)) return false;
      } else {
        if (!allowedGroupTypes.has("individual")) return false;
      }

      return true;
    });

    // Segregate into: eligible groups (as atomic units) and individual questions
    const eligibleGroupIds = new Set<string>();
    const individualCandidates: PoolQuestion[] = [];

    for (const q of candidates) {
      if (q.groupId) {
        eligibleGroupIds.add(q.groupId as string);
      } else {
        individualCandidates.push(q);
      }
    }

    // Build group atoms: only include groups where ALL questions in the group are present
    // and the group fits within remaining capacity
    type GroupAtom = { groupId: string; questions: PoolQuestion[]; type: string };
    const groupAtoms: GroupAtom[] = [];

    for (const gid of eligibleGroupIds) {
      const groupQs = (groupQuestionsMap.get(gid) || []).filter((q) => !globalUsed.has(q.id));
      const manifest = groupManifests.get(gid);
      if (!groupQs.length) continue;
      // Sort by groupOrder so passage questions appear in the right sequence
      const sorted = [...groupQs].sort((a, b) => Number(a.groupOrder || 0) - Number(b.groupOrder || 0));
      groupAtoms.push({ groupId: gid, questions: sorted, type: manifest?.type || "comprehension" });
    }

    // Shuffle group atoms and individual candidates for randomness
    const shuffledGroups = seededShuffle(groupAtoms);
    const shuffledIndividuals = seededShuffle(individualCandidates);

    // Difficulty target allocations
    const activeMix = difficultyMix ?? { easy: 1, medium: 2, hard: 1 };
    const diffTargets = allocateByWeight(needed, [
      { key: "easy", weight: activeMix.easy },
      { key: "medium", weight: activeMix.medium },
      { key: "hard", weight: activeMix.hard },
    ]) as Record<Difficulty, number>;

    const remainingDiff: Record<Difficulty, number> = {
      easy: diffTargets.easy ?? 0,
      medium: diffTargets.medium ?? 0,
      hard: diffTargets.hard ?? 0,
    };

    const sectionChosen: PoolQuestion[] = [];
    let slotsLeft = needed;

    // --- PASS 1: fill with groups first (whole or skip) ---
    for (const atom of shuffledGroups) {
      if (slotsLeft <= 0) break;
      if (atom.questions.length > slotsLeft) continue; // group too large for remaining slots — skip

      slotsLeft -= atom.questions.length;
      for (const q of atom.questions) {
        sectionChosen.push(q);
        globalUsed.add(q.id);
        const d = difficultyBucket(q);
        if (remainingDiff[d] > 0) remainingDiff[d]--;
      }
    }

    // --- PASS 2: fill remaining slots with individual questions using scoring ---
    const available = shuffledIndividuals.filter((q) => !globalUsed.has(q.id));

    while (slotsLeft > 0 && available.length > 0) {
      let bestIndex = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < available.length; i++) {
        const candidate = available[i];
        const d = difficultyBucket(candidate);
        let score = Math.random();
        if ((remainingDiff[d] || 0) > 0) score += 3;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      const [picked] = available.splice(bestIndex, 1);
      sectionChosen.push(picked);
      globalUsed.add(picked.id);

      const d = difficultyBucket(picked);
      if (remainingDiff[d] > 0) remainingDiff[d]--;
      slotsLeft--;
    }

    const shortfall = needed - sectionChosen.length;
    coverage.push({
      sectionId: section.id,
      sectionName: section.name,
      needed,
      found: sectionChosen.length,
      shortfall,
    });

    chosen.push(...sectionChosen);
  }

  return { chosen, coverage };
}
