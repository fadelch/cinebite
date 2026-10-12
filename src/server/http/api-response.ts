import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { normalizeError, expectedLevel } from "@/lib/observability/errors";
import { currentObservation } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
}
export function apiError(error: unknown) {
  const failure = normalizeError(error), requestId = currentObservation().requestId;
  log(expectedLevel(failure.status), "request.failed", { errorCode: failure.code, errorType: failure.type, statusCode: failure.status, retryable: failure.retryable });
  return NextResponse.json({
    error: failure.message + (requestId ? " Reference: " + requestId : ""), code: failure.code, ...(requestId ? { requestId } : {}),
    ...(error instanceof ZodError ? { issues: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) } : {}),
  }, { status: failure.status, headers: NO_STORE_HEADERS });
}
export function invalidRequestBody() {
  return NextResponse.json({ error: "The request body is invalid.", code: "INVALID_JSON", requestId: currentObservation().requestId }, { status: 400, headers: NO_STORE_HEADERS });
}
export function forbiddenOrigin() {
  return NextResponse.json({ error: "The request origin is not allowed.", code: "INVALID_ORIGIN", requestId: currentObservation().requestId }, { status: 403, headers: NO_STORE_HEADERS });
}
