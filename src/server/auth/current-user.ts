import { log } from "@/lib/observability/logger";
import "server-only";
import { normalizeError } from "@/lib/observability/errors";
import { ServiceError } from "@/server/services/service-error";

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
  const failure = normalizeError(error);
  log(failure.status >= 500 ? "error" : "warn", "auth.failure", { stage, errorCode: failure.code, errorType: failure.type, retryable: failure.retryable });
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
      log("warn","src.server.auth.current.user.ts.failure",{
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
        log("warn","src.server.auth.current.user.ts.failure",{
          organizationExists: Boolean(organization),
          organizationOperational: organization?.status === "ACTIVE",
        });
        return null;
      }
    }

    return user;
  } catch (error) {
    logCurrentUserFailure(stage, error);
    const failure = normalizeError(error);
    if (failure.status >= 500) throw new ServiceError(failure.code === "DATABASE_UNAVAILABLE" ? "DATABASE_UNAVAILABLE" : "IDENTITY_UNAVAILABLE", 503, "Staff access is temporarily unavailable.");
    // Verification, revocation, disabled users, and malformed profiles fail closed.
    return null;
  }
}
