import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, inMemoryPersistence } from "firebase/auth";

import { clientEnv } from "@/lib/env";

const firebaseConfig = {
  apiKey: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: clientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);
// This application uses email/password, not popup/redirect OAuth. Do not initialize
// durable browser token persistence or proactive mobile auth-helper iframes.
export const firebaseAuth = (() => {
  try {
    return initializeAuth(firebaseApp, { persistence: inMemoryPersistence });
  } catch (error) {
    // Preserve the existing singleton during development hot reload only.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "auth/already-initialized"
    )
      return getAuth(firebaseApp);
    throw error;
  }
})();
