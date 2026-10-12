import "server-only";
import { ZodError } from "zod";
import { isServiceError } from "@/server/services/service-error";
import { isRetryableTransactionError } from "@/lib/db/errors";
function errorCodes(error: unknown, depth = 0): string[] {
  if (!error || typeof error !== "object" || depth > 4) return [];
  const value = error as Record<string, unknown>;
  return [value.code, value.errorCode, value.originalCode]
    .filter((code): code is string => typeof code === "string")
    .concat(
      ...["cause", "meta", "driverAdapterError"].map((key) =>
        errorCodes(value[key], depth + 1),
      ),
    );
}
export function normalizeError(error: unknown) {
  if (error instanceof ZodError)
    return {
      code: "VALIDATION_ERROR",
      status: 400,
      retryable: false,
      type: "ValidationError",
      message: "Please correct the submitted information.",
    };
  if (isServiceError(error))
    return {
      code: error.code,
      status: error.status,
      retryable: error.status === 503 || error.status === 429,
      type: "BusinessError",
      message:
        error.status >= 500
          ? "This service is temporarily unavailable. Please try again."
          : error.message,
    };
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  const codes = errorCodes(error);
  if (isRetryableTransactionError(error))
    return {
      code: "TRANSACTION_CONFLICT",
      status: 409,
      retryable: true,
      type: "DatabaseError",
      message: "This operation is being updated. Please try again.",
    };
  if (code === "P2002" || code === "P2003")
    return {
      code: "CONSTRAINT_CONFLICT",
      status: 409,
      retryable: false,
      type: "DatabaseError",
      message: "This change conflicts with an existing record.",
    };
  if (code === "P2025")
    return {
      code: "RECORD_NOT_FOUND",
      status: 404,
      retryable: false,
      type: "DatabaseError",
      message: "The requested record was not found.",
    };
  if (
    codes.some((code) =>
      [
        "P1000",
        "P1001",
        "P1002",
        "P1008",
        "P1017",
        "P2024",
        "P2028",
        "P2021",
        "P2022",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENOTFOUND",
        "57P01",
        "53300",
        "57014",
        "55P03",
        "CONFIGURATION_UNAVAILABLE",
      ].includes(code),
    )
  )
    return {
      code: "DATABASE_UNAVAILABLE",
      status: 503,
      retryable: true,
      type: "DatabaseError",
      message: "The service is temporarily unavailable. Please try again.",
    };
  if (typeof code === "string" && code.startsWith("auth/")) {
    const invalid = [
      "auth/id-token-expired",
      "auth/id-token-revoked",
      "auth/session-cookie-expired",
      "auth/session-cookie-revoked",
      "auth/argument-error",
      "auth/user-disabled",
      "auth/user-not-found",
      "auth/invalid-id-token",
    ].includes(code);
    return {
      code: invalid ? "AUTHENTICATION_REQUIRED" : "IDENTITY_UNAVAILABLE",
      status: invalid ? 401 : 503,
      retryable: !invalid,
      type: "IdentityError",
      message: invalid
        ? "Please sign in again."
        : "Staff sign-in is temporarily unavailable.",
    };
  }
  return {
    code: "UNKNOWN_INTERNAL_ERROR",
    status: 500,
    retryable: false,
    type: "InternalError",
    message: "The request could not be completed. Please try again.",
  };
}
export function expectedLevel(status: number) {
  return status >= 500
    ? "error"
    : status === 401 || status === 404
      ? "debug"
      : status >= 400
        ? "warn"
        : "info";
}
