import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
import { ageSeconds, backlogStatus, databaseHealth } from "./health";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("bounded operational health", () => {
  it("checks actual adapter outcome without topology exposure", async () => {
    const result = await databaseHealth(async () => 1);
    expect(result.status).toBe("HEALTHY");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(result)).toEqual(["status", "latencyMs", "checkedAt"]);
  });
  it("fails unavailable safely", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await databaseHealth(async () => {
      throw new Error("PRIVATE database URL");
    });
    expect(result.status).toBe("UNHEALTHY");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("detects slow query through configurable threshold", async () => {
    vi.stubEnv("OBSERVABILITY_DB_DEGRADED_MS", "10");
    const result = await databaseHealth(
      async () => new Promise((resolve) => setTimeout(resolve, 20)),
    );
    expect(result.status).toBe("DEGRADED");
  });
  it("uses age and final failures for outbox degradation", () => {
    vi.stubEnv("OBSERVABILITY_BACKLOG_SECONDS", "30");
    expect(backlogStatus(1, 31, 0)).toBe("DEGRADED");
    expect(backlogStatus(0, null, 1)).toBe("DEGRADED");
    expect(backlogStatus(0, null, 0)).toBe("HEALTHY");
    expect(ageSeconds(new Date(0), new Date(31000))).toBe(31);
    expect(ageSeconds(null)).toBeNull();
  });
});
