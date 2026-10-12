import "server-only";
import { normalizeError } from "@/lib/observability/errors";
import { isServiceError, ServiceError } from "@/server/services/service-error";
export function safePageFailure(error: unknown): never {
  if (isServiceError(error)) throw error;
  const failure = normalizeError(error);
  throw new ServiceError(
    failure.status === 503 ? "DATABASE_UNAVAILABLE" : "PAGE_UNAVAILABLE",
    failure.status === 503 ? 503 : 500,
    "Current information is temporarily unavailable.",
  );
}
export async function optionalSessionData<T>(
  action: () => Promise<T>,
): Promise<T | null> {
  try {
    return await action();
  } catch (error) {
    if (isServiceError(error) && (error.status === 401 || error.status === 404))
      return null;
    return safePageFailure(error);
  }
}
