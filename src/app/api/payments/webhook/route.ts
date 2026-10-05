import { apiError, apiSuccess } from "@/server/http/api-response";
import { receivePaymentWebhook } from "@/server/services/payment.service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  // Raw body is authenticated BEFORE JSON parsing. No cookie/Origin required.
  if (Number(request.headers.get("content-length") ?? 0) > 16384) return new Response(null, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); return new Response(null, { status: 413 }); }
      chunks.push(chunk.value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return apiSuccess(await receivePaymentWebhook(raw, request.headers.get("x-cinebite-sandbox-signature")));
  } catch (error) { return apiError(error); }
}
