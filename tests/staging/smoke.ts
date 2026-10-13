import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium, type BrowserContext } from "playwright-core";
import { prisma } from "@/lib/db/prisma";
import { assertNonProductionToolEnvironment, validateEnvironment } from "@/lib/operations/environment";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
assertNonProductionToolEnvironment();
const { environment, resource } = validateEnvironment();
if (environment !== "staging" || resource.firebaseProjectId !== "cinebite-staging-20261013" ||
    !process.argv.includes("--confirm-staging-smoke") || process.env.PAYMENT_PROVIDER !== "sandbox" ||
    process.env.PAYMENT_SANDBOX_ENABLED !== "true" || process.env.CINEBITE_STORAGE_ENABLED !== "false")
  throw new Error("Explicit isolated, storage-disabled staging sandbox confirmation required.");
const base = resource.origin;
const bypass = process.env.CINEBITE_VERCEL_PROTECTION_BYPASS;
let check = "configuration";
const report: Record<string, unknown> = {
  environment, origin: base, release: process.env.OBSERVABILITY_RELEASE,
  realPayments: false, productionTouched: false, storageProvisioned: false,
  checks: {} as Record<string, string>,
};
const checks = report.checks as Record<string, string>;
async function request(context: BrowserContext | null, pathname: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) {
  const url = new URL(pathname, base);
  assert.equal(url.origin, base, "Requests must stay on the pinned staging origin.");
  const cookies = context ? (await context.cookies()).map(c => `${c.name}=${c.value}`).join("; ") : "";
  return fetch(url, {
    method, redirect: "manual", signal: AbortSignal.timeout(30000),
    headers: { ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
      ...(cookies ? { Cookie: cookies } : {}), ...(method !== "GET" ? { Origin: base, "Content-Type": "application/json" } : {}), ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function expectStatus(response: Response, expected: number) {
  assert.equal(response.status, expected, "Unexpected staging HTTP status.");
  return response.json();
}
async function main() {
  const fixture = JSON.parse(await readFile("ops-private/staging-fixture.json", "utf8")) as {
    organizationId: string; otherOrganizationId: string; locationId: string; hallId: string;
    screeningId: string; credential: string;
    staff: Array<{ role: string; email: string; password: string }>;
  };
  assert.equal((await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } })).slug, "cinebite-staging-cinemas");
  for (const pathname of ["/api/health", "/api/ready"]) {
    check = pathname; assert.equal((await request(null, pathname)).status, 200);
  }
  checks.healthAndReadiness = "PASS";
  const browser = await chromium.launch({ executablePath: process.env.OPS_CHROME_PATH ||
    (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true });
  try {
    async function context(mobile = false) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, reducedMotion: "reduce" });
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin === base) return route.continue({ headers: { ...route.request().headers(), ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) } });
        if (["identitytoolkit.googleapis.com", "securetoken.googleapis.com"].includes(url.hostname) && url.protocol === "https:")
          return route.continue();
        return route.abort(); // No credential/bypass forwarding to unrelated origins.
      });
      return context;
    }
    const staffContexts = new Map<string, BrowserContext>();
    check = "customer landing guidance";
    const landingContext = await context(true), landing = await landingContext.newPage();
    await landing.goto(base);
    await landing.getByRole("heading", { name: "Scan your seat QR", exact: true }).waitFor();
    assert.equal(await landing.getByText("Phase 1", { exact: false }).count(), 0);
    await landing.getByLabel("Test environment").waitFor();
    assert.equal(await landing.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await landing.screenshot({ path: "ops-private/staging-home-mobile.png", fullPage: true });
    checks.customerLandingGuidance = "PASS";
    for (const staff of fixture.staff) {
      check = "real browser login " + staff.role;
      const ctx = await context(); const page = await ctx.newPage();
      await page.goto(base + "/login");
      if (staff.role === "SUPER_ADMIN") {
        check = "login Clear form";
        let submissions = 0;
        page.on("request", r => { if (new URL(r.url()).pathname === "/api/auth/session" && r.method() === "POST") submissions++; });
        await page.locator("#email").fill(staff.email);
        await page.locator("#password").fill(staff.password);
        await page.getByRole("button", { name: "Show password", exact: true }).click();
        await page.getByRole("button", { name: "Clear form", exact: true }).click();
        assert.equal(await page.locator("#email").inputValue(), "");
        assert.equal(await page.locator("#password").inputValue(), "");
        assert.equal(await page.locator("#password").getAttribute("type"), "password");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "email");
        assert.equal(submissions, 0);
        checks.loginClearForm = "PASS";
      }
      check = "real browser login " + staff.role;
      await page.locator("#email").fill(staff.email);
      await page.locator("#password").fill(staff.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const path = ({ SUPER_ADMIN: "/super-admin", CINEMA_ADMIN: "/admin", KITCHEN_STAFF: "/kitchen", DELIVERY_STAFF: "/delivery" } as Record<string, string>)[staff.role];
      await page.waitForURL(base + path, { timeout: 30000 });
      assert.equal(new URL(page.url()).search, "");
      const cookie = (await ctx.cookies()).find(c => c.name === "cinebite_session");
      assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax");
      assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("firebase:authUser:"))), false);
      staffContexts.set(staff.role, ctx);
    }
    checks.realFirebaseStaffLoginAndCookies = "PASS";
    const admin = staffContexts.get("CINEMA_ADMIN")!, platform = staffContexts.get("SUPER_ADMIN")!;
    const kitchen = staffContexts.get("KITCHEN_STAFF")!, delivery = staffContexts.get("DELIVERY_STAFF")!;
    check = "authenticated release identity";
    const release = await expectStatus(await request(platform, "/api/super-admin/release"), 200);
    assert.equal(release.environment, "staging"); assert.equal(release.release, process.env.OBSERVABILITY_RELEASE);
    assert.equal(release.migrations, "ready"); checks.builtReleaseAndMigrations = "PASS";
    check = "PostgreSQL QR fallback generation";
    const qrRoot = `/api/admin/locations/${fixture.locationId}/halls/${fixture.hallId}/qr`;
    await expectStatus(await request(admin, qrRoot + "/generate", "POST", { action: "GENERATE_MISSING" }), 201);
    const generated = await prisma.seatQrCode.findFirstOrThrow({ where: { hallId: fixture.hallId, seatId: "a8" } });
    assert.equal(generated.qrImageStoragePath, null); assert.ok(generated.qrImageData?.byteLength);
    const image = await request(admin, qrRoot + "/a8/image"); assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    checks.adminQrPostgresFallback = "PASS";
    check = "mobile QR confirmation and start ordering";
    const guest = await context(true), page = await guest.newPage();
    const before = await prisma.customerSession.count();
    await page.goto(base + "/s/" + fixture.credential, { waitUntil: "networkidle" });
    assert.equal(await prisma.customerSession.count(), before, "QR GET must be passive.");
    const checkIn = await expectStatus(await request(admin, qrRoot + "/a7/check-in", "POST", {
      ticketVerified: true, ticketReference: "synthetic-staging-smoke-ticket", replaceExistingSession: true,
    }), 201);
    await page.getByLabel("Ticket check-in code", { exact: true }).fill(checkIn.accessCode);
    await page.getByRole("button", { name: "Start ordering" }).click();
    await page.waitForURL(base + "/customer/menu");
    const sessionsAfterStart = await prisma.customerSession.count();
    await page.goto(base);
    await page.waitForURL(base + "/customer/menu");
    assert.equal(await prisma.customerSession.count(), sessionsAfterStart);
    checks.validCustomerHomepageResume = "PASS";
    const cookie = (await guest.cookies()).find(c => c.name === CUSTOMER_SESSION_COOKIE);
    assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax");
    const popcorn = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Large Popcorn", exact: true }) });
    const pepsi = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Pepsi", exact: true }) });
    check = "mobile authoritative cart quantities";
    async function waitForCartUpdate(click: () => Promise<unknown>) {
      const completion = page.waitForResponse(r => r.url() === base + "/api/customer/cart" && r.request().method() === "PUT");
      await click();
      const response = await completion;
      assert.equal(response.status(), 200);
      await response.finished();
    }
    await waitForCartUpdate(() => popcorn.getByRole("button", { name: "Add", exact: true }).click());
    await waitForCartUpdate(() => popcorn.getByRole("button", { name: "Add one", exact: true }).click());
    await waitForCartUpdate(() => pepsi.getByRole("button", { name: "Add", exact: true }).click());
    await page.getByRole("link", { name: /View cart/ }).click();
    await page.waitForURL(base + "/customer/cart");
    const cart = await expectStatus(await request(guest, "/api/customer/cart"), 200);
    assert.equal(cart.subtotal, "12.00"); assert.equal(cart.itemCount, 3);
    checks.mobileQrAndAuthoritativeCart = "PASS";
    check = "sandbox checkout and settlement";
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL("**/customer/payments/*");
    const code = new URL(page.url()).pathname.split("/").at(-1)!;
    await page.getByRole("button", { name: /Test success/ }).click();
    await page.getByRole("heading", { name: "Payment confirmed", exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole("link", { name: "Follow your order" }).click();
    await page.waitForURL("**/customer/orders/*");
    const order = await prisma.order.findUniqueOrThrow({ where: { publicOrderCode: code }, include: { payment: true, items: true } });
    assert.equal(order.total.toFixed(2), "12.00"); assert.equal(order.seatId, "a7");
    assert.equal(order.screeningId, fixture.screeningId); assert.equal(order.payment?.provider, "sandbox");
    assert.equal(order.payment?.status, "SUCCEEDED"); assert.equal(order.fulfillmentEligible, true);
    assert.equal(await prisma.inventoryMovement.count({ where: { orderId: order.id, type: "ORDER_CONSUMPTION" } }), 2);
    checks.sandboxPaymentAndInventory = "PASS";
    check = "kitchen and delivery";
    const kitchenPage = kitchen.pages()[0];
    await kitchenPage.reload();
    const card = kitchenPage.locator(`[data-order-code="${code}"]`);
    await card.waitFor();
    check = "dark native selects";
    const select = kitchenPage.locator('select[name="status"]');
    assert.equal(await select.evaluate(el => getComputedStyle(el).colorScheme), "dark");
    assert.equal(await select.locator("option").first().evaluate(el => getComputedStyle(el).backgroundColor), "rgb(13, 13, 16)");
    checks.darkSelectControls = "PASS";
    check = "kitchen invalid skip drop";
    await card.dragTo(kitchenPage.getByRole("region", { name: "Ready", exact: true }));
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PLACED");
    check = "kitchen drag conflict feedback (simulated 409)";
    let rejectOnce = true;
    await kitchen.route(base + "/api/kitchen/orders/" + code, async route => {
      if (route.request().method() === "POST" && rejectOnce) {
        rejectOnce = false;
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Synthetic drag conflict; please retry." }) });
      }
      return route.fallback();
    });
    await card.dragTo(kitchenPage.getByRole("region", { name: "Accepted", exact: true }));
    await kitchenPage.getByRole("alert").filter({ hasText: "Synthetic drag conflict" }).waitFor();
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PLACED");
    check = "kitchen real drag and keyboard transitions";
    await card.getByRole("button", { name: "Accept order", exact: true }).waitFor();
    await kitchenPage.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    await card.dragTo(kitchenPage.getByRole("region", { name: "Accepted", exact: true }));
    const accepted = kitchenPage.getByRole("region", { name: "Accepted", exact: true }).locator(`[data-order-code="${code}"]`);
    await accepted.waitFor();
    const prepare = accepted.getByRole("button", { name: "Start preparing", exact: true });
    await prepare.focus(); await prepare.press("Enter");
    const preparing = kitchenPage.getByRole("region", { name: "Preparing", exact: true }).locator(`[data-order-code="${code}"]`);
    await preparing.waitFor();
    await preparing.dragTo(kitchenPage.getByRole("region", { name: "Ready", exact: true }));
    const ready = kitchenPage.getByRole("region", { name: "Ready", exact: true }).locator(`[data-order-code="${code}"]`);
    await ready.waitFor();
    assert.equal(await ready.getAttribute("draggable"), "false");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "READY");
    checks.kitchenDragDropAndKeyboard = "PASS";
    checks.kitchenClientConflictFeedback = "PASS (simulated HTTP 409; not a real backend conflict)";
    check = "delivery transitions";
    for (const [from, to] of [["READY", "OUT_FOR_DELIVERY"], ["OUT_FOR_DELIVERY", "DELIVERED"]])
      await expectStatus(await request(delivery, "/api/delivery/orders/" + code, "POST", { expectedStatus: from, toStatus: to }), 200);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "DELIVERED");
    const progress = await expectStatus(await request(guest, "/api/customer/orders/" + code), 200);
    assert.ok(JSON.stringify(progress).includes("DELIVERED")); checks.kitchenDeliveryAndProgress = "PASS";
    check = "notifications and scoped operational reads";
    await expectStatus(await request(null, "/api/notifications/process", "POST", undefined, { Authorization: "Bearer " + process.env.NOTIFICATION_JOB_SECRET }), 200);
    assert.ok(await prisma.notification.count());
    await expectStatus(await request(admin, "/api/admin/analytics"), 200);
    await expectStatus(await request(platform, "/api/super-admin/operations"), 200);
    assert.equal(await prisma.order.count({ where: { organizationId: fixture.otherOrganizationId } }), 0);
    checks.notificationsAnalyticsAndControlTenant = "PASS";
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    checks.mobileViewport = "PASS";
    report.status = "PASS";
    report.firebaseBackedMedia = "NOT EXECUTABLE: Storage intentionally disabled";
  } finally { await browser.close(); }
}
main().catch(error => {
  report.status = "FAIL"; report.failedCheck = check;
  report.safeErrorCategory = error instanceof Error ? error.name : "Error";
  // Numeric/boolean assertions help diagnose timing without logging tokens,
  // URLs, staff details or arbitrary assertion payloads.
  if (error instanceof assert.AssertionError) {
    const safeValue = (value: unknown) => typeof value === "number" || typeof value === "boolean" ||
      (typeof value === "string" && /^\d{1,10}(?:\.\d{1,4})?$/.test(value)) ? value : "suppressed";
    report.assertion = { expected: safeValue(error.expected), actual: safeValue(error.actual) };
  }
  process.exitCode = 1;
}).finally(async () => {
  await writeFile("ops-private/staging-smoke-result.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); // No cookies, passwords, QR credentials or provider secrets.
  await prisma.$disconnect();
});
