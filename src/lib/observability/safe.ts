// Deny-by-default telemetry: free text, URLs, payloads and exception messages are not accepted.
const secretKey =
  /access.?code|code.?hash|ticket.?reference|authorization|cookie|password|token|secret|private.?key|card|cvv|credential|database.?url|direct.?url|email|phone|note|payload|headers|stack|message/i;
const identifiers = new Set([
  "requestId",
  "jobRunId",
  "organizationId",
  "locationId",
  "orderId",
  "publicOrderCode",
  "paymentId",
  "refundId",
  "eventId",
  "notificationId",
]);
const labels = new Set([
  "operation",
  "event",
  "stage",
  "errorCode",
  "errorType",
  "environment",
  "release",
  "status",
  "jobType",
  "domain",
  "outcome",
  "digest",
]);
const numbers = new Set([
  "durationMs",
  "statusCode",
  "count",
  "processedCount",
  "failedCount",
  "retryCount",
  "attemptCount",
  "pendingCount",
  "latencyMs",
]);
export function safePath(path: string) {
  const pathname = path.split(/[?#]/)[0];
  const staticSegments = new Set([
    "api",
    "admin",
    "super-admin",
    "customer",
    "kitchen",
    "delivery",
    "orders",
    "payments",
    "webhook",
    "expire",
    "notifications",
    "process",
    "operations",
    "monitor",
    "health",
    "ready",
    "auth",
    "session",
    "logout",
    "cart",
    "s",
    "login",
  ]);
  return pathname
    .split("/")
    .slice(0, 16)
    .map((segment) =>
      !segment || staticSegments.has(segment) ? segment : "[id]",
    )
    .join("/");
}
export function safeReference(value: unknown) {
  return typeof value === "string" && /^(REQ-|JOB-)[a-f0-9-]{36}$/.test(value)
    ? value
    : undefined;
}
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[omitted]";
  if (Array.isArray(value))
    return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (!value || typeof value !== "object")
    return (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "boolean" ||
      value === null
      ? value
      : "[omitted]";
  const output: Record<string, unknown> = Object.create(null);
  for (const [key, entry] of Object.entries(value).slice(0, 50)) {
    if (secretKey.test(key)) {
      output[key.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 80)] = "[redacted]";
      continue;
    }
    if (numbers.has(key) && typeof entry === "number" && Number.isFinite(entry))
      output[key] = Math.max(0, Math.round(entry * 100) / 100);
    else if (
      ["retryable", "duplicate"].includes(key) &&
      typeof entry === "boolean"
    )
      output[key] = entry;
    else if (
      (identifiers.has(key) || labels.has(key)) &&
      typeof entry === "string" &&
      /^[a-zA-Z0-9_.:-]{1,120}$/.test(entry)
    )
      output[key] = entry;
    else if (key === "route" && typeof entry === "string")
      output.route = safePath(entry);
    else if (typeof entry === "object" && entry !== null)
      output[key.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40) || "details"] =
        redact(entry, depth + 1);
  }
  return output;
}
