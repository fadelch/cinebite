import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("prisma/migrations/20261005210000_phase_13_delivery_operations/migration.sql", "utf8");
describe("additive delivery migration", () => {
  it("extends enums, assignment FK, timestamps and indexes without destructive resets", () => {
    for (const field of ["OUT_FOR_DELIVERY", "DELIVERED", "deliveryAssignedUserId", "deliveryClaimedAt", "deliveredAt", "readyAt"]) expect(sql).toContain(field);
    expect(sql).toContain('REFERENCES "users"("id") ON DELETE RESTRICT');
    expect(sql.match(/CREATE INDEX/g)).toHaveLength(3);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DISABLE TRIGGER|DROP TRIGGER|DELETE FROM/i);
  });
  it("preserves old transitions, appends only next delivery steps and backfills ready timestamps", () => {
    expect(sql).toContain('"fromStatus"::text = \'READY\' AND "toStatus"::text = \'OUT_FOR_DELIVERY\'');
    expect(sql).toContain('"fromStatus"::text = \'OUT_FOR_DELIVERY\' AND "toStatus"::text = \'DELIVERED\'');
    expect(sql).toContain('UPDATE "orders" o SET "readyAt" = e."createdAt"');
    expect(sql).not.toContain('UPDATE "order_status_events"');
    expect(sql).toContain('"deliveredAt" >= "deliveryClaimedAt"');
  });
});
