import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "@/lib/auth/constants";
import { getLandingPathForRole } from "@/lib/auth/authorization";
import { isRecentLogin } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env.server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { isSameOriginRequest } from "@/server/auth/request-security";
import {
  claimsMatchProfile,
  getUserProfile,
} from "@/server/auth/user-profile";
import { sessionRequestSchema } from "@/validation/auth";

export const runtime = "nodejs";

type SessionStage =
  | "validate-server-environment"
  | "initialize-admin"
  | "verify-id-token"
  | "load-user-profile"
  | "create-session-cookie";

function logSessionFailure(stage: SessionStage, error: unknown) {
  const details =
    typeof error === "object" && error !== null
      ? {
          name: "name" in error ? String(error.name) : "UnknownError",
          code: "code" in error ? String(error.code) : undefined,
        }
      : { name: typeof error, code: undefined };

  console.error("[auth/session] Session creation failed.", {
    stage,
    ...details,
  });
}

function errorResponse(status: number) {
  return NextResponse.json(
    { error: "Unable to create session." },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403);
  }

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return errorResponse(400);
  }

  const parsed = sessionRequestSchema.safeParse(input);

  if (!parsed.success) {
    return errorResponse(400);
  }

  let stage: SessionStage = "validate-server-environment";

  try {
    getServerEnv();

    stage = "initialize-admin";
    const adminAuth = getAdminAuth();

    stage = "verify-id-token";
    const token = await adminAuth.verifyIdToken(parsed.data.idToken, true);

    if (!isRecentLogin(token.auth_time)) {
      return errorResponse(401);
    }

    stage = "load-user-profile";
    const profile = await getUserProfile(token.uid);

    if (!profile?.active || !claimsMatchProfile(token, profile)) {
      return errorResponse(403);
    }

    stage = "create-session-cookie";
    const sessionCookie = await adminAuth.createSessionCookie(
      parsed.data.idToken,
      { expiresIn: SESSION_DURATION_MS },
    );
    const response = NextResponse.json(
      {
        status: "ok",
        landingPath: getLandingPathForRole(profile.role),
      },
      { headers: { "Cache-Control": "no-store" } },
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_MS / 1_000,
    });

    return response;
  } catch (error) {
    logSessionFailure(stage, error);
    return errorResponse(stage === "verify-id-token" ? 401 : 500);
  }
}
