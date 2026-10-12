import "server-only";
import { createHash } from "node:crypto";
/** Authorization must run BEFORE this helper. Nothing is cached server-side. */
export function conditionalJson(request: Request, data: unknown) {
  const stable =
    data && typeof data === "object" && "fetchedAt" in data
      ? Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== "fetchedAt"),
        )
      : data;
  const etag =
    '"' +
    createHash("sha256").update(JSON.stringify(stable)).digest("hex") +
    '"';
  const headers = {
    "Cache-Control": "private, no-store",
    ETag: etag,
    Vary: "Cookie",
  };
  if (request.headers.get("If-None-Match") === etag)
    return new Response(null, { status: 304, headers });
  return Response.json(data, { headers });
}
