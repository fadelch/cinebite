import { exportAnalytics } from "@/server/services/analytics.service";
import {
  apiError,
  forbiddenOrigin,
  invalidRequestBody,
} from "@/server/http/api-response";
import { isSameOriginRequest } from "@/server/auth/request-security";
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4096)
      return new Response(null, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return invalidRequestBody();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    let input;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return invalidRequestBody();
    }
    const report = await exportAnalytics(input);
    return new Response(report.content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
export const runtime = "nodejs";
