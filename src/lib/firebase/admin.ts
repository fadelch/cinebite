import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getServerEnv } from "@/lib/env.server";

const env = getServerEnv();

export const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY,
      }),
    });

export const adminAuth = getAuth(adminApp);
export const adminFirestore = getFirestore(adminApp);
