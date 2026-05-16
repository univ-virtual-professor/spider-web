import { auth, db } from "@shared/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, arrayUnion } from "firebase/firestore";
import { clearLocalSessionId } from "@shared/lib/session";

function normSlug(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function tenantExists(slug: string) {
  const t = await getDoc(doc(db, "tenants", slug));
  if (t.exists()) return true;
  // fallback: check educators by tenantSlug
  // (keep lightweight; Signup.tsx also checks)
  return false;
}

export async function signInEmail(email: string, password: string) {
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutApp() {
  clearLocalSessionId();
  await signOut(auth);
}

export type EducatorSignupInput = {
  displayName: string;
  email: string;
  password: string;
  tenantSlug: string;
  coachingName: string;
  phone?: string;
};

export async function signUpEducator(input: EducatorSignupInput) {
  const slug = normSlug(input.tenantSlug);
  if (!slug) throw new Error("Invalid tenant slug");
  if (await tenantExists(slug)) throw new Error("Tenant slug already taken");

  const cred = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await updateProfile(cred.user, { displayName: input.displayName });

  const uid = cred.user.uid;

  await setDoc(
    doc(db, "users", uid),
    {
      uid,
      role: "EDUCATOR",
      displayName: input.displayName,
      email: input.email,
      tenantSlug: slug,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "educators", uid),
    {
      tenantSlug: slug,
      coachingName: input.coachingName,
      phone: input.phone || "",
      email: input.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "tenants", slug),
    {
      educatorId: uid,
      tenantSlug: slug,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { uid, tenantSlug: slug };
}

export type StudentSignupInput = {
  displayName: string;
  email: string;
  password: string;
  tenantSlug: string;
};

export async function signUpStudent(input: StudentSignupInput) {
  const slug = normSlug(input.tenantSlug);
  if (!slug) throw new Error("Invalid tenant slug");

  const cred = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await updateProfile(cred.user, { displayName: input.displayName });

  const uid = cred.user.uid;

  await setDoc(
    doc(db, "users", uid),
    {
      uid,
      role: "STUDENT",
      displayName: input.displayName,
      email: input.email,
      tenantSlug: slug,
      enrolledTenants: arrayUnion(slug),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Best-practice: let server register student into educator learners list
  const token = await cred.user.getIdToken();
  const registerRes = await fetch("/api/tenant/register-student", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tenantSlug: slug, displayName: input.displayName, email: input.email }),
  });

  if (!registerRes.ok) {
    const contentType = String(registerRes.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const data = await registerRes.json().catch(() => ({}));
      throw new Error(
        data?.error || `Failed to register student for this tenant (HTTP ${registerRes.status})`
      );
    }
    const text = (await registerRes.text().catch(() => "")).trim();
    throw new Error(
      text
        ? `Failed to register student for this tenant (HTTP ${registerRes.status}): ${text.slice(0, 160)}`
        : `Failed to register student for this tenant (HTTP ${registerRes.status})`
    );
  }

  return { uid, tenantSlug: slug };
}
