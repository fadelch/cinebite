import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/security/request-boundary", () => ({ secureRequest: vi.fn(async (request: Request) => request) }));
vi.mock("@/server/observability/incident", () => ({
  recordIncident: vi.fn().mockResolvedValue(undefined),
}));
import { observedRoute } from "./observed-route";
import { apiError } from "./api-response";
import { ServiceError } from "@/server/services/service-error";
import { log } from "@/lib/observability/logger";
import { GET as health } from "@/app/api/health/route";
import { recordIncident } from "@/server/observability/incident";
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
describe("correlated safe HTTP", () => {
  it("matches response reference to operation log and ignores attacker-supplied IDs", async () => {
    const sink = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = observedRoute(
      "POST.api.test",
      async (_request: Request) => {
        void _request;
        log("warn", "test.failure");
        return apiError(
          new ServiceError("INSUFFICIENT_STOCK", 409, "No stock."),
        );
      },
    );
    const response = await handler(
        new Request("http://localhost/api/test?password=PRIVATE", {
          headers: { "X-Request-ID": "attacker", Cookie: "session=PRIVATE" },
        }),
      ),
      body = await response.json();
    expect(response.status).toBe(409);
    expect(body.requestId).toBe(response.headers.get("X-Request-ID"));
    expect(body.error).toContain(body.requestId);
    expect(JSON.stringify(sink.mock.calls)).not.toContain("PRIVATE");
    expect(JSON.parse(sink.mock.calls[0][0] as string).requestId).toBe(
      body.requestId,
    );
  });
  it("maps escaped unknown exceptions to safe 500 without altering success responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await observedRoute("GET.api.test", async () => {
      throw new Error("PRIVATE raw SQL");
    })();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
  });
  it("uses safe unavailable status for real classified dependency failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await observedRoute("GET.api.test", async () => {
      throw Object.assign(new Error("private-db-host"), { code: "P1001" });
    })();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private-db-host",
    );
  });
  it("keeps liveness minimal and independent of database", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await health();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("does not persist incidents for public dependency probes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await observedRoute("GET.api.ready", async () =>
      Response.json({ status: "unavailable" }, { status: 503 }),
    )();
    expect(response.status).toBe(503);
    expect(recordIncident).not.toHaveBeenCalled();
  });
});
