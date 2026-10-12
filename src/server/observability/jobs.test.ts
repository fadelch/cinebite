import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { jobRun: { create: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("./incident", () => ({
  recordIncident: vi.fn().mockResolvedValue(undefined),
}));
import { prisma } from "@/lib/db/prisma";
import { runObservedJob } from "./jobs";
import { currentObservation } from "@/lib/observability/context";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.jobRun.create).mockResolvedValue({} as never);
  vi.mocked(prisma.jobRun.updateMany).mockResolvedValue({ count: 1 });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("durable job telemetry", () => {
  it("records running to success, job correlation and counts", async () => {
    const result = await runObservedJob(
      "NOTIFICATIONS",
      async () => ({
        processed: 2,
        failed: 0,
        job: currentObservation().jobRunId,
      }),
      (r) => r,
    );
    expect(result.job).toMatch(/^JOB-/);
    expect(prisma.jobRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobType: "NOTIFICATIONS" }),
      }),
    );
    expect(prisma.jobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          processedCount: 2,
          failedCount: 0,
        }),
      }),
    );
  });
  it("records partial recovery failures honestly", async () => {
    await runObservedJob(
      "PAYMENT_RECOVERY",
      async () => ({ processed: 1, failed: 2 }),
      (r) => r,
    );
    expect(prisma.jobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PARTIAL", failedCount: 2 }),
      }),
    );
  });
  it("records failure without storing raw error then rethrows", async () => {
    await expect(
      runObservedJob(
        "NOTIFICATIONS",
        async () => {
          throw new Error("PRIVATE payload");
        },
        () => ({ processed: 0, failed: 0 }),
      ),
    ).rejects.toThrow("PRIVATE");
    expect(
      JSON.stringify(vi.mocked(prisma.jobRun.updateMany).mock.calls),
    ).not.toContain("PRIVATE");
    expect(prisma.jobRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          safeErrorCode: "UNKNOWN_INTERNAL_ERROR",
        }),
      }),
    );
  });
  it("telemetry persistence failure never reverses successful business outcome", async () => {
    vi.mocked(prisma.jobRun.create).mockRejectedValue(new Error("DB down"));
    vi.mocked(prisma.jobRun.updateMany).mockRejectedValue(new Error("DB down"));
    await expect(
      runObservedJob(
        "NOTIFICATIONS",
        async () => ({ processed: 1, failed: 0 }),
        (r) => r,
      ),
    ).resolves.toEqual({ processed: 1, failed: 0 });
  });
});
