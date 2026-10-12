import { observedRoute } from "@/server/http/observed-route";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { isSameOriginRequest } from "@/server/auth/request-security";

function POSTHandler(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Unable to log out." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export const POST = observedRoute("POST.api.auth.logout", POSTHandler);
