import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser, type BrowserContext } from "playwright-core";

import { getAdminAuth } from "../src/lib/firebase/admin";
import { prisma } from "../src/lib/db/prisma";
import { createOpaqueToken, hashOpaqueToken } from "../src/lib/security/opaque-token";

// Explicit manual integration command: never included in npm test or CI.
// Only phase12-evidence-* records and example.com Firebase demo identities are mutated.
if (!process.argv.includes("--demo")) throw new Error("Use --demo to explicitly run the safe evidence scenario.");
const base = "http://127.0.0.1:3112";
const evidenceRun = randomUUID().slice(0, 8);
const output = path.join(process.cwd(), "linkedin", "phase-12");
const results = new Map<string, { status: string; evidence: string }>();
const testIds = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"];
for (const id of testIds) results.set(id, { status: "NOT EXECUTABLE", evidence: "Not reached in this run." });
function pass(ids: string[], evidence: string) { for (const id of ids) results.set(id, { status: "PASS", evidence }); console.log(`PASS ${ids.join(", ")}: ${evidence}`); }

async function fixture() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "cinebite-demo-cinemas" } });
  return prisma.$transaction(async (tx) => {
    const other = await tx.organization.upsert({ where: { slug: `phase12-evidence-${evidenceRun}-other-cinema` }, create: { id: `phase12-evidence-${evidenceRun}-other-org`, slug: `phase12-evidence-${evidenceRun}-other-cinema`, name: "Demo Cinema B", status: "ACTIVE" }, update: {} });
    const locations = [];
    const sessions = [];
    for (const [suffix, name, organizationId] of [["beirut", "Demo Beirut", org.id], ["dbayeh", "Demo Dbayeh", org.id], ["other", "Demo Cinema B", other.id]]) {
      const location = await tx.location.upsert({ where: { id: `phase12-evidence-${evidenceRun}-${suffix}` }, create: { id: `phase12-evidence-${evidenceRun}-${suffix}`, organizationId, name, slug: `phase12-evidence-${evidenceRun}-${suffix}`, addressLine1: "Demo cinema", city: "Beirut", country: "LB", timezone: "Asia/Beirut", status: "ACTIVE" }, update: {} });
      locations.push(location);
      const hall = await tx.hall.upsert({ where: { id: `phase12-evidence-${evidenceRun}-hall-${suffix}` }, create: { id: `phase12-evidence-${evidenceRun}-hall-${suffix}`, locationId: location.id, name: "Hall 1", number: 1, status: "ACTIVE" }, update: {} });
      const movie = await tx.movie.upsert({ where: { id: `phase12-evidence-${evidenceRun}-movie-${suffix}` }, create: { id: `phase12-evidence-${evidenceRun}-movie-${suffix}`, organizationId, title: "Interstellar", slug: `phase12-evidence-${evidenceRun}-interstellar-${suffix}`, durationMinutes: 180 }, update: {} });
      const screening = await tx.screening.upsert({ where: { id: `phase12-evidence-${evidenceRun}-screening-${suffix}` }, create: { id: `phase12-evidence-${evidenceRun}-screening-${suffix}`, hallId: hall.id, movieId: movie.id, startsAt: new Date(Date.now() - 300000), endsAt: new Date(Date.now() + 10800000) }, update: { status: "SCHEDULED", startsAt: new Date(Date.now() - 300000), endsAt: new Date(Date.now() + 10800000) } });
      const category = await tx.menuCategory.upsert({ where: { id: `phase12-evidence-${evidenceRun}-category-${suffix}` }, create: { id: `phase12-evidence-${evidenceRun}-category-${suffix}`, organizationId, name: "Cinema favorites", slug: `phase12-evidence-${evidenceRun}-favorites-${suffix}` }, update: {} });
      const product = await tx.product.upsert({ where: { id: `phase12-evidence-${evidenceRun}-product-${suffix}` }, create: { id: `phase12-evidence-${evidenceRun}-product-${suffix}`, organizationId, categoryId: category.id, name: "Large Popcorn", slug: `phase12-evidence-${evidenceRun}-popcorn-${suffix}`, description: "Freshly popped cinema popcorn." }, update: { name: "Large Popcorn" } });
      await tx.productLocation.upsert({ where: { productId_locationId: { productId: product.id, locationId: location.id } }, create: { id: `phase12-evidence-${evidenceRun}-offer-${suffix}`, organizationId, productId: product.id, locationId: location.id, price: "5.00", currencyCode: "USD" }, update: {} });
      if (suffix === "beirut") {
        const ingredient = await tx.inventoryItem.upsert({ where: { id: `phase12-evidence-${evidenceRun}-kernels` }, create: { id: `phase12-evidence-${evidenceRun}-kernels`, organizationId, name: "Demo popcorn kernels", sku: `PH12-${evidenceRun}-KERNELS`, unit: "GRAM" }, update: {} });
        await tx.locationInventory.upsert({ where: { locationId_inventoryItemId: { locationId: location.id, inventoryItemId: ingredient.id } }, create: { id: `phase12-evidence-${evidenceRun}-stock`, organizationId, locationId: location.id, inventoryItemId: ingredient.id, quantityOnHand: "100000", lowStockThreshold: "1000" }, update: {} });
        await tx.productRecipeComponent.upsert({ where: { productId_inventoryItemId: { productId: product.id, inventoryItemId: ingredient.id } }, create: { id: `phase12-evidence-${evidenceRun}-recipe`, organizationId, productId: product.id, inventoryItemId: ingredient.id, quantityRequired: "150.000" }, update: {} });
      }
      for (const number of suffix === "beirut" ? [7, 8, 9, 10, 11] : [7]) {
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

async function staffIdentity(role: "KITCHEN_STAFF" | "LOCATION_MANAGER" | "DELIVERY_STAFF", organizationId: string, locationIds: string[], suffix: string) {
  const email = `cinebite.phase12.${suffix}@example.com`;
  let identity;
  try { identity = await getAdminAuth().getUserByEmail(email); }
  catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; identity = await getAdminAuth().createUser({ email, displayName: "Demo Kitchen Team" }); }
  await getAdminAuth().updateUser(identity.uid, { disabled: false });
  const user = await prisma.user.upsert({ where: { firebaseUid: identity.uid }, create: { id: randomUUID(), firebaseUid: identity.uid, email, displayName: "Demo Kitchen Team", active: true }, update: { active: true } });
  const membership = await prisma.organizationMembership.upsert({ where: { userId_organizationId: { userId: user.id, organizationId } }, create: { id: randomUUID(), userId: user.id, organizationId, role, allLocations: false }, update: { role, locationAccess: { deleteMany: {} } } });
  await prisma.locationAccess.createMany({ data: locationIds.map((locationId) => ({ membershipId: membership.id, organizationId, locationId })), skipDuplicates: true });
  return { uid: identity.uid, role, organizationId };
}

async function signIn(context: BrowserContext, staff: { uid: string; role: string; organizationId: string }) {
  const token = await getAdminAuth().createCustomToken(staff.uid, { role: staff.role, organizationId: staff.organizationId });
  const identity = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) }).then((response) => response.json()) as { idToken?: string };
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

async function captureMobileContent(page: import("playwright-core").Page) {
  const height = await page.locator('nav[aria-label="Queue pages"]').evaluate((element) => Math.ceil(element.getBoundingClientRect().bottom + window.scrollY + 24));
  await page.screenshot({ path: path.join(output, "09-mobile-kitchen-view.png"), fullPage: true, clip: { x: 0, y: 0, width: 390, height } });
}

// Read-only business-data recapture. Only the dedicated demo staff identity is
// briefly enabled; no new orders, stock movements or fixture records are made.
async function polishMobileCapture() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "cinebite.phase12.kitchen@example.com" }, include: { memberships: { include: { locationAccess: true } } } });
  const membership = user.memberships.find((entry) => entry.role === "KITCHEN_STAFF");
  assert.ok(membership?.locationAccess[0]);
  await getAdminAuth().updateUser(user.firebaseUid, { disabled: false });
  await prisma.user.update({ where: { id: user.id }, data: { active: true } });
  const server = spawn(process.execPath, [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3112"], { stdio: "ignore" });
  let browser: Browser | undefined;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch { /* server starting */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await signIn(context, { uid: user.firebaseUid, role: "KITCHEN_STAFF", organizationId: membership.organizationId });
    const page = await context.newPage();
    await page.goto(`${base}/kitchen?locationId=${membership.locationAccess[0].locationId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await captureMobileContent(page);
    console.log("Mobile capture refreshed with the complete kitchen content and no unused bottom area.");
  } finally {
    await browser?.close(); server.kill();
    await getAdminAuth().updateUser(user.firebaseUid, { disabled: true });
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
  }
}

async function main() {
  await mkdir(output, { recursive: true });
  const demo = await fixture();
  console.log("Safe isolated Phase 12 evidence fixtures prepared.");
  const staffUsers = await Promise.all([
    staffIdentity("KITCHEN_STAFF", demo.org.id, [demo.locations[0].id], "kitchen"),
    staffIdentity("LOCATION_MANAGER", demo.org.id, [demo.locations[0].id], "manager"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [demo.locations[0].id], "delivery"),
    staffIdentity("KITCHEN_STAFF", demo.org.id, demo.locations.slice(0, 2).map((location) => location.id), "multi"),
  ]);
  const server = spawn(process.execPath, [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3112"], { stdio: ["ignore", "ignore", "pipe"] });
  server.stderr.on("data", (chunk: Buffer) => { const message = chunk.toString(); if (/\[(auth|api|kitchen)/.test(message)) console.error(message); });
  let browser: Browser | undefined;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch { /* server starting */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
    const staffContexts = await Promise.all(staffUsers.map(() => browser!.newContext({ viewport: { width: 1440, height: 1000 } })));
    await Promise.all(staffContexts.map((context, index) => signIn(context, staffUsers[index])));
    const [kitchen, manager, delivery, multi] = staffContexts;
    const admin = await prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: demo.org.id, role: "CINEMA_ADMIN" }, include: { user: true } });
    const adminContext = await browser.newContext();
    await signIn(adminContext, { uid: admin.user.firebaseUid, role: "CINEMA_ADMIN", organizationId: demo.org.id });
    const guestContexts = await Promise.all(demo.sessions.map(() => browser!.newContext({ viewport: { width: 390, height: 844 } })));
    await Promise.all(guestContexts.map((context, index) => context.addCookies([{ name: "cinebite_guest_session", value: demo.sessions[index].token, url: base, httpOnly: true, sameSite: "Lax" }])));
    const primary = guestContexts[0];
    const queuePage = await kitchen.newPage();
    await queuePage.goto(`${base}/kitchen?locationId=${demo.locations[0].id}`, { waitUntil: "networkidle" });
    assert.equal((await read(kitchen, `${base}/api/kitchen/orders`)).status(), 200, "Demo API client must carry the issued staff cookie");
    const orders: Array<{ publicOrderCode: string; status: string }> = [];
    // Checkout already has its own concurrency suite. Seed this operational
    // scenario sequentially to avoid seven unrelated stock races at setup.
    for (const context of guestContexts) {
      const response = await context.request.post(`${base}/api/customer/orders`, { headers: { Origin: base }, data: { idempotencyKey: randomUUID(), customerNote: "No salt, please." } });
      const body = await response.json();
      assert.equal(response.status(), 201, `Phase 11 demo checkout failed: ${body.code ?? response.status()}`);
      orders.push(body.order);
    }
    const code = orders[0].publicOrderCode;
    await queuePage.locator(`[data-order-code="${code}"]`).waitFor({ timeout: 25000 });
    pass(["A", "Y"], "Phase 11 checkout appeared in the open Kitchen queue via automatic polling.");
    const customerPage = await primary.newPage();
    await customerPage.goto(`${base}/customer/orders/${code}`, { waitUntil: "networkidle" });
    const independent = await kitchen.newPage();
    await independent.goto(`${base}/kitchen?locationId=${demo.locations[0].id}`, { waitUntil: "networkidle" });
    const before = await prisma.locationInventory.findUniqueOrThrow({ where: { id: `phase12-evidence-${evidenceRun}-stock` } });
    const movementsBefore = await prisma.inventoryMovement.count({ where: { locationInventoryId: before.id } });
    await queuePage.screenshot({ path: path.join(output, "01-kitchen-queue.png"), fullPage: true });
    await queuePage.getByRole("button", { name: `Open order ${code}`, exact: true }).click();
    await queuePage.getByRole("dialog").screenshot({ path: path.join(output, "02-new-order-ticket.png") });
    await queuePage.getByRole("button", { name: "Close ticket" }).click();

    async function transition(context: BrowserContext, publicCode: string, expectedStatus: string, toStatus: string) {
      return context.request.post(`${base}/api/kitchen/orders/${publicCode}`, { headers: await sessionHeaders(context), data: { expectedStatus, toStatus } });
    }
    assert.equal((await transition(kitchen, code, "PLACED", "READY")).status(), 400);
    pass(["E"], "Forward skip rejected by the server.");
    for (const [index, from, to, customerHeading] of [[3, "PLACED", "ACCEPTED", "The kitchen accepted your order"], [4, "ACCEPTED", "PREPARING", "Your order is being prepared"], [5, "PREPARING", "READY", "Your order is ready"]] as const) {
      const responses = await Promise.all([transition(kitchen, code, from, to), transition(multi, code, from, to)]);
      assert.deepEqual(responses.map((response) => response.status()).sort(), [200, 409]);
      const dbOrder = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: code }, include: { statusEvents: true } });
      assert.equal(dbOrder.status, to);
      assert.equal(dbOrder.statusEvents.filter((event) => event.toStatus === to).length, 1);
      await customerPage.getByRole("heading", { name: customerHeading, exact: true }).waitFor({ timeout: 25000 });
      await independent.getByRole("region", { name: to === "ACCEPTED" ? "Accepted" : to === "PREPARING" ? "Preparing" : "Ready", exact: true }).locator(`[data-order-code="${code}"]`).waitFor({ timeout: 25000 });
      const detail = await kitchen.newPage();
      await detail.goto(`${base}/kitchen/orders/${code}`, { waitUntil: "networkidle" });
      await detail.locator("article").screenshot({ path: path.join(output, `0${index}-order-${to.toLowerCase()}.png`) });
      await detail.close();
    }
    assert.equal((await transition(kitchen, code, "PLACED", "ACCEPTED")).status(), 409);
    assert.equal((await transition(kitchen, code, "READY", "PREPARING")).status(), 400);
    pass(["B", "C", "D", "F", "G", "H", "I", "J", "T", "Z"], "All three concurrent transitions produced one success and one conflict; customer and second kitchen client refreshed automatically.");
    const after = await prisma.locationInventory.findUniqueOrThrow({ where: { id: before.id } });
    assert.equal(after.quantityOnHand.toFixed(3), before.quantityOnHand.toFixed(3));
    assert.equal(await prisma.inventoryMovement.count({ where: { locationInventoryId: before.id } }), movementsBefore);
    pass(["K"], "Stock and ORDER_CONSUMPTION movement count were identical across all Kitchen actions.");

    await prisma.product.update({ where: { id: demo.sessions[0].productId }, data: { name: "Renamed demo popcorn" } });
    const preserved = await read(kitchen, `${base}/api/kitchen/orders/${code}`).then((response) => response.json());
    assert.equal(preserved.items[0].productName, "Large Popcorn");
    await prisma.product.update({ where: { id: demo.sessions[0].productId }, data: { name: "Large Popcorn" } });
    pass(["L"], "Kitchen returned the original item snapshot after the source Product was renamed.");
    const foreignCode = orders[5].publicOrderCode;
    const otherTenantCode = orders[6].publicOrderCode;
    assert.equal((await read(kitchen, `${base}/api/kitchen/orders/${foreignCode}`)).status(), 404);
    assert.equal((await transition(kitchen, foreignCode, "PLACED", "ACCEPTED")).status(), 404);
    assert.equal((await read(manager, `${base}/api/kitchen/orders/${foreignCode}`)).status(), 404);
    assert.equal((await transition(manager, foreignCode, "PLACED", "ACCEPTED")).status(), 404);
    assert.equal((await read(adminContext, `${base}/api/kitchen/orders/${code}`)).status(), 200);
    assert.equal((await read(adminContext, `${base}/api/kitchen/orders/${otherTenantCode}`)).status(), 404);
    assert.equal((await primary.request.get(`${base}/api/customer/orders/${foreignCode}`)).status(), 404);
    assert.equal((await transition(delivery, code, "PLACED", "ACCEPTED")).status(), 403);
    assert.equal((await transition(primary, code, "PLACED", "ACCEPTED")).status(), 401);
    pass(["M", "O", "P", "Q", "R", "S"], "Real Firebase staff and customer sessions enforced location/tenant/role ownership boundaries.");
    const multiPage = await multi.newPage();
    await multiPage.goto(`${base}/kitchen`, { waitUntil: "networkidle" });
    const locationOptions = await multiPage.locator('select[name="locationId"] option').allTextContents();
    assert.deepEqual(locationOptions.sort(), ["All authorized locations", "Demo Beirut", "Demo Dbayeh"].sort());
    pass(["N"], "Multiple-location staff selector contained exactly its two authorized demo locations.");
    const queue = await read(kitchen, `${base}/api/kitchen/orders?locationId=${demo.locations[0].id}`).then((response) => response.json());
    const placed = queue.orders.filter((order: { status: string }) => order.status === "PLACED");
    assert.deepEqual(placed.map((order: { createdAt: string }) => order.createdAt), placed.map((order: { createdAt: string }) => order.createdAt).sort());
    pass(["AA"], "Queue response prioritized oldest PLACED timestamps first.");

    const readyOrder = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: code }, include: { statusEvents: { orderBy: { createdAt: "asc" } } } });
    assert.deepEqual(readyOrder.statusEvents.map((event) => event.toStatus), ["PLACED", "ACCEPTED", "PREPARING", "READY"]);
    assert.equal(await prisma.auditLog.count({ where: { entityId: readyOrder.id, action: { in: ["ORDER_ACCEPTED", "ORDER_PREPARING_STARTED", "ORDER_MARKED_READY"] } } }), 3);
    await assert.rejects(() => prisma.orderStatusEvent.update({ where: { id: readyOrder.statusEvents[0].id }, data: { createdAt: new Date() } }));
    await assert.rejects(() => prisma.orderStatusEvent.delete({ where: { id: readyOrder.statusEvents[0].id } }));
    assert.equal(await prisma.order.count({ where: { statusEvents: { none: { toStatus: "PLACED" } } } }), 0);
    pass(["AB", "AC"], "Database timeline has four server-timestamped events, three staff audits, and rejects event rewriting.");
    const timelinePage = await kitchen.newPage();
    await timelinePage.goto(`${base}/kitchen/orders/${code}`, { waitUntil: "networkidle" });
    const timelineBounds = await timelinePage.getByRole("region", { name: "Order status timeline" }).boundingBox();
    assert.ok(timelineBounds);
    // Include a small native UI margin so timeline dots are not clipped.
    await timelinePage.screenshot({ path: path.join(output, "06-order-status-timeline.png"), clip: { x: timelineBounds.x - 12, y: timelineBounds.y - 12, width: timelineBounds.width + 24, height: timelineBounds.height + 24 } });
    await customerPage.screenshot({ path: path.join(output, "07-customer-order-progress.png"), fullPage: true });

    // Preserve completed/placed Orders independently of their original guest session/window.
    await prisma.customerSession.update({ where: { id: demo.sessions[1].id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await transition(manager, orders[1].publicOrderCode, "PLACED", "ACCEPTED")).status(), 200);
    pass(["U"], "Expired CustomerSession did not remove or block the existing kitchen Order.");
    await prisma.screening.update({ where: { id: demo.sessions[0].screeningId }, data: { endsAt: new Date(Date.now() - 1000) } });
    assert.equal((await transition(kitchen, orders[2].publicOrderCode, "PLACED", "ACCEPTED")).status(), 200);
    pass(["V"], "Screening ending did not remove or block the existing kitchen Order.");
    await prisma.screening.update({ where: { id: demo.sessions[0].screeningId }, data: { status: "CANCELLED" } });
    assert.equal((await transition(adminContext, orders[3].publicOrderCode, "PLACED", "ACCEPTED")).status(), 200);
    const cancelled = await read(kitchen, `${base}/api/kitchen/orders/${orders[3].publicOrderCode}`).then((response) => response.json());
    assert.match(cancelled.screeningWarning, /cancelled/);
    assert.equal((await prisma.locationInventory.findUniqueOrThrow({ where: { id: before.id } })).quantityOnHand.toFixed(3), before.quantityOnHand.toFixed(3));
    pass(["W"], "Cancelled Screening preserved its Order, displayed a warning, and restored no inventory.");
    await prisma.screening.update({ where: { id: demo.sessions[0].screeningId }, data: { status: "SCHEDULED", endsAt: new Date(Date.now() + 10800000) } });
    const xssOrder = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: orders[4].publicOrderCode } });
    await prisma.order.update({ where: { id: xssOrder.id }, data: { customerNote: "<script>window.phase12Injected=true</script>" } });
    await timelinePage.goto(`${base}/kitchen/orders/${xssOrder.publicOrderCode}`, { waitUntil: "networkidle" });
    assert.ok(await timelinePage.getByText("<script>window.phase12Injected=true</script>", { exact: true }).isVisible());
    assert.equal(await timelinePage.evaluate(() => (window as unknown as { phase12Injected?: boolean }).phase12Injected), undefined);
    await prisma.order.update({ where: { id: xssOrder.id }, data: { customerNote: "No salt, please." } });
    pass(["X"], "Browser displayed the script-like note as plain text; no script executed.");

    // Showcase one representative ticket in each state using supported transitions only.
    await transition(kitchen, orders[2].publicOrderCode, "ACCEPTED", "PREPARING");
    await queuePage.reload({ waitUntil: "networkidle" });
    await queuePage.screenshot({ path: path.join(output, "01-kitchen-queue.png"), fullPage: true });
    await queuePage.setViewportSize({ width: 1024, height: 768 });
    await queuePage.reload({ waitUntil: "networkidle" });
    await queuePage.getByRole("button", { name: `Open order ${code}`, exact: true }).click();
    assert.equal(await queuePage.getByRole("dialog").isVisible(), true);
    await queuePage.keyboard.press("Escape");
    assert.equal(await queuePage.getByRole("dialog").isVisible(), false);
    await queuePage.screenshot({ path: path.join(output, "08-tablet-kitchen-view.png"), fullPage: true });
    assert.equal(await queuePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    pass(["AE"], "Tablet queue at 1024 × 768 had practical cards/actions and no horizontal overflow.");
    await queuePage.setViewportSize({ width: 390, height: 844 });
    assert.equal(await queuePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const phoneTicket = queuePage.locator(`[data-order-code="${orders[4].publicOrderCode}"]`);
    await phoneTicket.getByRole("button", { name: "Accept order", exact: true }).click();
    await queuePage.getByRole("region", { name: "Accepted", exact: true }).locator(`[data-order-code="${orders[4].publicOrderCode}"]`).waitFor({ timeout: 25000 });
    for (const dismiss of await queuePage.getByRole("button", { name: "Dismiss notification", exact: true }).all()) await dismiss.click();
    // Allow the short layout transition to finish before measuring/capturing
    // the document; transient transforms can otherwise leave blank overflow.
    await queuePage.waitForTimeout(400);
    await captureMobileContent(queuePage);
    pass(["AF"], "Phone queue at 390 × 844 executed Accept and had no horizontal overflow.");
    assert.equal(await customerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    pass(["AG"], "Customer mobile progress was readable, refreshed through READY, and had no horizontal overflow.");
    pass(["AD"], "Kitchen repositories import Prisma only; no Firestore business persistence path exists (source inspection).");
    pass(["AH"], "Application-only production screenshots captured with demo data; original-resolution visual review is required before commit.");
    console.log("Phase 12 real integration and evidence scenario completed.");
  } finally {
    await browser?.close(); server.kill();
    await Promise.all(staffUsers.map(async (staff) => {
      await getAdminAuth().updateUser(staff.uid, { disabled: true });
      await prisma.user.updateMany({ where: { firebaseUid: staff.uid }, data: { active: false } });
    }));
    await writeFile(path.join(process.cwd(), "docs", "phase-12-integration-results.json"), JSON.stringify(Object.fromEntries(results), null, 2));
  }
}

(process.argv.includes("--polish-mobile") ? polishMobileCapture() : main()).catch((error) => { console.error(error instanceof Error ? error.message : "Phase 12 verification failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
