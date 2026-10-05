import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

import { chromium } from "playwright-core";

import { getAdminAuth } from "../src/lib/firebase/admin";
import { createOpaqueToken, hashOpaqueToken } from "../src/lib/security/opaque-token";
import { prisma } from "../src/lib/db/prisma";

const baseUrl = "http://127.0.0.1:3100";
const outputDirectory = path.join(process.cwd(), "linkedin", "phase-11");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function prepareDemo() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: "cinebite-demo-cinemas" } });
  const location = await prisma.location.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: organization.id, slug: "demo-beirut" } } });
  const screening = await prisma.screening.findUniqueOrThrow({ where: { id: "phase9-demo-beirut-live" }, include: { hall: true } });
  const seat = await prisma.seat.findFirstOrThrow({ where: { hallId: screening.hallId, label: "A7" } });
  const category = await prisma.menuCategory.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "drinks" } },
    create: { id: "phase11-demo-drinks", organizationId: organization.id, name: "Drinks", slug: "drinks", description: "Cold cinema drinks", status: "ACTIVE", sortOrder: 20 },
    update: { name: "Drinks", status: "ACTIVE", sortOrder: 20 },
  });
  const pepsi = await prisma.product.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "pepsi" } },
    create: { id: "phase11-demo-pepsi", organizationId: organization.id, categoryId: category.id, name: "Pepsi", slug: "pepsi", description: "Chilled Pepsi served to your seat.", sku: "PH11-PEPSI", status: "ACTIVE", sortOrder: 1 },
    update: { categoryId: category.id, name: "Pepsi", description: "Chilled Pepsi served to your seat.", status: "ACTIVE" },
  });
  await prisma.productLocation.upsert({
    where: { productId_locationId: { productId: pepsi.id, locationId: location.id } },
    create: { id: "phase11-demo-pepsi-beirut", organizationId: organization.id, productId: pepsi.id, locationId: location.id, price: "2.50", currencyCode: "USD", isAvailable: true },
    update: { price: "2.50", currencyCode: "USD", isAvailable: true },
  });
  const bottle = await prisma.inventoryItem.upsert({
    where: { organizationId_sku: { organizationId: organization.id, sku: "PH11-PEPSI-BOTTLE" } },
    create: { id: "phase11-demo-pepsi-bottle", organizationId: organization.id, name: "Pepsi bottle", sku: "PH11-PEPSI-BOTTLE", unit: "EACH", status: "ACTIVE" },
    update: { name: "Pepsi bottle", status: "ACTIVE" },
  });
  await prisma.locationInventory.upsert({
    where: { locationId_inventoryItemId: { locationId: location.id, inventoryItemId: bottle.id } },
    create: { id: "phase11-demo-pepsi-stock", organizationId: organization.id, locationId: location.id, inventoryItemId: bottle.id, quantityOnHand: "50", lowStockThreshold: "5" },
    update: { quantityOnHand: "50", lowStockThreshold: "5" },
  });
  await prisma.productRecipeComponent.upsert({
    where: { productId_inventoryItemId: { productId: pepsi.id, inventoryItemId: bottle.id } },
    create: { id: "phase11-demo-pepsi-recipe", organizationId: organization.id, productId: pepsi.id, inventoryItemId: bottle.id, quantityRequired: "1" },
    update: { quantityRequired: "1" },
  });
  const popcorn = await prisma.product.findFirstOrThrow({ where: { organizationId: organization.id, slug: "large-popcorn" }, include: { recipeComponents: true } });
  await prisma.productLocation.updateMany({ where: { productId: popcorn.id, locationId: location.id }, data: { price: "5.00", currencyCode: "USD", isAvailable: true } });
  for (const component of popcorn.recipeComponents) {
    await prisma.inventoryItem.update({ where: { id: component.inventoryItemId }, data: { status: "ACTIVE" } });
    await prisma.locationInventory.updateMany({ where: { locationId: location.id, inventoryItemId: component.inventoryItemId }, data: { quantityOnHand: "10000" } });
  }
  await prisma.customerSession.updateMany({ where: { hallId: seat.hallId, seatId: seat.id, screeningId: screening.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
  const rawToken = createOpaqueToken();
  const customerSession = await prisma.customerSession.create({ data: {
    id: randomUUID(), tokenHash: hashOpaqueToken(rawToken), hallId: seat.hallId, seatId: seat.id,
    screeningId: screening.id, status: "ACTIVE", expiresAt: screening.endsAt,
  } });
  const admin = await prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: organization.id, role: "CINEMA_ADMIN" }, include: { user: true } });
  const trackedIds = [...popcorn.recipeComponents.map((component) => component.inventoryItemId), bottle.id];
  const stockBefore = await prisma.locationInventory.findMany({ where: { locationId: location.id, inventoryItemId: { in: trackedIds } }, select: { inventoryItemId: true, quantityOnHand: true } });
  return { rawToken, organization, admin, customerSession, location, stockBefore };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/`)).ok) return; } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("CineBite development server did not start.");
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const demo = await prepareDemo();
  const server = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: process.cwd(), stdio: "ignore" });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.addCookies([{ name: "cinebite_guest_session", value: demo.rawToken, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/customer/menu`, { waitUntil: "networkidle" });
    const tamperedAdd = await context.request.put(`${baseUrl}/api/customer/cart`, { headers: { Origin: baseUrl }, data: { productSlug: "large-popcorn", quantity: 1, unitPrice: "0.01" } });
    assert.equal(tamperedAdd.status(), 400, "client price tampering must be rejected");
    await page.screenshot({ path: path.join(outputDirectory, "01-customer-menu-add-to-cart.png"), fullPage: true });
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await page.getByText("View cart").waitFor();
    await page.screenshot({ path: path.join(outputDirectory, "02-menu-cart-summary.png"), fullPage: true });
    await page.getByRole("button", { name: "Add", exact: true }).last().click();
    await page.getByText(/2 items/).waitFor();
    await page.getByRole("link", { name: /View cart/ }).click();
    await page.waitForURL("**/customer/cart");
    await page.getByRole("heading", { name: "Review your cart" }).waitFor();
    await page.screenshot({ path: path.join(outputDirectory, "03-cart-with-items.png"), fullPage: true });
    await page.getByRole("button", { name: "Add one" }).first().click();
    await page.getByText("$12.50").waitFor();
    const stockAfterCart = await prisma.locationInventory.findMany({ where: { locationId: demo.location.id, inventoryItemId: { in: demo.stockBefore.map((item) => item.inventoryItemId) } }, select: { inventoryItemId: true, quantityOnHand: true } });
    assert.deepEqual(stockAfterCart.map((item) => [item.inventoryItemId, item.quantityOnHand.toFixed(3)]).sort(), demo.stockBefore.map((item) => [item.inventoryItemId, item.quantityOnHand.toFixed(3)]).sort(), "cart must not reserve stock");
    await page.screenshot({ path: path.join(outputDirectory, "04-cart-price-summary.png"), fullPage: true });
    await page.getByPlaceholder("For example: no ice").fill("Please deliver quietly during the movie.");
    await page.screenshot({ path: path.join(outputDirectory, "05-checkout-ready.png"), fullPage: true });
    const tamperedCheckout = await context.request.post(`${baseUrl}/api/customer/orders`, { headers: { Origin: baseUrl }, data: { idempotencyKey: `tamper_${randomUUID().replaceAll("-", "")}`, total: "0.01", seatId: "A8" } });
    assert.equal(tamperedCheckout.status(), 400, "client total and seat tampering must be rejected");
    let checkoutBody: { idempotencyKey: string; customerNote: string | null } | null = null;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/customer/orders")) checkoutBody = request.postDataJSON();
    });
    await page.getByRole("button", { name: "Place order" }).click();
    await page.getByRole("heading", { name: "We received your order" }).waitFor();
    await page.screenshot({ path: path.join(outputDirectory, "06-order-confirmation.png"), fullPage: true });

    const customToken = await getAdminAuth().createCustomToken(demo.admin.user.firebaseUid, { role: "CINEMA_ADMIN", organizationId: demo.organization.id });
    const identityResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    const identity = await identityResponse.json() as { idToken?: string; error?: unknown };
    if (!identity.idToken) throw new Error("Could not create safe demo staff session.");
    const sessionResponse = await context.request.post(`${baseUrl}/api/auth/session`, { headers: { Origin: baseUrl }, data: { idToken: identity.idToken } });
    if (!sessionResponse.ok()) throw new Error(`Admin session failed with ${sessionResponse.status()}.`);
    const adminPage = await context.newPage();
    await adminPage.setViewportSize({ width: 1440, height: 1000 });
    await adminPage.goto(`${baseUrl}/admin/orders`, { waitUntil: "networkidle" });
    await adminPage.getByText(demo.admin.user.email).evaluate((element) => { (element as HTMLElement).style.visibility = "hidden"; });
    await adminPage.screenshot({ path: path.join(outputDirectory, "07-admin-orders.png"), fullPage: true });
    await Promise.all([
      adminPage.waitForURL("**/admin/orders/*"),
      adminPage.getByRole("link", { name: /^CB-/ }).first().click(),
    ]);
    await adminPage.getByRole("heading", { name: /^CB-/ }).waitFor();
    await adminPage.getByText(demo.admin.user.email).evaluate((element) => { (element as HTMLElement).style.visibility = "hidden"; });
    await adminPage.screenshot({ path: path.join(outputDirectory, "08-admin-order-detail.png"), fullPage: true });
    assert.ok(checkoutBody, "checkout request must be observed");
    const replay = await context.request.post(`${baseUrl}/api/customer/orders`, { headers: { Origin: baseUrl }, data: checkoutBody });
    assert.equal(replay.status(), 200, "same idempotency key must replay the successful order");
    const replayBody = await replay.json() as { order: { publicOrderCode: string } };
    const order = await prisma.order.findFirstOrThrow({ where: { customerSessionId: demo.customerSession.id }, include: { items: true, inventoryMovements: true } });
    assert.equal(replayBody.order.publicOrderCode, order.publicOrderCode);
    assert.equal(await prisma.order.count({ where: { customerSessionId: demo.customerSession.id } }), 1);
    assert.equal(order.total.toFixed(2), "12.50");
    assert.deepEqual(order.items.map((item) => [item.productNameSnapshot, item.quantity, item.lineTotal.toFixed(2)]).sort(), [["Large Popcorn", 2, "10.00"], ["Pepsi", 1, "2.50"]]);
    assert.ok(order.inventoryMovements.length >= 3);
    assert.ok(order.inventoryMovements.every((movement) => movement.type === "ORDER_CONSUMPTION" && movement.quantityDelta.isNegative()));
    assert.equal(await prisma.cartItem.count({ where: { cart: { customerSessionId: demo.customerSession.id } } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { entityType: "ORDER", entityId: order.id, action: "ORDER_PLACED" } }), 1);
    const addAfterOrder = await context.request.put(`${baseUrl}/api/customer/cart`, { headers: { Origin: baseUrl }, data: { productSlug: "pepsi", quantity: 1 } });
    assert.equal(addAfterOrder.status(), 200);
    const removeAfterOrder = await context.request.put(`${baseUrl}/api/customer/cart`, { headers: { Origin: baseUrl }, data: { productSlug: "pepsi", quantity: 0 } });
    assert.equal(removeAfterOrder.status(), 200);
    assert.equal((await removeAfterOrder.json() as { itemCount: number }).itemCount, 0, "zero quantity must remove the CartItem");
    console.log("PASS: price/identity tampering rejected; Cart did not reserve stock.");
    console.log("PASS: exact totals, snapshots, atomic inventory movements, audit, and Cart clearing verified.");
    console.log("PASS: same-key replay returned the original Order without a duplicate.");
    console.log("Phase 11 screenshots captured from the real application using safe demo data.");
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Phase 11 capture failed.");
  process.exitCode = 1;
});
