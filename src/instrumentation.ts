import type { Instrumentation } from "next";
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { log } = await import("./lib/observability/logger");
    log("info", "application.started", { operation: "startup" });
  }
}
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  _request,
  context,
) => {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const [
    { observationScope, newRequestId },
    { log },
    { normalizeError },
    { recordIncident },
    { captureTrackedError },
  ] = await Promise.all([
    import("./lib/observability/context"),
    import("./lib/observability/logger"),
    import("./lib/observability/errors"),
    import("./server/observability/incident"),
    import("./lib/observability/error-tracker"),
  ]);
  const failure = normalizeError(error);
  // Next route patterns, not actual request paths/headers/body; QR credentials never enter logs.
  const digest =
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    /^[a-zA-Z0-9-]{1,100}$/.test(String(error.digest))
      ? String(error.digest)
      : undefined;
  await observationScope(
    { requestId: newRequestId(), operation: context.routeType },
    async () => {
      log("error", "render.failed", {
        route: context.routePath,
        errorCode: failure.code,
        errorType: failure.type,
        ...(digest ? { digest } : {}),
      });
      await captureTrackedError("render.failed", {
        route: context.routePath,
        errorCode: failure.code,
        errorType: failure.type,
        ...(digest ? { digest } : {}),
      });
      await recordIncident("render." + context.routeType, failure.code);
    },
  );
};
