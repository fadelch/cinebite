import "server-only";
import { isSameOriginRequest } from "@/server/auth/request-security";
import {
  apiError,
  apiSuccess,
  forbiddenOrigin,
  invalidRequestBody,
} from "./api-response";
export { notificationQuery as settingsQuery } from "./notification-request";
export async function settingsBytes(request: Request, maximum = 16384) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) {
      await reader.cancel();
      throw new SyntaxError("oversized body");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function settingsJson(request: Request) {
  return JSON.parse((await settingsBytes(request)).toString("utf8"));
}
export async function settingsFormData(request: Request) {
  const bytes = await settingsBytes(request, 6 * 1024 * 1024);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}
export async function settingsGet(action: () => Promise<unknown>) {
  try {
    return apiSuccess(await action());
  } catch (error) {
    return apiError(error);
  }
}
export async function settingsMutation(
  request: Request,
  action: (input: unknown) => Promise<unknown>,
  status = 200,
) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  let data;
  try {
    data = await settingsJson(request);
  } catch {
    return invalidRequestBody();
  }
  try {
    return apiSuccess(await action(data), status);
  } catch (error) {
    return apiError(error);
  }
}
