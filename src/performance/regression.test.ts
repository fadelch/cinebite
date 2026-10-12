import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { productLocation: { findMany: vi.fn() } },
}));
import { prisma } from "@/lib/db/prisma";
import { getStockAvailabilityBatchRecord } from "@/server/repositories/stock-availability.repository";
import { getEffectiveProductAvailabilities } from "@/server/services/stock-availability.service";
import { conditionalJson } from "@/server/http/conditional-json";
import { pollingDelay } from "@/lib/performance/polling-policy";
import { transactionRetryDelay } from "@/lib/performance/transaction-retry";
import { runtimePoolConfig } from "@/lib/db/pool-config";
import { ImageCapacity } from "@/server/media/capacity";
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("performance invariants, not brittle wall-clock budgets", () => {
  it.each([20, 100, 500])(
    "batches %i products once and keeps tenant/location stock filters",
    async (count) => {
      vi.mocked(prisma.productLocation.findMany).mockResolvedValue([]);
      await getStockAvailabilityBatchRecord(
        "org-a",
        Array.from({ length: count }, (_, i) => "p" + i),
        "a1",
      );
      expect(prisma.productLocation.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.productLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org-a",
            locationId: "a1",
            product: { organizationId: "org-a" },
          }),
        }),
      );
    },
  );
  it("does not query an empty menu", async () => {
    expect(await getStockAvailabilityBatchRecord("a", [], "a1")).toEqual([]);
    expect(prisma.productLocation.findMany).not.toHaveBeenCalled();
  });
  it("preserves shared recipe math including reserved and missing stock", async () => {
    const decimal = (value: string) => ({ toFixed: () => value });
    vi.mocked(prisma.productLocation.findMany).mockResolvedValue([
      {
        productId: "p1",
        isAvailable: true,
        product: {
          status: "ACTIVE",
          recipeComponents: [
            {
              quantityRequired: decimal("2.000"),
              inventoryItem: {
                locationInventories: [
                  {
                    quantityOnHand: decimal("10.000"),
                    quantityReserved: decimal("9.000"),
                  },
                ],
              },
            },
          ],
        },
      },
      {
        productId: "p2",
        isAvailable: true,
        product: { status: "ACTIVE", recipeComponents: [] },
      },
      {
        productId: "p3",
        isAvailable: false,
        product: { status: "ACTIVE", recipeComponents: [] },
      },
    ] as never);
    const result = await getEffectiveProductAvailabilities(
      "a",
      ["p1", "p2", "p3"],
      "a1",
    );
    expect(result.get("p1")?.effectiveAvailable).toBe(false);
    expect(result.get("p2")?.inventory.state).toBe("NOT_TRACKED");
    expect(result.get("p3")?.effectiveAvailable).toBe(false);
  });
  it("returns private conditional data but ignores volatile queue fetch time", async () => {
    const first = conditionalJson(new Request("http://localhost"), {
      items: [{ code: "demo", status: "READY" }],
      fetchedAt: "t1",
    });
    const tag = first.headers.get("etag")!;
    const same = conditionalJson(
      new Request("http://localhost", { headers: { "if-none-match": tag } }),
      { items: [{ code: "demo", status: "READY" }], fetchedAt: "t2" },
    );
    expect(same.status).toBe(304);
    expect(await same.text()).toBe("");
    expect(same.headers.get("cache-control")).toContain("no-store");
    expect(same.headers.get("vary")).toBe("Cookie");
    expect(
      conditionalJson(
        new Request("http://localhost", { headers: { "if-none-match": tag } }),
        { items: [{ code: "demo", status: "DELIVERED" }] },
      ).status,
    ).toBe(200);
  });
  it("bounds polling jitter/backoff and honors retry guidance", () => {
    expect(pollingDelay(0, 0)).toBe(4500);
    expect(pollingDelay(0, 1)).toBe(5500);
    expect(pollingDelay(100, 1)).toBe(33000);
    expect(pollingDelay(0, 0, 60000)).toBe(60000);
  });
  it("bounds transaction retry delays", () => {
    expect(transactionRetryDelay(0, 0)).toBe(10);
    expect(transactionRetryDelay(10, 1)).toBe(120);
  });
  it("caps per-instance pools and timeout configuration", () => {
    vi.stubEnv("DB_POOL_MAX", "9999");
    vi.stubEnv("DB_QUERY_TIMEOUT_MS", "0");
    expect(runtimePoolConfig()).toMatchObject({
      max: 10,
      connectionTimeoutMillis: 2500,
      query_timeout: 10000,
    });
    vi.stubEnv("DB_POOL_MAX", "5");
    expect(runtimePoolConfig().max).toBe(5);
  });
  it("limits image work, rejects overflow and releases failed work", async () => {
    const limiter = new ImageCapacity(1, 1, 1000);
    let release!: () => void;
    const first = limiter.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    const second = limiter.run(async () => {
      throw new Error("fixture");
    });
    const handled = expect(second).rejects.toThrow("fixture");
    await expect(limiter.run(async () => true)).rejects.toMatchObject({
      status: 429,
    });
    release();
    await first;
    await handled;
    expect(limiter.snapshot).toEqual({ active: 0, queued: 0 });
  });
  it("removes expired image waiters without leaking capacity", async () => {
    const limiter = new ImageCapacity(1, 1, 5);
    let release!: () => void;
    const first = limiter.run(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    await Promise.resolve();
    await expect(limiter.run(async () => true)).rejects.toMatchObject({
      status: 429,
    });
    release();
    await first;
    expect(limiter.snapshot.queued).toBe(0);
  });
});
