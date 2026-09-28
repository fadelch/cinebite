import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/customer-session.service", () => ({ validateCustomerSession: vi.fn() }));
vi.mock("@/server/repositories/menu.repository", () => ({ getMenuForLocationRecord: vi.fn() }));
vi.mock("@/server/services/stock-availability.service", () => ({ getEffectiveProductAvailability: vi.fn() }));

import { getMenuForLocationRecord } from "@/server/repositories/menu.repository";
import { getCustomerMenu } from "@/server/services/customer-menu.service";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import { getEffectiveProductAvailability } from "@/server/services/stock-availability.service";

describe("read-only customer menu", () => {
  it("derives Location from the session, keeps PostgreSQL price, and reuses Phase 8 availability", async () => {
    vi.mocked(validateCustomerSession).mockResolvedValue({
      seat: { label: "A7", hall: { name: "Hall 1", location: { id: "beirut", name: "Demo Beirut", organizationId: "org-1" } } },
      screening: { endsAt: new Date("2026-09-29T12:00:00.000Z"), movie: { title: "Interstellar" } },
    } as never);
    vi.mocked(getMenuForLocationRecord).mockResolvedValue({ location: { id: "beirut", name: "Demo Beirut" }, categories: [{ id: "cat-1", slug: "popcorn", name: "Popcorn", sortOrder: 1, products: [
      { id: "p1", slug: "large-popcorn", name: "Large Popcorn", description: "Fresh", imageUrl: null, sortOrder: 1, price: "5.00", currencyCode: "USD", isAvailable: true },
      { id: "p2", slug: "nachos", name: "Nachos", description: "Crisp", imageUrl: null, sortOrder: 2, price: "4.00", currencyCode: "USD", isAvailable: true },
    ] }] } as never);
    vi.mocked(getEffectiveProductAvailability)
      .mockResolvedValueOnce({ manualLocationAvailable: true, inventory: { state: "NOT_TRACKED", projectedUnits: null }, effectiveAvailable: true })
      .mockResolvedValueOnce({ manualLocationAvailable: true, inventory: { state: "INSUFFICIENT", projectedUnits: 0 }, effectiveAvailable: false });
    const menu = await getCustomerMenu("cookie-token");
    expect(getMenuForLocationRecord).toHaveBeenCalledWith("org-1", "beirut", true);
    expect(menu.categories[0]?.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Large Popcorn", price: "5.00", availability: "NOT_TRACKED" }),
      expect.objectContaining({ name: "Nachos", availability: "OUT_OF_STOCK" }),
    ]));
    expect(JSON.stringify(menu)).not.toContain("quantityOnHand");
  });
});
