import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getStorage } from "firebase-admin/storage";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import {
  assertNonProductionToolEnvironment,
  assertSafeFixtureTarget,
} from "../../src/lib/operations/environment";
import { localEnvironment } from "../../scripts/operations/ci-environment.mjs";
import { prisma } from "@/lib/db/prisma";
import {
  getAdminApp,
  getAdminAuth,
  getAdminStorageBucket,
} from "@/lib/firebase/admin";
import {
  normalizeProductImage,
  createProductImagePath,
} from "@/server/media/product-image";
import { sandboxSignature } from "@/lib/payments/provider";
import type { operationFixtures } from "./fixtures";
assertNonProductionToolEnvironment();
if (!process.argv.includes("--local"))
  throw new Error(
    "Browser drill requires --local with emulator-only resources.",
  );
Object.assign(process.env, localEnvironment());
assertSafeFixtureTarget();
const base = "http://127.0.0.1:3122";
const root = process.cwd();
const report: Record<string, unknown> = {
  scope: "local synthetic resources + Firebase emulators",
  hostedStaging: "NOT EXECUTABLE",
  productionTouched: false,
};
const children: ChildProcess[] = [];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let current = "initialization";
async function start(directory: string, env: NodeJS.ProcessEnv, label: string) {
  try {
    await fetch(base + "/api/health", { signal: AbortSignal.timeout(1000) });
    throw new Error(
      "Test port already occupied; refuse to probe another process.",
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Test port already"))
      throw error;
  }
  const log = createWriteStream(
    path.join(root, ".phase22-test", label + ".log"),
  );
  const child = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3122",
    ],
    {
      cwd: directory,
      env: { ...env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  children.push(child);
  let ownReady = false;
  child.stdout?.on("data", (chunk) => {
    if (String(chunk).includes("Ready in")) ownReady = true;
  });
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("Owned local server exited before readiness.");
    try {
      if (
        ownReady &&
        (
          await fetch(base + "/api/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).status === 200
      )
        return child;
    } catch {}
    await pause(500);
  }
  throw new Error("Owned local server did not start.");
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGTERM");
  await exited;
}
async function identity(
  context: BrowserContext,
  role: "SUPER_ADMIN" | "CINEMA_ADMIN" | "KITCHEN_STAFF" | "DELIVERY_STAFF",
  organizationId: string,
  locationId: string,
) {
  const uid = `phase22-${randomUUID()}`,
    email = `${uid}@example.test`;
  await getAdminAuth().createUser({
    uid,
    email,
    displayName: "Demo Cinema Team",
  });
  const user = await prisma.user.create({
    data: {
      firebaseUid: uid,
      email,
      displayName: "Demo Cinema Team",
      platformRole: role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER",
    },
  });
  if (role !== "SUPER_ADMIN")
    await prisma.organizationMembership.create({
      data: { userId: user.id, organizationId, role, allLocations: true },
    });
  const token = await getAdminAuth().createCustomToken(uid, {
    role,
    organizationId: role === "SUPER_ADMIN" ? null : organizationId,
    authorizationVersion: 0,
  });
  current = `emulator token exchange ${role}`;
  const response = await fetch(
    "http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true }),
    },
  );
  const identity = await response.json();
  assert.ok(identity.idToken);
  current = `session exchange ${role}`;
  const session = await context.request.post(base + "/api/auth/session", {
    headers: { Origin: base },
    data: { idToken: identity.idToken },
  });
  if (session.status() !== 200)
    console.error(`Local session returned ${session.status()}.`);
  assert.equal(session.status(), 200, "Staff session exchange failed.");
  const cookie = session.headers()["set-cookie"] ?? "";
  current = `secure-cookie attributes ${role}`;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.ok(!/Domain=/i.test(cookie));
  return { uid, locationId };
}
async function staffGet(context: BrowserContext, pathname: string) {
  // Playwright's API jar does not send Secure cookies over HTTP loopback;
  // real Chrome does. Pass them explicitly for the local API-only assertions.
  return context.request.get(base + pathname, {
    maxRedirects: 0,
    headers: {
      Cookie: (await context.cookies())
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
    },
  });
}
async function staffPost(
  context: BrowserContext,
  pathname: string,
  data: object,
) {
  return context.request.post(base + pathname, {
    data,
    headers: {
      Origin: base,
      Cookie: (await context.cookies())
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
    },
  });
}
async function main() {
  await mkdir("linkedin/phase-22", { recursive: true });
  const fixture = JSON.parse(
    await readFile(".phase22-test/fixture.json", "utf8"),
  ) as Awaited<ReturnType<typeof operationFixtures>>;
  let server = await start(root, process.env, "candidate");
  const browser = await chromium.launch({
    executablePath:
      process.env.OPS_CHROME_PATH ||
      (process.platform === "win32"
        ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
        : "/usr/bin/google-chrome"),
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const admin = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    const supervisor = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    const kitchen = await browser.newContext();
    const delivery = await browser.newContext();
    current = "staff authentication";
    for (const [context, role] of [
      [admin, "CINEMA_ADMIN"],
      [supervisor, "SUPER_ADMIN"],
      [kitchen, "KITCHEN_STAFF"],
      [delivery, "DELIVERY_STAFF"],
    ] as const)
      await identity(
        context,
        role,
        fixture.organization.id,
        fixture.location.id,
      );
    report.staffAuth = "PASS";
    report.hostOnlySecureCookies = "PASS";
    current = "release smoke";
    const cookies = await supervisor.cookies();
    const smoke = spawnSync(
      process.execPath,
      [
        path.resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/operations/smoke.ts",
      ],
      {
        env: {
          ...process.env,
          CINEBITE_SMOKE_ORIGIN: base,
          CINEBITE_SMOKE_COOKIE: cookies
            .map((c) => `${c.name}=${c.value}`)
            .join("; "),
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (smoke.status !== 0)
      console.error(
        smoke.stderr
          .split(/\r?\n/)
          .filter((line) =>
            /Deployment smoke failed|Smoke failed:|AssertionError|actual:|expected:|operator:|ERR_/.test(
              line,
            ),
          )
          .join("\n"),
      );
    assert.equal(smoke.status, 0, "Authenticated release smoke failed.");
    report.releaseSmoke = "PASS";
    current = "role authorization pages";
    for (const [context, pathname] of [
      [admin, "/admin"],
      [admin, "/admin/analytics"],
      [kitchen, "/kitchen"],
      [delivery, "/delivery"],
      [supervisor, "/super-admin/operations"],
    ] as const) {
      assert.equal(
        (await staffGet(context, pathname)).status(),
        200,
        "Role page smoke failed",
      );
    }
    const otherBefore = await prisma.location.count({
      where: { organizationId: fixture.other.id },
    });
    const denied = await staffGet(kitchen, "/api/admin/analytics");
    assert.equal(denied.status(), 403);
    current = "cron and outbox";
    assert.equal((await fetch(base + "/api/cron/monitor")).status, 401);
    for (const job of ["payments", "notifications", "monitor"]) {
      current = `authorized ${job} cron`;
      const r = await fetch(base + "/api/cron/" + job, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      if (r.status !== 200)
        console.error(`Local ${job} cron returned ${r.status}.`);
      assert.equal(r.status, 200, "Authenticated scheduled job failed.");
    }
    const notificationCount = await prisma.notification.count();
    current = "outbox deduplication";
    assert.equal(
      (
        await fetch(base + "/api/cron/notifications", {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        })
      ).status,
      200,
    );
    assert.equal(await prisma.notification.count(), notificationCount);
    assert.ok(
      notificationCount > 0,
      "No valid fixture notification was delivered.",
    );
    assert.ok((await prisma.jobRun.count()) >= 4);
    report.cronAuthentication = "PASS";
    report.jobMonitoring = "PASS";
    report.outboxDeduplication = "PASS";
    current = "storage emulator isolation";
    const bytes = await sharp({
      create: { width: 240, height: 180, channels: 3, background: "#ffc400" },
    })
      .png()
      .toBuffer();
    const normalized = await normalizeProductImage(
      new File([new Uint8Array(bytes)], "synthetic.png", { type: "image/png" }),
    );
    const storagePath = createProductImagePath(
      fixture.organization.id,
      fixture.product.id,
    );
    const file = getAdminStorageBucket().file(storagePath);
    await file.save(normalized, {
      resumable: false,
      metadata: { contentType: "image/webp" },
    });
    const [exists] = await file.exists();
    assert.equal(exists, true);
    const [controlExists] = await getStorage(getAdminApp())
      .bucket("demo-cinebite-phase22-control.appspot.com")
      .file(storagePath)
      .exists();
    assert.equal(controlExists, false);
    report.storageEmulator = "PASS";
    report.storageNamespaceControl = "PASS";
    current = "mobile QR menu and sandbox payment";
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    await mobile.route("**/*", (route) =>
      new URL(route.request().url()).origin === base
        ? route.continue()
        : route.abort(),
    );
    const page = await mobile.newPage();
    await page.goto(base + "/s/" + fixture.qr, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start ordering" }).click();
    await page.waitForURL("**/customer/menu");
    const popcorn = page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: "Large Popcorn", exact: true }),
      });
    await popcorn.getByRole("button", { name: "Add", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "linkedin/phase-22/08-mobile-smoke.png",
      fullPage: true,
      animations: "disabled",
    });
    await popcorn.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("link", { name: /View cart/ }).click();
    await page.waitForURL("**/customer/cart");
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL("**/customer/payments/*");
    await page.getByRole("button", { name: /Test success/ }).click();
    await page
      .getByRole("heading", { name: "Payment confirmed", exact: true })
      .waitFor({ timeout: 30000 });
    await page.getByRole("link", { name: "Follow your order" }).click();
    await page.waitForURL("**/customer/orders/*");
    report.mobileSandboxCheckout = "PASS";
    const code = new URL(page.url()).pathname.split("/").at(-1)!;
    const paid = await prisma.order.findUniqueOrThrow({
      where: { publicOrderCode: code },
      include: { payment: { include: { attempts: true } } },
    });
    assert.equal(paid.payment?.status, "SUCCEEDED");
    assert.equal(paid.fulfillmentEligible, true);
    current = "signed webhook duplicate";
    const event = JSON.stringify({
      eventId: randomUUID(),
      providerPaymentId: paid.payment!.providerPaymentId,
      attemptId: paid.payment!.attempts[0].id,
      status: "SUCCEEDED",
      amountMinor: "400",
      currencyCode: "USD",
    });
    const signature = sandboxSignature(event);
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await fetch(base + "/api/payments/webhook", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cinebite-sandbox-signature": signature,
            },
            body: event,
          })
        ).status,
        200,
      );
    assert.equal(
      await prisma.location.count({
        where: { organizationId: fixture.other.id },
      }),
      otherBefore,
    );
    report.signedWebhookDeduplication = "PASS";
    report.crossTenantControl = "PASS";
    current = "kitchen payment-gated transitions";
    for (const [expectedStatus, toStatus] of [
      ["PLACED", "ACCEPTED"],
      ["ACCEPTED", "PREPARING"],
      ["PREPARING", "READY"],
    ])
      assert.equal(
        (
          await staffPost(kitchen, "/api/kitchen/orders/" + code, {
            expectedStatus,
            toStatus,
          })
        ).status(),
        200,
      );
    current = "safe full-page screenshots";
    for (const [context, pathname, filename] of [
      [admin, "/admin", "01-admin-test-environment.png"],
      [supervisor, "/super-admin/operations", "02-operations-health.png"],
      [admin, "/admin/analytics", "03-analytics-smoke.png"],
      [kitchen, "/kitchen", "04-kitchen-smoke.png"],
      [delivery, "/delivery", "05-delivery-smoke.png"],
    ] as const) {
      const p = await context.newPage();
      await p.goto(base + pathname, { waitUntil: "networkidle" });
      await p.evaluate(() => document.fonts.ready);
      // User identifiers are not portfolio material, including synthetic email addresses.
      await p.locator('input[type="email"]').evaluateAll((elements) =>
        elements.forEach((e) => {
          (e as HTMLInputElement).value = "";
        }),
      );
      await p.evaluate(() => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let node: Node | null;
        while ((node = walker.nextNode()))
          if (node.textContent)
            node.textContent = node.textContent.replace(
              /phase22-[a-f0-9-]+@example\.test/g,
              "demo.staff@example.test",
            );
      });
      await p.screenshot({
        path: "linkedin/phase-22/" + filename,
        fullPage: true,
        animations: "disabled",
      });
      await p.close();
    }
    current = "delivery completion";
    for (const [expectedStatus, toStatus] of [
      ["READY", "OUT_FOR_DELIVERY"],
      ["OUT_FOR_DELIVERY", "DELIVERED"],
    ])
      assert.equal(
        (
          await staffPost(delivery, "/api/delivery/orders/" + code, {
            expectedStatus,
            toStatus,
          })
        ).status(),
        200,
      );
    assert.equal(
      (
        await prisma.order.findUniqueOrThrow({
          where: { publicOrderCode: code },
        })
      ).status,
      "DELIVERED",
    );
    report.fulfillmentTransitions = "PASS";
    current = "application rollback drill";
    await stop(server);
    const previous = path.join(root, ".phase22-test/previous");
    const revision = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: previous,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(revision.status, 0);
    server = await start(
      previous,
      { ...process.env, OBSERVABILITY_RELEASE: revision.stdout.trim() },
      "previous",
    );
    assert.equal((await staffGet(admin, "/admin")).status(), 200);
    assert.equal((await fetch(base + "/api/ready")).status, 200);
    assert.equal(
      (await staffGet(supervisor, "/api/super-admin/release")).status(),
      404,
    );
    report.rollback = {
      status: "PASS",
      previousCommit: revision.stdout.trim(),
      databaseDowngraded: false,
      kind: "local process replacement, not Vercel Instant Rollback",
    };
    await stop(server);
    server = await start(root, process.env, "redeployed");
    assert.equal(
      (await staffGet(supervisor, "/api/super-admin/release")).status(),
      200,
    );
    report.redeploy = "PASS";
    await stop(server);
    current = "database outage smoke refusal";
    const unavailableEnv = localEnvironment("cinebite_phase229999_test");
    server = await start(root, unavailableEnv, "unavailable-database");
    assert.equal((await fetch(base + "/api/ready")).status, 503);
    const failedSmoke = spawnSync(
      process.execPath,
      [
        path.resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/operations/smoke.ts",
      ],
      {
        env: { ...unavailableEnv, CINEBITE_SMOKE_ORIGIN: base },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    assert.notEqual(failedSmoke.status, 0);
    report.unavailableDatabaseBlocksSmoke = "PASS";
    report.status = "PASS";
    await writeFile(
      ".phase22-test/browser-result.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
    for (const child of children) await stop(child);
    await prisma.$disconnect();
  }
}
main().then(
  () => process.exit(0),
  (error) => {
    const code = error?.code;
    console.error(
      `Local browser operations drill failed at ${current}. ${typeof code === "string" && /^[a-zA-Z0-9_/-]{1,80}$/.test(code) ? code : "No safe error code."} Secrets and request URLs suppressed.`,
    );
    process.exit(1);
  },
);
