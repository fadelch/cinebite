import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/repositories/tenant-structure.repository", () => ({}));
vi.mock("@/server/repositories/organizations.repository", () => ({}));

import {
  createTenantStructureService,
  type TenantStructureDependencies,
} from "@/server/services/tenant-structure.service";
import { ServiceError } from "@/server/services/service-error";
import type { AuthenticatedUser } from "@/types/auth";

const timestamp = {
  seconds: 1,
  nanoseconds: 0,
  toDate: () => new Date(1_000),
};

const organization = {
  id: "org-1",
  name: "Empire Cinemas",
  slug: "empire-cinemas",
  status: "ACTIVE" as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const locations = [
  {
    id: "location-1",
    organizationId: "org-1",
    name: "Downtown",
    slug: "downtown",
    status: "ACTIVE" as const,
    address: { line1: "Cinema Street" },
    city: "Beirut",
    country: "LB",
    timezone: "Asia/Beirut",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "location-2",
    organizationId: "org-1",
    name: "North Mall",
    slug: "north-mall",
    status: "ACTIVE" as const,
    address: { line1: "North Street" },
    city: "Dbayeh",
    country: "LB",
    timezone: "Asia/Beirut",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const hall = {
  id: "hall-1",
  organizationId: "org-1",
  locationId: "location-1",
  name: "Grand Hall",
  number: 1,
  status: "ACTIVE" as const,
  seatCount: 20,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const cinemaAdmin: AuthenticatedUser = {
  uid: "cinema-admin-1",
  email: "admin@example.com",
  displayName: "Cinema Admin",
  role: "CINEMA_ADMIN",
  organizationId: "org-1",
  locationIds: [],
  allLocations: false,
  active: true,
};

const locationManager: AuthenticatedUser = {
  ...cinemaAdmin,
  uid: "manager-1",
  email: "manager@example.com",
  displayName: "Location Manager",
  role: "LOCATION_MANAGER",
  locationIds: ["location-1"],
};

const locationInput = {
  name: "Verdun",
  slug: "verdun",
  status: "ACTIVE",
  address: { line1: "Verdun Street" },
  city: "Beirut",
  country: "LB",
  timezone: "Asia/Beirut",
};

function dependencies(): TenantStructureDependencies {
  return {
    getOrganization: vi.fn().mockResolvedValue(organization),
    listLocations: vi.fn().mockResolvedValue(locations),
    getLocation: vi.fn().mockImplementation(async (_organizationId, locationId) =>
      locations.find((location) => location.id === locationId) ?? null,
    ),
    listHalls: vi.fn().mockResolvedValue([hall]),
    getHall: vi.fn().mockResolvedValue(hall),
    listSeats: vi.fn().mockResolvedValue([]),
    allocateIds: vi.fn().mockReturnValue({ entityId: "new-id", auditLogId: "audit-1" }),
    createLocation: vi.fn().mockResolvedValue(locations[0]),
    createHall: vi.fn().mockResolvedValue(hall),
    updateHallStatus: vi.fn().mockResolvedValue({ ...hall, status: "INACTIVE" }),
    generateSeats: vi.fn().mockResolvedValue([]),
    updateSeatStatus: vi.fn().mockResolvedValue({
      id: "a1",
      organizationId: "org-1",
      locationId: "location-1",
      hallId: "hall-1",
      row: "A",
      number: 1,
      label: "A1",
      status: "DISABLED",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  };
}

describe("tenant structure service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets a CINEMA_ADMIN load only the authenticated organization dashboard", async () => {
    const data = dependencies();
    const dashboard = await createTenantStructureService(data).getDashboard(cinemaAdmin);

    expect(data.getOrganization).toHaveBeenCalledWith("org-1");
    expect(data.listLocations).toHaveBeenCalledWith("org-1", null);
    expect(dashboard).toMatchObject({ totalHalls: 2, totalSeats: 40 });
  });

  it("scopes a LOCATION_MANAGER list to assigned location IDs", async () => {
    const data = dependencies();
    await createTenantStructureService(data).listLocations(locationManager);
    expect(data.listLocations).toHaveBeenCalledWith("org-1", ["location-1"]);
  });

  it("allows all locations only when a LOCATION_MANAGER profile explicitly says so", async () => {
    const data = dependencies();
    await createTenantStructureService(data).listLocations({ ...locationManager, allLocations: true });
    expect(data.listLocations).toHaveBeenCalledWith("org-1", null);
  });

  it("blocks a LOCATION_MANAGER before reading an unassigned location", async () => {
    const data = dependencies();
    await expect(
      createTenantStructureService(data).getLocation("location-2", locationManager),
    ).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED", status: 403 });
    expect(data.getLocation).not.toHaveBeenCalled();
  });

  it("blocks LOCATION_MANAGER organization-level location creation", async () => {
    const data = dependencies();
    await expect(
      createTenantStructureService(data).createLocation(locationInput, locationManager),
    ).rejects.toMatchObject({ code: "LOCATION_CREATION_DENIED", status: 403 });
    expect(data.createLocation).not.toHaveBeenCalled();
  });

  it.each(["KITCHEN_STAFF", "DELIVERY_STAFF"] as const)("blocks %s from structure management", async (role) => {
    const data = dependencies();
    await expect(
      createTenantStructureService(data).listLocations({ ...cinemaAdmin, role }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED", status: 403 });
  });

  it("rejects a suspended organization before reading tenant locations", async () => {
    const data = dependencies();
    vi.mocked(data.getOrganization).mockResolvedValue({ ...organization, status: "SUSPENDED" });
    await expect(createTenantStructureService(data).listLocations(cinemaAdmin)).rejects.toMatchObject({
      code: "ORGANIZATION_NOT_ACTIVE",
      status: 403,
    });
    expect(data.listLocations).not.toHaveBeenCalled();
  });

  it("derives location organization scope from auth and allocates an audit ID", async () => {
    const data = dependencies();
    await createTenantStructureService(data).createLocation(locationInput, cinemaAdmin);
    expect(data.createLocation).toHaveBeenCalledWith(expect.objectContaining({
      actorUid: "cinema-admin-1",
      organizationId: "org-1",
      locationId: "new-id",
      auditLogId: "audit-1",
    }));
  });

  it("rejects a browser-supplied foreign organization ID", async () => {
    const data = dependencies();
    await expect(
      createTenantStructureService(data).createLocation(
        { ...locationInput, organizationId: "org-attacker" },
        cinemaAdmin,
      ),
    ).rejects.toBeTruthy();
    expect(data.createLocation).not.toHaveBeenCalled();
  });

  it("creates halls only through an authorized parent location", async () => {
    const data = dependencies();
    await createTenantStructureService(data).createHall(
      "location-1",
      { name: "Grand Hall", number: 1, status: "ACTIVE" },
      locationManager,
    );
    expect(data.createHall).toHaveBeenCalledWith(expect.objectContaining({
      actorUid: "manager-1",
      organizationId: "org-1",
      locationId: "location-1",
      hallId: "new-id",
      auditLogId: "audit-1",
    }));
  });

  it("rejects hall access through another organization's path without querying it", async () => {
    const data = dependencies();
    await expect(
      createTenantStructureService(data).getHall("foreign-location", "hall-1", locationManager),
    ).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
    expect(data.getHall).not.toHaveBeenCalled();
  });

  it("generates canonical labels on the server and submits one atomic repository intent", async () => {
    const data = dependencies();
    await createTenantStructureService(data).generateSeats(
      "location-1",
      "hall-1",
      { startingRow: "A", numberOfRows: 2, seatsPerRow: 3, startingSeatNumber: 1 },
      locationManager,
    );
    expect(data.generateSeats).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      locationId: "location-1",
      hallId: "hall-1",
      auditLogId: "audit-1",
      seats: [
        { row: "A", number: 1, label: "A1" },
        { row: "A", number: 2, label: "A2" },
        { row: "A", number: 3, label: "A3" },
        { row: "B", number: 1, label: "B1" },
        { row: "B", number: 2, label: "B2" },
        { row: "B", number: 3, label: "B3" },
      ],
    }));
  });

  it("propagates duplicate-seat protection without retrying or overwriting", async () => {
    const data = dependencies();
    vi.mocked(data.generateSeats).mockRejectedValue(
      new ServiceError("DUPLICATE_SEAT", 409, "A seat with label A1 already exists."),
    );
    await expect(
      createTenantStructureService(data).generateSeats(
        "location-1",
        "hall-1",
        { startingRow: "A", numberOfRows: 1, seatsPerRow: 1, startingSeatNumber: 1 },
        cinemaAdmin,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_SEAT", status: 409 });
    expect(data.generateSeats).toHaveBeenCalledTimes(1);
  });

  it.each(["DISABLED", "ACTIVE"] as const)("authorizes and audits a seat status intent for %s", async (status) => {
    const data = dependencies();
    await createTenantStructureService(data).setSeatStatus(
      "location-1",
      "hall-1",
      "a1",
      { status },
      locationManager,
    );
    expect(data.updateSeatStatus).toHaveBeenCalledWith(expect.objectContaining({
      actorUid: "manager-1",
      organizationId: "org-1",
      locationId: "location-1",
      hallId: "hall-1",
      seatId: "a1",
      auditLogId: "audit-1",
      status,
    }));
  });

  it("denies seat status changes outside a manager's assigned location", async () => {
    const data = dependencies();
    await expect(
      createTenantStructureService(data).setSeatStatus(
        "location-2",
        "hall-1",
        "a1",
        { status: "DISABLED" },
        locationManager,
      ),
    ).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
    expect(data.updateSeatStatus).not.toHaveBeenCalled();
  });
});
