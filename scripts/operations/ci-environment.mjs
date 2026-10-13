import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Entirely synthetic overrides. Never import a developer or production env file.
export function localEnvironment(database = "cinebite_phase22_test") {
  const project = "demo-cinebite-phase22",
    bucket = `${project}.appspot.com`;
  return {
    ...process.env,
    VERCEL: "0",
    VERCEL_ENV: "",
    CINEBITE_ENVIRONMENT: "test",
    OBSERVABILITY_ENVIRONMENT: "test",
    DATABASE_URL: `postgresql://cinebite_test@127.0.0.1:55414/${database}`,
    DIRECT_URL: `postgresql://cinebite_test@127.0.0.1:55414/${database}`,
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: project,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: bucket,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:demo",
    FIREBASE_ADMIN_PROJECT_ID: project,
    FIREBASE_ADMIN_CLIENT_EMAIL: `test@${project}.iam.gserviceaccount.com`,
    FIREBASE_ADMIN_PRIVATE_KEY: generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey,
    FIREBASE_STORAGE_BUCKET: bucket,
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9144",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9198",
    STORAGE_EMULATOR_HOST: "http://127.0.0.1:9198",
    GCLOUD_PROJECT: project,
    CINEBITE_APP_ORIGIN: "https://demo.cinebite.example.test",
    CINEBITE_ALLOWED_ORIGINS: "http://127.0.0.1:3122",
    CINEBITE_RESOURCE_REGISTRY: JSON.stringify({
      test: {
        databaseHost: "127.0.0.1",
        databaseName: database,
        firebaseProjectId: project,
        storageBucket: bucket,
        origin: "https://demo.cinebite.example.test",
      },
    }),
    SECURITY_RATE_LIMIT_SECRET: "synthetic-security-secret-not-a-credential-22",
    PAYMENT_PROVIDER: "sandbox",
    PAYMENT_SANDBOX_ENABLED: "true",
    PAYMENT_PROVIDER_WEBHOOK_SECRET:
      "synthetic-payment-webhook-not-a-credential-22",
    PAYMENT_EXPIRY_JOB_SECRET: "synthetic-payment-job-not-a-credential-22",
    NOTIFICATION_JOB_SECRET: "synthetic-notification-job-not-a-credential-22",
    OBSERVABILITY_JOB_SECRET: "synthetic-monitor-job-not-a-credential-22",
    CRON_SECRET: "synthetic-cron-job-not-a-credential-22",
    CINEBITE_SCHEDULER: "vercel",
    OBSERVABILITY_RELEASE:
      process.env.GITHUB_SHA ||
      process.env.OPS_RELEASE_SHA ||
      "0000000000000000000000000000000000000022",
    SECURITY_TRUST_PROXY: "false",
    SECURITY_CLIENT_IP_HEADER: "",
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.argv[2]
) {
  if (
    [
      process.env.CINEBITE_ENVIRONMENT,
      process.env.VERCEL_ENV,
      process.env.OBSERVABILITY_ENVIRONMENT,
    ].includes("production")
  )
    throw new Error("Refusing production-marked CI/test invocation.");
  const result = spawnSync(process.execPath, process.argv.slice(2), {
    env: localEnvironment(),
    stdio: "inherit",
    windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
}
