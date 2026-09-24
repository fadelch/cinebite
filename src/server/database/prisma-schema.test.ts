import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const phase8Migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260925120000_phase_8_inventory_management/migration.sql"),
  "utf8",
);

describe("Prisma relational constraints", () => {
  it.each([
    /firebaseUid\s+String\s+@unique/,
    /email\s+String\s+@unique/,
    /model Organization\s*{[\s\S]*?slug\s+String\s+@unique/,
    /@@unique\(\[userId, organizationId\]\)/,
    /@@unique\(\[id, organizationId\]\)/,
    /@@unique\(\[organizationId, slug\]\)/,
    /@@unique\(\[locationId, number\]\)/,
    /@@id\(\[hallId, id\]\)/,
    /@@unique\(\[hallId, label\]\)/,
    /@@id\(\[membershipId, locationId\]\)/,
  ])("contains required database invariant %s", (invariant) => {
    expect(schema).toMatch(invariant);
  });

  it("defines foreign keys for the complete tenant hierarchy", () => {
    expect(schema).toContain(
      "User             @relation(fields: [userId], references: [id], onDelete: Cascade)",
    );
    expect(schema).toContain(
      "Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)",
    );
    expect(schema).toContain(
      "@relation(fields: [membershipId, organizationId], references: [id, organizationId], onDelete: Cascade)",
    );
    expect(schema).toContain(
      "@relation(fields: [locationId, organizationId], references: [id, organizationId], onDelete: Cascade)",
    );
    expect(schema).toMatch(
      /location\s+Location\s+@relation\(fields: \[locationId\], references: \[id\], onDelete: Restrict\)/,
    );
    expect(schema).toMatch(
      /hall\s+Hall\s+@relation\(fields: \[hallId\], references: \[id\], onDelete: Restrict\)/,
    );
  });

  it("contains no password, token, or session credential columns", () => {
    expect(schema).not.toMatch(/password|passwordHash|idToken|sessionCookie/i);
  });

  it("enforces Phase 7 tenant-safe catalog and exact money relations", () => {
    expect(schema).toMatch(/model MenuCategory[\s\S]*?@@unique\(\[organizationId, slug\]\)/);
    expect(schema).toMatch(/model Product[\s\S]*?@@unique\(\[organizationId, slug\]\)/);
    expect(schema).toMatch(/model Product[\s\S]*?@@unique\(\[organizationId, sku\]\)/);
    expect(schema).toMatch(/model ProductLocation[\s\S]*?price\s+Decimal\s+@db\.Decimal\(12, 2\)/);
    expect(schema).toMatch(/model ProductLocation[\s\S]*?@@unique\(\[productId, locationId\]\)/);
    expect(schema).toContain("@relation(fields: [categoryId, organizationId], references: [id, organizationId], onDelete: Restrict)");
    expect(schema).toContain("@relation(fields: [productId, organizationId], references: [id, organizationId], onDelete: Restrict)");
  });

  it("enforces Phase 8 tenant-safe inventory and recipe relations", () => {
    expect(schema).toMatch(/model InventoryItem[\s\S]*?@@unique\(\[organizationId, sku\]\)/);
    expect(schema).toMatch(/model LocationInventory[\s\S]*?quantityOnHand\s+Decimal[\s\S]*?@db\.Decimal\(14, 3\)/);
    expect(schema).toMatch(/model LocationInventory[\s\S]*?@@unique\(\[locationId, inventoryItemId\]\)/);
    expect(schema).toMatch(/model ProductRecipeComponent[\s\S]*?@@unique\(\[productId, inventoryItemId\]\)/);
    expect(schema).toContain("@relation(fields: [inventoryItemId, organizationId], references: [id, organizationId], onDelete: Restrict)");
    expect(schema).toContain("@relation(fields: [productId, organizationId], references: [id, organizationId], onDelete: Restrict)");
  });

  it("adds database checks for nonnegative stock, signed movements, and positive recipes", () => {
    expect(phase8Migration).toContain('CHECK ("quantityOnHand" >= 0)');
    expect(phase8Migration).toContain('CHECK ("lowStockThreshold" >= 0)');
    expect(phase8Migration).toContain('CHECK ("quantityRequired" > 0)');
    expect(phase8Migration).toContain('"inventory_movements_sign_check"');
  });

  it("keeps inventory movement history immutable at the schema and migration boundary", () => {
    const movementModel = schema.match(/model InventoryMovement\s*{[\s\S]*?\n}/)?.[0];
    expect(movementModel).toBeDefined();
    expect(movementModel).not.toContain("updatedAt");
    expect(phase8Migration).not.toMatch(/ON DELETE CASCADE/);
    expect(phase8Migration).not.toMatch(/CREATE TRIGGER|UPDATE "inventory_movements"|DELETE FROM "inventory_movements"/);
  });
});
