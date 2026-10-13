import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_FIREBASE_PROJECT = "cinebite-staging-20261013";
const management = "https://firebase.googleapis.com";
const identity = "https://identitytoolkit.googleapis.com";
const billing = "https://cloudbilling.googleapis.com";
let currentStage = "local CLI login";

// This action is deliberately pinned to the existing staging project. No project,
// billing account, Storage bucket, user or service-account key can be created here.
export async function activateStagingAuth({ request, enable = false }) {
  const project = STAGING_FIREBASE_PROJECT;
  const report = { projectId: project, emailPasswordEnabled: false,
    billingEnabled: null, storageProvisionedByThisAction: false,
    authConfigHttpStatus: null, activationHttpStatus: null, status: "BLOCKED" };
  currentStage = "existing staging project verification";
  const projectResponse = await request("GET", `${management}/v1beta1/projects/${project}`);
  if (projectResponse.status !== 200 || projectResponse.body?.projectId !== project || projectResponse.body?.state !== "ACTIVE")
    return { ...report, reason: "Existing staging project access/identity could not be verified." };
  const billingUrl = `${billing}/v1/projects/${project}/billingInfo`;
  currentStage = "billing-off verification";
  const before = await request("GET", billingUrl);
  report.billingEnabled = before.body?.billingEnabled ?? null;
  if (before.status !== 200 || report.billingEnabled !== false)
    return { ...report, reason: "Billing-off precondition not verified; no activation attempted." };
  const configUrl = `${identity}/admin/v2/projects/${project}/config`;
  currentStage = "Auth configuration read";
  let config = await request("GET", configUrl);
  if (enable && (config.status === 404 || (config.status === 200 && !config.body?.signIn?.email?.enabled))) {
    currentStage = "existing web app verification";
    const apps = await request("GET", `${management}/v1beta1/projects/${project}/webApps`);
    const app = apps.body?.apps?.find(a => a.displayName === "CineBite Staging Web" && a.state === "ACTIVE");
    if (apps.status !== 200 || !app?.appId)
      return { ...report, reason: "Existing staging web app not verified; no activation attempted." };
    // Matches official Firebase CLI auth deployment: ordinary email/password only,
    // using an EXISTING app/project. No Identity Platform initializeAuth upgrade.
    currentStage = "standard email/password activation";
    const activation = await request("POST", `${management}/v1alpha/firebase:provisionFirebaseApp`, {
      parent: `projects/${project}`, appNamespace: app.appId, webInput: {},
      firebaseAuthInput: { emailAuthProviderMode: "PROVIDER_ENABLED" },
    });
    report.activationHttpStatus = activation.status;
    if (activation.status >= 200 && activation.status < 300 && activation.body?.name) {
      const operationName = activation.body.name;
      if (!/^operations\/[A-Za-z0-9_/-]+$/.test(operationName))
        throw new Error("Unexpected operation identity; refusing to follow it.");
      for (let i = 0; i < 45; i++) {
        const operation = await request("GET", `${management}/v1beta1/${operationName}`);
        if (operation.status !== 200 || operation.body?.error || operation.body?.done) break;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    config = await request("GET", configUrl);
  }
  report.authConfigHttpStatus = config.status;
  const after = await request("GET", billingUrl);
  report.billingEnabled = after.body?.billingEnabled ?? null;
  if (after.status !== 200 || report.billingEnabled !== false)
    return { ...report, reason: "Billing-off postcondition not verified; stop and inspect the staging console." };
  report.emailPasswordEnabled = config.status === 200 && config.body?.signIn?.email?.enabled === true && config.body?.signIn?.email?.passwordRequired === true;
  return { ...report, status: report.emailPasswordEnabled ? "PASS" : "BLOCKED",
    reason: report.emailPasswordEnabled ? "Provider configuration verified; real sign-in still requires a staging test identity."
      : "Standard Email/Password is not verified. Use the staging Firebase console; do not accept a billing or Identity Platform upgrade." };
}

async function main() {
  if ([process.env.CINEBITE_ENVIRONMENT, process.env.VERCEL_ENV, process.env.OBSERVABILITY_ENVIRONMENT].includes("production"))
    throw new Error("Refusing production-marked invocation.");
  if (!process.argv.includes("--check") && !process.argv.includes("--enable-email-password"))
    throw new Error("Choose --check (read only) or --enable-email-password (staging only).");
  // Existing CLI login only. Never accept credentials in argv or load .env.local.
  const cliRoot = process.env.CINEBITE_FIREBASE_CLI_LIB;
  if (!cliRoot) throw new Error("Set CINEBITE_FIREBASE_CLI_LIB to your installed firebase-tools/lib directory.");
  const require = createRequire(import.meta.url);
  const auth = require(resolve(cliRoot, "auth.js"));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI login is required.");
  currentStage = "CLI access token refresh";
  const token = await auth.getAccessToken(account.tokens.refresh_token, [
    "https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase",
  ]);
  const request = async (method, url, body) => {
    if (![management, identity, billing].includes(new URL(url).origin))
      throw new Error("Unexpected API origin.");
    const response = await fetch(url, { method, redirect: "error",
      headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const result = await activateStagingAuth({ request, enable: process.argv.includes("--enable-email-password") });
  // Fixed public identities, statuses and booleans only. No provider error bodies,
  // tokens, account addresses, API keys or operation payloads are logged.
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "PASS" ? 0 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => { console.error(`Staging Auth verification stopped at ${currentStage}. Check local CLI login/access; provider details and secrets suppressed.`); process.exitCode = 1; });
