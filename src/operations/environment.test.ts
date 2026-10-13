import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  assertNonProductionToolEnvironment,
  assertSafeFixtureTarget,
  databaseIdentity,
  validateEnvironment,
} from "@/lib/operations/environment";
import { dispatchCron } from "@/lib/operations/cron";
import { runGate, steps } from "../../scripts/operations/quality.mjs";
import { localEnvironment } from "../../scripts/operations/ci-environment.mjs";
afterEach(() => vi.unstubAllEnvs());
function fixtureDatabaseUrl(host: string, database: string) {
  // Synthetic credentials/invalid-domain fixtures; these URLs are never dialed.
  const url = new URL("postgresql://localhost");
  url.hostname = host;
  url.username = "synthetic";
  url.password = "synthetic";
  url.pathname = "/" + database;
  return url.toString();
}
function hosted() {
  const env: Record<string, string | undefined> = {
    ...localEnvironment(),
    CINEBITE_ENVIRONMENT: "staging",
    OBSERVABILITY_ENVIRONMENT: "staging",
    VERCEL: "1",
    VERCEL_PROJECT_ID: "prj_staging_fixture",
    CINEBITE_BUILD_RELEASE: undefined,
  };
  const registry = {
    staging: {
      databaseHost: "ep-staging.neon.invalid",
      databaseName: "staging",
      firebaseProjectId: "fixture-staging",
      storageBucket: "fixture-staging.appspot.com",
      origin: "https://staging.example.invalid",
      vercelProjectId: "prj_staging_fixture",
      authDomain: "fixture-staging.firebaseapp.com",
      firebaseAppId: "fixture-app",
      firebaseApiKeyHash: createHash("sha256").update("demo-key").digest("hex"),
    },
    production: {
      databaseHost: "ep-production.neon.invalid",
      databaseName: "production",
      firebaseProjectId: "fixture-production",
      storageBucket: "fixture-production.appspot.com",
      origin: "https://production.example.invalid",
      vercelProjectId: "prj_production_fixture",
      authDomain: "fixture-production.firebaseapp.com",
      firebaseAppId: "production-app",
      firebaseApiKeyHash: "1".repeat(64),
    },
  };
  const r = registry.staging;
  env.CINEBITE_ALLOWED_ORIGINS = "";
  env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = r.authDomain;
  env.NEXT_PUBLIC_FIREBASE_APP_ID = r.firebaseAppId;
  Object.assign(env, {
    DATABASE_URL: fixtureDatabaseUrl(
      "ep-staging-pooler.neon.invalid",
      "staging",
    ),
    DIRECT_URL: fixtureDatabaseUrl(r.databaseHost, "staging"),
    FIREBASE_ADMIN_PROJECT_ID: r.firebaseProjectId,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: r.firebaseProjectId,
    FIREBASE_ADMIN_CLIENT_EMAIL: `fixture@${r.firebaseProjectId}.iam.gserviceaccount.com`,
    FIREBASE_STORAGE_BUCKET: r.storageBucket,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: r.storageBucket,
    CINEBITE_APP_ORIGIN: r.origin,
    FIREBASE_AUTH_EMULATOR_HOST: undefined,
    FIREBASE_STORAGE_EMULATOR_HOST: undefined,
    STORAGE_EMULATOR_HOST: undefined,
    CINEBITE_RESOURCE_REGISTRY: JSON.stringify(registry),
  });
  return { env, registry };
}
describe("pinned environment separation", () => {
  it("accepts isolated loopback fixtures", () =>
    expect(validateEnvironment(localEnvironment()).environment).toBe("test"));
  it("accepts separately pinned hosted staging", () =>
    expect(validateEnvironment(hosted().env).environment).toBe("staging"));
  it("permits first staging only with explicitly absent production and protected development", () => {
    const { env, registry } = hosted();
    env.CINEBITE_RESOURCE_REGISTRY = JSON.stringify({
      staging: registry.staging,
      development: registry.production,
    });
    expect(() => validateEnvironment(env)).toThrow();
    env.CINEBITE_PRODUCTION_CONFIGURED = "false";
    expect(validateEnvironment(env).environment).toBe("staging");
    env.CINEBITE_ENVIRONMENT = "production";
    expect(() => validateEnvironment(env)).toThrow();
  });
  it("canonicalizes Neon pooler host, not arbitrary URL contents", () =>
    expect(
      databaseIdentity(fixtureDatabaseUrl("ep-a-pooler.neon.invalid", "db"))
        .host,
    ).toBe("ep-a.neon.invalid"));
  for (const [key, value] of Object.entries({
    CINEBITE_ENVIRONMENT: "unknown",
    DATABASE_URL: fixtureDatabaseUrl(
      "ep-production.neon.invalid",
      "production",
    ),
    DIRECT_URL: fixtureDatabaseUrl("ep-production.neon.invalid", "production"),
    FIREBASE_ADMIN_PROJECT_ID: "fixture-production",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fixture-production",
    FIREBASE_STORAGE_BUCKET: "fixture-production.appspot.com",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "fixture-production.appspot.com",
    FIREBASE_ADMIN_CLIENT_EMAIL:
      "fixture@fixture-production.iam.gserviceaccount.com",
    CINEBITE_APP_ORIGIN: "https://production.example.invalid",
    OBSERVABILITY_ENVIRONMENT: "production",
    VERCEL_PROJECT_ID: "prj_production_fixture",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9144",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9198",
    SECURITY_RATE_LIMIT_SECRET: "short",
    CINEBITE_BUILD_RELEASE: "different",
    OBSERVABILITY_RELEASE: "unversioned",
    CINEBITE_RESOURCE_REGISTRY: "{}",
    PAYMENT_PROVIDER: "live",
    CINEBITE_SCHEDULER: "unknown",
    CRON_SECRET: "short",
  }))
    it(`rejects ${key} drift without disclosing values`, () => {
      const { env } = hosted();
      env[key] = value;
      expect(() => validateEnvironment(env)).toThrow(
        "Environment resource isolation validation failed.",
      );
    });
  for (const field of [
    "firebaseProjectId",
    "storageBucket",
    "origin",
    "vercelProjectId",
    "databaseHost",
  ] as const)
    it(`rejects shared ${field}`, () => {
      const { env, registry } = hosted();
      registry.production[field] = registry.staging[field];
      if (field === "databaseHost")
        registry.production.databaseName = registry.staging.databaseName;
      env.CINEBITE_RESOURCE_REGISTRY = JSON.stringify(registry);
      expect(() => validateEnvironment(env)).toThrow();
    });
  it("production refuses sandbox launch and accepts disabled payments", () => {
    const { env, registry } = hosted();
    const r = registry.staging;
    registry.production = r;
    registry.staging = {
      ...r,
      databaseHost: "other.invalid",
      firebaseProjectId: "other",
      storageBucket: "other",
      origin: "https://other.invalid",
      vercelProjectId: "other",
    };
    env.CINEBITE_ENVIRONMENT = env.OBSERVABILITY_ENVIRONMENT = "production";
    env.CINEBITE_RESOURCE_REGISTRY = JSON.stringify(registry);
    expect(() => validateEnvironment(env)).toThrow();
    env.PAYMENT_PROVIDER = "disabled";
    env.PAYMENT_SANDBOX_ENABLED = "false";
    expect(validateEnvironment(env).environment).toBe("production");
  });
  it("fixtures refuse hosted staging", () =>
    expect(() => assertSafeFixtureTarget(hosted().env)).toThrow());
  for (const key of [
    "CINEBITE_ENVIRONMENT",
    "VERCEL_ENV",
    "OBSERVABILITY_ENVIRONMENT",
  ])
    it(`test/reset/load entrypoints refuse inherited ${key}=production`, () =>
      expect(() =>
        assertNonProductionToolEnvironment({ [key]: "production" }),
      ).toThrow());
  it("rejects nonlocal fixture targets and non-demo Firebase IDs", () => {
    const env = localEnvironment();
    env.DATABASE_URL = env.DIRECT_URL = fixtureDatabaseUrl(
      "external.invalid",
      "cinebite_phase22_test",
    );
    expect(() => assertSafeFixtureTarget(env)).toThrow();
  });
});
describe("gate and native cron adapter", () => {
  for (const failing of steps)
    it(`${failing.name} failure stops later steps`, () => {
      const invoked: string[] = [];
      const result = runGate(steps, (step: { name: string }) => {
        invoked.push(step.name);
        return step.name === failing.name ? 1 : 0;
      });
      expect(result.status).toBe(1);
      expect(invoked.at(-1)).toBe(failing.name);
    });
  function configure() {
    for (const [key, value] of Object.entries(localEnvironment()))
      vi.stubEnv(key, value);
  }
  it("unauthenticated cron never executes", async () => {
    configure();
    const execute = vi.fn();
    expect(
      (
        await dispatchCron(
          new Request("http://untrusted.invalid"),
          "monitor",
          execute,
        )
      ).status,
    ).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
  it("authorized cron constructs a fixed internal POST without forwarding headers", async () => {
    configure();
    const execute = vi.fn(async (r: Request) => {
      expect(r.method).toBe("POST");
      expect(new URL(r.url).pathname).toBe("/api/operations/monitor");
      expect(r.headers.get("x-evil")).toBeNull();
      return new Response(null, { status: 200 });
    });
    const r = await dispatchCron(
      new Request("https://evil.invalid", {
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          "x-evil": "yes",
        },
      }),
      "monitor",
      execute,
    );
    expect(r.status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
  });
  it("external scheduling disables native cron", async () => {
    configure();
    vi.stubEnv("CINEBITE_SCHEDULER", "external");
    const execute = vi.fn();
    expect(
      (
        await dispatchCron(
          new Request("http://fixture.invalid", {
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          }),
          "monitor",
          execute,
        )
      ).status,
    ).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
});
