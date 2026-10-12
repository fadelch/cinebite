import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminStorageBucket: vi.fn() }));
import {
  normalizeProductImage,
  createProductImagePath,
} from "@/server/media/product-image";
import {
  movieInputSchema,
  screeningInputSchema,
  movieListQuerySchema,
} from "@/validation/screening";
import {
  menuCategoryInputSchema,
  productCreateSchema,
} from "@/validation/menu";
import { stockMovementInputSchema } from "@/validation/inventory";
import { customerSessionStartSchema } from "@/validation/seat-qr";
import { checkoutSchema } from "@/validation/order";
import { inviteStaffSchema } from "@/validation/settings";
import { csvDocument } from "@/lib/analytics/csv";
import { redact } from "@/lib/observability/safe";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/security/opaque-token";
import { seatQrImagePath } from "@/server/media/seat-qr-image";
import { customerFinancialDto } from "@/lib/payments/customer-financial";

describe("security DTO / upload / rendering / source boundaries", () => {
  it("does not expose staff notes, refund IDs, arbitrary loaded fields or operational issues in customer financial DTO", () => {
    const summary = {
      status: "CANCELED",
      canCancel: false,
      currencyCode: "USD",
      paymentStatus: "SUCCEEDED",
      paidAmount: "10.00",
      refundedAmount: "2.00",
      processingAmount: "0.00",
      remainingRefundableAmount: "8.00",
      fullyRefunded: false,
      cancellation: {
        fromStatus: "PLACED",
        reasonCode: "OTHER",
        reasonNote: "private-note",
        initiatedByType: "STAFF",
        inventoryDisposition: "AUTO_RESTOCKED",
        createdAt: "2026-10-12",
      },
      refunds: [
        {
          id: "private-id",
          status: "SUCCEEDED",
          amount: "2.00",
          currencyCode: "USD",
          reasonCode: "OTHER",
          reasonNote: "private-note",
          retryOfId: "private-id",
          createdAt: "2026-10-12",
          succeededAt: "2026-10-12",
        },
      ],
      issues: [
        {
          id: "private-id",
          type: "OTHER",
          status: "OPEN",
          note: "private-note",
          resolution: null,
          createdAt: "2026-10-12",
          resolvedAt: null,
        },
      ],
      providerCredential: "private-material",
    };
    const dto = customerFinancialDto(summary);
    expect(JSON.stringify(dto)).not.toMatch(
      /private-note|private-id|private-material|providerCredential/,
    );
    expect(dto.remainingRefundableAmount).toBe("8.00");
    expect(dto.issues).toEqual([]);
  });
  it("rejects mass assignment across legacy and newer mutations", () => {
    for (const [schema, input] of [
      [
        menuCategoryInputSchema,
        { name: "Demo", slug: "demo", organizationId: "other" },
      ],
      [
        movieInputSchema,
        {
          title: "Demo",
          slug: "demo",
          durationMinutes: 90,
          organizationId: "other",
        },
      ],
      [
        screeningInputSchema,
        {
          locationId: "a1",
          hallId: "a1-h",
          movieId: "movie",
          startsAtLocal: "2026-10-12T10:00",
          endsAtLocal: "2026-10-12T12:00",
          organizationId: "other",
        },
      ],
      [
        productCreateSchema,
        {
          name: "Demo",
          slug: "demo",
          categoryId: "category",
          description: "Demo",
          sku: null,
          role: "SUPER_ADMIN",
        },
      ],
      [
        stockMovementInputSchema,
        { type: "RECEIVE", quantity: "1", organizationId: "other" },
      ],
      [
        customerSessionStartSchema,
        { credential: createOpaqueToken(), seatId: "a8" },
      ],
      [
        checkoutSchema,
        {
          idempotencyKey: crypto.randomUUID(),
          customerNote: "",
          price: "0.01",
          total: "0.01",
        },
      ],
      [
        inviteStaffSchema,
        {
          email: "demo@example.test",
          displayName: "Demo",
          role: "SUPER_ADMIN",
          allLocations: true,
          locationIds: [],
        },
      ],
    ] as const)
      expect(schema.safeParse(input).success).toBe(false);
  });
  it("rejects enormous pagination and unsafe numeric values", () => {
    expect(movieListQuerySchema.safeParse({ pageSize: 10000000 }).success).toBe(
      false,
    );
    expect(movieListQuerySchema.safeParse({ page: 10000000 }).success).toBe(
      false,
    );
    for (const quantity of [
      "NaN",
      "Infinity",
      "-1",
      "1000000000000000000000000",
    ])
      expect(
        stockMovementInputSchema.safeParse({ type: "RECEIVE", quantity })
          .success,
      ).toBe(false);
  });
  it("escapes HTML-like stored text and protects CSV spreadsheet formulas", () => {
    const output = renderToStaticMarkup(
      createElement(
        "p",
        null,
        '<img src=x onerror="window.fixtureXss=true"><script>fixture</script>',
      ),
    );
    expect(output).not.toContain("<img");
    expect(output).not.toContain("<script");
    expect(output).toContain("&lt;");
    const csv = csvDocument(["Name"], [["=2+2"], ["+2"], ["-2"], ["@SUM(1)"]]);
    for (const prefix of ["=", "+", "-", "@"])
      expect(csv).toContain("'" + prefix);
  });
  it("rejects fake/SVG/oversized/extreme-dimension images; ignores traversal filename", async () => {
    for (const body of ["<svg></svg>", "<script>test</script>", "not png"])
      await expect(
        normalizeProductImage(
          new File([body], "fake.png", { type: "image/png" }),
        ),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      normalizeProductImage({ size: 6 * 1024 * 1024 } as File),
    ).rejects.toMatchObject({ status: 400 });
    const extreme = await sharp({
      create: { width: 10001, height: 1, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(
      normalizeProductImage(new File([extreme], "image.png")),
    ).rejects.toMatchObject({ status: 400 });
    const valid = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    expect(
      (
        await sharp(
          await normalizeProductImage(new File([valid], "../../elsewhere.svg")),
        ).metadata()
      ).format,
    ).toBe("webp");
    expect(createProductImagePath("org-a", "product")).not.toContain("..");
  });
  it("uses high entropy hashes and unique concurrent QR storage paths", () => {
    const tokens = Array.from({ length: 100 }, createOpaqueToken);
    expect(new Set(tokens).size).toBe(100);
    expect(tokens.every((t) => t.length === 43)).toBe(true);
    expect(hashOpaqueToken(tokens[0])).toMatch(/^[a-f0-9]{64}$/);
    const input = {
      organizationId: "org",
      locationId: "loc",
      hallId: "hall",
      seatId: "a7",
      version: 2,
    };
    expect(seatQrImagePath(input)).not.toBe(seatQrImagePath(input));
  });
  it("redacts secret categories, prevents newline log forging and prototype mutation", () => {
    const raw = "private-test-value";
    const output = redact({
      Authorization: raw,
      Cookie: raw,
      "Set-Cookie": raw,
      firebaseToken: raw,
      customerSessionToken: raw,
      qrCredential: raw,
      paymentSecret: raw,
      privateKey: raw,
      databaseUrl: raw,
      directUrl: raw,
      password: raw,
      resetLink: raw,
      card: raw,
      cvv: raw,
      operation: "http\nforged",
      eventId: "test\nforged",
      details: JSON.parse('{"__proto__":{"polluted":true}}'),
    });
    expect(JSON.stringify(output)).not.toContain(raw);
    expect(JSON.stringify(output)).not.toContain("forged");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("checks every application API is wrapped and unsafe raw SQL / HTML / code execution is absent", () => {
    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      );
    }
    const files = walk("src").filter(
      (f) =>
        /\.tsx?$/.test(f) &&
        !f.includes("generated") &&
        !f.endsWith(".test.ts"),
    );
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(|\$queryRawUnsafe/,
      );
      // Two existing literal statement timeouts were converted to safe tagged SQL.
      expect(source, file).not.toContain("$executeRawUnsafe");
      if (
        file.replaceAll("\\", "/").includes("/app/api/") &&
        file.endsWith("route.ts")
      )
        expect(source, file).toContain("observedRoute");
    }
  });
});
