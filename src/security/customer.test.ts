import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    seatQrCode: { findFirst: vi.fn() },
    screening: { findFirst: vi.fn() },
    customerSession: { updateMany: vi.fn(), create: vi.fn() },
  };
  return { tx, prisma: { $transaction: vi.fn() } };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));
import { createCustomerSessionRecord } from "@/server/repositories/customer-session.repository";
const input = {
  qrId: "qr",
  qrHash: "a".repeat(64),
  tokenHash: "b".repeat(64),
  hallId: "hall",
  seatId: "a7",
  screeningId: "screen",
  expiresAt: new Date(Date.now() + 60000),
  now: new Date(),
};
describe("security customer establishment race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.$transaction.mockImplementation(async (fn) => fn(db.tx));
    db.tx.seatQrCode.findFirst.mockResolvedValue({ id: "qr" });
    db.tx.screening.findFirst.mockResolvedValue({ id: "screen" });
  });
  it("locks QR and rechecks exact hash, current context before revoking old session or creating a new one", async () => {
    await createCustomerSessionRecord(input);
    expect(db.tx.seatQrCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "qr",
          tokenHash: input.qrHash,
          status: "ACTIVE",
          hallId: "hall",
          seatId: "a7",
        }),
      }),
    );
    const query = db.tx.customerSession.create.mock.calls[0][0];
    expect(query.data.tokenHash).toBe(input.tokenHash);
    expect(query.data).not.toHaveProperty("rawToken");
    expect(query.data.seatId).toBe("a7");
  });
  it.each(["qr", "screening"])(
    "rejects changed/revoked/ended %s before session writes",
    async (resource) => {
      if (resource === "qr") db.tx.seatQrCode.findFirst.mockResolvedValue(null);
      else db.tx.screening.findFirst.mockResolvedValue(null);
      await expect(createCustomerSessionRecord(input)).rejects.toMatchObject({
        status: 404,
      });
      expect(db.tx.customerSession.create).not.toHaveBeenCalled();
      expect(db.tx.customerSession.updateMany).not.toHaveBeenCalled();
    },
  );
});
