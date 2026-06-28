import { DocumentReference, arrayUnion, serverTimestamp, setDoc } from "firebase/firestore";

type QBMetaQuestion = {
  chapter?: string;
  topic?: string;
  topics?: string[];
  tags?: string[];
};

export async function updateQBMeta(docRef: DocumentReference, questions: QBMetaQuestion[]) {
  const chapters = new Set<string>();
  const topics   = new Set<string>();
  const tags     = new Set<string>();

  // Cross-reference pair sets (stored as "a::b" strings, updated via arrayUnion)
  const chTpPairs = new Set<string>(); // chapter::topic
  const chTgPairs = new Set<string>(); // chapter::tag
  const tpTgPairs = new Set<string>(); // topic::tag

  questions.forEach((q) => {
    const ch = q.chapter?.trim() ?? "";
    const qTopics = [
      ...(q.topic?.trim() ? [q.topic.trim()] : []),
      ...(q.topics ?? []).map((t) => t?.trim()).filter(Boolean),
    ] as string[];
    const qTags = (q.tags ?? []).map((g) => g?.trim()).filter(Boolean) as string[];

    if (ch) chapters.add(ch);
    qTopics.forEach((t) => topics.add(t));
    qTags.forEach((g) => tags.add(g));

    // Cross-refs
    if (ch) {
      qTopics.forEach((t) => chTpPairs.add(`${ch}::${t}`));
      qTags.forEach((g) => chTgPairs.add(`${ch}::${g}`));
    }
    qTopics.forEach((t) => qTags.forEach((g) => tpTgPairs.add(`${t}::${g}`)));
  });

  if (!chapters.size && !topics.size && !tags.size) return;

  const payload: Record<string, unknown> = {
    chapters:  arrayUnion(...Array.from(chapters)),
    topics:    arrayUnion(...Array.from(topics)),
    tags:      arrayUnion(...Array.from(tags)),
    updatedAt: serverTimestamp(),
  };

  if (chTpPairs.size) payload.ch_tp_pairs = arrayUnion(...Array.from(chTpPairs));
  if (chTgPairs.size) payload.ch_tg_pairs = arrayUnion(...Array.from(chTgPairs));
  if (tpTgPairs.size) payload.tp_tg_pairs = arrayUnion(...Array.from(tpTgPairs));

  await setDoc(docRef, payload, { merge: true });
}
