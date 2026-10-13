/** Server/CLI policy. Never import this module into a client component. */
import { createHash, createPrivateKey } from "node:crypto";
export type Environment = "development" | "test" | "staging" | "production";
type Variables = Record<string, string | undefined>;
export type Resource = {
  databaseHost: string;
  databaseName: string;
  firebaseProjectId: string;
  storageBucket: string;
  origin: string;
  vercelProjectId?: string;
  authDomain?: string;
  firebaseAppId?: string;
  firebaseApiKeyHash?: string;
};
export type Registry = Partial<Record<Environment, Resource>>;
const environments = ["development", "test", "staging", "production"] as const;
const loopback = ["localhost", "127.0.0.1", "[::1]"];
function refuse(): never {
  // Deliberately omit input values, hosts and credentials from errors.
  throw Object.assign(
    new Error("Environment resource isolation validation failed."),
    {
      code: "CONFIGURATION_UNAVAILABLE",
    },
  );
}
export function databaseIdentity(raw: string | undefined) {
  try {
    const u = new URL(raw ?? "");
    if (!["postgres:", "postgresql:"].includes(u.protocol)) return refuse();
    const host = u.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
    const name = decodeURIComponent(u.pathname.slice(1));
    if (!host || !name || name.includes("/")) return refuse();
    return {
      host,
      name,
      port: u.port || "5432",
      local: loopback.includes(host),
    };
  } catch {
    return refuse();
  }
}
export function assertNonProductionToolEnvironment(
  env: Variables = process.env,
) {
  if (
    [
      env.CINEBITE_ENVIRONMENT,
      env.VERCEL_ENV,
      env.OBSERVABILITY_ENVIRONMENT,
    ].includes("production")
  )
    refuse();
}
export function validateEnvironment(env: Variables = process.env): {
  environment: Environment;
  resource: Resource;
} {
  const environment = env.CINEBITE_ENVIRONMENT as Environment;
  if (!environments.includes(environment)) return refuse();
  let registry: Registry;
  try {
    registry = JSON.parse(env.CINEBITE_RESOURCE_REGISTRY ?? "");
  } catch {
    return refuse();
  }
  const resource = registry?.[environment];
  if (
    !resource ||
    Object.values(resource).some((v) => typeof v !== "string" || !v.trim())
  )
    return refuse();
  if (
    !resource.databaseHost ||
    !resource.databaseName ||
    !resource.firebaseProjectId ||
    !resource.storageBucket ||
    !resource.origin
  )
    return refuse();
  const runtime = databaseIdentity(env.DATABASE_URL),
    direct = databaseIdentity(env.DIRECT_URL);
  if (
    runtime.host !== direct.host ||
    runtime.name !== direct.name ||
    runtime.port !== direct.port
  )
    return refuse();
  if (
    runtime.host !== resource.databaseHost ||
    runtime.name !== resource.databaseName
  )
    return refuse();
  if (
    env.FIREBASE_ADMIN_PROJECT_ID !== resource.firebaseProjectId ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== resource.firebaseProjectId
  )
    return refuse();
  if (
    (env.FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) !==
      resource.storageBucket ||
    env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET !== resource.storageBucket
  )
    return refuse();
  if (
    !env.FIREBASE_ADMIN_CLIENT_EMAIL?.endsWith(
      `@${resource.firebaseProjectId}.iam.gserviceaccount.com`,
    )
  )
    return refuse();
  if (
    env.CINEBITE_APP_ORIGIN !== resource.origin ||
    env.OBSERVABILITY_ENVIRONMENT !== environment
  )
    return refuse();
  let origin: URL;
  try {
    origin = new URL(resource.origin);
  } catch {
    return refuse();
  }
  if (origin.origin !== resource.origin || origin.username || origin.password)
    return refuse();
  const hosted = environment === "staging" || environment === "production";
  if (hosted) {
    if (
      runtime.local ||
      origin.protocol !== "https:" ||
      loopback.includes(origin.hostname)
    )
      return refuse();
    try {
      const key = createPrivateKey(
        env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "",
      );
      if (key.type !== "private" || key.asymmetricKeyType !== "rsa")
        return refuse();
    } catch {
      return refuse();
    }
    if (
      env.CINEBITE_ALLOWED_ORIGINS?.trim() &&
      env.CINEBITE_ALLOWED_ORIGINS.split(",").some(
        (value) => value.trim() !== resource.origin,
      )
    )
      return refuse();
    const stage = registry.staging,
      production = registry.production;
    // Staging can precede a production deployment, but must protect the existing
    // development resources explicitly. Never invent production identities.
    if (
      !stage ||
      (!production &&
        !(
          environment === "staging" &&
          env.CINEBITE_PRODUCTION_CONFIGURED === "false" &&
          registry.development
        ))
    )
      return refuse();
    const protectedResources = [registry.development, production].filter(
      (r): r is Resource => Boolean(r),
    );
    for (const protectedResource of protectedResources) {
      if (
        stage.databaseHost === protectedResource.databaseHost &&
        stage.databaseName === protectedResource.databaseName
      )
        return refuse();
      for (const field of [
        "firebaseProjectId",
        "storageBucket",
        "origin",
      ] as const)
        if (
          !stage[field] ||
          !protectedResource[field] ||
          stage[field] === protectedResource[field]
        )
          return refuse();
      if (
        stage.vercelProjectId &&
        stage.vercelProjectId === protectedResource.vercelProjectId
      )
        return refuse();
    }
    if (
      !resource.authDomain ||
      resource.authDomain !== env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
      !resource.firebaseAppId ||
      resource.firebaseAppId !== env.NEXT_PUBLIC_FIREBASE_APP_ID
    )
      return refuse();
    if (
      !resource.firebaseApiKeyHash ||
      !/^[a-f0-9]{64}$/.test(resource.firebaseApiKeyHash) ||
      createHash("sha256")
        .update(env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "")
        .digest("hex") !== resource.firebaseApiKeyHash
    )
      return refuse();
    if (
      env.FIREBASE_AUTH_EMULATOR_HOST ||
      env.FIREBASE_STORAGE_EMULATOR_HOST ||
      env.STORAGE_EMULATOR_HOST
    )
      return refuse();
    if ((env.SECURITY_RATE_LIMIT_SECRET?.length ?? 0) < 32) return refuse();
    if (
      env.VERCEL === "1" &&
      (!resource.vercelProjectId ||
        env.VERCEL_PROJECT_ID !== resource.vercelProjectId)
    )
      return refuse();
    const release = env.OBSERVABILITY_RELEASE || env.VERCEL_GIT_COMMIT_SHA;
    if (!release || !/^[a-f0-9]{40}$/.test(release)) return refuse();
    if (env.VERCEL_GIT_COMMIT_SHA && env.VERCEL_GIT_COMMIT_SHA !== release)
      return refuse();
    if (env.CINEBITE_BUILD_RELEASE && env.CINEBITE_BUILD_RELEASE !== release)
      return refuse();
  } else if (environment === "test") {
    if (
      !runtime.local ||
      !/^cinebite_phase\d+_(test|baseline|recovery)$/.test(runtime.name) ||
      !resource.firebaseProjectId.startsWith("demo-")
    )
      return refuse();
    for (const key of [
      "FIREBASE_AUTH_EMULATOR_HOST",
      "FIREBASE_STORAGE_EMULATOR_HOST",
    ])
      if (!env[key] || !loopback.includes(env[key]!.split(":")[0]))
        return refuse();
  }
  // No live payment or external-message adapter is installed. Fail closed.
  if (
    env.PAYMENT_PROVIDER &&
    !["disabled", "sandbox"].includes(env.PAYMENT_PROVIDER)
  )
    return refuse();
  if (
    environment !== "production" &&
    env.PAYMENT_PROVIDER === "sandbox" &&
    env.PAYMENT_SANDBOX_ENABLED !== "true"
  )
    return refuse();
  if (
    hosted &&
    env.PAYMENT_PROVIDER === "sandbox" &&
    (env.PAYMENT_PROVIDER_WEBHOOK_SECRET?.length ?? 0) < 32
  )
    return refuse();
  if (
    environment === "production" &&
    (env.PAYMENT_PROVIDER !== "disabled" ||
      env.PAYMENT_SANDBOX_ENABLED === "true")
  )
    return refuse();
  const scheduler = env.CINEBITE_SCHEDULER || "disabled";
  if (!["disabled", "external", "vercel"].includes(scheduler)) return refuse();
  if (scheduler !== "disabled") {
    const keys = [
      "PAYMENT_EXPIRY_JOB_SECRET",
      "NOTIFICATION_JOB_SECRET",
      "OBSERVABILITY_JOB_SECRET",
      ...(scheduler === "vercel" ? ["CRON_SECRET"] : []),
    ];
    const values = keys.map((key) => env[key]);
    if (
      values.some((v) => !v || v.length < 32) ||
      new Set(values).size !== values.length
    )
      return refuse();
  }
  return { environment, resource };
}
export function assertSafeFixtureTarget(env: Variables = process.env) {
  assertNonProductionToolEnvironment(env);
  const result = validateEnvironment(env);
  // Hosted staging data creation requires a separately reviewed operator procedure.
  if (result.environment !== "test" && result.environment !== "development")
    return refuse();
  if (
    !databaseIdentity(env.DATABASE_URL).local ||
    !result.resource.firebaseProjectId.startsWith("demo-")
  )
    return refuse();
  return result;
}
