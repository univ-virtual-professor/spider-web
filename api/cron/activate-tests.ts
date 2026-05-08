import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdmin } from "../_lib/firebaseAdmin.js";
import { notifyDiscord } from "../_lib/discordLogger.js";

// ─── handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron injects Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization ?? "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const startMs = Date.now();
  const admin = getAdmin();
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;

  const now = Timestamp.now();
  const nowMs = now.toMillis(); // used for endTime checks below

  let activated = 0;
  let expired = 0;
  let errors = 0;

  try {
    // collectionGroup requires a composite index:
    //   Collection group: my_tests
    //   Fields: isScheduleActive ASC, startTime ASC, isPublished ASC
    const snap = await db
      .collectionGroup("my_tests")
      .where("isScheduleActive", "==", true)
      .where("startTime", "<=", now)
      .where("isPublished", "==", false)
      .get();

    if (snap.empty) {
      return res.json({ ok: true, activated: 0, expired: 0, errors: 0, durationMs: Date.now() - startMs });
    }

    // Process in batches of 500 (Firestore limit)
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let batchCount = 0;

    const flush = async () => {
      if (batchCount > 0) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    };

    for (const doc of snap.docs) {
      try {
        const data = doc.data() as any;
        const endTime: FirebaseFirestore.Timestamp | null = data.endTime ?? null;

        // Skip if the test window has already fully elapsed
        if (endTime && endTime.toMillis() < nowMs) {
          const recurrence = data.recurrence ?? null;

          if (recurrence && recurrence.type && recurrence.type !== "none") {
            // Advance recurring test to the next cycle
            const nextTimes = computeNextCycle(data.startTime, endTime, recurrence, Timestamp);

            if (!nextTimes) {
              // Recurrence has ended — deactivate
              batch.update(doc.ref, {
                isScheduleActive: false,
                updatedAt: FieldValue.serverTimestamp(),
              });
              batchCount++;
              expired++;
            } else {
              batch.update(doc.ref, {
                startTime: nextTimes.startTime,
                endTime: nextTimes.endTime,
                isPublished: false,
                updatedAt: FieldValue.serverTimestamp(),
              });
              batchCount++;
            }
          } else {
            // One-time test whose window passed without activation — deactivate
            batch.update(doc.ref, {
              isScheduleActive: false,
              updatedAt: FieldValue.serverTimestamp(),
            });
            batchCount++;
            expired++;
          }
        } else {
          // Window is valid — publish
          const recurrence = data.recurrence ?? null;
          const update: Record<string, unknown> = {
            isPublished: true,
            publishedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };

          // Pre-compute the next cycle times so the next cron run can advance it
          if (recurrence && recurrence.type && recurrence.type !== "none" && endTime) {
            const nextTimes = computeNextCycle(data.startTime, endTime, recurrence, Timestamp);
            if (!nextTimes) {
              // This is the final cycle — mark so deactivation triggers after endTime
              update.recurrenceFinalCycle = true;
            } else {
              update.recurrenceNextStart = nextTimes.startTime;
              update.recurrenceNextEnd = nextTimes.endTime;
            }
          }

          batch.update(doc.ref, update);
          batchCount++;
          activated++;
        }

        if (batchCount >= BATCH_SIZE) await flush();
      } catch (docErr) {
        console.error(`[activate-tests] Error processing doc ${doc.ref.path}:`, docErr);
        errors++;
      }
    }

    await flush();

    // Second pass: advance recurring tests that just ended (isPublished: true, endTime < now, recurrenceNextStart set)
    await advanceFinishedRecurringTests(db, admin, now);

    const duration = Date.now() - startMs;
    console.log(`[activate-tests] activated=${activated} expired=${expired} errors=${errors} durationMs=${duration}`);

    return res.json({ ok: true, activated, expired, errors, durationMs: duration });
  } catch (e: any) {
    await notifyDiscord(e, req, "cron/activate-tests");
    console.error("[activate-tests] Fatal error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ─── advance finished recurring tests ────────────────────────────────────────

async function advanceFinishedRecurringTests(
  db: FirebaseFirestore.Firestore,
  admin: any,
  now: FirebaseFirestore.Timestamp
) {
  try {
    const FieldValue = admin.firestore.FieldValue;

    // Requires composite index: isScheduleActive ASC, isPublished ASC, endTime ASC (collectionGroup: my_tests)
    const snap = await db
      .collectionGroup("my_tests")
      .where("isScheduleActive", "==", true)
      .where("isPublished", "==", true)
      .where("endTime", "<=", now)
      .get();

    if (snap.empty) return;

    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data() as any;

      if (data.recurrenceNextStart && data.recurrenceNextEnd) {
        // Advance to the next pre-computed cycle
        batch.update(doc.ref, {
          startTime: data.recurrenceNextStart,
          endTime: data.recurrenceNextEnd,
          isPublished: false,
          recurrenceNextStart: FieldValue.delete(),
          recurrenceNextEnd: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // No next cycle info — deactivate the schedule
        batch.update(doc.ref, {
          isScheduleActive: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();
  } catch (e) {
    // Non-fatal — log and continue; primary activation already succeeded
    console.error("[activate-tests] advanceFinishedRecurringTests error:", e);
  }
}

// ─── recurrence math ─────────────────────────────────────────────────────────

function computeNextCycle(
  startTime: FirebaseFirestore.Timestamp,
  endTime: FirebaseFirestore.Timestamp,
  recurrence: any,
  Timestamp: any
): { startTime: FirebaseFirestore.Timestamp; endTime: FirebaseFirestore.Timestamp } | null {
  const endsAt: FirebaseFirestore.Timestamp | null = recurrence.endsAt ?? null;
  const durationMs = endTime.toMillis() - startTime.toMillis();

  let nextStart: FirebaseFirestore.Timestamp;

  if (recurrence.type === "weekly") {
    nextStart = new Timestamp(startTime.seconds + 7 * 24 * 3600, startTime.nanoseconds);
  } else if (recurrence.type === "monthly") {
    const d = startTime.toDate();
    d.setMonth(d.getMonth() + 1);
    nextStart = Timestamp.fromDate(d);
  } else {
    return null;
  }

  // Check if next cycle falls after recurrenceEndsAt
  if (endsAt && nextStart.toMillis() > endsAt.toMillis()) {
    return null;
  }

  const nextEndMs = nextStart.toMillis() + durationMs;
  const nextEnd = new Timestamp(
    Math.floor(nextEndMs / 1000),
    (nextEndMs % 1000) * 1e6
  );

  return { startTime: nextStart, endTime: nextEnd };
}
