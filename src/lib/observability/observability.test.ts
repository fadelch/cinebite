import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { redact, safePath } from "./safe";
import { log, logRecord, observedOperation } from "./logger";
import {
  newRequestId,
  newJobRunId,
  currentObservation,
  observationScope,
} from "./context";
import { normalizeError, expectedLevel } from "./errors";
import { ServiceError } from "@/server/services/service-error";
import { captureTrackedError } from "./error-tracker";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("safe observability", () => {
  it("generates independent cryptographic request/job references, never user input", () => {
    const ids = Array.from({ length: 100 }, newRequestId);
    expect(new Set(ids).size).toBe(100);
    expect(ids[0]).toMatch(/^REQ-[a-f0-9-]{36}$/);
    expect(newJobRunId()).toMatch(/^JOB-/);
  });
  it("propagates context through async calls and isolates concurrent requests", async () => {
    const result = await Promise.all(
      ["one", "two"].map((operation) =>
        observationScope({ requestId: newRequestId(), operation }, async () => {
          await Promise.resolve();
          return currentObservation();
        }),
      ),
    );
    expect(result[0].operation).toBe("one");
    expect(result[1].operation).toBe("two");
    expect(result[0].requestId).not.toBe(result[1].requestId);
    expect(currentObservation()).toEqual({});
  });
  it.each([
    "authorization",
    "cookie",
    "setCookie",
    "password",
    "token",
    "secret",
    "privateKey",
    "cardNumber",
    "cvv",
    "DATABASE_URL",
    "DIRECT_URL",
    "customerNote",
    "email",
    "phone",
    "credential",
    "payload",
    "stack",
    "message",
  ])("scrubs sensitive key %s at nested levels", (key) => {
    const output = JSON.stringify(
      redact({
        nested: { [key]: "TEST_PRIVATE_VALUE" },
        items: [{ [key]: "TEST_PRIVATE_VALUE" }],
      }),
    );
    expect(output).not.toContain("TEST_PRIVATE_VALUE");
    expect(output).toContain("[redacted]");
  });
  it("drops unknown free text/URLs and cannot spoof JSON log lines", () => {
    const output = JSON.stringify(
      logRecord("warn", "bad\nerror", {
        note: "fake\nSUCCESS",
        unknown: "password=https://private.example/?token=private",
        operation: "broken\nspoof",
        requestId: newRequestId(),
      }),
    );
    expect(output).not.toContain("SUCCESS");
    expect(output).not.toContain("private.example");
    expect(JSON.parse(output).event).toBe("telemetry.invalid_event");
  });
  it("bounds deep/circular objects and arrays", () => {
    const value: Record<string, unknown> = {};
    value.nested = value;
    expect(() => JSON.stringify(redact(value))).not.toThrow();
    expect(redact(Array(50).fill(1))).toHaveLength(20);
  });
  it("sanitizes dynamic paths, QR credentials and every query parameter", () => {
    expect(safePath("/s/private-qr-value?password=private")).toBe("/s/[id]");
    expect(safePath("/api/customer/orders/CB-private?token=private")).toBe(
      "/api/customer/orders/[id]",
    );
  });
  it("emits valid timestamp/environment/release without allowing production debug", () => {
    vi.stubEnv("OBSERVABILITY_ENVIRONMENT", "staging");
    vi.stubEnv("OBSERVABILITY_RELEASE", "demo-release-19");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OBSERVABILITY_LOG_LEVEL", "debug");
    const record = logRecord("info", "http.completed");
    expect(record.environment).toBe("staging");
    expect(record.release).toBe("demo-release-19");
    expect(Date.parse(record.timestamp)).toBeGreaterThan(0);
    const sink = vi.spyOn(console, "info").mockImplementation(() => {});
    log("debug", "debug.event");
    expect(sink).not.toHaveBeenCalled();
  });
  it("rejects unsafe release values", () => {
    vi.stubEnv("OBSERVABILITY_RELEASE", "https://secret.example/?key=private");
    expect(logRecord("info", "http.completed").release).toBeUndefined();
  });
  it.each([
    ["P1001", 503],
    ["P2024", 503],
    ["P2002", 409],
    ["P2003", 409],
    ["P2025", 404],
    ["P2034", 409],
    ["P2021", 503],
  ])("normalizes Prisma %s to safe status %s", (code, status) => {
    const failure = normalizeError({
      code,
        message: "SQL postgresql://private:private@127.0.0.1/phase19-test",
    });
    expect(failure.status).toBe(status);
    expect(JSON.stringify(failure)).not.toContain("private");
  });
  it("classifies wrapped driver and initialization failures without message parsing", () => {
    expect(
      normalizeError({
        code: "P2010",
        meta: {
          driverAdapterError: { cause: { originalCode: "ECONNREFUSED" } },
        },
      }).status,
    ).toBe(503);
    expect(normalizeError({ errorCode: "P1001" }).status).toBe(503);
  });
  it("does not treat expected conflicts as catastrophic", () => {
    expect(expectedLevel(409)).toBe("warn");
    expect(expectedLevel(401)).toBe("debug");
    expect(
      normalizeError(new ServiceError("INSUFFICIENT_STOCK", 409, "No stock."))
        .status,
    ).toBe(409);
  });
  it("never exposes unknown exception names/messages/stacks", () => {
    expect(
      normalizeError(new Error("private secret card number")),
    ).toMatchObject({ code: "UNKNOWN_INTERNAL_ERROR", status: 500 });
    expect(
      JSON.stringify(normalizeError(new Error("private secret"))),
    ).not.toContain("private");
  });
  it("retains semantic custom statuses", () => {
    for (const status of [401, 403, 404, 409, 422, 429, 500, 503])
      expect(
        normalizeError(
          new ServiceError("AUTHORIZATION_DENIED", status, "Safe message."),
        ).status,
      ).toBe(status);
  });
  it("records checkout failures without action input or raw exception", async () => {
    const sink = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      observedOperation("checkout.order_transaction", async () => {
        throw new ServiceError("CART_EMPTY", 409, "Safe message.");
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.parse(sink.mock.calls[0][0] as string)).toMatchObject({
      operation: "checkout.order_transaction",
      errorCode: "CART_EMPTY",
      statusCode: 409,
    });
  });
  it("scrubs external tracking envelope and isolates provider failure", async () => {
    const capture = vi
      .fn()
      .mockRejectedValue(new Error("private-provider-error"));
    await expect(
      captureTrackedError(
        "render.failed",
        {
          cookie: "private-cookie",
          message: "private-password",
          errorCode: "UNKNOWN_INTERNAL_ERROR",
        },
        { capture },
      ),
    ).resolves.toBeUndefined();
    expect(JSON.stringify(capture.mock.calls)).not.toContain("private-cookie");
    expect(JSON.stringify(capture.mock.calls)).not.toContain(
      "private-password",
    );
  });
});
