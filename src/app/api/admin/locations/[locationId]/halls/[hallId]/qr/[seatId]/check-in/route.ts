import { NextResponse } from "next/server";
import { observedRoute } from "@/server/http/observed-route";
import { apiError, forbiddenOrigin, invalidRequestBody } from "@/server/http/api-response";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { issueSeatCheckIn } from "@/server/services/seat-check-in.service";

export const runtime = "nodejs";

async function POSTHandler(request: Request, context: { params: Promise<{ locationId: string; hallId: string; seatId: string }> }) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let input: unknown;
  try { input = await request.json(); } catch { return invalidRequestBody(); }
  try {
    const { locationId, hallId, seatId } = await context.params;
    const result = await issueSeatCheckIn(locationId, hallId, seatId, input);
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export const POST = observedRoute("POST.api.admin.seat.check.in", POSTHandler);
