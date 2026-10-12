import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isRetryableTransactionError } from "./errors";
it.each(["40001", "40P01"])(
  "recognizes direct adapter COMMIT conflicts: %s",
  (code) =>
    expect(
      isRetryableTransactionError({
        name: "DriverAdapterError",
        cause: { originalCode: code },
      }),
    ).toBe(true),
);
it("does not retry an unrelated direct adapter constraint error", () =>
  expect(
    isRetryableTransactionError({
      name: "DriverAdapterError",
      cause: { originalCode: "23514" },
    }),
  ).toBe(false));
it.each([
  { code: "P2034" },
  { code: "P2010", meta: { code: "40001" } },
  { code: "P2010", meta: { code: "40P01" } },
  {
    code: "P2010",
    meta: { driverAdapterError: { cause: { originalCode: "40001" } } },
  },
])("recognizes serializable/deadlock retry states: %j", (error) =>
  expect(isRetryableTransactionError(error)).toBe(true),
);
it.each([
  null,
  {},
  { code: "P2010", meta: { code: "23514" } },
  { code: "P2002" },
  { code: "P2010" },
])("does not retry unknown database errors: %j", (error) =>
  expect(isRetryableTransactionError(error)).toBe(false),
);
