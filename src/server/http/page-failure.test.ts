import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { optionalSessionData } from "./page-failure";
import { ServiceError } from "@/server/services/service-error";
describe("customer dependency failure presentation", () => {
  it("retains valid data", async () => {
    await expect(
      optionalSessionData(async () => ({ valid: true })),
    ).resolves.toEqual({ valid: true });
  });
  it.each([401, 404])(
    "only treats expected %s as absent/ended",
    async (status) => {
      await expect(
        optionalSessionData(async () => {
          throw new ServiceError(
            "CUSTOMER_SESSION_INVALID",
            status,
            "Session unavailable.",
          );
        }),
      ).resolves.toBeNull();
    },
  );
  it("never converts DB outage into session expiry", async () => {
    await expect(
      optionalSessionData(async () => {
        throw { code: "P1001", message: "PRIVATE connection" };
      }),
    ).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE", status: 503 });
  });
  it("scrubs unknown rendering exception", async () => {
    await expect(
      optionalSessionData(async () => {
        throw new Error("PRIVATE query");
      }),
    ).rejects.toMatchObject({
      code: "PAGE_UNAVAILABLE",
      message: "Current information is temporarily unavailable.",
    });
  });
  it("preserves real authorization denial", async () => {
    await expect(
      optionalSessionData(async () => {
        throw new ServiceError("AUTHORIZATION_DENIED", 403, "Denied.");
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
