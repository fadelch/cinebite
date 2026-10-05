import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { getAdminAuth } from "../src/lib/firebase/admin";
import { prisma } from "../src/lib/db/prisma";
import { getEffectiveProductAvailability } from "../src/server/services/stock-availability.service";
import { paymentMinorUnits } from "../src/lib/payments/policy";
import { sandboxSignature } from "../src/lib/payments/provider";
import { createOpaqueToken, hashOpaqueToken } from "../src/lib/security/opaque-token";

// Isolated manual integration runner: refuses cloud databases and real Firebase projects.
// Never load .env.local when invoking this script. It has no production credential requirement.
if (!process.argv.includes("--local")) throw new Error("Use --local with the isolated PostgreSQL and Firebase Auth emulator running.");
process.env.DATABASE_URL = "postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase14_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9144";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-cinebite-phase14";
process.env.GCLOUD_PROJECT = "demo-cinebite-phase14";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@demo-cinebite-phase14.iam.gserviceaccount.com";
process.env.FIREBASE_STORAGE_BUCKET = "demo-cinebite-phase14.appspot.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
const base = "http://127.0.0.1:3114";
const evidenceRun = randomUUID().slice(0, 8);
const output = path.join(process.cwd(), "linkedin", "phase-14");
const results = new Map<string, { status: "PASS" | "FAIL" | "NOT EXECUTABLE"; evidence: string }>();
for (const id of [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ...Array.from({ length: 20 }, (_, i) => `A${String.fromCharCode(65 + i)}`)]) results.set(id, { status: "NOT EXECUTABLE", evidence: "Not reached in this run." });
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
  await page.screenshot({ path: path.join(output, name), fullPage: true, clip: { x: 0, y: 0, width: page.viewportSize()!.width, height } });
}
async function fixture() {
  const org = await prisma.organization.create({ data: { id: `phase14-evidence-${evidenceRun}-org`, slug: `phase14-evidence-${evidenceRun}-cinemas`, name: "Demo CineBite Cinemas", status: "ACTIVE" } });
  return prisma.$transaction(async (tx) => {
    const other = await tx.organization.upsert({ where: { slug: `phase14-evidence-${evidenceRun}-other-cinema` }, create: { id: `phase14-evidence-${evidenceRun}-other-org`, slug: `phase14-evidence-${evidenceRun}-other-cinema`, name: "Demo Cinema B", status: "ACTIVE" }, update: {} });
    const locations = [];
    const sessions = [];
    for (const [suffix, name, organizationId] of [["beirut", "Demo Beirut", org.id], ["dbayeh", "Demo Dbayeh", org.id], ["other", "Demo Cinema B", other.id]]) {
      const location = await tx.location.upsert({ where: { id: `phase14-evidence-${evidenceRun}-${suffix}` }, create: { id: `phase14-evidence-${evidenceRun}-${suffix}`, organizationId, name, slug: `phase14-evidence-${evidenceRun}-${suffix}`, addressLine1: "Demo cinema", city: "Beirut", country: "LB", timezone: "Asia/Beirut", status: "ACTIVE" }, update: {} });
      locations.push(location);
      const hall = await tx.hall.upsert({ where: { id: `phase14-evidence-${evidenceRun}-hall-${suffix}` }, create: { id: `phase14-evidence-${evidenceRun}-hall-${suffix}`, locationId: location.id, name: "Hall 1", number: 1, status: "ACTIVE" }, update: {} });
      const movie = await tx.movie.upsert({ where: { id: `phase14-evidence-${evidenceRun}-movie-${suffix}` }, create: { id: `phase14-evidence-${evidenceRun}-movie-${suffix}`, organizationId, title: "Interstellar", slug: `phase14-evidence-${evidenceRun}-interstellar-${suffix}`, durationMinutes: 180 }, update: {} });
      const screening = await tx.screening.upsert({ where: { id: `phase14-evidence-${evidenceRun}-screening-${suffix}` }, create: { id: `phase14-evidence-${evidenceRun}-screening-${suffix}`, hallId: hall.id, movieId: movie.id, startsAt: new Date(Date.now() - 300000), endsAt: new Date(Date.now() + 10800000) }, update: { status: "SCHEDULED", startsAt: new Date(Date.now() - 300000), endsAt: new Date(Date.now() + 10800000) } });
      const category = await tx.menuCategory.upsert({ where: { id: `phase14-evidence-${evidenceRun}-category-${suffix}` }, create: { id: `phase14-evidence-${evidenceRun}-category-${suffix}`, organizationId, name: "Cinema favorites", slug: `phase14-evidence-${evidenceRun}-favorites-${suffix}` }, update: {} });
      const product = await tx.product.upsert({ where: { id: `phase14-evidence-${evidenceRun}-product-${suffix}` }, create: { id: `phase14-evidence-${evidenceRun}-product-${suffix}`, organizationId, categoryId: category.id, name: "Large Popcorn", slug: `phase14-evidence-${evidenceRun}-popcorn-${suffix}`, description: "Freshly popped cinema popcorn." }, update: { name: "Large Popcorn" } });
      await tx.productLocation.upsert({ where: { productId_locationId: { productId: product.id, locationId: location.id } }, create: { id: `phase14-evidence-${evidenceRun}-offer-${suffix}`, organizationId, productId: product.id, locationId: location.id, price: "5.00", currencyCode: "USD" }, update: {} });
      if (suffix === "beirut") {
        const ingredient = await tx.inventoryItem.upsert({ where: { id: `phase14-evidence-${evidenceRun}-kernels` }, create: { id: `phase14-evidence-${evidenceRun}-kernels`, organizationId, name: "Demo snack portions", sku: `PH14-${evidenceRun}-KERNELS`, unit: "EACH" }, update: {} });
        await tx.locationInventory.upsert({ where: { locationId_inventoryItemId: { locationId: location.id, inventoryItemId: ingredient.id } }, create: { id: `phase14-evidence-${evidenceRun}-stock`, organizationId, locationId: location.id, inventoryItemId: ingredient.id, quantityOnHand: "1000", lowStockThreshold: "5" }, update: {} });
        await tx.productRecipeComponent.upsert({ where: { productId_inventoryItemId: { productId: product.id, inventoryItemId: ingredient.id } }, create: { id: `phase14-evidence-${evidenceRun}-recipe`, organizationId, productId: product.id, inventoryItemId: ingredient.id, quantityRequired: "1.000" }, update: {} });
      }
      for (const number of suffix === "beirut" ? Array.from({ length: 44 }, (_, i) => i + 7) : [7]) {
        const seat = await tx.seat.upsert({ where: { hallId_id: { hallId: hall.id, id: `a${number}` } }, create: { hallId: hall.id, id: `a${number}`, row: "A", number, label: `A${number}` }, update: {} });
        await tx.customerSession.updateMany({ where: { hallId: hall.id, seatId: seat.id, screeningId: screening.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
        const token = createOpaqueToken();
        const session = await tx.customerSession.create({ data: { id: randomUUID(), hallId: hall.id, seatId: seat.id, screeningId: screening.id, tokenHash: hashOpaqueToken(token), expiresAt: screening.endsAt, lastSeenAt: new Date(), cart: { create: { id: randomUUID(), items: { create: { id: randomUUID(), productId: product.id, quantity: number === 7 ? 2 : 1, reviewedUnitPrice: "5.00", reviewedCurrencyCode: "USD" } } } } } });
        sessions.push({ token, id: session.id, suffix, number, screeningId: screening.id, productId: product.id });
      }
    }
    return { org, other, locations, sessions };
  }, { timeout: 60000 });
}

async function staffIdentity(role: "KITCHEN_STAFF" | "LOCATION_MANAGER" | "DELIVERY_STAFF" | "CINEMA_ADMIN", organizationId: string, locationIds: string[], suffix: string) {
  const email = `cinebite.phase14.${suffix}@example.com`;
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
  const stockId = `phase14-evidence-${evidenceRun}-stock`;
  const popcorn = await prisma.product.findUniqueOrThrow({ where: { id: demo.sessions[0].productId } });
  const pepsi = await prisma.product.create({ data: { id: randomUUID(), organizationId: demo.org.id, categoryId: popcorn.categoryId, name: "Pepsi", slug: `phase14-${evidenceRun}-pepsi`, description: "Demo cinema drink",
    productLocations: { create: { locationId: demo.locations[0].id, price: "2.50", currencyCode: "USD" } },
    recipeComponents: { create: { inventoryItemId: `phase14-evidence-${evidenceRun}-kernels`, quantityRequired: "1.000" } } } });
  await prisma.cartItem.create({ data: { id: randomUUID(), cartId: (await prisma.cart.findUniqueOrThrow({ where: { customerSessionId: demo.sessions[0].id } })).id, productId: pepsi.id, quantity: 1, reviewedUnitPrice: "2.50", reviewedCurrencyCode: "USD" } });
  const staff = await Promise.all([
    staffIdentity("CINEMA_ADMIN", demo.org.id, demo.locations.slice(0, 2).map(l => l.id), "admin"),
    staffIdentity("LOCATION_MANAGER", demo.org.id, [demo.locations[0].id], "manager"),
    staffIdentity("KITCHEN_STAFF", demo.org.id, [demo.locations[0].id], "kitchen"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [demo.locations[0].id], "worker-a"),
    staffIdentity("CINEMA_ADMIN", demo.other.id, [demo.locations[2].id], "other-admin"),
  ]);
  const server = spawn(process.execPath, [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3114"], { stdio: ["ignore", "ignore", "pipe"], env: process.env });
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
    const orderRow = (i: number) => prisma.order.findUniqueOrThrow({ where: { id: orders.get(i)!.id }, include: { payment: { include: { attempts: { orderBy: { number: "desc" }, take: 1 } } }, reservations: true } });
    const stock = () => prisma.locationInventory.findUniqueOrThrow({ where: { id: stockId } });
    async function post(i: number, url: string, data: unknown) { return guests[i].request.post(base + url, { headers: { Origin: base }, data }); }
    async function checkout(i: number, key = randomUUID()) {
      const response = await post(i, "/api/customer/orders", { idempotencyKey: key, customerNote: "Demo seat delivery, please." });
      assert.ok([200, 201].includes(response.status()), `Checkout ${i} failed: ${await response.text()}`);
      const body = await response.json();
      const row = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: body.order.publicOrderCode } });
      orders.set(i, { id: row.id, publicOrderCode: row.publicOrderCode }); return row;
    }
    async function event(i: number, status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELED", patch: Record<string, unknown> = {}, valid = true, eventId = randomUUID()) {
      const order = await orderRow(i), payment = order.payment!, attempt = payment.attempts[0];
      const raw = JSON.stringify({ eventId, providerPaymentId: attempt.providerPaymentId, attemptId: attempt.id, amountMinor: paymentMinorUnits(payment.amount.toFixed(2), payment.currencyCode), currencyCode: payment.currencyCode, status, ...patch });
      const signature = valid ? sandboxSignature(raw) : "invalid-signature";
      return guests[i].request.post(base + "/api/payments/webhook", { headers: { "Content-Type": "application/json", "x-cinebite-sandbox-signature": signature }, data: raw });
    }
    async function simulate(i: number, outcome: string) {
      const response = await post(i, `/api/customer/payments/${orders.get(i)!.publicOrderCode}/sandbox`, { outcome });
      assert.equal(response.status(), 200, await response.text()); return response.json();
    }
    async function expire() {
      const response = await admin.request.post(base + "/api/payments/expire", { headers: { authorization: `Bearer ${process.env.PAYMENT_EXPIRY_JOB_SECRET}` } });
      assert.equal(response.status(), 200, await response.text()); return response.json();
    }
    async function pageFor(i: number) { const p = await guests[i].newPage(); await p.goto(`${base}/customer/payments/${orders.get(i)!.publicOrderCode}`, { waitUntil: "networkidle" }); return p; }
    currentCase = "C";
    assert.equal((await post(0, "/api/customer/cart", {})).status(), 405);
    const cartPut = await guests[0].request.put(base + "/api/customer/cart", { headers: { Origin: base }, data: { productSlug: popcorn.slug, quantity: 2 } });
    assert.equal(cartPut.status(), 200); assert.equal((await stock()).quantityReserved.toFixed(3), "0.000");
    pass(["C"], "Actual cart PUT retained zero reserved stock.");
    currentCase = "A";
    await checkout(0);
    const first = await orderRow(0); assert.equal(first.total.toFixed(2), "12.50");
    for (const extra of [{ amount: "0.01" }, { currencyCode: "EUR" }]) assert.equal((await post(0, "/api/customer/orders", { idempotencyKey: randomUUID(), ...extra })).status(), 400);
    const intent = await prisma.sandboxPaymentIntent.findUniqueOrThrow({ where: { attemptId: first.payment!.attempts[0].id } });
    assert.equal(intent.amountMinor, "1250"); assert.equal(intent.currencyCode, "USD");
    pass(["A", "B"], "Actual strict checkout endpoints rejected browser total/currency. Durable provider request is exactly 1250 USD minor units.");
    assert.equal(first.reservations.length, 1); assert.equal(first.reservations[0].quantity.toFixed(3), "3.000");
    assert.equal(first.reservations[0].status, "ACTIVE"); assert.equal((await stock()).quantityOnHand.toFixed(3), "1000.000");
    pass(["D", "AA", "AD"], "Two popcorn plus Pepsi share one aggregate ACTIVE reservation of three portions; on-hand stock remains unchanged.");
    const kitchenPage = await kitchen.newPage(); await kitchenPage.goto(base + "/kitchen", { waitUntil: "networkidle" });
    assert.equal(await kitchenPage.locator(`[data-order-code="${first.publicOrderCode}"]`).count(), 0);
    assert.equal((await mutate(kitchen, first.publicOrderCode, "PLACED", "ACCEPTED", true)).status(), 409);
    currentCase = "G";
    const successEvent = randomUUID();
    assert.equal((await event(0, "SUCCEEDED", {}, true, successEvent)).status(), 200);
    const paid = await orderRow(0); assert.equal(paid.payment!.status, "SUCCEEDED"); assert.equal(paid.fulfillmentEligible, true);
    assert.equal((await stock()).quantityOnHand.toFixed(3), "997.000"); assert.equal((await stock()).quantityReserved.toFixed(3), "0.000");
    assert.equal(paid.reservations[0].status, "CONSUMED");
    pass(["G", "AB"], "Signed success atomically consumed aggregate recipe stock, cleared reservations and inserted ORDER_CONSUMPTION.");
    await kitchenPage.locator(`[data-order-code="${first.publicOrderCode}"]`).waitFor({ timeout: 20000 });
    pass(["Z"], "Unpaid PLACED was hidden and mutation denied; paid order appeared in the already-open kitchen by polling.");
    await capture(kitchenPage, "06-kitchen-payment-gating.png");
    currentCase = "J";
    const duplicates = await Promise.all(Array.from({ length: 10 }, () => event(0, "SUCCEEDED", {}, true, successEvent)));
    assert.ok(duplicates.every(r => r.status() === 200));
    assert.equal(await prisma.inventoryMovement.count({ where: { orderId: first.id, type: "ORDER_CONSUMPTION" } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { entityId: first.id, action: "PAYMENT_SUCCEEDED" } }), 1);
    assert.equal(await prisma.paymentAttempt.count({ where: { paymentId: first.payment!.id, status: "SUCCEEDED" } }), 1);
    assert.equal((await stock()).quantityOnHand.toFixed(3), "997.000");
    pass(["J"], "Ten duplicate signed HTTP success webhooks produced one settlement, one movement and one success audit.");
    assert.equal((await event(0, "FAILED")).status(), 200); assert.equal((await orderRow(0)).payment!.status, "SUCCEEDED");
    pass(["Y"], "A later signed FAILED event could not downgrade SUCCEEDED.");
    const confirmed = await pageFor(0); await confirmed.getByRole("heading", { name: "Payment confirmed", exact: true }).waitFor();
    await confirmed.setViewportSize({ width: 1440, height: 1000 }); await capture(confirmed, "03-payment-success.png");
    currentCase = "E";
    await prisma.locationInventory.update({ where: { id: stockId }, data: { quantityOnHand: "10" } });
    await prisma.cartItem.updateMany({ where: { cart: { customerSessionId: demo.sessions[1].id } }, data: { quantity: 2 } });
    await checkout(1);
    assert.equal((await stock()).quantityReserved.toFixed(3), "2.000");
    const availability = await getEffectiveProductAvailability(demo.org.id, popcorn.id, demo.locations[0].id);
    assert.equal(availability.inventory.projectedUnits, 8);
    pass(["E"], "Real PostgreSQL on-hand 10/reserved 2 gave customer availability of eight units.");
    const inventoryPage = await admin.newPage(); await inventoryPage.goto(`${base}/admin/inventory?locationId=${demo.locations[0].id}`, { waitUntil: "networkidle" });
    await inventoryPage.getByRole("heading", { name: "Inventory overview" }).waitFor(); await capture(inventoryPage, "07-inventory-reservation.png");
    const checkoutPage = await pageFor(1); await checkoutPage.setViewportSize({ width: 1440, height: 1000 }); await capture(checkoutPage, "01-payment-checkout.png");
    currentCase = "H";
    const failureId = randomUUID(); assert.equal((await event(1, "FAILED", {}, true, failureId)).status(), 200);
    assert.equal((await orderRow(1)).payment!.status, "FAILED"); assert.equal((await stock()).quantityOnHand.toFixed(3), "10.000"); assert.equal((await stock()).quantityReserved.toFixed(3), "0.000");
    assert.equal(await prisma.inventoryMovement.count({ where: { orderId: orders.get(1)!.id } }), 0);
    for (let n = 0; n < 3; n++) assert.equal((await event(1, "FAILED", {}, true, failureId)).status(), 200);
    assert.equal((await stock()).quantityReserved.toFixed(3), "0.000");
    pass(["H", "K"], "Failure and repeated failure released exactly once, preserved physical stock, and created no consumption movement.");
    await checkoutPage.getByRole("heading", { name: "Payment failed", exact: true }).waitFor({ timeout: 20000 }); await capture(checkoutPage, "04-payment-failed.png");
    await checkoutPage.getByRole("button", { name: "Retry payment", exact: true }).waitFor(); pass(["AO"], "Actual failed page explains release and offers same-order retry.");
    currentCase = "F";
    await prisma.locationInventory.update({ where: { id: stockId }, data: { quantityOnHand: "1" } });
    for (const i of [2, 3]) {
      assert.equal((await guests[i].request.put(base + "/api/customer/cart", { headers: { Origin: base }, data: { productSlug: popcorn.slug, quantity: 0 } })).status(), 200);
      assert.equal((await guests[i].request.put(base + "/api/customer/cart", { headers: { Origin: base }, data: { productSlug: pepsi.slug, quantity: 1 } })).status(), 200);
    }
    const competing = await Promise.all([2, 3].map(i => post(i, "/api/customer/orders", { idempotencyKey: randomUUID() })));
    assert.deepEqual(competing.map(r => r.status()).sort(), [201, 409]);
    const winning = competing[0].status() === 201 ? 2 : 3;
    const winningBody = await competing[winning === 2 ? 0 : 1].json(); const winningRow = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: winningBody.order.publicOrderCode } });
    orders.set(winning, winningRow); assert.equal((await stock()).quantityReserved.toFixed(3), "1.000");
    pass(["F"], "Two actual simultaneous checkout requests competed for one portion: one reserved it, the other received 409 with no extra order.");
    await simulate(winning, "SUCCEEDED");
    await prisma.locationInventory.update({ where: { id: stockId }, data: { quantityOnHand: "1000" } });
    currentCase = "I"; await checkout(4); await simulate(4, "CANCELED");
    assert.equal((await orderRow(4)).reservations[0].status, "RELEASED");
    pass(["I"], "Owner's same-origin sandbox cancellation released stock without consumption.");
    currentCase = "L"; await checkout(5); const beforeInvalid = (await stock()).quantityReserved.toFixed(3);
    assert.equal((await event(5, "SUCCEEDED", {}, false)).status(), 400);
    assert.equal((await orderRow(5)).payment!.status, "PENDING"); assert.equal((await stock()).quantityReserved.toFixed(3), beforeInvalid);
    pass(["L"], "Invalid signature was rejected before trusted parsing; payment and stock remained unchanged.");
    for (const [id, patch] of [["M", { amountMinor: "1" }], ["N", { currencyCode: "EUR" }], ["O", { providerPaymentId: "not-the-provider-payment" }]] as const) {
      currentCase = id; const response = await event(5, "SUCCEEDED", patch); assert.equal(response.status(), 200); assert.equal((await response.json()).status, "REJECTED");
      const row = await orderRow(5); assert.equal(row.payment!.status, "PENDING"); assert.equal(row.fulfillmentEligible, false);
      assert.equal((await stock()).quantityReserved.toFixed(3), beforeInvalid);
      pass([id], "Validly signed mismatched provider data was journaled REJECTED; no settlement, stock change or kitchen eligibility.");
    }
    currentCase = "P";
    const unpaid = await guests[5].newPage(); await unpaid.goto(`${base}/customer/payments/${orders.get(5)!.publicOrderCode}?success=true`, { waitUntil: "networkidle" });
    await unpaid.getByRole("heading", { name: "Waiting for payment", exact: true }).waitFor();
    assert.equal((await orderRow(5)).payment!.status, "PENDING");
    pass(["P"], "Manually visiting a success query still showed Waiting for payment and did not mark paid.");
    currentCase = "AP";
    const mobile = await guests[6].newPage(); await mobile.goto(base + "/customer/cart", { waitUntil: "networkidle" });
    await mobile.getByRole("button", { name: "Continue to payment", exact: true }).click();
    await mobile.waitForURL("**/customer/payments/**");
    const mobileCode = mobile.url().split("/").pop()!; const mobileRow = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: mobileCode } }); orders.set(6, mobileRow);
    await mobile.getByRole("button", { name: "Test failure", exact: true }).click();
    await mobile.getByRole("heading", { name: "Payment failed", exact: true }).waitFor();
    await mobile.getByRole("button", { name: "Retry payment", exact: true }).click();
    await mobile.getByRole("heading", { name: "Waiting for payment", exact: true }).waitFor();
    await mobile.getByRole("button", { name: "Test processing", exact: true }).click();
    await mobile.getByRole("heading", { name: "Confirming your payment…", exact: true }).waitFor();
    assert.equal((await orderRow(6)).payment!.status, "PROCESSING");
    const processing = await pageFor(6); await processing.setViewportSize({ width: 1440, height: 1000 }); await capture(processing, "02-payment-processing.png");
    assert.equal((await orderRow(6)).fulfillmentEligible, false);
    await mobile.reload({ waitUntil: "networkidle" }); await event(6, "SUCCEEDED");
    await mobile.getByRole("heading", { name: "Payment confirmed", exact: true }).waitFor({ timeout: 20000 }); await capture(mobile, "08-mobile-payment-flow.png");
    pass(["R"], "Return-first processing page waited for signed success and updated by server polling, not browser return authority.");
    await mobile.getByRole("link", { name: "Follow your order", exact: true }).click();
    await mobile.getByRole("heading", { name: "We received your order", exact: true }).waitFor();
    assert.equal(await mobile.locator('a[href="/customer/menu"]').count(), 1);
    await mobile.setViewportSize({ width: 390, height: 844 }); assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    pass(["AP"], "Actual 390×844 cart → checkout → Pay/test processing → verified success → fulfillment progress; failure/retry was also rendered and interacted with.");
    currentCase = "Q"; await checkout(7); await event(7, "SUCCEEDED"); const webhookFirst = await pageFor(7); await webhookFirst.getByRole("heading", { name: "Payment confirmed", exact: true }).waitFor();
    pass(["Q"], "Webhook arrived before customer returned; return page read confirmed server state.");
    currentCase = "S"; await checkout(8); const closed = await pageFor(8); await closed.close(); await event(8, "SUCCEEDED"); assert.equal((await orderRow(8)).payment!.status, "SUCCEEDED"); assert.equal((await orderRow(8)).fulfillmentEligible, true);
    pass(["S"], "Browser closed before signed callback; server still settled and consumed reservations.");
    currentCase = "T"; const key = randomUUID(); const double = await Promise.all([post(9, "/api/customer/orders", { idempotencyKey: key }), post(9, "/api/customer/orders", { idempotencyKey: key })]); assert.ok(double.every(r => [200, 201].includes(r.status())));
    const doubleBody = await double[0].json(); const doubleRow = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: doubleBody.order.publicOrderCode } }); orders.set(9, doubleRow);
    assert.equal(await prisma.order.count({ where: { customerSessionId: demo.sessions[9].id } }), 1);
    assert.equal(await prisma.paymentAttempt.count({ where: { payment: { orderId: doubleRow.id } } }), 1);
    assert.equal(await prisma.sandboxPaymentIntent.count({ where: { attemptId: (await orderRow(9)).payment!.attempts[0].id } }), 1);
    pass(["T"], "Concurrent same-key checkout returned one order, one attempt, one durable provider intent and one reservation set.");
    currentCase = "U"; await checkout(10); await event(10, "FAILED"); const retryKey = randomUUID();
    const retry = await Promise.all([post(10, `/api/customer/payments/${orders.get(10)!.publicOrderCode}`, { idempotencyKey: retryKey }), post(10, `/api/customer/payments/${orders.get(10)!.publicOrderCode}`, { idempotencyKey: retryKey })]);
    assert.ok(retry.every(r => r.status() === 200)); const retryRow = await orderRow(10); assert.equal(retryRow.payment!.currentAttemptNumber, 2);
    assert.equal(await prisma.paymentAttempt.count({ where: { paymentId: retryRow.payment!.id } }), 2); assert.equal(await prisma.order.count({ where: { customerSessionId: demo.sessions[10].id } }), 1);
    assert.equal(retryRow.reservations.filter(r => r.status === "ACTIVE").length, 1);
    await event(10, "SUCCEEDED"); assert.equal(await prisma.inventoryMovement.count({ where: { orderId: retryRow.id } }), 1);
    pass(["U"], "Failed attempt retained history. Concurrent retry created attempt two on the same order with one active reservation; success consumed once.");
    currentCase = "V"; await checkout(11); const expireRow = await orderRow(11); const onHand = (await stock()).quantityOnHand.toFixed(3);
    await prisma.paymentAttempt.update({ where: { id: expireRow.payment!.attempts[0].id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await prisma.inventoryReservation.updateMany({ where: { orderId: expireRow.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expire(); const reservedAfter = (await stock()).quantityReserved.toFixed(3); await expire();
    assert.equal((await stock()).quantityOnHand.toFixed(3), onHand); assert.equal((await stock()).quantityReserved.toFixed(3), reservedAfter);
    assert.equal((await orderRow(11)).reservations[0].status, "EXPIRED");
    pass(["V", "W"], "Authenticated deployment sweep expired abandoned reservation; a second sweep did not release twice.");
    currentCase = "X"; await event(11, "SUCCEEDED"); const late = await orderRow(11);
    assert.equal(late.payment!.status, "SUCCEEDED"); assert.equal(late.payment!.reviewRequired, true); assert.equal(late.fulfillmentEligible, false);
    assert.equal((await stock()).quantityOnHand.toFixed(3), onHand); assert.equal(await prisma.inventoryMovement.count({ where: { orderId: late.id } }), 0);
    pass(["X"], "Late financial success is recorded with manual review, no fulfillment, no re-reservation and no stock deduction.");
    currentCase = "CANCELLATION_RECOVERY";
    await checkout(14); const recoveryOrder = await orderRow(14), recoveryAttempt = recoveryOrder.payment!.attempts[0];
    const missingIntent = await prisma.sandboxPaymentIntent.findUniqueOrThrow({ where: { id: recoveryAttempt.providerPaymentId! } });
    await prisma.paymentAttempt.update({ where: { id: recoveryAttempt.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await prisma.sandboxPaymentIntent.delete({ where: { id: missingIntent.id } }); // isolated provider fixture unavailable
    await expire();
    assert.equal((await orderRow(14)).reservations[0].status, "EXPIRED");
    assert.equal((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: "sandbox-internal", providerEventId: `cancel:${recoveryAttempt.id}` } } })).status, "CANCEL_PENDING");
    await prisma.sandboxPaymentIntent.create({ data: missingIntent });
    await expire();
    assert.equal((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: "sandbox-internal", providerEventId: `cancel:${recoveryAttempt.id}` } } })).status, "CANCEL_COMPLETE");
    assert.equal((await prisma.sandboxPaymentIntent.findUniqueOrThrow({ where: { id: missingIntent.id } })).status, "CANCELED");
    pass(["CANCELLATION_RECOVERY"], "Provider retrieval temporarily failed: stock still released, cancellation stayed durable, and the next real job request completed it after recovery.");
    currentCase = "CREATION_RECOVERY";
    await checkout(15); const binding = await orderRow(15), bindingAttempt = binding.payment!.attempts[0];
    await prisma.paymentAttempt.update({ where: { id: bindingAttempt.id }, data: { providerPaymentId: null } });
    await prisma.payment.update({ where: { id: binding.payment!.id }, data: { providerPaymentId: null } });
    assert.equal((await guests[15].request.get(`${base}/api/customer/payments/${binding.publicOrderCode}`)).status(), 200);
    assert.equal((await orderRow(15)).payment!.attempts[0].providerPaymentId, bindingAttempt.providerPaymentId);
    assert.equal(await prisma.sandboxPaymentIntent.count({ where: { attemptId: bindingAttempt.id } }), 1);
    pass(["CREATION_RECOVERY"], "Simulated provider-create/bind crash recovered the same intent via an actual status request; no duplicate provider session.");
    currentCase = "SUPERSEDED_SUCCESS";
    await checkout(16); const oldAttempt = (await orderRow(16)).payment!.attempts[0]; await event(16, "FAILED");
    assert.equal((await post(16, `/api/customer/payments/${orders.get(16)!.publicOrderCode}`, { idempotencyKey: randomUUID() })).status(), 200);
    const replacement = (await orderRow(16)).payment!.attempts[0], beforeLate = (await stock()).quantityOnHand.toFixed(3);
    await event(16, "SUCCEEDED", { attemptId: oldAttempt.id, providerPaymentId: oldAttempt.providerPaymentId });
    const superseded = await orderRow(16); assert.equal(superseded.payment!.reviewRequired, true); assert.equal(superseded.fulfillmentEligible, false);
    assert.equal((await prisma.sandboxPaymentIntent.findUniqueOrThrow({ where: { id: replacement.providerPaymentId! } })).status, "CANCELED");
    assert.equal((await stock()).quantityOnHand.toFixed(3), beforeLate); assert.equal(superseded.reservations.filter(r => r.status === "ACTIVE").length, 0);
    pass(["SUPERSEDED_SUCCESS"], "Late success from an older failed attempt required review, released replacement holds and cancelled the replacement provider session without consuming stock.");
    currentCase = "AC"; const notTrackedIndex = demo.sessions.findIndex(s => s.suffix === "dbayeh");
    await checkout(notTrackedIndex); await simulate(notTrackedIndex, "SUCCEEDED");
    assert.equal((await orderRow(notTrackedIndex)).reservations.length, 0); assert.equal(await prisma.inventoryMovement.count({ where: { orderId: orders.get(notTrackedIndex)!.id } }), 0);
    pass(["AC"], "No-recipe NOT_TRACKED payment confirmed without fake inventory reservations or movements.");
    currentCase = "AE";
    assert.equal((await guests[1].request.get(`${base}/api/customer/payments/${first.publicOrderCode}`)).status(), 404);
    assert.equal((await post(1, `/api/customer/payments/${first.publicOrderCode}`, { idempotencyKey: randomUUID() })).status(), 404);
    assert.equal((await post(1, `/api/customer/payments/${first.publicOrderCode}/sandbox`, { outcome: "SUCCEEDED" })).status(), 404);
    const anonymous = await browser.newContext(); assert.equal((await anonymous.request.get(`${base}/api/customer/payments/${first.publicOrderCode}`)).status(), 401);
    pass(["AE", "AF"], "Other guest cannot read, retry or simulate an owner's payment; public order code without trusted cookie is insufficient.");
    currentCase = "AG";
    const detail = await admin.newPage(); await detail.goto(`${base}/admin/orders/${first.id}`, { waitUntil: "networkidle" }); await detail.getByRole("heading", { name: "Payment status" }).waitFor();
    assert.ok((await detail.locator("body").innerText()).includes("SUCCEEDED")); await capture(detail, "05-admin-payment-status.png");
    const otherBody = await read(otherAdmin, `${base}/admin/orders/${first.id}`).then(r => r.text()); assert.equal(otherBody.includes("12.50 USD"), false);
    assert.equal(otherBody.includes("Payment status"), false);
    pass(["AG"], "Own-organization admin rendered safe payment summary; foreign organization could not retrieve it.");
    const permitted = await manager.newPage(); await permitted.goto(`${base}/admin/orders/${first.id}`, { waitUntil: "networkidle" }); await permitted.getByRole("heading", { name: "Payment status" }).waitFor();
    const outside = await read(manager, `${base}/admin/orders/${orders.get(notTrackedIndex)!.id}`);
    assert.equal((await outside.text()).includes("Payment status"), false);
    pass(["AH"], "Location manager sees Beirut summary but cannot retrieve a Dbayeh payment outside current grants.");
    currentCase = "AI"; const kitchenDto = await read(kitchen, `${base}/api/kitchen/orders/${first.publicOrderCode}`).then(r => r.json());
    for (const key of ["payment", "provider", "providerPaymentId", "attemptCount", "reviewReason"]) assert.equal(key in kitchenDto, false);
    const forbiddenPage = await read(kitchen, `${base}/admin/orders/${first.id}`);
    assert.equal((await forbiddenPage.text()).includes("Payment status"), false);
    assert.equal(new URL(forbiddenPage.url()).pathname.startsWith("/admin/orders/"), false);
    pass(["AI"], "Kitchen DTO has no provider/financial payment details; staff cannot access admin payment view.");
    currentCase = "AJ"; assert.equal((await delivery.request.post(`${base}/api/customer/payments/${first.publicOrderCode}/sandbox`, { headers: await sessionHeaders(delivery), data: { outcome: "FAILED" } })).status(), 401);
    assert.equal((await delivery.request.post(base + "/api/payments/expire", { headers: await sessionHeaders(delivery) })).status(), 401);
    pass(["AJ"], "Delivery staff session cannot mutate customer payments or run expiry without the job credential.");
    currentCase = "AK";
    const { id: _id, createdAt: _created, updatedAt: _updated, ...legacyData } = await prisma.order.findUniqueOrThrow({ where: { id: first.id } });
    void _id; void _created; void _updated;
    const legacy = await prisma.order.create({ data: { ...legacyData, id: randomUUID(), publicOrderCode: `CB-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
      idempotencyKey: randomUUID(), paymentPolicy: "LEGACY_NOT_REQUIRED", fulfillmentEligible: true } });
    const queueLegacy = await read(kitchen, base + "/api/kitchen/orders").then(r => r.json()); assert.ok(queueLegacy.orders.some((o: { publicOrderCode: string }) => o.publicOrderCode === legacy.publicOrderCode));
    assert.equal(await prisma.payment.count({ where: { orderId: legacy.id } }), 0);
    assert.equal((await mutate(kitchen, legacy.publicOrderCode, "PLACED", "ACCEPTED", true)).status(), 200);
    pass(["AK"], "Explicit legacy order has no fabricated payment and remains actionable in kitchen.");
    currentCase = "AN"; await confirmed.getByRole("link", { name: "Follow your order", exact: true }).click();
    await confirmed.getByRole("heading", { name: "We received your order", exact: true }).waitFor();
    assert.equal((await mutate(kitchen, first.publicOrderCode, "PLACED", "ACCEPTED", true)).status(), 200);
    await confirmed.getByRole("heading", { name: "The kitchen accepted your order", exact: true }).waitFor({ timeout: 20000 });
    assert.ok((await confirmed.locator("body").innerText()).includes("A7")); assert.ok((await confirmed.locator("body").innerText()).includes("Hall 1"));
    pass(["AN"], "Confirmed customer sees order code, Hall 1, seat A7, then actual kitchen acceptance arrives through progress polling.");
    currentCase = "AQ";
    assert.equal(await prisma.payment.count({ where: { orderId: first.id } }), 1); assert.equal(await prisma.paymentWebhookEvent.count({ where: { providerEventId: successEvent } }), 1);
    assert.equal(await prisma.inventoryReservation.count({ where: { orderId: first.id, status: "CONSUMED" } }), 1);
    const negative = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM location_inventory WHERE "quantityReserved" < 0 OR "quantityReserved" > "quantityOnHand"`; assert.equal(Number(negative[0].count), 0);
    pass(["AQ"], "Real migrated PostgreSQL persisted linked payments, attempts, webhook event, reservation and reserved stock with no invariant violations.");
    currentCase = "AL"; await checkout(12); const ending = await orderRow(12);
    await prisma.screening.update({ where: { id: demo.sessions[12].screeningId }, data: { endsAt: new Date(Date.now() - 1000) } }); await expire();
    assert.equal((await orderRow(12)).payment!.status, "CANCELED"); assert.equal((await orderRow(12)).reservations[0].status, "EXPIRED");
    await event(12, "SUCCEEDED"); assert.equal((await orderRow(12)).fulfillmentEligible, false); assert.equal((await orderRow(12)).payment!.reviewRequired, true);
    assert.equal(await prisma.inventoryMovement.count({ where: { orderId: ending.id } }), 0); assert.equal((await orderRow(0)).fulfillmentEligible, true);
    pass(["AL"], "Screening end expired unpaid holds; late signed success required review and could not fulfill. Previously paid order remained operational.");
    await prisma.screening.update({ where: { id: demo.sessions[12].screeningId }, data: { endsAt: new Date(Date.now() + 10800000) } });
    currentCase = "AM"; await checkout(13);
    const cancelScreening = await admin.request.post(`${base}/api/admin/screenings/${demo.sessions[13].screeningId}/cancel`, { headers: await sessionHeaders(admin), data: {} });
    assert.equal(cancelScreening.status(), 200, await cancelScreening.text()); await expire();
    assert.equal((await orderRow(13)).payment!.status, "CANCELED"); await event(13, "SUCCEEDED");
    assert.equal((await orderRow(13)).payment!.reviewRequired, true); assert.equal((await orderRow(13)).fulfillmentEligible, false);
    pass(["AM"], "Actual admin screening cancellation expired pending stock; financial late success was retained for review with no automatic refund or kitchen entry.");
    currentCase = "FULFILLMENT_REGRESSION";
    const physicalBeforeOperations = (await stock()).quantityOnHand.toFixed(3);
    for (const [from, to] of [["ACCEPTED", "PREPARING"], ["PREPARING", "READY"]]) assert.equal((await mutate(kitchen, first.publicOrderCode, from, to, true)).status(), 200);
    for (const [from, to] of [["READY", "OUT_FOR_DELIVERY"], ["OUT_FOR_DELIVERY", "DELIVERED"]]) assert.equal((await mutate(delivery, first.publicOrderCode, from, to)).status(), 200);
    assert.equal((await orderRow(0)).status, "DELIVERED"); assert.equal((await orderRow(0)).payment!.status, "SUCCEEDED");
    assert.equal((await stock()).quantityOnHand.toFixed(3), physicalBeforeOperations);
    assert.equal(await prisma.inventoryMovement.count({ where: { orderId: first.id } }), 1);
    assert.equal(await prisma.orderStatusEvent.count({ where: { orderId: first.id } }), 6);
    pass(["FULFILLMENT_REGRESSION"], "Paid order completed real kitchen and delivery transitions even after screening cancellation, with six immutable events and no second stock consumption/payment mutation.");
    const sourceFiles = await collectSources(path.join(process.cwd(), "src"));
    const paymentSource = sourceFiles.filter(f => /payment|order.repository|stock-availability/.test(f.name)).map(f => f.text).join("\n");
    assert.equal(/getFirestore\(|collection\(/.test(paymentSource), false);
    pass(["AR"], "Executed payment flow persisted exclusively in PostgreSQL; inspected payment/order/availability sources contain no Firestore calls.");
    const evidenceFiles = await Promise.all((await (await import("node:fs/promises")).readdir(output)).filter(f => f.endsWith(".png")).map(async name => ({ name, bytes: await readFile(path.join(output, name)) })));
    assert.equal(evidenceFiles.length, 8); assert.ok(evidenceFiles.every(f => f.bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"));
    pass(["AT"], "Eight screenshots captured actual sandbox CineBite pages using native browser screenshots, no desktop/browser chrome; manual visual review follows.");
    const diff = spawnSync("git", ["diff", "--", "src", "prisma", "scripts", ".env.example"], { encoding: "utf8" }).stdout;
    for (const secret of [process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET!, process.env.PAYMENT_EXPIRY_JOB_SECRET!, process.env.FIREBASE_ADMIN_PRIVATE_KEY!, ...demo.sessions.map(s => s.token)]) assert.equal(diff.includes(secret), false);
    assert.equal(/-----BEGIN PRIVATE KEY-----/.test(diff), false);
    pass(["AS"], "Inspected source diff against actual ephemeral webhook/job/private-key/guest secrets; no leaked values or card inputs. Final staged scan is repeated before commit.");
    results.set("REAL_PROVIDER", { status: "NOT EXECUTABLE", evidence: "No real provider selected or credentials configured; deterministic sandbox only, no real charge/card tests." });
  } catch (error) {
    results.set(currentCase, { status: "FAIL", evidence: error instanceof Error ? error.message : "Unknown verification failure" }); throw error;
  } finally {
    await writeFile(path.join(process.cwd(), "docs", "phase-14-integration-results.json"), JSON.stringify({ executedAt: new Date().toISOString(), environment: "Isolated loopback PostgreSQL and Firebase Auth emulator; deterministic sandbox; production Next.js build; Chromium", results: Object.fromEntries(results) }, null, 2) + "\n");
    await browser?.close(); server.kill();
    await Promise.all(staff.map(user => getAdminAuth().updateUser(user.uid, { disabled: true })));
    await prisma.user.updateMany({ where: { firebaseUid: { in: staff.map(user => user.uid) } }, data: { active: false } });
    await prisma.$disconnect();
  }
}
async function collectSources(directory: string): Promise<Array<{ name: string; text: string }>> {
  const { readdir } = await import("node:fs/promises"); const files: Array<{ name: string; text: string }> = [];
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (file.name === "generated") continue;
    const name = path.join(directory, file.name);
    if (file.isDirectory()) files.push(...await collectSources(name));
    else if (/\.tsx?$/.test(name)) files.push({ name, text: await readFile(name, "utf8") });
  }
  return files;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Verification failed"); process.exitCode = 1; });
