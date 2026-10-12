import "server-only";
import { observedOperation } from "@/lib/observability/logger";
import { isServiceError, ServiceError } from "@/server/services/service-error";
import { normalizeError } from "@/lib/observability/errors";
export function providerOperation<T>(
  operation: string,
  action: () => Promise<T>,
  fields: Record<string, unknown> = {},
) {
  return observedOperation(
    operation,
    async () => {
      try {
        return await action();
      } catch (error) {
        if (isServiceError(error)) throw error;
        if (normalizeError(error).code === "DATABASE_UNAVAILABLE") throw error;
        throw new ServiceError(
          "PAYMENT_PROVIDER_UNAVAILABLE",
          503,
          "Payment processing is temporarily unavailable. Check the existing order before retrying.",
        );
      }
    },
    fields,
  );
}
