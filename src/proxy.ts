import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  BASE_SECURITY_HEADERS,
  contentSecurityPolicy,
} from "@/lib/security/headers";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString("base64");
  const policy = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  Object.entries(BASE_SECURITY_HEADERS).forEach(([key, value]) =>
    response.headers.set(key, value),
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  // No preload/includeSubDomains assumption; LAN HTTP continues to work.
  if (
    request.nextUrl.protocol === "https:" &&
    process.env.NODE_ENV === "production"
  )
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
