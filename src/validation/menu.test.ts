import { describe, expect, it } from "vitest";

import {
  currencyCodeSchema,
  menuCategoryInputSchema,
  priceSchema,
  productCreateSchema,
} from "@/validation/menu";

describe("Phase 7 menu validation", () => {
  it("normalizes Decimal-safe price strings without Number conversion", () => {
    expect(priceSchema.parse("5")).toBe("5.00");
    expect(priceSchema.parse("5.5")).toBe("5.50");
    expect(priceSchema.parse("04.00")).toBe("4.00");
    expect(priceSchema.parse("000.5")).toBe("0.50");
    expect(priceSchema.parse("999999.99")).toBe("999999.99");
  });

  it.each(["-1", "1.999", "1000000.00", "NaN", "1e2"])("rejects unsafe price %s", (price) => {
    expect(priceSchema.safeParse(price).success).toBe(false);
  });

  it("normalizes ISO-style currency codes", () => {
    expect(currencyCodeSchema.parse(" usd ")).toBe("USD");
    expect(currencyCodeSchema.parse("lbp")).toBe("LBP");
  });

  it.each(["US", "USDD", "12A", "U$D"])("rejects invalid currency %s", (currency) => {
    expect(currencyCodeSchema.safeParse(currency).success).toBe(false);
  });

  it("normalizes optional SKU and nullable category description", () => {
    expect(productCreateSchema.parse({
      name: "Large Popcorn", slug: "large-popcorn", categoryId: "cat-1",
      description: "Fresh popcorn", sku: " pop-large ", locations: [],
    }).sku).toBe("POP-LARGE");
    expect(productCreateSchema.parse({
      name: "Large Popcorn", slug: "large-popcorn", categoryId: "cat-1",
      description: "Fresh popcorn", sku: " large popcorn ", locations: [],
    }).sku).toBe("LARGE-POPCORN");
    expect(menuCategoryInputSchema.parse({ name: "Popcorn", slug: "popcorn", description: "" }).description).toBeNull();
  });

  it("rejects duplicate location assignments before persistence", () => {
    const result = productCreateSchema.safeParse({
      name: "Large Popcorn", slug: "large-popcorn", categoryId: "cat-1", description: "Fresh",
      locations: [
        { locationId: "loc-1", price: "5.00", currencyCode: "USD", isAvailable: true },
        { locationId: "loc-1", price: "5.50", currencyCode: "USD", isAvailable: false },
      ],
    });
    expect(result.success).toBe(false);
  });
});
