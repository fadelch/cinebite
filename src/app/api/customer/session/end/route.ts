import { NextResponse } from "next/server";

import { CUSTOMER_SESSION_COOKIE, customerSessionCookieOptions } from "@/lib/customer-session/policy";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { endCustomerSession } from "@/server/services/customer-session.service";
import { customerSessionEndSchema } from "@/validation/seat-qr";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    customerSessionEndSchema.parse(input);
    const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${CUSTOMER_SESSION_COOKIE}=`))?.slice(CUSTOMER_SESSION_COOKIE.length + 1);
    await endCustomerSession(token ? decodeURIComponent(token) : undefined);
    const response = NextResponse.json({ destination: "/" }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(CUSTOMER_SESSION_COOKIE, "", customerSessionCookieOptions(new Date(0)));
    return response;
  } catch (error) { return apiError(error); }
}
