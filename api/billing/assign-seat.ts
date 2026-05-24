import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdmin } from "../_lib/firebaseAdmin.js";
import { requireUser } from "../_lib/requireUser.js";
import { notifyDiscord } from "../_lib/discordLogger.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const user = await requireUser(req, { roles: ["EDUCATOR", "ADMIN"] });
    const educatorId = user.uid;

    const studentId = String(req.body?.studentId || "").trim();
    if (!studentId) return res.status(400).json({ error: "Missing studentId" });

    const admin = getAdmin();
    const db = admin.firestore();

    const educatorSnap = await db.doc(`educators/${educatorId}`).get();
    const eduData = educatorSnap.data() || {};
    const seatLimit = Math.max(
      0,
      Number(eduData.seatLimit || 0),
      Number(eduData.purchasedSeatLimit || 0)
    );
    if (seatLimit <= 0) {
      return res.status(403).json({
        error:
          "No seats assigned to your coaching yet. Contact PrepareKaro support/admin to get seats.",
      });
    }

    // must exist in learners list
    const studentSnap = await db.doc(`educators/${educatorId}/students/${studentId}`).get();
    if (!studentSnap.exists)
      return res.status(400).json({ error: "Student not found in your learners list." });

    const seatRef = db.doc(`educators/${educatorId}/billingSeats/${studentId}`);
    const seatSnap = await seatRef.get();
    const curStatus = String(seatSnap.data()?.status || "").toLowerCase();
    if (curStatus === "active") return res.json({ ok: true, alreadyAssigned: true });

    // count active seats
    let used = 0;
    try {
      const agg = await db
        .collection(`educators/${educatorId}/billingSeats`)
        .where("status", "==", "active")
        .count()
        .get();
      used = agg.data().count || 0;
    } catch {
      const snap = await db
        .collection(`educators/${educatorId}/billingSeats`)
        .where("status", "==", "active")
        .get();
      used = snap.size;
    }

    if (used >= seatLimit) {
      return res
        .status(400)
        .json({ error: "Seat limit reached. Contact sales/admin to increase seats." });
    }

    await seatRef.set(
      {
        status: "active",
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        assignedBy: educatorId,
        revokedAt: null,
      },
      { merge: true }
    );

    return res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    await notifyDiscord(e, req, "assign-seat");
    const msg = String(e?.message || "Server error");
    if (msg === "Forbidden") return res.status(403).json({ error: "Forbidden" });
    return res.status(500).json({ error: msg });
  }
}
