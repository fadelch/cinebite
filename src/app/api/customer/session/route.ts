import { NextResponse } from "next/server";

import { CUSTOMER_SESSION_COOKIE, customerSessionCookieOptions } from "@/lib/customer-session/policy";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { startCustomerSession } from "@/server/services/customer-session.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const session = await startCustomerSession(input);
    const response = NextResponse.json({ destination: "/customer/menu" }, { status: 201, headers: { "Cache-Control": "no-store" } });
    response.cookies.set(CUSTOMER_SESSION_COOKIE, session.rawToken, customerSessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) { return apiError(error); }
}
