function firstHeaderValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;

    const requestUrl = new URL(request.url);
    if (originUrl.origin === requestUrl.origin) return true;

    // Next.js can construct request.url with its bind hostname (for example
    // localhost) even when the browser reached the server through a LAN IP.
    // Compare the browser Origin with the public request headers as a safe
    // fallback, while retaining protocol validation for reverse proxies.
    const host = firstHeaderValue(request.headers.get("x-forwarded-host"))
      ?? firstHeaderValue(request.headers.get("host"));
    if (!host) return false;
    const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))
      ?? requestUrl.protocol.slice(0, -1);
    if (protocol !== "http" && protocol !== "https") return false;

    return originUrl.origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
