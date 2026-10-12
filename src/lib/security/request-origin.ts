/** Browser mutations accept explicit deployment origins, never forwarded headers. */
export function isSameOriginRequest(request: Request): boolean {
  const raw = request.headers.get("origin");
  if (
    !raw ||
    raw.length > 300 ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return false;
  try {
    const origin = new URL(raw);
    if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== raw)
      return false;
    if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
      const isolatedDemo =
        process.env.FIREBASE_ADMIN_PROJECT_ID?.startsWith("demo-") &&
        ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
      if (!isolatedDemo) return false;
    }
    const configured = [
      process.env.CINEBITE_APP_ORIGIN,
      ...(process.env.CINEBITE_ALLOWED_ORIGINS ?? "").split(","),
    ]
      .filter(Boolean)
      .map((value) => new URL(value!.trim()).origin);
    if (configured.includes(origin.origin)) return true;
    if (process.env.NODE_ENV === "production") return false;
    return new URL(request.url).origin === origin.origin;
  } catch {
    return false;
  }
}
