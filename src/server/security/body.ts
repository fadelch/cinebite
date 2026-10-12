import "server-only";
import { ServiceError } from "@/server/services/service-error";

export async function boundedBody(request: Request, maximum: number) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d{1,10}$/.test(declared) || Number(declared) > maximum))
    throw new ServiceError(
      "REQUEST_TOO_LARGE",
      413,
      "The request is too large.",
    );
  if (
    request.headers.has("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new ServiceError(
      "INVALID_REQUEST",
      415,
      "Compressed request bodies are not supported.",
    );
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new ServiceError(
          "REQUEST_TOO_LARGE",
          413,
          "The request is too large.",
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    reader.releaseLock();
  }
}

export function validateQuery(request: Request) {
  const url = new URL(request.url);
  if (url.search.length > 4096 || url.pathname.length > 2048)
    throw new ServiceError(
      "REQUEST_TOO_LARGE",
      413,
      "The request is too large.",
    );
  const keys = [...url.searchParams.keys()];
  if (keys.length > 32 || new Set(keys).size !== keys.length)
    throw new ServiceError(
      "INVALID_REQUEST",
      400,
      "Use each query parameter only once.",
    );
}
