import { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/requireUser.js";
import { getAdmin } from "../_lib/firebaseAdmin.js";
import { notifyDiscord } from "../_lib/discordLogger.js";

const BATCH_SIZE = 490; // Firestore hard limit is 500 ops per batch

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(req, { roles: ["EDUCATOR"] });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { adminTestId } = (req.body || {}) as { adminTestId?: unknown };

  if (
    !adminTestId ||
    typeof adminTestId !== "string" ||
    adminTestId.trim().length === 0 ||
    adminTestId.length > 128
  ) {
    return res
      .status(400)
      .json({ error: "adminTestId is required and must be a non-empty string" });
  }

  const safeAdminTestId = adminTestId.trim();

  const admin = getAdmin();
  const db = admin.firestore();

  try {
    // 1. Fetch and validate the admin test
    const adminTestSnap = await db.doc(`test_series/${safeAdminTestId}`).get();

    if (!adminTestSnap.exists) {
      return res.status(404).json({ error: "Test not found" });
    }

    const adminTestData = adminTestSnap.data()!;

    if (!adminTestData.isPublished) {
      return res.status(403).json({ error: "Test is not available for import" });
    }

    // 2. Idempotency check — return existing if already imported
    const duplicateSnap = await db
      .collection(`educators/${user.uid}/my_tests`)
      .where("importedFromAdminTestId", "==", safeAdminTestId)
      .limit(1)
      .get();

    if (!duplicateSnap.empty) {
      return res.status(200).json({
        testId: duplicateSnap.docs[0].id,
        alreadyImported: true,
      });
    }

    // 3. Fetch all questions from the admin test
    const questionsSnap = await db
      .collection(`test_series/${safeAdminTestId}/questions`)
      .orderBy("questionOrder", "asc")
      .get()
      .catch(async () => {
        // questionOrder index may not exist yet — fall back to unordered fetch
        return db.collection(`test_series/${safeAdminTestId}/questions`).get();
      });

    const questions = questionsSnap.docs.map((d) => ({ _id: d.id, ...d.data() }));

    // 4. Build test payload — copy all safe fields, override ownership + state
    const now = admin.firestore.FieldValue.serverTimestamp();

    const testPayload: Record<string, unknown> = {
      title: String(adminTestData.title || "Imported Test"),
      description: String(adminTestData.description || ""),
      subject: String(adminTestData.subject || ""),
      courseId: adminTestData.courseId || "",
      courseName: adminTestData.courseName || "",
      durationMinutes: Number(adminTestData.durationMinutes || 60),
      attemptsAllowed: Number(adminTestData.attemptsAllowed || 1),
      sections: Array.isArray(adminTestData.sections) ? adminTestData.sections : [],
      questionsCount: questions.length,
      questionsTarget: questions.length,
      markingScheme: adminTestData.markingScheme || null,
      difficultyLevel: adminTestData.difficultyLevel ?? 0.5,
      level: adminTestData.level || "General",
      // Preserve section-mode flags from admin test
      useSections: Array.isArray(adminTestData.sections) && adminTestData.sections.length > 0,
      subjectMode: adminTestData.subjectMode || "single",
      type: "test",
      source: "imported",
      originSource: "admin",
      importedFromAdminTestId: safeAdminTestId,
      importedAt: now,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
      targetBatches: [],
      isPublished: false, // imported copies start as drafts; educator publishes explicitly
    };

    // Strip undefined values — Firestore rejects them
    for (const key of Object.keys(testPayload)) {
      if (testPayload[key] === undefined) delete testPayload[key];
    }

    // 5. Write the new test document + all questions in chunked batches
    const testRef = db.collection(`educators/${user.uid}/my_tests`).doc();
    const testId = testRef.id;

    let batch = db.batch();
    batch.set(testRef, testPayload);
    let ops = 1;

    let order = 0;
    for (const q of questions) {
      if (ops >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }

      const {
        _id,
        questionOrder: _qo,
        ...questionData
      } = q as Record<string, unknown> & { _id: string; questionOrder?: unknown };

      const qRef = db.collection(`educators/${user.uid}/my_tests/${testId}/questions`).doc();

      batch.set(qRef, {
        ...questionData,
        questionOrder: order++,
        adminQuestionId: _id, // traceability back to source
        importedFrom: "admin",
        addedAt: now,
      });
      ops++;
    }

    await batch.commit();

    console.log(
      `[import-admin-test] educator=${user.uid} imported adminTest=${safeAdminTestId} → myTest=${testId} (${questions.length} questions)`
    );

    return res.status(200).json({ testId, questionsImported: questions.length });
  } catch (err) {
    await notifyDiscord(err, req, "educator/import-admin-test");
    console.error("[import-admin-test]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
