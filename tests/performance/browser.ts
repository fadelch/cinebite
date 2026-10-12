import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext } from "playwright-core";
import { base, secrets } from "./environment";
import { prisma } from "@/lib/db/prisma";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/security/opaque-token";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Browser telemetry deliberately excludes URLs, headers, cookie values and bodies. */
export async function mobileAndPolling(input: {
  browser: Browser;
  kitchenContext: BrowserContext;
  hallId: string;
  seatId: string;
  projectDirectory: string;
}) {
  const credential = createOpaqueToken();
  secrets.add(credential);
  await prisma.seatQrCode.create({
    data: {
      hallId: input.hallId,
      seatId: input.seatId,
      tokenHash: hashOpaqueToken(credential),
    },
  });
  const mobile = await input.browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  await mobile.route("**/*", (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort(),
  );
  const page = await mobile.newPage(),
    cdp = await mobile.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
  });
  let javascriptBytes = 0,
    javascriptCount = 0,
    chartMarkers = 0,
    externalRequests = 0;
  const reads: Promise<void>[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== base) externalRequests++;
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "script")
      reads.push(
        (async () => {
          const buffer = await response.body();
          javascriptBytes += buffer.length;
          javascriptCount++;
          if (
            /recharts-wrapper|CartesianAxis|firebase:authUser:/.test(
              buffer.toString(),
            )
          )
            chartMarkers++;
        })().catch(() => undefined),
      );
  });
  const entered = performance.now();
  await page.goto(base + "/s/" + credential, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start ordering" }).click();
  await page.waitForURL("**/customer/menu");
  const popcorn = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Large Popcorn", exact: true }),
  });
  await popcorn
    .getByRole("button", { name: "Add", exact: true })
    .waitFor({ state: "visible" });
  const usefulMenuMs = Math.round(performance.now() - entered);
  await page.evaluate(() => document.fonts.ready);
  // Next's accessibility route announcer intentionally uses role=alert for the title.
  const alerts = await page.getByRole("alert").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const root = element.getRootNode();
        return !(
          root instanceof ShadowRoot &&
          root.host.tagName === "NEXT-ROUTE-ANNOUNCER"
        );
      })
      .map((element) => element.textContent ?? ""),
  );
  assert.ok(
    alerts.every((text) => !text.trim()),
    "Mobile menu contains an error alert.",
  );
  await mkdir(path.join(input.projectDirectory, "linkedin/phase-21"), {
    recursive: true,
  });
  await page.screenshot({
    path: path.join(
      input.projectDirectory,
      "linkedin/phase-21/08-mobile-performance.png",
    ),
    fullPage: true,
    animations: "disabled",
  });
  const cartStart = performance.now();
  const cartResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/customer/cart") && r.request().method() === "PUT",
  );
  await popcorn.getByRole("button", { name: "Add", exact: true }).click();
  assert.equal((await cartResponse).status(), 200);
  await page.getByRole("link", { name: /View cart/ }).click();
  await page.waitForURL("**/customer/cart");
  const checkoutResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/customer/orders") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue to payment" }).click();
  assert.equal((await checkoutResponse).status(), 201);
  await page.waitForURL("**/customer/payments/*");
  const sandbox = page.waitForResponse(
    (r) => r.url().includes("/sandbox") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Test success/ }).click();
  assert.equal((await sandbox).status(), 200);
  await page
    .getByRole("heading", { name: "Payment confirmed", exact: true })
    .waitFor({ state: "visible", timeout: 30000 });
  await page.getByRole("link", { name: "Follow your order" }).click();
  await page.waitForURL("**/customer/orders/*");
  await page
    .getByRole("heading", { name: "We received your order", exact: true })
    .waitFor({ state: "visible" });
  const cartToPaidProgressMs = Math.round(performance.now() - cartStart);
  await Promise.all(reads);
  assert.equal(chartMarkers, 0);
  assert.equal(externalRequests, 0);
  for (const cookie of await mobile.cookies()) secrets.add(cookie.value);
  await mobile.close();

  // Deterministic visibility events exercise the actual hook, not an OS/physical-device claim.
  const kitchen = await input.kitchenContext.newPage();
  let queueRequests = 0;
  kitchen.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/kitchen/orders") queueRequests++;
  });
  await kitchen.goto(base + "/kitchen", { waitUntil: "networkidle" });
  await pause(1200);
  assert.ok(queueRequests > 0);
  const visibility = async (value: "hidden" | "visible") =>
    kitchen.evaluate((v) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: v,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, value);
  await visibility("hidden");
  await pause(1000);
  const hiddenStart = queueRequests;
  await pause(6000);
  assert.equal(queueRequests, hiddenStart);
  const resumed = kitchen.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/kitchen/orders",
  );
  await visibility("visible");
  await resumed;
  assert.ok(queueRequests > hiddenStart);
  await kitchen.goto(base + "/", { waitUntil: "networkidle" });
  const unmounted = queueRequests;
  await pause(6000);
  assert.equal(queueRequests, unmounted);
  let injected = 0;
  const queuePattern = /\/api\/kitchen\/orders(?:\?.*)?$/;
  await kitchen.route(queuePattern, (route) => {
    injected++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic local slowdown." }),
    });
  });
  await kitchen.goto(base + "/kitchen", { waitUntil: "networkidle" });
  if (injected === 0) await visibility("visible");
  await pause(6000);
  assert.equal(
    injected,
    1,
    "503 polling must back off beyond the healthy interval.",
  );
  await kitchen.unroute(queuePattern);
  let denied = 0;
  await kitchen.route(queuePattern, (route) => {
    denied++;
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Authentication required." }),
    });
  });
  await visibility("visible");
  await pause(6000);
  assert.equal(denied, 1, "Terminal denial must stop polling.");
  await kitchen.close();
  return {
    recordedAt: new Date().toISOString(),
    viewport: { width: 390, height: 844, dpr: 2 },
    network: {
      method: "Chrome CDP emulation",
      latencyMs: 150,
      downloadBitsPerSecond: 1600000,
      uploadBitsPerSecond: 750000,
    },
    usefulMenuMs,
    cartToPaidProgressMs,
    javascriptBytes,
    javascriptCount,
    chartMarkers,
    externalRequests,
    polling: {
      hiddenPause: true,
      visibleResume: true,
      unmountCleanup: true,
      failureBackoff: true,
      terminalDenialStops: true,
    },
    limits: [
      "Browser emulation, not a physical phone.",
      "JS bytes are decoded response bodies, not compressed transfer size.",
      "Synthetic menu has no remote product/poster images; image-heavy mobile traffic requires staging validation.",
    ],
  };
}
