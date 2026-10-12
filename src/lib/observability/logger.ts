import "server-only";
import { currentObservation } from "./context";
import { observabilityConfig } from "./config";
import { redact } from "./safe";
export type LogLevel = "debug" | "info" | "warn" | "error";
export function logRecord(
  level: LogLevel,
  event: string,
  details: Record<string, unknown> = {},
) {
  const config = observabilityConfig();
  return {
    ...(redact({ ...currentObservation(), ...details }) as Record<
      string,
      unknown
    >),
    timestamp: new Date().toISOString(),
    level,
    event: /^[a-z][a-z0-9_.]{0,80}$/.test(event)
      ? event
      : "telemetry.invalid_event",
    environment: config.environment,
    ...(config.release ? { release: config.release } : {}),
  };
}
export function log(
  level: LogLevel,
  event: string,
  details: Record<string, unknown> = {},
) {
  if (level === "debug" && !observabilityConfig().debug) return;
  try {
    const line = JSON.stringify(logRecord(level, event, details));
    // One JSON object per line. Neither user-derived text nor raw errors reach this sink.
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  } catch {
    /* Telemetry must never change a committed business outcome. */
  }
}
export async function observedOperation<T>(
  operation: string,
  action: () => Promise<T>,
  fields: Record<string, unknown> = {},
) {
  const started = performance.now();
  try {
    const result = await action();
    log("info", "operation.completed", {
      operation,
      ...fields,
      durationMs: performance.now() - started,
    });
    return result;
  } catch (error) {
    const { normalizeError, expectedLevel } = await import("./errors");
    const failure = normalizeError(error);
    log(expectedLevel(failure.status), "operation.failed", {
      operation,
      ...fields,
      durationMs: performance.now() - started,
      errorCode: failure.code,
      errorType: failure.type,
      retryable: failure.retryable,
      statusCode: failure.status,
    });
    throw error;
  }
}
