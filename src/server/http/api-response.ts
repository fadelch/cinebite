import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isServiceError } from "@/server/services/service-error";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Please correct the highlighted information.",
        code: "VALIDATION_ERROR",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (isServiceError(error)) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }

  console.error("[api] Unexpected request failure.", {
    name:
      typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : "UnknownError",
    code:
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined,
  });

  return NextResponse.json(
    { error: "The request could not be completed.", code: "INTERNAL_ERROR" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

export function invalidRequestBody() {
  return NextResponse.json(
    { error: "The request body is invalid.", code: "INVALID_JSON" },
    { status: 400, headers: NO_STORE_HEADERS },
  );
}

export function forbiddenOrigin() {
  return NextResponse.json(
    { error: "The request origin is not allowed.", code: "INVALID_ORIGIN" },
    { status: 403, headers: NO_STORE_HEADERS },
  );
}
