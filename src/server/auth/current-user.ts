import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getAdminAuth } from "@/lib/firebase/admin";
import type { AuthenticatedUser } from "@/types/auth";
import {
  claimsMatchProfile,
  getUserProfile,
  toAuthenticatedUser,
} from "@/server/auth/user-profile";

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const token = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    const profile = await getUserProfile(token.uid);

    if (!profile?.active || !claimsMatchProfile(token, profile)) {
      return null;
    }

    return toAuthenticatedUser(profile);
  } catch {
    // Verification, revocation, disabled users, and malformed profiles fail closed.
    return null;
  }
}
