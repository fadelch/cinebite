import "server-only";
import { logRecord } from "./logger";
// Future vendor adapters receive ONLY this already-scrubbed envelope. No request/body/error object.
export interface ErrorTrackingProvider {
  capture(event: ReturnType<typeof logRecord>): Promise<void>;
}
let configuredProvider: ErrorTrackingProvider | undefined;
// Only trusted server startup code may install a future reviewed vendor adapter.
export function configureErrorTrackingProvider(
  provider?: ErrorTrackingProvider,
) {
  configuredProvider = provider;
}
export async function captureTrackedError(
  event: string,
  details: Record<string, unknown>,
  provider = configuredProvider,
) {
  if (!provider) return; // Local structured logging only; no invented DSN or external delivery.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      provider.capture(logRecord("error", event, details)),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 500);
      }),
    ]);
  } catch {
    /* External telemetry is non-critical. */
  } finally {
    if (timer) clearTimeout(timer);
  }
}
