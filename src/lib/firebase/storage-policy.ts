import "server-only";
import { ServiceError } from "@/server/services/service-error";

/** Explicit staging hold: never fall back to a development/production bucket. */
export function assertMediaStorageEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.CINEBITE_STORAGE_ENABLED === "false")
    throw new ServiceError(
      "MEDIA_STORAGE_DISABLED", 503,
      "Firebase media storage is disabled for this environment. Billing approval and isolated Storage setup are required before Firebase-backed media operations can run.",
    );
  if (env.CINEBITE_STORAGE_ENABLED !== undefined && env.CINEBITE_STORAGE_ENABLED !== "true")
    throw new ServiceError("CONFIGURATION_UNAVAILABLE", 503, "Media storage configuration is invalid.");
}
