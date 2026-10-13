import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/operations/environment", () => ({ validateEnvironment: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("keeps the full release SHA while satisfying Vercel's deployment ID limit", async () => {
  const release = "0123456789abcdef0123456789abcdef01234567";
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("OBSERVABILITY_RELEASE", release);
  const { default: config } = await import("../../next.config");
  expect(config.env?.CINEBITE_BUILD_RELEASE).toBe(release);
  expect(config.deploymentId).toBe(release.slice(0, 32));
  expect(config.deploymentId).toHaveLength(32);
});

it("does not reflect malformed release values into public build metadata", async () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("OBSERVABILITY_RELEASE", "not-a-commit");
  const { default: config } = await import("../../next.config");
  expect(config.env?.CINEBITE_BUILD_RELEASE).toBe("local-unversioned");
  expect(config.deploymentId).toBe("local-unversioned");
});

it("leaves hosted deployment IDs to Vercel so same-SHA redeployments remain unique", async () => {
  const release = "0123456789abcdef0123456789abcdef01234567";
  vi.stubEnv("OBSERVABILITY_RELEASE", release);
  vi.stubEnv("VERCEL", "1");
  const { default: config } = await import("../../next.config");
  expect(config).not.toHaveProperty("deploymentId");
  expect(config.env?.CINEBITE_BUILD_RELEASE).toBe(release);
});
