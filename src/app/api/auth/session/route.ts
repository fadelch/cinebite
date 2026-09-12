import { NextResponse } from "next/server";

import {
  RECENT_LOGIN_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "@/lib/auth/constants";
import { getLandingPathForRole } from "@/lib/auth/authorization";
import { getAdminAuth } from "@/lib/firebase/admin";
import { isSameOriginRequest } from "@/server/auth/request-security";
import {
  claimsMatchProfile,
  getUserProfile,
} from "@/server/auth/user-profile";
import { sessionRequestSchema } from "@/validation/auth";

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

  try {
    const adminAuth = getAdminAuth();
    const token = await adminAuth.verifyIdToken(parsed.data.idToken, true);
    const tokenAgeSeconds = Math.floor(Date.now() / 1_000) - token.auth_time;

    if (
      tokenAgeSeconds < 0 ||
      tokenAgeSeconds > RECENT_LOGIN_MAX_AGE_SECONDS
    ) {
      return errorResponse(401);
    }

    const profile = await getUserProfile(token.uid);

    if (!profile?.active || !claimsMatchProfile(token, profile)) {
      return errorResponse(403);
    }

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
  } catch {
    return errorResponse(401);
  }
}
