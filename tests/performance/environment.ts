import { generateKeyPairSync, randomUUID } from "node:crypto";
if (!process.argv.includes("--local"))
  throw new Error("Performance writes require --local. Never load .env.local.");
export const stage = process.argv.includes("--baseline")
  ? "baseline"
  : "optimized";
export const database =
  stage === "baseline" ? "cinebite_phase21_baseline" : "cinebite_phase21_test";
process.env.DATABASE_URL = `postgresql://cinebite_test@127.0.0.1:55414/${database}`;
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9144";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9198";
process.env.STORAGE_EMULATOR_HOST = "http://127.0.0.1:9198";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-cinebite-phase21";
process.env.GCLOUD_PROJECT = "demo-cinebite-phase21";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL =
  "test@demo-cinebite-phase21.iam.gserviceaccount.com";
process.env.FIREBASE_STORAGE_BUCKET = "demo-cinebite-phase21.appspot.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;
for (const key of [
  "PAYMENT_PROVIDER_WEBHOOK_SECRET",
  "PAYMENT_EXPIRY_JOB_SECRET",
  "NOTIFICATION_JOB_SECRET",
  "OBSERVABILITY_JOB_SECRET",
  "SECURITY_RATE_LIMIT_SECRET",
])
  process.env[key] = randomUUID() + randomUUID();
process.env.PAYMENT_PROVIDER = "sandbox";
process.env.PAYMENT_SANDBOX_ENABLED = "true";
process.env.OBSERVABILITY_ENVIRONMENT = "test";
process.env.OBSERVABILITY_RELEASE = "phase-21-isolated-performance";
process.env.SECURITY_TRUST_PROXY = "true";
process.env.SECURITY_CLIENT_IP_HEADER = "x-real-ip";
process.env.CINEBITE_APP_ORIGIN = "https://demo.cinebite.example.test";
export const base = "http://127.0.0.1:3121";
process.env.CINEBITE_ALLOWED_ORIGINS = base;
export const evidenceRun = randomUUID().slice(0, 8);
export const secrets = new Set(
  Object.entries(process.env)
    .filter(([key]) => /PRIVATE_KEY|SECRET/.test(key))
    .map(([, v]) => v!),
);
