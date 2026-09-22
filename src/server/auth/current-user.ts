import "server-only";

import { cookies } from "next/headers";

import { canUseOrganization } from "@/lib/auth/authorization";
import { claimsMatchProfile } from "@/lib/auth/claims";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import type { AuthenticatedUser } from "@/types/auth";
import {
  getUserProfile,
  toAuthenticatedUser,
} from "@/server/auth/user-profile";

type CurrentUserStage =
  | "initialize-admin"
  | "verify-session-cookie"
  | "load-user-profile"
  | "load-organization";

function logCurrentUserFailure(stage: CurrentUserStage, error: unknown) {
  const details =
    typeof error === "object" && error !== null
      ? {
          name: "name" in error ? String(error.name) : "UnknownError",
          code: "code" in error ? String(error.code) : undefined,
        }
      : { name: typeof error, code: undefined };

  console.error("[auth/current-user] Session verification failed.", {
    stage,
    ...details,
  });
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  let stage: CurrentUserStage = "initialize-admin";

  try {
    const adminAuth = getAdminAuth();

    stage = "verify-session-cookie";
    const token = await adminAuth.verifySessionCookie(sessionCookie, true);

    stage = "load-user-profile";
    const profile = await getUserProfile(
      token.uid,
      typeof token.organizationId === "string" ? token.organizationId : null,
    );

    if (!profile?.active || !claimsMatchProfile(token, profile)) {
      console.warn("[auth/current-user] Session profile check failed.", {
        profileExists: Boolean(profile),
        active: profile?.active ?? false,
        roleMatches: profile ? token.role === profile.role : false,
        organizationMatches: profile
          ? (token.organizationId ?? null) === profile.organizationId
          : false,
        emailMatches: profile ? token.email === profile.email : false,
      });
      return null;
    }

    const user = toAuthenticatedUser(profile);

    if (user.role !== "SUPER_ADMIN") {
      stage = "load-organization";
      const organization = user.organizationId
        ? await getOrganizationById(user.organizationId)
        : null;

      if (!canUseOrganization(user, organization?.status ?? null)) {
        console.warn("[auth/current-user] Tenant organization access denied.", {
          organizationExists: Boolean(organization),
          organizationOperational: organization?.status === "ACTIVE",
        });
        return null;
      }
    }

    return user;
  } catch (error) {
    logCurrentUserFailure(stage, error);
    // Verification, revocation, disabled users, and malformed profiles fail closed.
    return null;
  }
}
