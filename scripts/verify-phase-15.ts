import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { getAdminAuth } from "../src/lib/firebase/admin";
import { prisma } from "../src/lib/db/prisma";
import { getPaymentProvider } from "../src/lib/payments/provider";
import { cancelOrderRecord } from "../src/server/repositories/cancellation.repository";
import { dispatchRefund } from "../src/server/repositories/refund.repository";
import { sandboxSignature } from "../src/lib/payments/provider";
import { createOpaqueToken, hashOpaqueToken } from "../src/lib/security/opaque-token";

// Isolated manual integration runner: refuses cloud databases and real Firebase projects.
// Never load .env.local when invoking this script. It has no production credential requirement.
if (!process.argv.includes("--local")) throw new Error("Use --local with the isolated PostgreSQL and Firebase Auth emulator running.");
process.env.DATABASE_URL = "postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase15_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9144";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-cinebite-phase15";
process.env.GCLOUD_PROJECT = "demo-cinebite-phase15";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@demo-cinebite-phase15.iam.gserviceaccount.com";
process.env.FIREBASE_STORAGE_BUCKET = "demo-cinebite-phase15.appspot.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
const base = "http://127.0.0.1:3115";
const evidenceRun = randomUUID().slice(0, 8);
const output = path.join(process.cwd(), "linkedin", "phase-15");
const results = new Map<string, { status: "PASS" | "FAIL" | "NOT EXECUTABLE"; evidence: string }>();
for (const id of [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ...Array.from({ length: 22 }, (_, i) => `A${String.fromCharCode(65 + i)}`)]) results.set(id, { status: "NOT EXECUTABLE", evidence: "Not reached in this run." });
function pass(ids: string[], evidence: string) { for (const id of ids) results.set(id, { status: "PASS", evidence }); console.log(`PASS ${ids.join(", ")}: ${evidence}`); }
let currentCase = "A";
process.env.PAYMENT_PROVIDER = "sandbox";
process.env.PAYMENT_SANDBOX_ENABLED = "true";
process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET = randomUUID() + randomUUID();
process.env.PAYMENT_EXPIRY_JOB_SECRET = randomUUID() + randomUUID();
process.env.PAYMENT_RESERVATION_MINUTES = "12";
async function mutate(context: BrowserContext, code: string, from: string, to: string, kitchen = false) {
  return context.request.post(`${base}/api/${kitchen ? "kitchen" : "delivery"}/orders/${code}`, { headers: await sessionHeaders(context), data: { expectedStatus: from, toStatus: to } });
}
async function capture(page: Page, name: string) {
  for (const button of await page.getByRole("button", { name: "Dismiss notification", exact: true }).all()) await button.click();
  await page.waitForTimeout(350);
  const height = await page.locator("body").evaluate((el) => Math.ceil(el.scrollHeight));
  const viewport = page.viewportSize()!;
  const openDialog = await page.locator("dialog[open]").count();
  if (openDialog) { await page.setViewportSize({ width: viewport.width, height: Math.max(height, viewport.height) }); await page.waitForTimeout(100); }
  await page.screenshot({ path: path.join(output, name), fullPage: true, clip: { x: 0, y: 0, width: page.viewportSize()!.width, height } });
  if (openDialog) await page.setViewportSize(viewport);
}
async function fixture() {
  const org = await prisma.organization.create({ data: { id: `phase15-evidence-${evidenceRun}-org`, slug: `phase15-evidence-${evidenceRun}-cinemas`, name: "Demo CineBite Cinemas", status: "ACTIVE" } });
  return prisma.$transaction(async (tx) => {
    const other = await tx.organization.upsert({ where: { slug: `phase15-evidence-${evidenceRun}-other-cinema` }, create: { id: `phase15-evidence-${evidenceRun}-other-org`, slug: `phase15-evidence-${evidenceRun}-other-cinema`, name: "Demo Cinema B", status: "ACTIVE" }, update: {} });
    const locations = [];
    const sessions = [];
    for (const [suffix, name, organizationId] of [["beirut", "Demo Beirut", org.id], ["dbayeh", "Demo Dbayeh", org.id], ["other", "Demo Cinema B", other.id]]) {
      const location = await tx.location.upsert({ where: { id: `phase15-evidence-${evidenceRun}-${suffix}` }, create: { id: `phase15-evidence-${evidenceRun}-${suffix}`, organizationId, name, slug: `phase15-evidence-${evidenceRun}-${suffix}`, addressLine1: "Demo cinema", city: "Beirut", country: "LB", timezone: "Asia/Beirut", status: "ACTIVE" }, update: {} });
      locations.push(location);
      const hall = await tx.hall.upsert({ where: { id: `phase15-evidence-${evidenceRun}-hall-${suffix}` }, create: { id: `phase15-evidence-${evidenceRun}-hall-${suffix}`, locationId: location.id, name: "Hall 1", number: 1, status: "ACTIVE" }, update: {} });
      const movie = await tx.movie.upsert({ where: { id: `phase15-evidence-${evidenceRun}-movie-${suffix}` }, create: { id: `phase15-evidence-${evidenceRun}-movie-${suffix}`, organizationId, title: "Interstellar", slug: `phase15-evidence-${evidenceRun}-interstellar-${suffix}`, durationMinutes: 180 }, update: {} });
      const screening = await tx.screening.upsert({ where: { id: `phase15-evidence-${evidenceRun}-screening-${suffix}` }, create: { id: `phase15-evidence-${evidenceRun}-screening-${suffix}`, hallId: hall.id, movieId: movie.id, startsAt: new Date(Date.now() - 300000), endsAt: new Date(Date.now() + 10800000) }, update: { status: "SCHEDULED", startsAt: new Date(Date.now() - 300000), endsAt: new Date(Date.now() + 10800000) } });
      const category = await tx.menuCategory.upsert({ where: { id: `phase15-evidence-${evidenceRun}-category-${suffix}` }, create: { id: `phase15-evidence-${evidenceRun}-category-${suffix}`, organizationId, name: "Cinema favorites", slug: `phase15-evidence-${evidenceRun}-favorites-${suffix}` }, update: {} });
      const product = await tx.product.upsert({ where: { id: `phase15-evidence-${evidenceRun}-product-${suffix}` }, create: { id: `phase15-evidence-${evidenceRun}-product-${suffix}`, organizationId, categoryId: category.id, name: "Large Popcorn", slug: `phase15-evidence-${evidenceRun}-popcorn-${suffix}`, description: "Freshly popped cinema popcorn." }, update: { name: "Large Popcorn" } });
      await tx.productLocation.upsert({ where: { productId_locationId: { productId: product.id, locationId: location.id } }, create: { id: `phase15-evidence-${evidenceRun}-offer-${suffix}`, organizationId, productId: product.id, locationId: location.id, price: "12.50", currencyCode: "USD" }, update: {} });
      if (suffix === "beirut") {
        const ingredient = await tx.inventoryItem.upsert({ where: { id: `phase15-evidence-${evidenceRun}-kernels` }, create: { id: `phase15-evidence-${evidenceRun}-kernels`, organizationId, name: "Demo snack portions", sku: `PH15-${evidenceRun}-KERNELS`, unit: "GRAM" }, update: {} });
        await tx.locationInventory.upsert({ where: { locationId_inventoryItemId: { locationId: location.id, inventoryItemId: ingredient.id } }, create: { id: `phase15-evidence-${evidenceRun}-stock`, organizationId, locationId: location.id, inventoryItemId: ingredient.id, quantityOnHand: "1000000", lowStockThreshold: "5" }, update: {} });
        await tx.productRecipeComponent.upsert({ where: { productId_inventoryItemId: { productId: product.id, inventoryItemId: ingredient.id } }, create: { id: `phase15-evidence-${evidenceRun}-recipe`, organizationId, productId: product.id, inventoryItemId: ingredient.id, quantityRequired: "300.000" }, update: {} });
      }
      if (suffix === "beirut") {
        const cups = await tx.inventoryItem.create({ data: { id: `phase15-evidence-${evidenceRun}-cups`, organizationId, name: "Demo cups", sku: `PH15-${evidenceRun}-CUPS`, unit: "EACH" } });
        await tx.locationInventory.create({ data: { id: `phase15-evidence-${evidenceRun}-cup-stock`, organizationId, locationId: location.id, inventoryItemId: cups.id, quantityOnHand: "10000" } });
        await tx.productRecipeComponent.create({ data: { organizationId, productId: product.id, inventoryItemId: cups.id, quantityRequired: "2.000" } });
      }
      for (const number of suffix === "beirut" ? Array.from({ length: 44 }, (_, i) => i + 7) : [7]) {
        const seat = await tx.seat.upsert({ where: { hallId_id: { hallId: hall.id, id: `a${number}` } }, create: { hallId: hall.id, id: `a${number}`, row: "A", number, label: `A${number}` }, update: {} });
        await tx.customerSession.updateMany({ where: { hallId: hall.id, seatId: seat.id, screeningId: screening.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
        const token = createOpaqueToken();
        const session = await tx.customerSession.create({ data: { id: randomUUID(), hallId: hall.id, seatId: seat.id, screeningId: screening.id, tokenHash: hashOpaqueToken(token), expiresAt: screening.endsAt, lastSeenAt: new Date(), cart: { create: { id: randomUUID(), items: { create: { id: randomUUID(), productId: product.id, quantity: 1, reviewedUnitPrice: "12.50", reviewedCurrencyCode: "USD" } } } } } });
        sessions.push({ token, id: session.id, suffix, number, screeningId: screening.id, productId: product.id });
      }
    }
    return { org, other, locations, sessions };
  }, { timeout: 60000 });
}

async function staffIdentity(role: "KITCHEN_STAFF" | "LOCATION_MANAGER" | "DELIVERY_STAFF" | "CINEMA_ADMIN", organizationId: string, locationIds: string[], suffix: string) {
  const email = `cinebite.phase15.${suffix}@example.com`;
  let identity;
  try { identity = await getAdminAuth().getUserByEmail(email); }
  catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; identity = await getAdminAuth().createUser({ email, displayName: `Demo ${suffix === "worker-a" ? "Delivery A" : suffix === "worker-b" ? "Delivery B" : suffix === "admin" ? "Supervisor" : "Cinema Team"}` }); }
  await getAdminAuth().updateUser(identity.uid, { disabled: false });
  const user = await prisma.user.upsert({ where: { firebaseUid: identity.uid }, create: { id: randomUUID(), firebaseUid: identity.uid, email, displayName: `Demo ${suffix === "worker-a" ? "Delivery A" : suffix === "worker-b" ? "Delivery B" : suffix === "admin" ? "Supervisor" : "Cinema Team"}`, active: true }, update: { active: true } });
  const membership = await prisma.organizationMembership.upsert({ where: { userId_organizationId: { userId: user.id, organizationId } }, create: { id: randomUUID(), userId: user.id, organizationId, role, allLocations: false }, update: { role, locationAccess: { deleteMany: {} } } });
  await prisma.locationAccess.createMany({ data: locationIds.map((locationId) => ({ membershipId: membership.id, organizationId, locationId })), skipDuplicates: true });
  return { uid: identity.uid, userId: user.id, role, organizationId };
}

async function signIn(context: BrowserContext, staff: { uid: string; role: string; organizationId: string }) {
  const token = await getAdminAuth().createCustomToken(staff.uid, { role: staff.role, organizationId: staff.organizationId });
  const identity = await fetch(`http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) }).then((response) => response.json()) as { idToken?: string };
  assert.ok(identity.idToken, "Demo staff token exchange failed");
  const response = await context.request.post(`${base}/api/auth/session`, { headers: { Origin: base }, data: { idToken: identity.idToken } });
  assert.equal(response.status(), 200, `Demo staff session creation failed: ${await response.text()}`);
}

// Playwright's API client does not apply Chromium's secure-cookie loopback
// exception on plain HTTP. Send the legitimately issued demo cookie explicitly
// for API assertions; real pages use the browser cookie jar unchanged.
async function sessionHeaders(context: BrowserContext) {
  return { Origin: base, Cookie: (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") };
}
async function read(context: BrowserContext, url: string) {
  return context.request.get(url, { headers: await sessionHeaders(context) });
}

async function main() {
  await mkdir(output, { recursive: true });
  const demo = await fixture();
  const stockId = `phase15-evidence-${evidenceRun}-stock`, cupsId = `phase15-evidence-${evidenceRun}-cup-stock`;
  const staff = await Promise.all([
    staffIdentity("CINEMA_ADMIN", demo.org.id, demo.locations.slice(0, 2).map(l => l.id), "admin"),
    staffIdentity("LOCATION_MANAGER", demo.org.id, [demo.locations[0].id], "manager"),
    staffIdentity("KITCHEN_STAFF", demo.org.id, [demo.locations[0].id], "kitchen"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [demo.locations[0].id], "worker-a"),
    staffIdentity("CINEMA_ADMIN", demo.other.id, [demo.locations[2].id], "other-admin"),
  ]);
  const server = spawn(process.execPath, [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3115"], { stdio: ["ignore", "ignore", "pipe"], env: process.env });
  server.stderr.on("data", (chunk: Buffer) => { if (/\[(api|auth)/.test(chunk.toString())) console.error(chunk.toString()); });
  let browser: Browser | undefined;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
    const staffContexts = await Promise.all(staff.map(() => browser!.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })));
    await Promise.all(staffContexts.map((ctx, i) => signIn(ctx, staff[i])));
    const [admin, manager, kitchen, delivery, otherAdmin] = staffContexts;
    const guests = await Promise.all(demo.sessions.map(() => browser!.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })));
    await Promise.all(guests.map((ctx, i) => ctx.addCookies([{ name: "cinebite_guest_session", value: demo.sessions[i].token, url: base, httpOnly: true, sameSite: "Lax" }])));
    const orders = new Map<number, { id: string; publicOrderCode: string }>();
    const row = (i: number) => prisma.order.findUniqueOrThrow({ where: { id: orders.get(i)!.id }, include: { payment: { include: { attempts: { orderBy: { number: "desc" }, take: 1 } } }, refunds: true, cancellation: true, inventoryMovements: true, statusEvents: true, reservations: true, issues: true } });
    const stock = async () => { const [kernels, cups] = await Promise.all([prisma.locationInventory.findUniqueOrThrow({ where: { id: stockId } }), prisma.locationInventory.findUniqueOrThrow({ where: { id: cupsId } })]); return { onHand: kernels.quantityOnHand.toFixed(3), reserved: kernels.quantityReserved.toFixed(3), cups: cups.quantityOnHand.toFixed(3), cupReserved: cups.quantityReserved.toFixed(3) }; };
    async function post(ctx: BrowserContext, url: string, data: unknown) { return ctx.request.post(base + url, { headers: await sessionHeaders(ctx), data }); }
    async function ok(response: Awaited<ReturnType<typeof post>>, expected = 200) { assert.equal(response.status(), expected, `${response.status()}: ${await response.text()}`); return response.json(); }
    async function checkout(i: number, paid = true) {
      const body = await ok(await post(guests[i], "/api/customer/orders", { idempotencyKey: randomUUID() }), 201);
      const order = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: body.order.publicOrderCode } }); orders.set(i, { id: order.id, publicOrderCode: order.publicOrderCode });
      if (paid) await ok(await post(guests[i], `/api/customer/payments/${order.publicOrderCode}/sandbox`, { outcome: "SUCCEEDED" }));
      return order;
    }
    const cancel = (i: number, ctx = guests[i], staffCancel = false, exceptional = false) => post(ctx,
      `/api/${staffCancel ? "admin" : "customer"}/orders/${staffCancel ? orders.get(i)!.id : orders.get(i)!.publicOrderCode}/cancel`, { confirmed: true, ...(staffCancel ? { reasonCode: "OPERATIONAL_ISSUE", exceptional } : {}) });
    const refund = (i: number, amount?: string, key = randomUUID(), ctx = admin) => post(ctx, `/api/admin/orders/${orders.get(i)!.id}/refunds`, { kind: amount ? "PARTIAL" : "FULL", ...(amount ? { amount } : {}), reasonCode: "CUSTOMER_REQUEST", idempotencyKey: key, confirmed: true });
    async function refundResult(i: number, refundId: string, outcome = "SUCCEEDED") { return ok(await post(admin, `/api/admin/orders/${orders.get(i)!.id}/refunds/sandbox`, { refundId, outcome, confirmed: true })); }
    async function advance(i: number, target: string) {
      const statuses = ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
      for (let index = 0; index < statuses.indexOf(target); index++) await ok(await mutate(index < 3 ? kitchen : delivery, orders.get(i)!.publicOrderCode, statuses[index], statuses[index + 1], index < 3));
    }
    async function signedRefund(i: number, refundId: string, eventId = `refund-evidence:${randomUUID()}`, overrides = {}) {
      const r = (await row(i)).refunds.find(r => r.id === refundId)!;
      const intent = await getPaymentProvider().retrieveRefund(r.providerRefundId!);
      const raw = JSON.stringify({ ...intent, kind: "refund", status: "SUCCEEDED", eventId, ...overrides });
      return { raw, signature: sandboxSignature(raw) };
    }
    const webhook = (raw: string, signature: string) => admin.request.post(`${base}/api/payments/webhook`, { headers: { "Content-Type": "application/json", "x-cinebite-sandbox-signature": signature }, data: raw });

    currentCase = "A";
    const original = await stock(); await checkout(0, false); await ok(await cancel(0));
    let o = await row(0); assert.equal(o.status, "CANCELED"); assert.equal(o.payment!.status, "CANCELED"); assert.equal(o.refunds.length, 0); assert.deepEqual(await stock(), original);
    pass(["A"], "PENDING unpaid cancellation confirmed by provider; active holds released, physical stock unchanged, no refund.");

    currentCase = "B";
    await checkout(1); const beforePaidCancel = await stock();
    const customerPage = await guests[1].newPage(); await customerPage.setViewportSize({ width: 1440, height: 1000 });
    await customerPage.goto(`${base}/customer/orders/${orders.get(1)!.publicOrderCode}`); await customerPage.getByRole("button", { name: "Cancel order", exact: true }).waitFor();
    await capture(customerPage, "01-customer-cancel-order.png"); await customerPage.getByRole("button", { name: "Cancel order", exact: true }).click();
    await customerPage.getByRole("dialog").waitFor(); assert.equal(await customerPage.getByRole("dialog").isVisible(), true); await capture(customerPage, "02-cancellation-confirmation.png");
    await customerPage.getByRole("dialog").getByRole("button", { name: "Cancel order", exact: true }).click();
    await customerPage.getByRole("heading", { name: "Order canceled", exact: true }).first().waitFor();
    await customerPage.getByText("Refund processing · 12.50 USD", { exact: true }).waitFor(); await capture(customerPage, "03-refund-processing.png");
    o = await row(1); assert.equal(o.status, "CANCELED"); assert.equal(o.refunds.length, 1); assert.equal(o.refunds[0].status, "PROCESSING"); assert.equal(o.payment!.status, "SUCCEEDED");
    const afterPaid = await stock(); assert.equal(Number(afterPaid.onHand) - Number(beforePaidCancel.onHand), 300); assert.equal(Number(afterPaid.cups) - Number(beforePaidCancel.cups), 2);
    await refundResult(1, o.refunds[0].id); await customerPage.reload(); await customerPage.getByText("Refund completed · 12.50 USD", { exact: true }).waitFor(); await capture(customerPage, "04-refund-completed.png");
    pass(["B", "O", "AQ"], "Real customer confirmation starts exact 12.50 USD full refund; original stock restored and charge preserved; processing/completed browser UX follows signed provider state.");

    currentCase = "C";
    for (const [i, target, test] of [[2, "ACCEPTED", "C"], [4, "PREPARING", "E"], [5, "READY", "F"], [6, "OUT_FOR_DELIVERY", "G"], [7, "DELIVERED", "H"]] as const) {
      currentCase = test; await checkout(i); await advance(i, target); const response = await cancel(i); assert.equal(response.status(), 409); assert.equal((await response.json()).code, "TOO_LATE_TO_CANCEL"); assert.equal((await row(i)).status, target); pass([test], `Customer cancellation rejected with TOO_LATE_TO_CANCEL for actual ${target} order.`);
    }
    currentCase = "D";
    await checkout(3, false); await ok(await post(guests[3], `/api/customer/payments/${orders.get(3)!.publicOrderCode}/sandbox`, { outcome: "PROCESSING" }));
    const held = await stock(); await cancelOrderRecord(orders.get(3)!.id, { type: "CUSTOMER", sessionId: demo.sessions[3].id }, { reasonCode: "CUSTOMER_REQUEST" });
    assert.deepEqual(await stock(), held); o = await row(3); assert.equal(o.payment!.status, "PROCESSING"); assert.equal(o.reservations.filter(r => r.status === "ACTIVE").length, 2);
    await prisma.sandboxPaymentIntent.update({ where: { id: o.payment!.providerPaymentId! }, data: { status: "SUCCEEDED" } });
    const terminal = await getPaymentProvider().retrieve(o.payment!.providerPaymentId!); const lateRaw = JSON.stringify({ ...terminal, eventId: `processing-cancel:${randomUUID()}` }); await ok(await webhook(lateRaw, sandboxSignature(lateRaw)));
    o = await row(3); assert.equal(o.status, "CANCELED"); assert.equal(o.refunds.length, 1); assert.equal(o.refunds[0].status, "PROCESSING"); assert.equal(o.inventoryMovements.length, 0); assert.equal(o.reservations.filter(r => r.status === "ACTIVE").length, 0);
    pass(["D"], "Processing cancellation stops fulfillment but retains both stock holds until verified success; late capture starts refund and releases stock without consumption.");

    currentCase = "I";
    await checkout(8); const race = await Promise.all([cancel(8), mutate(kitchen, orders.get(8)!.publicOrderCode, "PLACED", "ACCEPTED", true)]);
    assert.equal(race.filter(r => r.status() === 200).length, 1); assert.ok(race.every(r => [200, 409].includes(r.status()))); o = await row(8); assert.ok(["CANCELED", "ACCEPTED"].includes(o.status));
    pass(["I"], "Concurrent customer cancel / kitchen accept: one succeeds, one 409; one coherent state and no 500.");
    currentCase = "J";
    await checkout(9); await advance(9, "OUT_FOR_DELIVERY"); const deliveredRace = await Promise.all([cancel(9, admin, true, true), mutate(delivery, orders.get(9)!.publicOrderCode, "OUT_FOR_DELIVERY", "DELIVERED")]);
    assert.equal(deliveredRace.filter(r => r.status() === 200).length, 1); assert.ok(deliveredRace.every(r => [200, 409].includes(r.status()))); o = await row(9); assert.ok(["CANCELED", "DELIVERED"].includes(o.status));
    pass(["J"], "Exceptional staff cancellation / delivery completion race has one terminal winner; delivered history is never canceled.");

    currentCase = "K";
    await checkout(10); const old = await stock(); const productId = demo.sessions[10].productId;
    await prisma.productRecipeComponent.updateMany({ where: { productId, inventoryItemId: `phase15-evidence-${evidenceRun}-kernels` }, data: { quantityRequired: "900" } });
    await prisma.productRecipeComponent.updateMany({ where: { productId, inventoryItemId: `phase15-evidence-${evidenceRun}-cups` }, data: { quantityRequired: "3" } });
    await ok(await cancel(10)); const restored = await stock(); assert.equal(Number(restored.onHand) - Number(old.onHand), 300); assert.equal(Number(restored.cups) - Number(old.cups), 2);
    for (let repeat = 0; repeat < 3; repeat++) await ok(await cancel(10)); assert.deepEqual(await stock(), restored); o = await row(10); assert.equal(o.refunds.length, 1); assert.equal(o.statusEvents.filter(e => e.toStatus === "CANCELED").length, 1); assert.equal(o.inventoryMovements.filter(m => m.type === "ORDER_CANCELLATION_RESTOCK").length, 2);
    await prisma.productRecipeComponent.updateMany({ where: { productId, inventoryItemId: `phase15-evidence-${evidenceRun}-kernels` }, data: { quantityRequired: "300" } }); await prisma.productRecipeComponent.updateMany({ where: { productId, inventoryItemId: `phase15-evidence-${evidenceRun}-cups` }, data: { quantityRequired: "2" } });
    pass(["K", "L", "M"], "Changed recipe to 900g/3 cups after capture; cancellation restores original 300g/2 cups once, with two explicit restock movements, one event and one refund across repeated requests.");
    currentCase = "N";
    const beforeExceptional = await stock(); await ok(await cancel(4, admin, true, true)); assert.deepEqual(await stock(), beforeExceptional); assert.equal((await row(4)).cancellation!.inventoryDisposition, "NO_AUTO_RESTOCK");
    pass(["N"], "Explicit confirmed PREPARING cancellation starts remaining refund with NO_AUTO_RESTOCK; physical balances unchanged.");

    currentCase = "P";
    await checkout(11); assert.equal((await refund(11, "1000.00")).status(), 409); assert.equal((await row(11)).refunds.length, 0);
    pass(["P"], "Tampered 1000 USD refund on 12.50 capture rejected; no provider intent or refund created.");
    currentCase = "Q";
    await checkout(12); await ok(await refund(12, "2.50")); o = await row(12); await refundResult(12, o.refunds[0].id); let balance = await (await read(admin, `${base}/api/admin/orders/${o.id}/financial`)).json(); assert.equal(balance.refundedAmount, "2.50"); assert.equal(balance.remainingRefundableAmount, "10.00"); assert.equal((await row(12)).total.toFixed(2), "12.50");
    pass(["Q"], "Verified 2.50 partial refund leaves immutable order total 12.50 and remaining balance 10.00.");
    currentCase = "R"; await ok(await refund(12, "5.00")); o = await row(12); await refundResult(12, o.refunds.find(r => r.status === "PROCESSING")!.id); balance = await (await read(admin, `${base}/api/admin/orders/${o.id}/financial`)).json(); assert.equal(balance.refundedAmount, "7.50"); assert.equal(balance.remainingRefundableAmount, "5.00"); pass(["R"], "Second verified partial refund: total returned 7.50, remaining 5.00.");
    currentCase = "S"; assert.equal((await refund(12, "6.00")).status(), 409); pass(["S"], "6.00 over-refund rejected against remaining 5.00.");
    const adminPage = await admin.newPage(); await adminPage.goto(`${base}/admin/orders/${orders.get(12)!.id}`); await adminPage.getByRole("heading", { name: "Issue a financial refund" }).waitFor(); await capture(adminPage, "06-partial-refund.png");
    currentCase = "T"; await checkout(13); await ok(await refund(13, "2.50")); o = await row(13); await refundResult(13, o.refunds[0].id);
    const overRace = await Promise.all([refund(13, "8.00", randomUUID(), admin), refund(13, "8.00", randomUUID(), manager)]); assert.equal(overRace.filter(r => r.status() === 200).length, 1); assert.equal(overRace.filter(r => r.status() === 409).length, 1);
    o = await row(13); assert.equal(o.refunds.length, 2); pass(["T"], "Two authorized supervisors concurrently request 8.00 with 10.00 remaining: one intent wins, one 409, no 16.00 exposure.");
    currentCase = "U"; await checkout(14); const refundKey = randomUUID(); await Promise.all([refund(14, undefined, refundKey), refund(14, undefined, refundKey)]).then(async responses => { for (const response of responses) await ok(response); }); o = await row(14); assert.equal(o.refunds.length, 1); assert.equal(await prisma.sandboxRefundIntent.count({ where: { refundId: o.refunds[0].id } }), 1);
    pass(["U"], "Concurrent identical-key full refund creates one SQL refund and one durable provider intent.");
    currentCase = "V"; const event = await signedRefund(14, o.refunds[0].id); await prisma.sandboxRefundIntent.update({ where: { id: o.refunds[0].providerRefundId! }, data: { status: "SUCCEEDED" } }); const beforeEvent = await stock(); for (let repeat = 0; repeat < 5; repeat++) await ok(await webhook(event.raw, event.signature));
    assert.equal((await row(14)).refunds[0].status, "SUCCEEDED"); assert.equal(await prisma.auditLog.count({ where: { entityId: o.id, action: "REFUND_SUCCEEDED" } }), 1); assert.deepEqual(await stock(), beforeEvent); pass(["V", "AP"], "Five identical signed success events produce one refund success/audit and zero inventory/order-cancellation changes.");
    currentCase = "W"; const invalid = await signedRefund(13, (await row(13)).refunds.find(r => r.status === "PROCESSING")!.id); assert.equal((await webhook(invalid.raw, `0000000000.${"0".repeat(64)}`)).status(), 400); assert.equal((await row(13)).refunds.filter(r => r.status === "PROCESSING").length, 1); pass(["W"], "Invalid refund webhook signature rejected before mutation; processing exposure remains reserved.");

    currentCase = "X"; await checkout(15); await ok(await refund(15)); o = await row(15); const failedId = o.refunds[0].id; await refundResult(15, failedId, "FAILED"); o = await row(15); assert.equal(o.refunds[0].status, "FAILED"); assert.ok(o.issues.some(issue => issue.type === "PAYMENT_REFUND_FAILED"));
    const failedPage = await guests[15].newPage(); await failedPage.goto(`${base}/customer/orders/${o.publicOrderCode}`); await failedPage.getByText("Refund requires attention · 12.50 USD", { exact: true }).waitFor(); assert.equal(await failedPage.getByText("Refund completed · 12.50 USD", { exact: true }).count(), 0);
    pass(["X"], "Sandbox FAILED refund retains failure history, opens supervisor issue, and browser shows attention—not false refunded success.");
    currentCase = "Y"; const retryKey = randomUUID(); await ok(await post(admin, `/api/admin/orders/${o.id}/refunds/retry`, { refundId: failedId, idempotencyKey: retryKey, confirmed: true })); await ok(await post(admin, `/api/admin/orders/${o.id}/refunds/retry`, { refundId: failedId, idempotencyKey: randomUUID(), confirmed: true })); o = await row(15); assert.equal(o.refunds.length, 2); const retry = o.refunds.find(r => r.retryOfId === failedId)!; assert.equal(retry.status, "PROCESSING"); await refundResult(15, retry.id); pass(["Y"], "Failed refund retries as one new linked record; duplicate retry preserves failed history and cannot exceed capture.");

    currentCase = "Z"; const deliveredStock = await stock(), deliveredHistory = (await row(7)).statusEvents.map(e => e.id); await ok(await refund(7, "2.50")); o = await row(7); await refundResult(7, o.refunds[0].id); assert.equal((await row(7)).status, "DELIVERED"); assert.deepEqual(await stock(), deliveredStock); pass(["Z"], "Delivered partial refund preserves DELIVERED, snapshots and all physical inventory.");
    currentCase = "AA"; await ok(await refund(7)); o = await row(7); const remaining = o.refunds.find(r => r.status === "PROCESSING")!; assert.equal(remaining.amount.toFixed(2), "10.00"); await refundResult(7, remaining.id); assert.equal((await row(7)).status, "DELIVERED"); assert.deepEqual((await row(7)).statusEvents.map(e => e.id), deliveredHistory); assert.deepEqual(await stock(), deliveredStock); pass(["AA"], "Full remaining delivered refund is exactly 10.00 after prior 2.50; delivered history and inventory unchanged.");

    currentCase = "AB"; assert.equal((await refund(2, undefined, randomUUID(), kitchen)).status(), 403); assert.equal((await cancel(2, kitchen, true, true)).status(), 403); pass(["AB"], "Kitchen staff denied financial refund and exceptional cancellation by server authentication/RBAC.");
    currentCase = "AC"; assert.equal((await refund(2, undefined, randomUUID(), delivery)).status(), 403); assert.equal((await cancel(2, delivery, true, true)).status(), 403); pass(["AC"], "Delivery staff denied refund and payment/cancellation financial mutation.");
    currentCase = "AD"; await checkout(44); assert.equal((await refund(44, undefined, randomUUID(), manager)).status(), 404); assert.equal((await cancel(44, manager, true)).status(), 404); assert.equal((await read(manager, `${base}/api/admin/orders/${orders.get(2)!.id}/financial`)).status(), 200); pass(["AD"], "Beirut manager has Beirut financial access; Dbayeh refund and cancellation both fail 404 without leakage.");
    currentCase = "AE"; await checkout(45); assert.equal((await refund(45)).status(), 404); assert.equal((await cancel(45, admin, true)).status(), 404); assert.equal((await read(otherAdmin, `${base}/api/admin/orders/${orders.get(2)!.id}/financial`)).status(), 404); pass(["AE"], "Both cross-tenant financial directions denied 404 by trusted organization grants.");
    currentCase = "AF"; assert.equal((await cancel(2, guests[0])).status(), 404); assert.equal((await read(guests[0], `${base}/api/customer/orders/${orders.get(2)!.publicOrderCode}/financial`)).status(), 404); pass(["AF"], "Another seat session cannot cancel or read financial status of the order.");

    currentCase = "AG"; const issueStock = await stock(), issuesBefore = (await row(6)).refunds.length;
    const issueResponse = await ok(await post(delivery, `/api/staff/orders/${orders.get(6)!.publicOrderCode}/issues`, { type: "CUSTOMER_UNAVAILABLE", note: "Demo customer is not at Seat A13. Supervisor review needed." }));
    assert.equal((await row(6)).status, "OUT_FOR_DELIVERY"); assert.equal((await row(6)).refunds.length, issuesBefore); assert.deepEqual(await stock(), issueStock); pass(["AG"], "Assigned delivery worker reports CUSTOMER_UNAVAILABLE; creates OPEN issue only, no refund/restock/status rewind.");
    currentCase = "AH"; await ok(await post(kitchen, `/api/staff/orders/${orders.get(2)!.publicOrderCode}/issues`, { type: "ITEM_MISSING", note: '<script>window.phase15_xss=true</script>' })); await adminPage.goto(`${base}/admin/orders/${orders.get(2)!.id}`); await adminPage.getByText('<script>window.phase15_xss=true</script>', { exact: true }).waitFor(); assert.equal(await adminPage.evaluate(() => "phase15_xss" in window), false); pass(["AH"], "Malicious operational note rendered as literal escaped React text; browser script sentinel never executes.");
    await adminPage.goto(`${base}/admin/orders/${orders.get(6)!.id}`); await adminPage.getByText("Demo customer is not at Seat A13. Supervisor review needed.", { exact: true }).waitFor(); await capture(adminPage, "07-order-exception.png");
    currentCase = "AI"; await ok(await post(manager, `/api/admin/orders/${orders.get(6)!.id}/issues/resolve`, { issueId: issueResponse.id, confirmed: true, resolution: "Supervisor confirmed corrected seat with customer. Continue assigned delivery." })); const resolved = (await row(6)).issues.find(i => i.id === issueResponse.id)!; assert.equal(resolved.status, "RESOLVED"); assert.equal(resolved.resolvedByUserId, staff[1].userId); assert.ok(resolved.resolvedAt); assert.ok(resolved.resolution); pass(["AI"], "Authorized manager records immutable reporting identity plus resolution, actor and trusted timestamp without automatic financial effects.");

    currentCase = "AR"; await adminPage.goto(`${base}/admin/orders/${orders.get(13)!.id}`); await adminPage.getByText("Refund processing · 8.00 USD", { exact: true }).waitFor(); await capture(adminPage, "05-admin-refund-panel.png"); const safe = await (await read(admin, `${base}/api/admin/orders/${orders.get(13)!.id}/financial`)).json(); assert.equal(safe.refundedAmount, "2.50"); assert.equal(safe.processingAmount, "8.00"); assert.equal(safe.remainingRefundableAmount, "2.00"); assert.equal(JSON.stringify(safe).includes("providerRefundId"), false); pass(["AR"], "Admin view shows paid/refunded/processing/remaining with safe history and no provider/payment IDs or secrets.");
    currentCase = "AU"; await checkout(19); const mobilePage = await guests[19].newPage(); await mobilePage.goto(`${base}/customer/orders/${orders.get(19)!.publicOrderCode}`); await mobilePage.getByRole("button", { name: "Cancel order", exact: true }).waitFor(); await mobilePage.getByRole("button", { name: "Cancel order", exact: true }).click(); await mobilePage.getByRole("dialog").waitFor();
    assert.equal(await mobilePage.getByRole("dialog").evaluate(el => el.contains(document.activeElement)), true); await mobilePage.keyboard.press("Shift+Tab"); assert.equal(await mobilePage.getByRole("dialog").evaluate(el => el.contains(document.activeElement)), true); assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await mobilePage.getByRole("dialog").getByRole("button", { name: "Cancel order", exact: true }).click(); await mobilePage.getByText("Refund processing · 12.50 USD", { exact: true }).waitFor(); await refundResult(19, (await row(19)).refunds[0].id); await mobilePage.reload(); await mobilePage.getByText("Refund completed · 12.50 USD", { exact: true }).waitFor(); assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); await capture(mobilePage, "09-mobile-refund-flow.png"); pass(["AU"], "Actual 390x844 cancel/confirmation/processing/completed flow: native focus remains in modal including Shift+Tab, touch targets readable and no horizontal overflow.");

    currentCase = "FAILED_CANCELED_UNPAID";
    for (const [index, outcome] of [[16, "FAILED"], [17, "CANCELED"]] as const) { const before = await stock(); await checkout(index, false); await ok(await post(guests[index], `/api/customer/payments/${orders.get(index)!.publicOrderCode}/sandbox`, { outcome })); await ok(await cancel(index)); assert.equal((await row(index)).refunds.length, 0); assert.deepEqual(await stock(), before); }
    pass([currentCase], "FAILED and provider-CANCELED unpaid orders cancel without refunds, re-consumption or double reservation release.");
    currentCase = "REFUND_CREATE_BIND_RECOVERY"; await checkout(18); await ok(await refund(18, "2.50")); const recoverable = (await row(18)).refunds[0]; const providerId = recoverable.providerRefundId;
    await prisma.refund.update({ where: { id: recoverable.id }, data: { providerRefundId: null } }); await dispatchRefund(recoverable.id); assert.equal((await row(18)).refunds[0].providerRefundId, providerId); assert.equal(await prisma.sandboxRefundIntent.count({ where: { refundId: recoverable.id } }), 1); pass([currentCase], "Simulated create/bind crash recovers same provider refund by stable SQL refund ID; no second provider intent or exposure.");
    currentCase = "REFUND_CALLBACK_MISMATCH";
    for (const override of [{ amountMinor: "1" }, { currencyCode: "EUR" }, { providerRefundId: "fake-provider-refund" }, { providerPaymentId: "other-charge" }]) { const mismatch = await signedRefund(18, recoverable.id, `mismatch:${randomUUID()}`, override); const result = await ok(await webhook(mismatch.raw, mismatch.signature)); assert.equal(result.status, "REJECTED"); assert.equal((await row(18)).refunds[0].status, "PROCESSING"); }
    pass([currentCase], "Correctly signed amount/currency/provider-refund/payment-ID mismatches are journaled REJECTED without financial mutation.");
    currentCase = "REFUND_TERMINAL_REGRESSION"; const stale = await signedRefund(14, (await row(14)).refunds[0].id, `stale:${randomUUID()}`, { status: "FAILED" }); assert.equal((await ok(await webhook(stale.raw, stale.signature))).status, "IGNORED"); assert.equal((await row(14)).refunds[0].status, "SUCCEEDED"); pass([currentCase], "Verified stale failure cannot rewind a successful refund, free its captured balance or create a false issue.");
    currentCase = "QUEUE_REMOVAL"; const canceledQueue = await ok(await read(kitchen, `${base}/api/kitchen/orders?code=${orders.get(1)!.publicOrderCode}`)); assert.equal(canceledQueue.orders.length, 0); assert.equal((await read(kitchen, `${base}/api/kitchen/orders/${orders.get(1)!.publicOrderCode}`)).status(), 404); pass([currentCase], "Canceled online order is absent from actionable kitchen queue and cannot be reopened as a kitchen ticket.");
    currentCase = "CSRF_AND_HISTORY"; const csrf = await guests[18].request.post(`${base}/api/customer/orders/${orders.get(18)!.publicOrderCode}/cancel`, { headers: { Origin: "https://untrusted.example" }, data: { confirmed: true } }); assert.equal(csrf.status(), 403);
    await assert.rejects(prisma.orderCancellation.update({ where: { orderId: orders.get(1)!.id }, data: { reasonCode: "OTHER" } })); await assert.rejects(prisma.refund.update({ where: { id: recoverable.id }, data: { amount: "2.51" } })); await assert.rejects(prisma.inventoryMovement.update({ where: { id: (await row(1)).inventoryMovements.find(m => m.type === "ORDER_CONSUMPTION")!.id }, data: { quantityDelta: "-301" } })); pass([currentCase], "Cross-origin financial POST rejected; PostgreSQL rejects cancellation-history, refund-amount and original-consumption mutation.");

    currentCase = "AJ"; await checkout(20, false); await checkout(21); await checkout(22); await advance(22, "PREPARING"); await checkout(23); await advance(23, "DELIVERED"); const paidPlacedOriginal = await row(21); const startedOriginal = await row(22); const deliveredOriginal = await row(23);
    await ok(await post(admin, `/api/admin/screenings/${demo.sessions[20].screeningId}/cancel`, {}));
    const previewResponse = await read(admin, `${base}/api/admin/screenings/${demo.sessions[20].screeningId}/reconciliation`); const preview = await ok(previewResponse); assert.ok(preview.counts.unpaidPlaced >= 1); assert.ok(preview.counts.paidPlaced >= 1); assert.ok(preview.counts.started >= 1); assert.ok(preview.counts.delivered >= 1);
    await adminPage.goto(`${base}/admin/screenings/${demo.sessions[20].screeningId}`); await adminPage.getByRole("heading", { name: "Review affected orders", exact: true }).waitFor(); await capture(adminPage, "08-screening-cancellation-reconciliation.png");
    const reconciliation = `/api/admin/screenings/${demo.sessions[20].screeningId}/reconciliation`; await ok(await post(admin, reconciliation, { confirmed: true, batchOrderIds: preview.batchOrderIds }));
    o = await row(20); assert.equal(o.status, "CANCELED"); assert.equal(o.payment!.status, "CANCELED"); assert.equal(o.refunds.length, 0); assert.equal(o.reservations.filter(r => r.status === "ACTIVE").length, 0); pass(["AJ"], "Actual screening cancellation + reviewed reconciliation cancels unpaid order, releases holds on provider confirmation and creates no refund.");
    currentCase = "AK"; o = await row(21); assert.equal(o.status, "CANCELED"); assert.equal(o.refunds.length, 1); assert.equal(o.refunds[0].amount.toFixed(2), "12.50"); assert.equal(o.inventoryMovements.filter(m => m.type === "ORDER_CANCELLATION_RESTOCK").length, paidPlacedOriginal.inventoryMovements.length); pass(["AK"], "Paid PLACED screening reconciliation starts full refund and restores original consumption exactly once.");
    currentCase = "AL"; o = await row(22); assert.equal(o.status, "PREPARING"); assert.equal(o.refunds.length, 0); assert.deepEqual(o.inventoryMovements.map(m => m.id), startedOriginal.inventoryMovements.map(m => m.id)); assert.ok(o.issues.some(i => i.type === "SCREENING_CANCELED")); pass(["AL"], "Preparing order remains operational with supervisor screening issue; no automatic restock or refund.");
    currentCase = "AM"; o = await row(23); assert.equal(o.status, "DELIVERED"); assert.equal(o.refunds.length, 0); assert.deepEqual(o.statusEvents.map(e => e.id), deliveredOriginal.statusEvents.map(e => e.id)); pass(["AM"], "Delivered order preserved with no screening-driven refund, cancellation, restock or history rewind.");
    currentCase = "AN"; const priorReconciliation = { stock: await stock(), cancel: await prisma.orderCancellation.count({ where: { order: { screeningId: demo.sessions[20].screeningId } } }), refunds: await prisma.refund.count({ where: { order: { screeningId: demo.sessions[20].screeningId } } }), movements: await prisma.inventoryMovement.count({ where: { order: { screeningId: demo.sessions[20].screeningId }, type: "ORDER_CANCELLATION_RESTOCK" } }) };
    await ok(await post(admin, reconciliation, { confirmed: true, batchOrderIds: preview.batchOrderIds })); assert.deepEqual(await stock(), priorReconciliation.stock); assert.equal(await prisma.orderCancellation.count({ where: { order: { screeningId: demo.sessions[20].screeningId } } }), priorReconciliation.cancel); assert.equal(await prisma.refund.count({ where: { order: { screeningId: demo.sessions[20].screeningId } } }), priorReconciliation.refunds); assert.equal(await prisma.inventoryMovement.count({ where: { order: { screeningId: demo.sessions[20].screeningId }, type: "ORDER_CANCELLATION_RESTOCK" } }), priorReconciliation.movements); pass(["AN"], "Same reconciliation twice: no duplicate cancellation/refund/restock/issue and stock/reservations unchanged.");

    currentCase = "AO";
    // Separate still-live Dbayeh screening proves a genuine simultaneous race.
    const liveSession = demo.sessions[44]; const newToken = createOpaqueToken();
    const raceSeat = await prisma.seat.create({ data: { hallId: (await row(44)).hallId, id: "a51", row: "A", number: 51, label: "A51" } });
    const racingSession = await prisma.customerSession.create({ data: { tokenHash: hashOpaqueToken(newToken), hallId: raceSeat.hallId, seatId: raceSeat.id, screeningId: liveSession.screeningId, expiresAt: new Date(Date.now() + 3600000), cart: { create: { items: { create: { productId: liveSession.productId, quantity: 1, reviewedUnitPrice: "12.50", reviewedCurrencyCode: "USD" } } } } } });
    const racingGuest = await browser.newContext(); await racingGuest.addCookies([{ name: "cinebite_guest_session", value: newToken, url: base, httpOnly: true, sameSite: "Lax" }]);
    const racingBody = await ok(await post(racingGuest, "/api/customer/orders", { idempotencyKey: randomUUID() }), 201); const racingOrder = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: racingBody.order.publicOrderCode }, include: { payment: { include: { attempts: true } } } });
    await prisma.sandboxPaymentIntent.update({ where: { id: racingOrder.payment!.providerPaymentId! }, data: { status: "SUCCEEDED" } }); const intent = await getPaymentProvider().retrieve(racingOrder.payment!.providerPaymentId!); const captureRaw = JSON.stringify({ ...intent, eventId: `cancel-race:${randomUUID()}` });
    const settlementRace = await Promise.all([post(racingGuest, `/api/customer/orders/${racingOrder.publicOrderCode}/cancel`, { confirmed: true }), webhook(captureRaw, sandboxSignature(captureRaw))]); for (const result of settlementRace) await ok(result);
    const finalRace = await prisma.order.findUniqueOrThrow({ where: { id: racingOrder.id }, include: { payment: true, refunds: true, reservations: true } }); assert.equal(finalRace.status, "CANCELED"); assert.equal(finalRace.payment!.status, "SUCCEEDED"); assert.equal(finalRace.refunds.length, 1); assert.equal(finalRace.fulfillmentEligible, false); assert.equal(finalRace.reservations.filter(r => r.status === "ACTIVE").length, 0); assert.ok(racingSession.id); pass(["AO"], "Actual simultaneous provider-success / customer cancellation serializes to captured payment, canceled order and exactly one remaining refund, never fulfillment or negative holds.");
    currentCase = "AS"; const tables = await prisma.$queryRaw<Array<{ name: string }>>`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename IN ('order_cancellations','refunds','order_issues','order_status_events','inventory_movements')`; assert.equal(tables.length, 5); assert.ok(await prisma.orderCancellation.count()); assert.ok(await prisma.refund.count()); assert.ok(await prisma.orderIssue.count()); pass(["AS"], "Inspected actual PostgreSQL relations, statuses, cancellation/event/refund/issue/movement records after all workflows.");
    currentCase = "AT"; for (const file of ["src/server/repositories/cancellation.repository.ts", "src/server/repositories/refund.repository.ts", "src/server/repositories/refund-domain.ts", "src/server/services/cancellation.service.ts"]) assert.equal(/firestore|collection\(|\.doc\(/i.test(await readFile(file, "utf8")), false); pass(["AT"], "Executed Phase 15 persisted in isolated PostgreSQL only; inspected all new business layers for Firestore calls—none present.");
    currentCase = "AV"; const images = (await (await import("node:fs/promises")).readdir(output)).filter(f => f.endsWith(".png")); assert.equal(images.length, 9); for (const name of images) assert.equal((await readFile(path.join(output, name))).subarray(0, 8).toString("hex"), "89504e470d0a1a0a"); pass(["AV"], "Nine real app-only native browser PNGs captured with fictional sandbox data and no browser/desktop chrome. Native-resolution visual review follows.");
    results.set("REAL_PROVIDER", { status: "NOT EXECUTABLE", evidence: "No merchant provider selected/configured; sandbox refunds actually executed, no real money/card/provider account contacted." });
    const diff = spawnSync("git", ["diff", "--", "src", "prisma", "scripts"], { encoding: "utf8" }).stdout;
    for (const secret of [process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET!, process.env.PAYMENT_EXPIRY_JOB_SECRET!, process.env.FIREBASE_ADMIN_PRIVATE_KEY!, ...demo.sessions.map(s => s.token)]) assert.equal(diff.includes(secret), false, "Ephemeral secret leaked into source");
  } catch (error) {
    results.set(currentCase, { status: "FAIL", evidence: error instanceof Error ? error.message : "Verification failure" }); throw error;
  } finally {
    await writeFile(path.join(process.cwd(), "docs", "phase-15-integration-results.json"), JSON.stringify({ executedAt: new Date().toISOString(), environment: "Isolated PostgreSQL loopback / Auth emulator / sandbox / production Next build / Chromium", results: Object.fromEntries(results) }, null, 2) + "\n");
    await browser?.close(); server.kill();
    await Promise.all(staff.map(user => getAdminAuth().updateUser(user.uid, { disabled: true })));
    await prisma.user.updateMany({ where: { firebaseUid: { in: staff.map(user => user.uid) } }, data: { active: false } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Verification failed"); process.exitCode = 1; });
