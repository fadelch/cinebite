import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Offline migration contract checks. The explicit demo integration separately
// executes the trigger against PostgreSQL; npm test never connects to Neon.
const migration = readFileSync(path.join(process.cwd(), "prisma/migrations/20261005190000_phase_12_kitchen_operations/migration.sql"), "utf8");

describe("status history migration safety contract", () => {
  it("rejects update/delete and restricts historical foreign-key deletion", () => {
    expect(migration).toMatch(/CREATE TRIGGER order_status_events_immutable\s+BEFORE UPDATE OR DELETE ON "order_status_events"/);
    expect(migration).toContain("RAISE EXCEPTION 'Order status history is append-only'");
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(2);
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/);
  });
  it("enforces a single event per state and database-owned timestamps", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "order_status_events_orderId_toStatus_key" ON "order_status_events"("orderId", "toStatus")');
    expect(migration).toContain('"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
    expect(migration).toContain('"order_status_events_transition_check" CHECK (COALESCE((');
  });
  it("backfills one historical SYSTEM PLACED event without duplicate deployment history", () => {
    expect(migration).toContain("'phase12-backfill-' || \"id\"");
    expect(migration).toContain("'SYSTEM', \"createdAt\" AT TIME ZONE 'UTC'");
    expect(migration).toContain('ON CONFLICT ("orderId", "toStatus") DO NOTHING');
  });
});
