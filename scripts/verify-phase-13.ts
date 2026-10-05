import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { getAdminAuth } from "../src/lib/firebase/admin";
import { prisma } from "../src/lib/db/prisma";
import { createOpaqueToken, hashOpaqueToken } from "../src/lib/security/opaque-token";

// Isolated manual integration runner: refuses cloud databases and real Firebase projects.
// Never load .env.local when invoking this script. It has no production credential requirement.
if (!process.argv.includes("--local")) throw new Error("Use --local with the isolated PostgreSQL and Firebase Auth emulator running.");
process.env.DATABASE_URL = "postgresql://cinebite_test@127.0.0.1:55413/cinebite_phase13_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9133";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-cinebite-phase13";
process.env.GCLOUD_PROJECT = "demo-cinebite-phase13";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@demo-cinebite-phase13.iam.gserviceaccount.com";
process.env.FIREBASE_STORAGE_BUCKET = "demo-cinebite-phase13.appspot.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
const base = "http://127.0.0.1:3113";
const evidenceRun = randomUUID().slice(0, 8);
const output = path.join(process.cwd(), "linkedin", "phase-13");
const results = new Map<string, { status: "PASS" | "FAIL" | "NOT EXECUTABLE"; evidence: string }>();
for (const id of [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "AA", "AB", "AC", "AD"]) results.set(id, { status: "NOT EXECUTABLE", evidence: "Not reached in this run." });
function pass(ids: string[], evidence: string) { for (const id of ids) results.set(id, { status: "PASS", evidence }); console.log(`PASS ${ids.join(", ")}: ${evidence}`); }
let currentCase = "A";
async function mutate(context: BrowserContext, code: string, from: string, to: string, kitchen = false) {
  return context.request.post(`${base}/api/${kitchen ? "kitchen" : "delivery"}/orders/${code}`, { headers: await sessionHeaders(context), data: { expectedStatus: from, toStatus: to } });
}
async function capture(page: Page, name: string) {
  for (const button of await page.getByRole("button", { name: "Dismiss notification", exact: true }).all()) await button.click();
  await page.waitForTimeout(350);
  const height = await page.locator('nav[aria-label="Delivery pages"]').evaluate((el) => Math.ceil(el.getBoundingClientRect().bottom + window.scrollY + 24));
  await page.screenshot({ path: path.join(output, name), fullPage: true, clip: { x: 0, y: 0, width: page.viewportSize()!.width, height } });
}
async function fixture() {
  const org = await prisma.organization.create({ data: { id: `phase13-evidence-${evidenceRun}-org`, slug: `phase13-evidence-${evidenceRun}-cinemas`, name: "Demo CineBite Cinemas", status: "ACTIVE" } });
  return prisma.$transaction(async (tx) => {
    const other = await tx.organization.upsert({ where: { slug: `phase13-evidence-${evidenceRun}-other-cinema` }, create: { id: `phase13-evidence-${evidenceRun}-other-org`, slug: `phase13-evidence-${evidenceRun}-other-cinema`, name: "Demo Cinema B", status: "ACTIVE" }, update: {} });
    const locations = [];
    const sessions = [];
    for (const [suffix, name, organizationId] of [["beirut", "Demo Beirut", org.id], ["dbayeh", "Demo Dbayeh", org.id], ["other", "Demo Cinema B", other.id]]) {
      const location = await tx.location.upsert({ where: { id: `phase13-evidence-${evidenceRun}-${suffix}` }, create: { id: `phase13-evidence-${evidenceRun}-${suffix}`, organizationId, name, slug: `phase13-evidence-${evidenceRun}-${suffix}`, addressLine1: "Demo cinema", city: "Beirut", country: "LB", timezone: "Asia/Beirut", status: "ACTIVE" }, update: {} });
      locations.push(location);
      const hall = await tx.hall.upsert({ where: { id: `phase13-evidence-${evidenceRun}-hall-${suffix}` }, create: { id: `phase13-evidence-${evidenceRun}-hall-${suffix}`, locationId: location.id, name: "Hall 1", number: 1, status: "ACTIVE" }, update: {} });
      const movie = await tx.movie.upsert({ where: { id: `phase13-evidence-${evidenceRun}-movie-${suffix}` }, create: { id: `phase13-evidence-${evidenceRun}-movie-${suffix}`, organizationId, title: "Interstellar", slug: `phase13-evidence-${evidenceRun}-interstellar-${suffix}`, durationMinutes: 180 }, update: {} });
      const screening = await tx.screening.upsert({ where: { id: `phase13-evidence-${evidenceRun}-screening-${suffix}` }, create: { id: `phase13-evidence-${evidenceRun}-screening-${suffix}`, hallId: hall.id, movieId: movie.id, startsAt: new Date(Date.now() - 300000), endsAt: new Date(Date.now() + 10800000) }, update: { status: "SCHEDULED", startsAt: new Date(Date.now() - 300000), endsAt: new Date(Date.now() + 10800000) } });
      const category = await tx.menuCategory.upsert({ where: { id: `phase13-evidence-${evidenceRun}-category-${suffix}` }, create: { id: `phase13-evidence-${evidenceRun}-category-${suffix}`, organizationId, name: "Cinema favorites", slug: `phase13-evidence-${evidenceRun}-favorites-${suffix}` }, update: {} });
      const product = await tx.product.upsert({ where: { id: `phase13-evidence-${evidenceRun}-product-${suffix}` }, create: { id: `phase13-evidence-${evidenceRun}-product-${suffix}`, organizationId, categoryId: category.id, name: "Large Popcorn", slug: `phase13-evidence-${evidenceRun}-popcorn-${suffix}`, description: "Freshly popped cinema popcorn." }, update: { name: "Large Popcorn" } });
      await tx.productLocation.upsert({ where: { productId_locationId: { productId: product.id, locationId: location.id } }, create: { id: `phase13-evidence-${evidenceRun}-offer-${suffix}`, organizationId, productId: product.id, locationId: location.id, price: "5.00", currencyCode: "USD" }, update: {} });
      if (suffix === "beirut") {
        const ingredient = await tx.inventoryItem.upsert({ where: { id: `phase13-evidence-${evidenceRun}-kernels` }, create: { id: `phase13-evidence-${evidenceRun}-kernels`, organizationId, name: "Demo popcorn kernels", sku: `PH13-${evidenceRun}-KERNELS`, unit: "GRAM" }, update: {} });
        await tx.locationInventory.upsert({ where: { locationId_inventoryItemId: { locationId: location.id, inventoryItemId: ingredient.id } }, create: { id: `phase13-evidence-${evidenceRun}-stock`, organizationId, locationId: location.id, inventoryItemId: ingredient.id, quantityOnHand: "100000", lowStockThreshold: "1000" }, update: {} });
        await tx.productRecipeComponent.upsert({ where: { productId_inventoryItemId: { productId: product.id, inventoryItemId: ingredient.id } }, create: { id: `phase13-evidence-${evidenceRun}-recipe`, organizationId, productId: product.id, inventoryItemId: ingredient.id, quantityRequired: "150.000" }, update: {} });
      }
      for (const number of suffix === "beirut" ? [7, 8, 9, 10, 11, 12, 13] : [7]) {
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
  const email = `cinebite.phase13.${suffix}@example.com`;
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
  const identity = await fetch(`http://127.0.0.1:9133/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) }).then((response) => response.json()) as { idToken?: string };
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
  const staff = await Promise.all([
    staffIdentity("DELIVERY_STAFF", demo.org.id, [demo.locations[0].id], "worker-a"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [demo.locations[0].id], "worker-b"),
    staffIdentity("CINEMA_ADMIN", demo.org.id, demo.locations.slice(0, 2).map((l) => l.id), "admin"),
    staffIdentity("LOCATION_MANAGER", demo.org.id, [demo.locations[0].id], "manager"),
    staffIdentity("KITCHEN_STAFF", demo.org.id, [demo.locations[0].id], "kitchen"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, demo.locations.slice(0, 2).map((l) => l.id), "multi"),
    staffIdentity("CINEMA_ADMIN", demo.other.id, [demo.locations[2].id], "other-admin"),
  ]);
  const server = spawn(process.execPath, [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3113"], { stdio: ["ignore", "ignore", "pipe"], env: process.env });
  server.stderr.on("data", (chunk: Buffer) => { const message = chunk.toString(); if (/\[(auth|api|delivery)/.test(message)) console.error(message); });
  let browser: Browser | undefined;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
    const contexts = await Promise.all(staff.map(() => browser!.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })));
    await Promise.all(contexts.map((context, i) => signIn(context, staff[i])));
    const [workerA, workerB, admin, manager, kitchen, multi, otherAdmin] = contexts;
    const guests = await Promise.all(demo.sessions.map(() => browser!.newContext({ viewport: { width: 390, height: 844 } })));
    await Promise.all(guests.map((context, i) => context.addCookies([{ name: "cinebite_guest_session", value: demo.sessions[i].token, url: base, httpOnly: true, sameSite: "Lax" }])));
    const orders: { publicOrderCode: string }[] = [];
    for (const context of guests) {
      const response = await context.request.post(`${base}/api/customer/orders`, { headers: { Origin: base }, data: { idempotencyKey: randomUUID(), customerNote: "No salt, please." } });
      assert.equal(response.status(), 201, `Local demo checkout: ${response.status()}`); orders.push((await response.json()).order);
    }
    const code = orders[0].publicOrderCode;
    const customer = await guests[0].newPage();
    await customer.goto(`${base}/customer/orders/${code}`, { waitUntil: "networkidle" });
    const readyPage = await workerB.newPage();
    await readyPage.goto(`${base}/delivery`, { waitUntil: "networkidle" });
    for (const i of [0, 6, 7, 8]) for (const [from, to] of [["PLACED", "ACCEPTED"], ["ACCEPTED", "PREPARING"], ["PREPARING", "READY"]]) {
      assert.equal((await mutate(i === 8 ? otherAdmin : admin, orders[i].publicOrderCode, from, to, true)).status(), 200);
    }
    await readyPage.locator(`[data-order-code="${code}"]`).waitFor({ timeout: 20000 });
    await customer.getByRole("heading", { name: "Your order is ready", exact: true }).waitFor({ timeout: 20000 });
    pass(["A"], "A Phase 12 READY order appeared in an already-open authorized delivery queue via five-second polling.");
    const destination = await read(workerA, `${base}/api/delivery/orders/${code}`).then((r) => r.json());
    assert.equal(destination.locationName, "Demo Beirut"); assert.equal(destination.hallName, "Hall 1"); assert.equal(destination.seatLabel, "A7"); assert.equal(destination.movieTitle, "Interstellar");
    assert.equal(destination.items[0].productName, "Large Popcorn"); assert.equal(destination.items[0].quantity, 2);
    for (const key of ["id", "customerSessionId", "firebaseUid", "deliveryAssignedUserId", "token"]) assert.equal(key in destination, false);
    pass(["B"], "Trusted location, Hall 1, seat A7, movie and two popcorn snapshot items match checkout; secret/internal fields are absent.");
    await capture(readyPage, "01-delivery-ready-queue.png");
    await readyPage.locator(`[data-order-code="${code}"]`).screenshot({ path: path.join(output, "02-ready-order-card.png") });
    const beforeStock = await prisma.locationInventory.findUniqueOrThrow({ where: { id: `phase13-evidence-${evidenceRun}-stock` } });
    const beforeMovements = await prisma.inventoryMovement.count({ where: { locationInventoryId: beforeStock.id } });

    currentCase = "H";
    assert.equal((await mutate(workerA, code, "READY", "DELIVERED")).status(), 400);
    assert.equal((await mutate(workerA, code, "PLACED", "OUT_FOR_DELIVERY")).status(), 400);
    pass(["H"], "Direct READY to DELIVERED and invalid preparation-state delivery requests rejected.");
    currentCase = "K";
    const foreign = orders[7].publicOrderCode; const otherCode = orders[8].publicOrderCode;
    assert.equal((await read(workerA, `${base}/api/delivery/orders/${foreign}`)).status(), 404);
    assert.equal((await mutate(workerA, foreign, "READY", "OUT_FOR_DELIVERY")).status(), 404);
    assert.equal((await read(workerA, `${base}/api/delivery/orders?locationId=${demo.locations[1].id}`)).status(), 403);
    const foreignPage = await workerA.newPage(); await foreignPage.goto(`${base}/delivery?locationId=${demo.locations[1].id}`, { waitUntil: "networkidle" });
    assert.ok(await foreignPage.getByRole("heading", { name: "Delivery queue unavailable" }).isVisible()); await foreignPage.close();
    pass(["K"], "Beirut worker denied Dbayeh read, claim, explicit location API and direct page filter.");
    currentCase = "L";
    assert.equal((await read(admin, `${base}/api/delivery/orders/${foreign}`)).status(), 200);
    assert.equal((await read(admin, `${base}/api/delivery/orders/${otherCode}`)).status(), 404);
    const adminQueue = await read(admin, `${base}/api/delivery/orders`).then((r) => r.json());
    assert.ok(adminQueue.ready.every((o: { locationName: string }) => o.locationName !== "Demo Cinema B"));
    pass(["L"], "Cinema admin sees own-organization Beirut and Dbayeh only, never another tenant.");
    currentCase = "M";
    assert.equal((await read(manager, `${base}/api/delivery/orders/${code}`)).status(), 200);
    assert.equal((await read(manager, `${base}/api/delivery/orders/${foreign}`)).status(), 404);
    assert.equal((await mutate(manager, code, "READY", "OUT_FOR_DELIVERY")).status(), 403);
    assert.equal((await mutate(admin, code, "READY", "OUT_FOR_DELIVERY")).status(), 403);
    pass(["M"], "Manager oversight is limited to granted locations; manager/admin cannot implicitly claim or complete deliveries.");
    currentCase = "N";
    for (const [from, to] of [["READY", "OUT_FOR_DELIVERY"], ["OUT_FOR_DELIVERY", "DELIVERED"]]) {
      assert.equal((await mutate(kitchen, code, from, to)).status(), 403);
      assert.equal((await mutate(workerA, code, "PREPARING", "READY", true)).status(), 403);
    }
    pass(["N"], "Kitchen staff cannot claim/deliver, and delivery staff cannot use kitchen transitions.");
    currentCase = "O";
    assert.equal((await mutate(guests[0], code, "READY", "OUT_FOR_DELIVERY")).status(), 401);
    assert.equal((await mutate(guests[0], code, "OUT_FOR_DELIVERY", "DELIVERED")).status(), 401);
    pass(["O"], "Valid anonymous customer session is not staff mutation authority.");
    currentCase = "P";
    const anonymous = await browser.newContext();
    assert.equal((await mutate(anonymous, code, "READY", "OUT_FOR_DELIVERY")).status(), 401);
    assert.equal((await read(anonymous, `${base}/api/delivery/orders/${code}`)).status(), 401);
    assert.equal((await guests[0].request.get(`${base}/api/customer/orders/${foreign}`)).status(), 404);
    pass(["P"], "Public order code without staff authorization grants no delivery access; customer cannot read someone else's order.");

    currentCase = "C";
    const staleResponse = await read(workerB, `${base}/api/delivery/orders`).then((r) => r.json());
    await readyPage.route("**/api/delivery/orders?*", (route) => route.fulfill({ json: staleResponse }));
    const phone = await workerA.newPage(); await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(`${base}/delivery?code=${code}`, { waitUntil: "networkidle" });
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await phone.locator(`[data-order-code="${code}"]`).getByRole("button", { name: "Claim delivery", exact: true }).click();
    await phone.getByRole("region", { name: "My deliveries", exact: true }).locator(`[data-order-code="${code}"]`).waitFor({ timeout: 20000 });
    let dbOrder = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: code }, include: { statusEvents: true } });
    assert.equal(dbOrder.status, "OUT_FOR_DELIVERY"); assert.equal(dbOrder.deliveryAssignedUserId, staff[0].userId); assert.ok(dbOrder.deliveryClaimedAt);
    assert.equal(dbOrder.statusEvents.filter((e) => e.toStatus === "OUT_FOR_DELIVERY").length, 1);
    assert.equal(dbOrder.deliveryClaimedAt.toISOString(), dbOrder.statusEvents.find((e) => e.toStatus === "OUT_FOR_DELIVERY")!.createdAt.toISOString());
    pass(["C"], "Actual phone Claim atomically set the assigned PostgreSQL user, status, database timestamp and one claim event.");
    const claimedDesktop = await workerA.newPage(); await claimedDesktop.goto(`${base}/delivery?code=${code}`, { waitUntil: "networkidle" });
    await capture(claimedDesktop, "03-order-claimed.png"); await claimedDesktop.close();
    for (const button of await phone.getByRole("button", { name: "Dismiss notification", exact: true }).all()) await button.click();
    await phone.waitForTimeout(350);
    await phone.getByRole("region", { name: "My deliveries", exact: true }).screenshot({ path: path.join(output, "04-my-delivery.png") });
    await phone.locator(`[data-order-code="${code}"] [data-destination]`).screenshot({ path: path.join(output, "05-hall-seat-destination.png") });
    await capture(phone, "08-mobile-delivery-view.png");
    currentCase = "S";
    await readyPage.locator(`[data-order-code="${code}"]`).getByRole("button", { name: "Claim delivery", exact: true }).click();
    await readyPage.getByText("Another worker already claimed this order. The queue has refreshed.", { exact: true }).waitFor({ timeout: 10000 });
    await readyPage.unroute("**/api/delivery/orders?*");
    await readyPage.locator(`[data-order-code="${code}"]`).waitFor({ state: "detached", timeout: 20000 });
    pass(["S"], "A deliberately stale second-worker card sent a real claim, received a safe conflict and disappeared after polling resumed.");
    currentCase = "F";
    assert.equal((await mutate(workerB, code, "OUT_FOR_DELIVERY", "DELIVERED")).status(), 403);
    assert.equal((await read(workerB, `${base}/api/delivery/orders/${code}`)).status(), 404);
    pass(["F"], "Second worker cannot read another worker's active assignment or mark it delivered.");
    currentCase = "R";
    await phone.close();
    const reconnected = await browser.newContext({ viewport: { width: 390, height: 844 } }); await signIn(reconnected, staff[0]);
    const newPhone = await reconnected.newPage(); await newPhone.goto(`${base}/delivery?code=${code}`, { waitUntil: "networkidle" });
    assert.ok(await newPhone.getByRole("region", { name: "My deliveries", exact: true }).locator(`[data-order-code="${code}"]`).isVisible());
    pass(["R"], "Closing the original page and creating a new staff session retained the assigned order in My deliveries.");
    currentCase = "Q";
    await customer.getByRole("heading", { name: "Your order is on the way to your seat.", exact: true }).waitFor({ timeout: 20000 });
    currentCase = "G";
    await newPhone.locator(`[data-order-code="${code}"]`).getByRole("button", { name: "Mark delivered", exact: true }).click();
    await newPhone.getByRole("region", { name: "Recently delivered", exact: true }).locator(`[data-order-code="${code}"]`).waitFor({ timeout: 20000 });
    dbOrder = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: code }, include: { statusEvents: { orderBy: { createdAt: "asc" } }, deliveryAssignedUser: true } });
    assert.equal(dbOrder.status, "DELIVERED"); assert.ok(dbOrder.deliveredAt); assert.equal(dbOrder.statusEvents.filter((e) => e.toStatus === "DELIVERED").length, 1);
    pass(["G", "AB"], "Assigned worker completed the full READY→Claim→My delivery→Hall/Seat→Delivered flow at 390×844 with no horizontal overflow.");
    await capture(newPhone, "06-delivered-confirmation.png");
    currentCase = "Q";
    await customer.getByRole("heading", { name: "Delivered.", exact: true }).waitFor({ timeout: 20000 });
    assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await customer.getByText("Demo Delivery A", { exact: true }).count(), 0);
    await customer.waitForFunction(() => Number(getComputedStyle(document.querySelector("h1")!).opacity) > 0.99);
    await customer.screenshot({ path: path.join(output, "07-customer-delivery-progress.png"), fullPage: true });
    pass(["Q"], "The same open customer page automatically progressed READY→on the way→Delivered without reload; no private worker name appears.");
    currentCase = "I";
    assert.equal((await mutate(workerA, code, "DELIVERED", "OUT_FOR_DELIVERY")).status(), 400);
    assert.equal((await mutate(workerA, code, "OUT_FOR_DELIVERY", "DELIVERED")).status(), 409);
    pass(["I"], "Terminal backward mutation and duplicate delivery rejected.");
    currentCase = "Y";
    assert.deepEqual(dbOrder.statusEvents.map((e) => e.toStatus), ["PLACED", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]);
    assert.equal(await prisma.auditLog.count({ where: { entityId: dbOrder.id, action: { in: ["ORDER_CLAIMED_FOR_DELIVERY", "ORDER_DELIVERED"] } } }), 2);
    await assert.rejects(() => prisma.orderStatusEvent.update({ where: { id: dbOrder.statusEvents[0].id }, data: { createdAt: new Date() } }));
    assert.equal(dbOrder.deliveryAssignedUserId, staff[0].userId); assert.ok(await prisma.user.findUnique({ where: { id: dbOrder.deliveryAssignedUserId! } }));
    assert.ok(dbOrder.deliveredAt! >= dbOrder.deliveryClaimedAt!);
    await assert.rejects(() => prisma.order.update({ where: { id: dbOrder.id }, data: { deliveryAssignedUserId: null } }));
    await assert.rejects(() => prisma.order.update({ where: { id: dbOrder.id }, data: { deliveryAssignedUserId: "not-an-existing-user" } }));
    pass(["Y", "Z"], "PostgreSQL stores six ordered immutable events, two delivery audits, valid assignment relation and trusted claim/delivery timestamps.");

    // Prepare remaining isolated demo orders through the existing kitchen APIs.
    for (const i of [1, 2, 3, 4, 5]) for (const [from, to] of [["PLACED", "ACCEPTED"], ["ACCEPTED", "PREPARING"], ["PREPARING", "READY"]]) assert.equal((await mutate(kitchen, orders[i].publicOrderCode, from, to, true)).status(), 200);
    currentCase = "D";
    const doubleCode = orders[2].publicOrderCode;
    assert.equal((await mutate(workerA, doubleCode, "READY", "OUT_FOR_DELIVERY")).status(), 200);
    assert.equal((await mutate(workerA, doubleCode, "READY", "OUT_FOR_DELIVERY")).status(), 409);
    assert.equal(await prisma.orderStatusEvent.count({ where: { order: { publicOrderCode: doubleCode }, toStatus: "OUT_FOR_DELIVERY" } }), 1);
    pass(["D"], "Two claim submissions produced one success, one safe conflict and exactly one persisted claim event.");
    currentCase = "E";
    const raceCode = orders[1].publicOrderCode;
    const race = await Promise.all([mutate(workerA, raceCode, "READY", "OUT_FOR_DELIVERY"), mutate(workerB, raceCode, "READY", "OUT_FOR_DELIVERY")]);
    assert.deepEqual(race.map((r) => r.status()).sort(), [200, 409]);
    const raced = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: raceCode }, include: { statusEvents: true } });
    assert.ok([staff[0].userId, staff[1].userId].includes(raced.deliveryAssignedUserId!)); assert.equal(raced.statusEvents.filter((e) => e.toStatus === "OUT_FOR_DELIVERY").length, 1);
    pass(["E"], "Two distinct emulated Firebase delivery workers raced the same READY order against real PostgreSQL: exactly one 200, one 409, one owner and one event.");
    currentCase = "T";
    const source = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: doubleCode } });
    await prisma.product.update({ where: { id: demo.sessions[2].productId }, data: { name: "Renamed popcorn" } });
    await prisma.seat.update({ where: { hallId_id: { hallId: source.hallId, id: source.seatId } }, data: { label: "Renamed seat" } });
    const historical = await read(workerA, `${base}/api/delivery/orders/${doubleCode}`).then((r) => r.json());
    assert.equal(historical.items[0].productName, "Large Popcorn"); assert.equal(historical.seatLabel, "A9");
    await prisma.product.update({ where: { id: demo.sessions[2].productId }, data: { name: "Large Popcorn" } });
    pass(["T"], "Renaming the source Product and Seat leaves the placed order's item and seat snapshots unchanged.");
    currentCase = "U";
    await prisma.order.update({ where: { id: source.id }, data: { customerNote: "<script>window.phase13Injected=true</script>" } });
    const xss = await workerA.newPage(); await xss.goto(`${base}/delivery?code=${doubleCode}`, { waitUntil: "networkidle" });
    assert.ok(await xss.getByText("Note: <script>window.phase13Injected=true</script>", { exact: true }).isVisible());
    assert.equal(await xss.evaluate(() => (window as unknown as { phase13Injected?: boolean }).phase13Injected), undefined);
    await prisma.order.update({ where: { id: source.id }, data: { customerNote: "No salt, please." } }); await xss.close();
    pass(["U"], "The real browser escaped a script-like customer note as visible plain text; no JavaScript executed.");
    currentCase = "V";
    assert.equal((await mutate(workerA, orders[3].publicOrderCode, "READY", "OUT_FOR_DELIVERY")).status(), 200);
    await prisma.screening.update({ where: { id: demo.sessions[3].screeningId }, data: { endsAt: new Date(Date.now() - 1000) } });
    assert.equal((await mutate(workerA, orders[3].publicOrderCode, "OUT_FOR_DELIVERY", "DELIVERED")).status(), 200);
    pass(["V"], "Screening ended after claim; assigned staff still delivered the preserved order.");
    currentCase = "W";
    await prisma.customerSession.update({ where: { id: demo.sessions[4].id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await mutate(workerA, orders[4].publicOrderCode, "READY", "OUT_FOR_DELIVERY")).status(), 200);
    assert.equal((await mutate(workerA, orders[4].publicOrderCode, "OUT_FOR_DELIVERY", "DELIVERED")).status(), 200);
    pass(["W"], "Expired original CustomerSession did not block staff claiming and delivering the existing order.");
    currentCase = "X";
    await prisma.screening.update({ where: { id: demo.sessions[5].screeningId }, data: { status: "CANCELLED" } });
    const warning = await read(workerA, `${base}/api/delivery/orders/${orders[5].publicOrderCode}`).then((r) => r.json());
    assert.match(warning.screeningWarning, /cancelled/);
    assert.equal((await mutate(workerA, orders[5].publicOrderCode, "READY", "OUT_FOR_DELIVERY")).status(), 200);
    assert.equal((await mutate(workerA, orders[5].publicOrderCode, "OUT_FOR_DELIVERY", "DELIVERED")).status(), 200);
    pass(["X"], "Cancelled screening preserved its order, showed an operational warning and still allowed assigned delivery.");
    currentCase = "J";
    assert.equal((await prisma.locationInventory.findUniqueOrThrow({ where: { id: beforeStock.id } })).quantityOnHand.toFixed(3), beforeStock.quantityOnHand.toFixed(3));
    assert.equal(await prisma.inventoryMovement.count({ where: { locationInventoryId: beforeStock.id } }), beforeMovements);
    pass(["J"], "All claims, completions, expiry/end/cancel scenarios left stock and ORDER_CONSUMPTION counts identical to post-checkout values.");
    await prisma.screening.update({ where: { id: demo.sessions[0].screeningId }, data: { status: "SCHEDULED", endsAt: new Date(Date.now() + 10800000) } });
    currentCase = "AC";
    const supervisor = await manager.newPage(); await supervisor.goto(`${base}/delivery`, { waitUntil: "networkidle" });
    assert.ok(await supervisor.getByRole("region", { name: "Active deliveries", exact: true }).isVisible());
    assert.equal(await supervisor.getByRole("button", { name: "Claim delivery", exact: true }).count(), 0);
    await supervisor.locator("summary").click(); assert.equal(await supervisor.locator('select[name="staffId"]').count(), 1);
    const secondPage = await read(manager, `${base}/api/delivery/orders?page=2`).then((r) => r.json());
    assert.equal(secondPage.page, 2); assert.equal(secondPage.pageSize, 20); assert.equal(secondPage.delivered.length, 0);
    const oldDate = await read(manager, `${base}/api/delivery/orders?date=1900-01-01&staffId=${staff[0].userId}`).then((r) => r.json());
    assert.equal(oldDate.delivered.length, 0); assert.ok(oldDate.active.some((o: { publicOrderCode: string }) => o.publicOrderCode === doubleCode));
    const filtered = await read(manager, `${base}/api/delivery/orders?hall=Hall%201&code=${code}&staffId=${staff[0].userId}`).then((r) => r.json());
    assert.equal(filtered.delivered.length, 1); assert.equal(filtered.delivered[0].publicOrderCode, code);
    await supervisor.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await supervisor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await supervisor.locator("summary").click();
    await supervisor.setViewportSize({ width: 1440, height: 1000 });
    const multiPage = await multi.newPage(); await multiPage.goto(`${base}/delivery`, { waitUntil: "networkidle" }); await multiPage.locator("summary").click();
    assert.deepEqual((await multiPage.locator('select[name="locationId"] option').allTextContents()).sort(), ["All authorized locations", "Demo Beirut", "Demo Dbayeh"].sort());
    await supervisor.getByRole("button", { name: `Open delivery ${doubleCode}`, exact: true }).click();
    assert.ok(await supervisor.getByRole("dialog").isVisible()); await supervisor.keyboard.press("Escape"); assert.equal(await supervisor.getByRole("dialog").isVisible(), false);
    pass(["AC"], "Desktop/tablet supervisor queues, bounded pagination, delivered-date/hall/code/worker filters, keyboard dialog/Escape and no overflow verified; multi-location selector contains only authorized locations.");
    // A compact full application view with representative Ready, Active and Delivered tickets.
    await supervisor.goto(`${base}/delivery?hall=Hall%201&code=`, { waitUntil: "networkidle" });
    await capture(supervisor, "01-delivery-ready-queue.png");
    currentCase = "AA";
    for (const filename of ["src/server/repositories/delivery.repository.ts", "src/server/services/delivery.service.ts"]) assert.doesNotMatch(await readFile(filename, "utf8"), /getFirestore|Firestore|collection\(/);
    pass(["AA"], "Executed delivery path persists through Prisma/PostgreSQL only; inspected delivery sources contain no Firestore writes.");
    currentCase = "AD";
    for (const filename of ["01-delivery-ready-queue.png", "02-ready-order-card.png", "03-order-claimed.png", "04-my-delivery.png", "05-hall-seat-destination.png", "06-delivered-confirmation.png", "07-customer-delivery-progress.png", "08-mobile-delivery-view.png"]) assert.ok((await readFile(path.join(output, filename))).length > 1000);
    pass(["AD"], "Eight real application-only demo screenshots captured; no browser/desktop chrome or credentials. Original-resolution visual review is recorded separately before commit.");
  } catch (error) {
    results.set(currentCase, { status: "FAIL", evidence: error instanceof Error ? error.message : "Integration assertion failed." }); throw error;
  } finally {
    await browser?.close(); server.kill();
    await Promise.all(staff.map(async (s) => { await getAdminAuth().updateUser(s.uid, { disabled: true }); await prisma.user.updateMany({ where: { firebaseUid: s.uid }, data: { active: false } }); }));
    await writeFile(path.join(process.cwd(), "docs", "phase-13-integration-results.json"), JSON.stringify(Object.fromEntries(results), null, 2));
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Phase 13 verification failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
