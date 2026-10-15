import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { localEnvironment } from "../../scripts/operations/ci-environment.mjs";
import { assertNonProductionToolEnvironment, assertSafeFixtureTarget } from "@/lib/operations/environment";
import { prisma } from "@/lib/db/prisma";
import { getAdminAuth } from "@/lib/firebase/admin";
import { operationFixtures } from "../operations/fixtures";
import { transitionKitchenOrderRecord } from "@/server/repositories/kitchen.repository";
import { requireKitchenActor } from "@/server/services/kitchen-access";
import type { AuthenticatedUser } from "@/types/auth";

assertNonProductionToolEnvironment();
assert.ok(process.argv.includes("--local"));
Object.assign(process.env, localEnvironment("cinebite_phase24_test"));
process.env.DATABASE_URL = process.env.DATABASE_URL!.replace(":55414/", ":55424/");
process.env.DIRECT_URL = process.env.DATABASE_URL;
const origin = "http://127.0.0.1:3124";
process.env.CINEBITE_ALLOWED_ORIGINS = origin;
assertSafeFixtureTarget();
let browser: Browser | undefined, server: ChildProcess | undefined;
let current = "local prerequisites";
const checks: string[] = [], browserErrors: string[] = [];
async function main() {
  let occupied = false;
  try { await fetch(origin, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
  assert.equal(occupied, false, "Refusing an occupied test port.");
  const fixture = await operationFixtures();
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3124"], { env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  server.stdout?.resume(); server.stderr?.resume();
  let ready = false;
  for (let i = 0; i < 60; i++) {
    assert.equal(server.exitCode, null);
    try { if ((await fetch(origin + "/api/health", { signal: AbortSignal.timeout(1000) })).status === 200) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  async function identity(role: "CINEMA_ADMIN" | "DELIVERY_STAFF") {
    const context = await browser!.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const uid = `delivery-ui-${randomUUID()}`, email = `${uid}@example.test`;
    await getAdminAuth().createUser({ uid, email, displayName: "Synthetic delivery test" });
    const user = await prisma.user.create({ data: { firebaseUid: uid, email, displayName: "Synthetic delivery test", memberships: { create: { organizationId: fixture.organization.id, role, allLocations: true } } } });
    const token = await getAdminAuth().createCustomToken(uid, { role, organizationId: fixture.organization.id, authorizationVersion: 0 });
    const login = await fetch("http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) });
    const identity = await login.json(); assert.ok(identity.idToken);
    const session = await context.request.post(origin + "/api/auth/session", { headers: { Origin: origin }, data: { idToken: identity.idToken } });
    assert.equal(session.status(), 200);
    const actor: AuthenticatedUser = { uid, email, displayName: user.displayName, organizationId: fixture.organization.id, role, active: true, allLocations: true, locationIds: [], authorizationVersion: 0 };
    return { context, actor, user };
  }
  const admin = await identity("CINEMA_ADMIN"), worker = await identity("DELIVERY_STAFF"), other = await identity("DELIVERY_STAFF");
  for (const [expectedStatus, toStatus] of [["PLACED", "ACCEPTED"], ["ACCEPTED", "PREPARING"], ["PREPARING", "READY"]] as const)
    await transitionKitchenOrderRecord({ actor: requireKitchenActor(admin.actor), publicCode: fixture.order.publicOrderCode, expectedStatus, toStatus });
  const financial = async () => JSON.stringify({ payment: await prisma.payment.findUnique({ where: { id: fixture.payment.id } }), refund: await prisma.refund.findUnique({ where: { id: fixture.refund.id } }), stock: await prisma.locationInventory.findUnique({ where: { id: fixture.stock.id } }) });
  const before = await financial();
  const page = await worker.context.newPage();
  page.on("pageerror", error => browserErrors.push(error.name));
  await page.goto(origin + "/delivery");
  const card = () => page.locator('[draggable="true"]').filter({ has: page.locator(`article[data-order-code="${fixture.order.publicOrderCode}"]`) });
  current = "a delivery cannot skip claiming";
  await card().dragTo(page.getByRole("region", { name: "Recently delivered", exact: true }));
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).status, "READY"); checks.push(current);
  current = "desktop drag claims through the real authorized API";
  const claimed = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/" + fixture.order.publicOrderCode));
  await card().dragTo(page.getByRole("region", { name: "My deliveries", exact: true }));
  assert.equal((await claimed).status(), 200);
  await page.getByRole("button", { name: "Mark delivered", exact: true }).waitFor();
  const claimedOrder = await prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
  assert.equal(claimedOrder.status, "OUT_FOR_DELIVERY"); assert.equal(claimedOrder.deliveryAssignedUserId, worker.user.id); checks.push(current);
  async function post(context: BrowserContext, data: object) {
    return context.request.post(origin + "/api/delivery/orders/" + fixture.order.publicOrderCode, { headers: { Origin: origin, Cookie: (await context.cookies()).map(c => `${c.name}=${c.value}`).join("; ") }, data });
  }
  current = "other worker and supervisor cannot complete the assigned delivery";
  assert.equal((await post(other.context, { expectedStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" })).status(), 403);
  assert.equal((await post(admin.context, { expectedStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" })).status(), 403);
  const supervisor = await admin.context.newPage(); await supervisor.goto(origin + "/delivery");
  assert.equal(await supervisor.locator('[draggable="true"]').count(), 0); checks.push(current);
  current = "desktop drag completes exactly once and retains financial records";
  const delivered = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/" + fixture.order.publicOrderCode));
  await card().dragTo(page.getByRole("region", { name: "Recently delivered", exact: true }));
  assert.equal((await delivered).status(), 200);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).status, "DELIVERED");
  assert.equal(await prisma.orderStatusEvent.count({ where: { orderId: fixture.order.id, toStatus: "DELIVERED" } }), 1);
  assert.equal((await post(worker.context, { expectedStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" })).status(), 409);
  assert.equal(await financial(), before); checks.push(current);
  current = "mobile history layout has no overflow or runtime exceptions";
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(browserErrors, []); checks.push(current);
  console.log(JSON.stringify({ status: "PASS", scope: "local production build, PostgreSQL and Firebase Auth emulator", checks }));
}
main().catch(error => { console.error(JSON.stringify({ status: "FAIL", current, errorCategory: error?.code ?? error?.name ?? "Error", checksCompleted: checks })); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.kill(); await prisma.$disconnect(); });
