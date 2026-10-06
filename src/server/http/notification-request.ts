import "server-only";
export function notificationQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => [
      key,
      params.getAll(key).length > 1 ? params.getAll(key) : params.get(key),
    ]),
  );
}
export async function notificationBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Invalid JSON");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) {
      await reader.cancel();
      throw new SyntaxError("Body too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
