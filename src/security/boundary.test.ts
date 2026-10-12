import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: "fixture" }) }),
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/services/customer-session.service", () => ({
  validateCustomerSession: vi.fn(),
}));
vi.mock("@/server/security/rate-limit", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/server/security/rate-limit")>();
  return { ...real, consumeRateLimit: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { secureRequest } from "@/server/security/request-boundary";
import { getCurrentUser } from "@/server/auth/current-user";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  authorizationScope,
  rememberAuthorization,
  requestAuthorizationVersion,
} from "@/server/auth/authorization-context";
import { assertMutationActor } from "@/server/auth/mutation-scope";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CINEBITE_APP_ORIGIN", "http://localhost");
});
afterEach(() => vi.unstubAllEnvs());
const request = (url: string, data: unknown = {}) =>
  new Request("http://localhost" + url, {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify(data),
  });
describe("security shared request-boundary regression", () => {
  it("allows anonymous customer end-session without accidentally requiring staff identity", async () => {
    expect(
      (
        await secureRequest(
          request("/api/customer/session/end", { action: "END_SESSION" }),
        )
      ).method,
    ).toBe("POST");
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(validateCustomerSession).not.toHaveBeenCalled();
    expect(consumeRateLimit).toHaveBeenCalled();
  });
  it("verifies customer identity before quota selection, refusing fake-session quota resets", async () => {
    vi.mocked(validateCustomerSession).mockRejectedValue(
      new Error("invalid session"),
    );
    await expect(
      secureRequest(request("/api/customer/orders")),
    ).rejects.toThrow();
    expect(consumeRateLimit).not.toHaveBeenCalled();
    vi.mocked(validateCustomerSession).mockResolvedValue({
      id: "verified-session",
    } as never);
    await secureRequest(request("/api/customer/orders"));
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "checkout" }),
      "verified-session",
    );
  });
  it("fails closed for absent current staff identity and never invokes privileged business code", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(
      secureRequest(request("/api/admin/staff")),
    ).rejects.toMatchObject({ status: 401 });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });
  it("isolates request-local authorization versions and checks the originally verified version at commit", async () => {
    const versions = await Promise.all(
      [2, 3].map((version) =>
        authorizationScope(async () => {
          rememberAuthorization("uid", version);
          await Promise.resolve();
          return requestAuthorizationVersion("uid");
        }),
      ),
    );
    expect(versions).toEqual([2, 3]);
    expect(requestAuthorizationVersion("uid")).toBeUndefined();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      organizationMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await authorizationScope(async () => {
      rememberAuthorization("uid", 2);
      await expect(
        assertMutationActor(tx as never, "uid", "org"),
      ).rejects.toMatchObject({ status: 403 });
    });
    expect(tx.organizationMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({ authorizationVersion: 2 }),
        }),
      }),
    );
  });
});
