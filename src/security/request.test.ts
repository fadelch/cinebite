import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: vi.fn() } }));
import { prisma } from "@/lib/db/prisma";
import { boundedBody, validateQuery } from "@/server/security/body";
import {
  consumeRateLimit,
  rateKey,
  networkSubject,
  RATE_POLICIES,
} from "@/server/security/rate-limit";
import { isSameOriginRequest } from "@/lib/security/request-origin";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
afterEach(() => vi.unstubAllEnvs());
describe("security ingress", () => {
  it("requires an explicit production origin and ignores forged forwarded hosts", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CINEBITE_APP_ORIGIN", "https://cinema.example");
    vi.stubEnv("CINEBITE_ALLOWED_ORIGINS", "");
    const request = new Request("http://localhost/api/test", {
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOriginRequest(request)).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("http://localhost/api/test", {
          headers: { origin: "https://cinema.example" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("http://localhost/api/test", {
          headers: {
            origin: "https://cinema.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toBe(false);
    vi.stubEnv("CINEBITE_APP_ORIGIN", "");
    expect(
      isSameOriginRequest(
        new Request("http://localhost/api/test", {
          headers: { origin: "http://localhost" },
        }),
      ),
    ).toBe(false);
  });
  it("bounds actual streamed bytes, not just declared content length", async () => {
    for (const headers of [
      new Headers(),
      new Headers({ "content-length": "1" }),
    ]) {
      const request = new Request("http://localhost", {
        method: "POST",
        headers,
        body: "x".repeat(100),
      });
      await expect(boundedBody(request, 10)).rejects.toMatchObject({
        status: 413,
      });
    }
    await expect(
      boundedBody(
        new Request("http://localhost", { method: "POST", body: '{"x":1}' }),
        10,
      ),
    ).resolves.toEqual(Buffer.from('{"x":1}'));
    await expect(
      boundedBody(
        new Request("http://localhost", {
          method: "POST",
          body: "test",
          headers: { "content-encoding": "gzip" },
        }),
        100,
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("rejects duplicate or huge query input", () => {
    expect(() =>
      validateQuery(
        new Request("http://localhost?locationId=a1&locationId=a2"),
      ),
    ).toThrow();
    expect(() =>
      validateQuery(new Request("http://localhost?search=" + "x".repeat(5000))),
    ).toThrow();
  });
  it("does not trust arbitrary client IP headers; HMAC keys contain no raw network/session data", () => {
    vi.stubEnv("SECURITY_TRUST_PROXY", "false");
    expect(networkSubject(new Headers({ "x-real-ip": "192.0.2.1" }))).toBe(
      "deployment",
    );
    vi.stubEnv("SECURITY_TRUST_PROXY", "true");
    vi.stubEnv("SECURITY_CLIENT_IP_HEADER", "x-real-ip");
    expect(
      networkSubject(new Headers({ "x-real-ip": "192.0.2.1, evil" })),
    ).toBe("deployment");
    expect(networkSubject(new Headers({ "x-real-ip": "192.0.2.1" }))).toBe(
      "ip:192.0.2.1",
    );
    vi.stubEnv("SECURITY_RATE_LIMIT_SECRET", "test-fixture-key".repeat(3));
    expect(rateKey(RATE_POLICIES.qr, "ip:192.0.2.1", 1)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(rateKey(RATE_POLICIES.qr, "ip:192.0.2.1", 1)).not.toBe(
      rateKey(RATE_POLICIES.qr, "ip:192.0.2.1", 2),
    );
  });
  it("uses shared atomic counters and rejects over quota", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 61 }]);
    await expect(
      consumeRateLimit(RATE_POLICIES.qr, "fixture"),
    ).rejects.toMatchObject({ status: 429 });
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 1 }]);
    await expect(
      consumeRateLimit(RATE_POLICIES.qr, "fixture", Date.now() + 60000),
    ).resolves.toBeUndefined();
  });
  it("emits unique production nonces, no script unsafe-inline/eval, no-store and HTTPS HSTS", () => {
    vi.stubEnv("NODE_ENV", "production");
    const first = proxy(new NextRequest("https://cinema.example/login"));
    const second = proxy(
      new NextRequest("https://cinema.example/login", {
        headers: { "x-nonce": "forged" },
      }),
    );
    const policy = first.headers.get("content-security-policy")!;
    expect(policy).not.toBe(second.headers.get("content-security-policy"));
    expect(
      policy
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith("script-src")),
    ).not.toMatch(/unsafe-inline|unsafe-eval|forged/);
    for (const directive of [
      "default-src",
      "style-src",
      "img-src",
      "font-src",
      "connect-src",
      "frame-src",
      "frame-ancestors",
      "object-src",
      "base-uri",
      "form-action",
    ])
      expect(policy).toContain(directive);
    expect(first.headers.get("x-frame-options")).toBe("DENY");
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    expect(first.headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(
      proxy(new NextRequest("http://localhost/login")).headers.has(
        "strict-transport-security",
      ),
    ).toBe(false);
  });
});
