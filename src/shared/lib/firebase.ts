// src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Analytics is optional (and should only run in browser)
// import { getAnalytics, isSupported } from "firebase/analytics";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

// Prevent re-initializing in Vite HMR
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Enable offline persistence with IndexedDB cache.
// This ensures repeat reads (page navigations, refreshes) are served from the
// local cache instead of hitting Firestore servers, drastically reducing
// document read charges. The multi-tab manager keeps the cache consistent
// across multiple browser tabs.
export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // If Firestore was already initialized (e.g. Vite HMR), fall back to the
    // existing instance which is already configured.
    return getFirestore(app);
  }
})();

export const storage = getStorage(app);

// Optional analytics (disabled due to loading issues)
/*
export async function initAnalytics() {
  try {
    const ok = await isSupported();
    if (!ok) return null;
    return getAnalytics(app);
  } catch {
    return null;
  }
}
*/
