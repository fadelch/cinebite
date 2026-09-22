import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

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
});
