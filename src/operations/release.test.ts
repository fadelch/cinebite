import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (run: (tx: object) => unknown) =>
      run({ $executeRaw: vi.fn(), $queryRaw: query }),
  },
}));
import manifest from "@/lib/operations/migrations.json";
import { migrationReadiness } from "@/server/observability/release";
import { paymentConfig } from "@/lib/payments/config";
const complete = () =>
  manifest.map((m) => ({
    migration_name: m.name,
    checksum: m.checksum,
    finished_at: new Date(),
    rolled_back_at: null,
  }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("release readiness fails closed", () => {
  it("accepts only explicitly pinned legacy Windows line-ending hashes", async () => {
    query.mockResolvedValue(
      complete().map((row, index) => ({
        ...row,
        checksum: manifest[index].legacyWindowsChecksum,
      })),
    );
    expect(await migrationReadiness()).toBe(true);
  });
  it("requires every committed migration checksum", async () => {
    query.mockResolvedValue(complete());
    expect(await migrationReadiness()).toBe(true);
  });
  it("rejects missing migrations", async () => {
    query.mockResolvedValue(complete().slice(1));
    expect(await migrationReadiness()).toBe(false);
  });
  it("rejects rewritten history", async () => {
    const rows = complete();
    rows[0].checksum = "different";
    query.mockResolvedValue(rows);
    expect(await migrationReadiness()).toBe(false);
  });
  it("rejects unfinished/failed migrations", async () => {
    query.mockResolvedValue([
      ...complete(),
      { migration_name: "pending", finished_at: null, rolled_back_at: null },
    ]);
    expect(await migrationReadiness()).toBe(false);
  });
  it("allows finished additive migrations for compatible application rollback", async () => {
    query.mockResolvedValue([
      ...complete(),
      {
        migration_name: "new-additive",
        finished_at: new Date(),
        rolled_back_at: null,
      },
    ]);
    expect(await migrationReadiness()).toBe(true);
  });
  it("returns unavailable without leaking a DB exception", async () => {
    query.mockRejectedValue(new Error("private connection details"));
    expect(await migrationReadiness()).toBe(false);
  });
  it("production cannot activate the sandbox as a live payment system", () => {
    vi.stubEnv("CINEBITE_ENVIRONMENT", "production");
    vi.stubEnv("PAYMENT_PROVIDER", "sandbox");
    vi.stubEnv("PAYMENT_SANDBOX_ENABLED", "true");
    expect(() => paymentConfig()).toThrow("Production launch remains blocked");
  });
});
