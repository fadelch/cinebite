import "server-only";
import { cookies } from "next/headers";
import { isSameOriginRequest } from "@/lib/security/request-origin";
import { getCurrentUser } from "@/server/auth/current-user";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import { ServiceError } from "@/server/services/service-error";
import { boundedBody, validateQuery } from "./body";
import {
  anonymousPolicy,
  consumeRateLimit,
  networkSubject,
  RATE_POLICIES,
} from "./rate-limit";

const MACHINE_PATHS = new Set([
  "/api/payments/webhook",
  "/api/payments/expire",
  "/api/notifications/process",
  "/api/operations/monitor",
]);
export async function secureRequest(request: Request) {
  validateQuery(request);
  const path = new URL(request.url).pathname;
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (mutation && !MACHINE_PATHS.has(path) && !isSameOriginRequest(request))
    throw new ServiceError(
      "INVALID_ORIGIN",
      403,
      "The request origin is not allowed.",
    );
  // Verify identities before choosing per-user counters; random cookies cannot reset a quota.
  const network = networkSubject(request.headers);
  if (path === "/api/auth/session" || path === "/api/customer/session") {
    const policy =
      path === "/api/auth/session" ? RATE_POLICIES.auth : RATE_POLICIES.start;
    await consumeRateLimit(anonymousPolicy(policy, network), network);
  } else if (path === "/api/payments/webhook") {
    // Generous ingress ceiling only; signature verification still controls every mutation.
    await consumeRateLimit(
      anonymousPolicy(RATE_POLICIES.webhook, network),
      network,
    );
  } else if (mutation || path.includes("/analytics")) {
    if (path === "/api/customer/session/end") {
      await consumeRateLimit(
        anonymousPolicy({ ...RATE_POLICIES.start, name: "end" }, network),
        network,
      );
    } else if (path.startsWith("/api/customer/")) {
      const session = await validateCustomerSession(
        (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value,
      );
      const policy =
        path.includes("/payments/") || path === "/api/customer/orders"
          ? RATE_POLICIES.checkout
          : RATE_POLICIES.customer;
      await consumeRateLimit(policy, session.id);
    } else if (!MACHINE_PATHS.has(path) && path !== "/api/auth/logout") {
      const user = await getCurrentUser();
      if (!user)
        throw new ServiceError(
          "AUTHENTICATION_REQUIRED",
          401,
          "Authentication is required.",
        );
      const policy =
        (path === "/api/admin/staff" && request.method === "POST") ||
        path.endsWith("/setup")
          ? RATE_POLICIES.invite
          : path.includes("/refunds")
            ? RATE_POLICIES.refund
            : path.includes("/analytics")
              ? RATE_POLICIES.report
              : request.headers
                    .get("content-type")
                    ?.startsWith("multipart/form-data")
                ? RATE_POLICIES.upload
                : RATE_POLICIES.staff;
      await consumeRateLimit(
        policy,
        `${user.uid}:${user.organizationId ?? "platform"}`,
      );
    }
  }
  if (!mutation) return request;
  const multipart = request.headers
    .get("content-type")
    ?.startsWith("multipart/form-data");
  const maximum = multipart ? 6 * 1024 * 1024 : 16384;
  const bytes = await boundedBody(request, maximum);
  if (multipart) {
    let form: FormData;
    try {
      form = await new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": request.headers.get("content-type")! },
      }).formData();
    } catch {
      throw new ServiceError(
        "INVALID_REQUEST",
        400,
        "The upload form is invalid.",
      );
    }
    const allowed = path.includes("/settings/logo")
      ? ["image", "version"]
      : path.includes("/movies")
        ? path.endsWith("/poster")
          ? ["poster"]
          : ["poster", "payload"]
        : path.endsWith("/image")
          ? ["image"]
          : ["image", "payload"];
    if (
      [...form.keys()].some(
        (key) => !allowed.includes(key) || form.getAll(key).length !== 1,
      ) ||
      [...form.values()].some(
        (value) =>
          typeof value === "string" && Buffer.byteLength(value) > 16384,
      )
    )
      throw new ServiceError(
        "INVALID_REQUEST",
        400,
        "Use only the supported upload fields once.",
      );
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bytes.length ? new Uint8Array(bytes) : undefined,
  });
}
