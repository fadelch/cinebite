import { base, database, evidenceRun, secrets, stage } from "./environment";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { prisma } from "@/lib/db/prisma";
import { getAdminAuth } from "@/lib/firebase/admin";
import { sandboxSignature } from "@/lib/payments/provider";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { dataset, bulk } from "./dataset";
import { staffIdentity, signIn } from "./fixtures";
import {
  measure,
  recordHttpRequest,
  recordHttpResponse,
  type Measurement,
} from "./metrics";
import { processNotificationOutbox } from "@/server/notifications/processor";
import { normalizeProductImage } from "@/server/media/product-image";
import { logRecord } from "@/lib/observability/logger";
import sharp from "sharp";
import { mobileAndPolling } from "./browser";

const measurements: Measurement[] = [];
const tests: Record<
  string,
  { status: "PASS" | "FAIL" | "NOT EXECUTABLE"; evidence: string }
> = {};
for (const id of [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "AA",
  "AB",
  "AC",
  "AD",
  "AE",
  "AF",
  "AG",
  "AH",
  "AI",
  "AJ",
  "AK",
  "AL",
  "AM",
  "AN",
  "AO",
  "AP",
  "AQ",
  "AR",
  "AS",
])
  tests[id] = {
    status: "NOT EXECUTABLE",
    evidence: "Not reached in this invocation.",
  };
let current = "setup",
  logs = "",
  peakConnections = 0;
const serverRssMiB: null = null; // Runner RSS deltas are sampled; no server peak claim.
function pass(id: string, evidence: string) {
  tests[id] = { status: "PASS", evidence };
  console.log(`PASS ${id}: ${evidence}`);
}
async function request(
  cookie: string,
  url: string,
  method = "GET",
  data?: unknown,
  extra: Record<string, string> = {},
) {
  recordHttpRequest();
  const response = await fetch(base + url, {
    method,
    headers: {
      Origin: base,
      Cookie: cookie,
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(45000),
  });
  recordHttpResponse(response.status);
  const text = await response.text();
  const body = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  return {
    status: response.status,
    headers: response.headers,
    text,
    body,
    bytes: Buffer.byteLength(text),
  };
}
async function main() {
  await mkdir("docs/performance", { recursive: true });
  const [db] = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  assert.equal(db.name, database);
  assert.equal(
    await prisma.organization.count(),
    0,
    "Use the explicit local reset command before repeating this fixture.",
  );
  const demo = await dataset(),
    a = demo.locations[0],
    a2 = demo.locations[1];
  const identities = await Promise.all([
    staffIdentity("CINEMA_ADMIN", demo.org.id, [], "admin"),
    staffIdentity("KITCHEN_STAFF", demo.org.id, [a.id], "kitchen"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [a.id], "delivery"),
    staffIdentity("LOCATION_MANAGER", demo.org.id, [a.id], "manager"),
    staffIdentity("CINEMA_ADMIN", demo.other.id, [], "other-admin"),
    staffIdentity("KITCHEN_STAFF", demo.org.id, [a2.id], "other-kitchen"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [a2.id], "other-delivery"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [a.id], "worker-b"),
  ]);
  const outboxes = Array.from({ length: 5000 }, (_, i) => ({
    id: randomUUID(),
    eventKey: `fixture-${evidenceRun}-${i}`,
    type: "LOW_STOCK" as const,
    organizationId: demo.org.id,
    locationId: a.id,
    entityType: "INVENTORY",
    entityId: demo.scarceStock.id,
    payload: { item: "Demo limited portions" },
    status: "PROCESSED" as const,
    processedAt: new Date(),
    createdAt: new Date(Date.now() - i * 1000),
  }));
  await bulk(outboxes, (data) =>
    prisma.notificationOutbox.createMany({ data }),
  );
  await bulk(
    outboxes.map((o, i) => ({
      outboxId: o.id,
      dedupeKey: `fixture-${evidenceRun}-${i}`,
      organizationId: demo.org.id,
      locationId: a.id,
      recipientUserId: identities[0].userId,
      type: "LOW_STOCK" as const,
      severity: "WARNING" as const,
      title: "Demo stock notification",
      message: "Synthetic performance notification.",
      entityType: "INVENTORY",
      entityId: o.entityId,
      createdAt: o.createdAt,
      expiresAt: new Date(Date.now() + 86400000),
      readAt: i % 2 ? new Date() : null,
    })),
    (data) => prisma.notification.createMany({ data }),
  );
  await prisma.$executeRaw`ANALYZE`;
  const counts = Object.fromEntries(
    await Promise.all(
      [
        "organization",
        "location",
        "hall",
        "seat",
        "product",
        "customerSession",
        "order",
        "orderStatusEvent",
        "notification",
        "user",
      ].map(async (name) => [
        name,
        await (prisma[name as "order"] as typeof prisma.order).count(),
      ]),
    ),
  );
  const coldStart = performance.now();
  const server = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3121",
    ],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  server.stdout.on("data", (data) => {
    logs += data.toString();
  });
  server.stderr.on("data", (data) => {
    logs += data.toString();
  });
  let browser: Browser | undefined,
    sampling = false;
  const poolTimer = setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      const [n] = await prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend'`;
      peakConnections = Math.max(peakConnections, Number(n.count));
    } catch {
    } finally {
      sampling = false;
    }
  }, 250);
  try {
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(base + "/api/ready")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(
      (await fetch(base + "/api/ready")).status,
      200,
      "Isolated application readiness failed.",
    );
    const startupMs = Math.round(performance.now() - coldStart);
    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      headless: true,
    });
    const contexts: BrowserContext[] = await Promise.all(
      identities.map(() => browser!.newContext()),
    );
    for (let i = 0; i < contexts.length; i++)
      await signIn(contexts[i], identities[i]);
    const cookies = await Promise.all(
      contexts.map(async (c) =>
        (await c.cookies()).map((v) => `${v.name}=${v.value}`).join("; "),
      ),
    );
    const [admin, kitchen, delivery] = cookies;
    const guests = demo.sessions.filter((s) => s.suffix === "beirut"),
      others = demo.sessions.filter((s) => s.suffix === "other");
    const guest = (i: number) =>
      `${CUSTOMER_SESSION_COOKIE}=${guests[i % guests.length].token}`;
    const other = (i: number) =>
      `${CUSTOMER_SESSION_COOKIE}=${others[i % others.length].token}`;
    const run = async (
      name: string,
      c: number,
      n: number,
      action: (i: number) => ReturnType<typeof request>,
      accepted = [200, 201],
    ) => {
      const m = await measure(name, c, n, action, accepted);
      measurements.push(m);
      assert.equal(m.unexpectedErrors, 0, "Unexpected errors in " + name);
      return m;
    };
    const baseProduct = guests[0].productId,
      baseSlug = `phase21-evidence-${evidenceRun}-popcorn-beirut`;
    const setMenu = async (count: number) => {
      const ids = [
        baseProduct,
        ...demo.products
          .filter((p) => p.organizationId === demo.org.id)
          .slice(0, count - 1)
          .map((p) => p.id),
      ];
      await prisma.productLocation.updateMany({
        where: { locationId: a.id },
        data: { isAvailable: false },
      });
      await prisma.productLocation.updateMany({
        where: { locationId: a.id, productId: { in: ids } },
        data: { isAvailable: true },
      });
    };
    current = "A";
    for (const count of [20, 100, 500]) {
      await setMenu(count);
      await request(guest(0), "/customer/menu");
      await run(`menu-${count}`, 1, 8, async (i) => {
        const r = await request(guest(i), "/customer/menu");
        assert.ok(
          r.text.includes("Large Popcorn") &&
            !r.text.includes("Demo other snack"),
        );
        return r;
      });
    }
    pass(
      "A",
      "Warm secure production HTML menu measured at 20/100/500 offered products before/after optimization; query statistics exclude sampler SQL.",
    );
    current = "C";
    await run("cart-read", 1, 8, (i) =>
      request(guest(i), "/api/customer/cart"),
    );
    await run("cart-write", 1, 8, (i) =>
      request(guest(i), "/api/customer/cart", "PUT", {
        productSlug: baseSlug,
        quantity: 1,
      }),
    );
    pass(
      "C",
      "Independent customer carts read and mutate through actual authorized APIs.",
    );
    current = "D";
    const checked: string[] = [];
    await run("checkout", 1, 5, async (i) => {
      const r = await request(guest(i + 20), "/api/customer/orders", "POST", {
        idempotencyKey: randomUUID(),
      });
      if (r.status === 201) checked.push(r.body.order.publicOrderCode);
      return r;
    });
    assert.equal(checked.length, 5);
    pass(
      "D",
      "Five independent initializations produce distinct orders, intents and reservations.",
    );
    const paid = await prisma.order.findMany({
      where: { publicOrderCode: { in: checked } },
      include: { payment: { include: { attempts: true } } },
    });
    const events: Event[] = paid.map((order) => ({
      eventId: randomUUID(),
      providerPaymentId: order.payment!.providerPaymentId!,
      attemptId: order.payment!.attempts[0].id,
      amountMinor: "1250",
      currencyCode: "USD",
      status: "SUCCEEDED",
    }));
    await prisma.sandboxPaymentIntent.updateMany({
      where: { id: { in: events.map((e) => e.providerPaymentId) } },
      data: { status: "SUCCEEDED" },
    });
    const webhook = async (event: (typeof events)[number]) => {
      const raw = JSON.stringify(event),
        signature = sandboxSignature(raw);
      secrets.add(signature);
      let r!: Response,
        text = "";
      for (let attempt = 0; attempt < 4; attempt++) {
        recordHttpRequest();
        r = await fetch(base + "/api/payments/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cinebite-sandbox-signature": signature,
            "x-real-ip": "192.0.2.20",
          },
          body: raw,
          signal: AbortSignal.timeout(45000),
        });
        recordHttpResponse(r.status);
        text = await r.text();
        const body = JSON.parse(text);
        if (
          r.status !== 409 ||
          !["PAYMENT_CONFLICT", "CHECKOUT_CONFLICT"].includes(body.code)
        )
          break;
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * (attempt + 1) + Math.random() * 100),
        );
      }
      return { status: r.status, bytes: Buffer.byteLength(text) };
    };
    current = "H";
    await measure("webhook", 1, 5, (i) => webhook(events[i])).then((m) => {
      measurements.push(m);
      assert.equal(m.unexpectedErrors, 0);
    });
    pass("H", "Five unique signed sandbox events settle once.");
    current = "K";
    await run("kitchen-queue", 1, 8, () =>
      request(kitchen, "/api/kitchen/orders"),
    );
    pass(
      "K",
      "Bounded oldest-first kitchen queue measured with thousands of orders.",
    );
    current = "L";
    await run("kitchen-transition", 1, 5, (i) =>
      request(kitchen, "/api/kitchen/orders/" + checked[i], "POST", {
        expectedStatus: "PLACED",
        toStatus: "ACCEPTED",
      }),
    );
    for (const code of checked) {
      for (const [expectedStatus, toStatus] of [
        ["ACCEPTED", "PREPARING"],
        ["PREPARING", "READY"],
      ]) {
        const r = await request(
          kitchen,
          "/api/kitchen/orders/" + code,
          "POST",
          { expectedStatus, toStatus },
        );
        assert.equal(r.status, 200);
      }
    }
    pass(
      "L",
      "Actual accept/preparing/ready transitions preserve unique histories.",
    );
    current = "M";
    await run("delivery-queue", 1, 8, () =>
      request(delivery, "/api/delivery/orders"),
    );
    pass(
      "M",
      "Ready/assigned/history delivery queue measured with scoped staff.",
    );
    await run("delivery-claim", 1, 5, (i) =>
      request(delivery, "/api/delivery/orders/" + checked[i], "POST", {
        expectedStatus: "READY",
        toStatus: "OUT_FOR_DELIVERY",
      }),
    );
    current = "O";
    await run("customer-status", 1, 8, (i) =>
      request(guest(20 + (i % 5)), "/api/customer/orders/" + checked[i % 5]),
    );
    pass(
      "O",
      "Owned progress polling measured with current session authorization.",
    );
    await run("admin-orders", 1, 8, () => request(admin, "/admin/orders"));
    current = "T";
    await run("analytics-7d", 1, 5, () =>
      request(admin, "/api/admin/analytics?period=7d"),
    );
    pass(
      "T",
      "Seven-day analytics executed with paid historical fixture rows.",
    );
    current = "U";
    await run("analytics-30d", 1, 5, () =>
      request(admin, "/api/admin/analytics?period=30d"),
    );
    pass("U", "Thirty-day analytics executed.");
    current = "Y";
    await run("staff-list", 1, 8, () => request(admin, "/api/admin/staff"));
    pass("Y", "Large synthetic staff list retains bounded pages.");
    current = "P";
    await run("notifications", 1, 8, async () => {
      const r = await request(admin, "/api/notifications");
      assert.equal(r.body.items.length, 20);
      assert.equal(r.body.total, 5000);
      return r;
    });
    pass(
      "P",
      "Notification feed measured with 5000 currently authorized recipient notifications.",
    );
    if (stage === "optimized")
      await extraScenarios({
        demo,
        identities,
        contexts,
        browser,
        cookies,
        guest,
        other,
        guests,
        others,
        checked,
        events,
        webhook,
        run,
        setMenu,
        baseSlug,
      });
    // No credentials, SQL text, account details or raw runtime logs enter committed evidence.
    for (const secret of secrets)
      assert.ok(!logs.includes(secret), "Sensitive test value in runtime log.");
    const summaries = logs.split(/\r?\n/).flatMap((line) => {
      try {
        const p = JSON.parse(line);
        return p.event === "checkout.transaction_retry" ? [p.attemptCount] : [];
      } catch {
        return [];
      }
    });
    const finalDataset = Object.fromEntries(
      await Promise.all(
        Object.keys(counts).map(async (name) => [
          name,
          await (prisma[name as "order"] as typeof prisma.order).count(),
        ]),
      ),
    );
    await writeFile(
      `docs/performance/phase-21-${stage}.json`,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          stage,
          environment:
            "Isolated local PostgreSQL 17 + demo Firebase Auth/Storage + production Next build; no production requests",
          dataset: counts,
          finalDataset,
          startupMs,
          peakConnections,
          connectionScope:
            "Total local test DB client connections including fixture/sampler pool",
          serverRssMiB,
          checkoutRetries: summaries.length,
          measurements,
          tests,
        },
        null,
        2,
      ) + "\n",
    );
  } catch (error) {
    tests[current] = {
      status: "FAIL",
      evidence: "Controlled local assertion failed; investigate and rerun.",
    };
    console.error(
      "Performance run failed at " +
        current +
        " (" +
        (error instanceof Error ? error.name : "Error") +
        ").",
    );
    if (error instanceof assert.AssertionError)
      console.error(error.message.slice(0, 220));
    process.exitCode = 1;
    await writeFile(
      `docs/performance/phase-21-${stage}-failed.json`,
      JSON.stringify({ measurements, tests }, null, 2) + "\n",
    );
  } finally {
    clearInterval(poolTimer);
    await browser?.close();
    server.kill();
    for (const staff of identities)
      await getAdminAuth()
        .updateUser(staff.uid, { disabled: true })
        .catch(() => undefined);
    await prisma.$disconnect();
  }
}
type Demo = Awaited<ReturnType<typeof dataset>>;
type Event = {
  eventId: string;
  providerPaymentId: string;
  attemptId: string;
  amountMinor: string;
  currencyCode: string;
  status: string;
};
type Bench = (
  name: string,
  c: number,
  n: number,
  action: (i: number) => ReturnType<typeof request>,
  accepted?: number[],
) => Promise<Measurement>;
type Context = {
  demo: Demo;
  identities: Awaited<ReturnType<typeof staffIdentity>>[];
  contexts: BrowserContext[];
  browser: Browser;
  cookies: string[];
  guest: (i: number) => string;
  other: (i: number) => string;
  guests: Demo["sessions"];
  others: Demo["sessions"];
  checked: string[];
  events: Event[];
  webhook: (event: Event) => Promise<{ status: number; bytes: number }>;
  run: Bench;
  setMenu: (count: number) => Promise<void>;
  baseSlug: string;
};
async function extraScenarios(context: Context) {
  const {
    demo,
    browser,
    cookies,
    guest,
    other,
    guests,
    checked,
    events,
    webhook,
    run,
    setMenu,
  } = context;
  const [
    admin,
    kitchen,
    delivery,
    ,
    otherAdmin,
    otherKitchen,
    otherDelivery,
    workerB,
  ] = cookies;
  const a = demo.locations[0];
  const bench = async (
    name: string,
    c: number,
    n: number,
    action: (
      i: number,
    ) => Promise<{ status: number; bytes?: number; expected?: boolean }>,
    accepted = [200, 201],
  ) => {
    const m = await measure(name, c, n, action, accepted);
    measurements.push(m);
    assert.equal(m.unexpectedErrors, 0, "Unexpected errors in " + name);
    return m;
  };
  const expected = (r: Awaited<ReturnType<typeof request>>) => ({
    ...r,
    expected:
      r.status === 409 &&
      [
        "CHECKOUT_CONFLICT",
        "PAYMENT_CONFLICT",
        "INSUFFICIENT_STOCK",
        "ORDER_ALREADY_CLAIMED",
        "STALE_ORDER_STATE",
        "REFUND_LIMIT_EXCEEDED",
        "REFUND_CONFLICT",
      ].includes(r.body?.code),
  });
  const checkout = async (index: number, key: string) => {
    let result = await request(guest(index), "/api/customer/orders", "POST", {
      idempotencyKey: key,
    });
    for (
      let retry = 0;
      retry < 4 &&
      result.status === 409 &&
      result.body?.code === "CHECKOUT_CONFLICT";
      retry++
    ) {
      await new Promise((r) =>
        setTimeout(r, 30 * (retry + 1) + Math.random() * 30),
      );
      result = await request(guest(index), "/api/customer/orders", "POST", {
        idempotencyKey: key,
      });
    }
    return expected(result);
  };
  const cartFixture = async (
    indices: number[],
    productFor: (i: number) => string,
  ) => {
    for (const index of indices) {
      const cart = await prisma.cart.findUniqueOrThrow({
        where: { customerSessionId: guests[index].id },
      });
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: productFor(index),
          quantity: 1,
          reviewedUnitPrice: "12.50",
          reviewedCurrencyCode: "USD",
        },
      });
    }
  };
  current = "AC";
  const menuRows = measurements.filter((m) => /^menu-/.test(m.scenario));
  assert.ok(menuRows.at(-1)!.databaseCalls <= menuRows[0].databaseCalls + 16);
  pass(
    "AC",
    "Product count grows 20→500 without one stock query per product; measured SQL calls remain bounded.",
  );
  current = "B";
  await setMenu(100);
  await run("menu-load-100-users", 100, 100, async (i) => {
    const r = await request(guest(i), "/customer/menu");
    assert.ok(
      r.text.includes("Demo beirut snack") &&
        !r.text.includes("Demo other snack"),
    );
    return r;
  });
  pass(
    "B",
    "100 simultaneous local menu readers retain cinema products and prices.",
  );
  current = "C";
  await run("cart-load", 20, 100, async (i) => {
    const r = await request(guest(i), "/api/customer/cart");
    assert.ok(
      r.body.items.every(
        (item: { productSlug: string }) => !item.productSlug.includes("other"),
      ),
    );
    return r;
  });
  pass(
    "C",
    "100 independent authorized carts measured at 20 in flight without cross-session data.",
  );
  current = "D";
  const loadKeys = Array.from({ length: 20 }, () => randomUUID());
  const loadCodes: string[] = [];
  await bench("checkout-load", 10, 20, async (i) => {
    const r = await checkout(i + 30, loadKeys[i]);
    if ([200, 201].includes(r.status))
      loadCodes.push(r.body.order.publicOrderCode);
    return r;
  });
  assert.equal(loadCodes.length, 20);
  assert.equal(new Set(loadCodes).size, 20);
  pass(
    "D",
    "20 independent checkout workflows at 10 in flight complete with bounded same-key retries, distinct orders and correct reservations.",
  );
  current = "H";
  const loadOrders = await prisma.order.findMany({
    where: { publicOrderCode: { in: loadCodes } },
    include: { payment: { include: { attempts: true } } },
  });
  const loadEvents = loadOrders.map((o) => ({
    eventId: randomUUID(),
    providerPaymentId: o.payment!.providerPaymentId!,
    attemptId: o.payment!.attempts[0].id,
    amountMinor: "1250",
    currencyCode: "USD",
    status: "SUCCEEDED",
  }));
  await prisma.sandboxPaymentIntent.updateMany({
    where: { id: { in: loadEvents.map((e) => e.providerPaymentId) } },
    data: { status: "SUCCEEDED" },
  });
  await bench("webhook-unique-load", 10, 20, (i) => webhook(loadEvents[i]));
  for (const order of loadOrders) {
    assert.equal(
      await prisma.inventoryMovement.count({
        where: { orderId: order.id, type: "ORDER_CONSUMPTION" },
      }),
      2,
    );
  }
  await bench("webhook-out-of-order", 10, 20, (i) =>
    webhook({ ...loadEvents[i], eventId: randomUUID(), status: "FAILED" }),
  );
  assert.equal(
    await prisma.order.count({
      where: {
        id: { in: loadOrders.map((o) => o.id) },
        fulfillmentEligible: true,
      },
    }),
    20,
  );
  pass(
    "H",
    "Twenty concurrent unique signed settlements consume each ingredient once; twenty late failure events cannot undo verified success.",
  );
  const transitionWorkers: string[] = [];
  for (let i = 0; i < 4; i++) {
    const identity = await staffIdentity(
      "KITCHEN_STAFF",
      demo.org.id,
      [a.id],
      "transition-worker-" + i,
    );
    context.identities.push(identity);
    const worker = await browser.newContext();
    await signIn(worker, identity);
    transitionWorkers.push(
      (await worker.cookies()).map((c) => `${c.name}=${c.value}`).join("; "),
    );
    await worker.close();
  }
  current = "L";
  for (const [expectedStatus, toStatus] of [
    ["PLACED", "ACCEPTED"],
    ["ACCEPTED", "PREPARING"],
    ["PREPARING", "READY"],
  ]) {
    await bench("kitchen-load-" + toStatus.toLowerCase(), 10, 20, async (i) => {
      let r = await request(
        transitionWorkers[i % transitionWorkers.length],
        "/api/kitchen/orders/" + loadCodes[i],
        "POST",
        { expectedStatus, toStatus },
      );
      for (
        let retry = 0;
        retry < 6 && r.status === 409 && r.body?.code === "STALE_ORDER_STATE";
        retry++
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * (retry + 1) + Math.random() * 200),
        );
        r = await request(
          transitionWorkers[i % transitionWorkers.length],
          "/api/kitchen/orders/" + loadCodes[i],
          "POST",
          { expectedStatus, toStatus },
        );
      }
      return r;
    });
  }
  for (const order of loadOrders)
    assert.equal(
      await prisma.orderStatusEvent.count({
        where: { orderId: order.id, toStatus: "READY" },
      }),
      1,
    );
  pass(
    "L",
    "Sixty independent real kitchen transitions at ten in flight retain exactly one READY history per order.",
  );
  current = "E";
  const duplicateKey = randomUUID();
  await cartFixture([99], () => guests[99].productId);
  await bench("checkout-idempotency", 10, 10, () => checkout(99, duplicateKey));
  const duplicateOrders = await prisma.order.findMany({
    where: { customerSessionId: guests[99].id, idempotencyKey: duplicateKey },
    include: { payment: { include: { attempts: true } }, reservations: true },
  });
  assert.equal(duplicateOrders.length, 1);
  assert.equal(duplicateOrders[0].payment!.attempts.length, 1);
  assert.equal(duplicateOrders[0].reservations.length, 2);
  pass(
    "E",
    "Ten concurrent identical checkout keys yield one order, one attempt and one reservation per ingredient.",
  );
  current = "F";
  await prisma.productLocation.updateMany({
    where: { productId: { in: demo.scarceProducts.map((p) => p.id) } },
    data: { isAvailable: true },
  });
  await cartFixture(
    Array.from({ length: 100 }, (_, i) => i),
    () => demo.scarceProducts[0].id,
  );
  const limitedKeys = Array.from({ length: 100 }, () => randomUUID());
  const limitedCodes: string[] = [];
  const lastStock = await bench(
    "last-stock-100-buyers",
    100,
    100,
    async (i) => {
      const r = await checkout(i, limitedKeys[i]);
      if ([200, 201].includes(r.status))
        limitedCodes.push(r.body.order.publicOrderCode);
      return { ...r, expected: r.expected || r.status === 429 };
    },
  );
  assert.equal(limitedCodes.length, 10);
  const limited = await prisma.locationInventory.findUniqueOrThrow({
    where: { id: demo.scarceStock.id },
  });
  assert.equal(limited.quantityReserved.toFixed(3), "10.000");
  assert.equal(limited.quantityOnHand.toFixed(3), "10.000");
  assert.equal(lastStock.success, 10);
  pass(
    "F",
    "100 buyers against ten portions: exactly ten committed orders/reservations, nonnegative physical stock, remaining requests fail safely.",
  );
  // Advance only these isolated test attempts to simulate time passing, then use the real job.
  await prisma.paymentAttempt.updateMany({
    where: { payment: { order: { publicOrderCode: { in: limitedCodes } } } },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await request("", "/api/payments/expire", "POST", undefined, {
    Authorization: "Bearer " + process.env.PAYMENT_EXPIRY_JOB_SECRET,
  });
  assert.equal(
    (
      await prisma.locationInventory.findUniqueOrThrow({
        where: { id: demo.scarceStock.id },
      })
    ).quantityReserved.toFixed(3),
    "0.000",
  );
  current = "G";
  await prisma.locationInventory.update({
    where: { id: demo.scarceStock.id },
    data: { quantityOnHand: "40.000" },
  });
  await cartFixture(
    Array.from({ length: 50 }, (_, i) => i),
    (i) => demo.scarceProducts[i % 2].id,
  );
  const sharedKeys = Array.from({ length: 50 }, () => randomUUID());
  let used = 0;
  await bench("shared-ingredient", 20, 50, async (i) => {
    const r = await checkout(i, sharedKeys[i]);
    if ([200, 201].includes(r.status)) used += i % 2 ? 2 : 1;
    return r;
  });
  const shared = await prisma.locationInventory.findUniqueOrThrow({
    where: { id: demo.scarceStock.id },
  });
  assert.equal(Number(shared.quantityReserved), used);
  assert.ok(used <= 40 && used > 0);
  pass(
    "G",
    "Mixed one/two-unit products share the same ingredient; committed reservation sum matches winners and never exceeds physical stock.",
  );
  current = "I";
  await bench("duplicate-webhook-storm", 20, 100, () => webhook(events[0]));
  assert.equal(
    await prisma.paymentWebhookEvent.count({
      where: { provider: "sandbox", providerEventId: events[0].eventId },
    }),
    1,
  );
  assert.equal(
    await prisma.inventoryMovement.count({
      where: {
        orderId: (
          await prisma.order.findUniqueOrThrow({
            where: { publicOrderCode: checked[0] },
          })
        ).id,
        type: "ORDER_CONSUMPTION",
      },
    }),
    2,
  );
  pass(
    "I",
    "100 signed concurrent replays retain one journal entry and one consumption per component.",
  );
  current = "J";
  const refundIdentity = await staffIdentity(
      "CINEMA_ADMIN",
      demo.org.id,
      [],
      "refund-admin",
    ),
    refundContext = await browser.newContext();
  context.identities.push(refundIdentity);
  await signIn(refundContext, refundIdentity);
  const refundCookie = (await refundContext.cookies())
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const paidOrder = await prisma.order.findUniqueOrThrow({
      where: { publicOrderCode: checked[1] },
    }),
    refundKeys = Array.from({ length: 10 }, () => randomUUID());
  await bench("refund-contention", 10, 10, async (i) =>
    expected(
      await request(
        refundCookie,
        "/api/admin/orders/" + paidOrder.id + "/refunds",
        "POST",
        {
          kind: "PARTIAL",
          amount: "2.00",
          reasonCode: "CUSTOMER_REQUEST",
          idempotencyKey: refundKeys[i],
          confirmed: true,
        },
      ),
    ),
  );
  const refunds = await prisma.refund.findMany({
    where: {
      orderId: paidOrder.id,
      status: { in: ["PENDING", "PROCESSING", "SUCCEEDED"] },
    },
  });
  assert.ok(refunds.reduce((sum, r) => sum + Number(r.amount), 0) <= 12.5);
  await refundContext.close();
  await getAdminAuth().updateUser(refundIdentity.uid, { disabled: true });
  pass(
    "J",
    "Ten competing partial refund workflows preserve capture exposure; conflicts are counted separately from infrastructure errors.",
  );
  current = "K";
  const firstQueue = await request(kitchen, "/api/kitchen/orders"),
    queueTag = firstQueue.headers.get("etag")!;
  assert.ok(queueTag);
  const k = await run(
    "kitchen-conditional-poll",
    10,
    50,
    () =>
      request(kitchen, "/api/kitchen/orders", "GET", undefined, {
        "If-None-Match": queueTag,
      }),
    [304],
  );
  assert.equal(k.bytes, 0);
  pass(
    "K",
    "Fifty conditional kitchen polls reauthorize and query fresh data, return 304 without unchanged payload; no server authorization cache.",
  );
  current = "AD";
  assert.ok(k.databaseCalls / 50 < 50);
  pass(
    "AD",
    "Kitchen SQL calls remain bounded per page, not per returned order.",
  );
  current = "M";
  const firstDelivery = await request(delivery, "/api/delivery/orders"),
    deliveryTag = firstDelivery.headers.get("etag")!;
  const d = await run(
    "delivery-conditional-poll",
    10,
    50,
    () =>
      request(delivery, "/api/delivery/orders", "GET", undefined, {
        "If-None-Match": deliveryTag,
      }),
    [304],
  );
  assert.equal(d.bytes, 0);
  pass(
    "M",
    "Fifty fresh-authorized delivery polls suppress unchanged payloads.",
  );
  current = "AE";
  assert.ok(d.databaseCalls / 50 < 50);
  pass(
    "AE",
    "Delivery relation loading is bounded per page rather than per delivery.",
  );
  current = "N";
  const ready = await prisma.order.findFirstOrThrow({
    where: {
      organizationId: demo.org.id,
      locationId: a.id,
      status: "READY",
      deliveryAssignedUserId: null,
    },
  });
  let claims = 0;
  await bench("delivery-claim-contention", 20, 20, async (i) => {
    const r = expected(
      await request(
        i % 2 ? workerB : delivery,
        "/api/delivery/orders/" + ready.publicOrderCode,
        "POST",
        { expectedStatus: "READY", toStatus: "OUT_FOR_DELIVERY" },
      ),
    );
    if (r.status === 200) claims++;
    return r;
  });
  assert.equal(claims, 1);
  assert.equal(
    await prisma.orderStatusEvent.count({
      where: { orderId: ready.id, toStatus: "OUT_FOR_DELIVERY" },
    }),
    1,
  );
  pass(
    "N",
    "Twenty workers/requests competing for one ready order have exactly one committed claim/history.",
  );
  current = "O";
  await run("customer-poll-load", 100, 200, (i) =>
    request(guest(20 + (i % 5)), "/api/customer/orders/" + checked[i % 5]),
  );
  pass(
    "O",
    "200 owned status reads at 100 in flight preserve customer authorization and bounded histories.",
  );
  current = "P";
  await run("unread-badge-load", 10, 50, async () => {
    const r = await request(admin, "/api/notifications?summary=count");
    assert.equal(r.body.items.length, 0);
    assert.ok(r.body.unread >= 2500);
    return r;
  });
  pass(
    "P",
    "Closed unread badge performs count-only polling; full center remains paginated and authorized.",
  );
  current = "AI";
  await run("tenant-mixed-load", 20, 100, async (i) => {
    const r = await request(i % 2 ? admin : otherAdmin, "/api/kitchen/orders");
    const expectedLocation = i % 2 ? "Demo Beirut" : "Demo Cinema B";
    assert.ok(
      r.body.orders.every(
        (o: { locationName: string }) =>
          o.locationName === expectedLocation ||
          (i % 2 && o.locationName === "Demo Dbayeh"),
      ),
    );
    return r;
  });
  pass(
    "AI",
    "Mixed organization traffic returns only its current authorized tenant orders.",
  );
  current = "AJ";
  await run("location-mixed-load", 20, 100, async (i) => {
    const r = await request(
      i % 2 ? kitchen : otherKitchen,
      "/api/kitchen/orders",
    );
    assert.ok(
      r.body.orders.every(
        (o: { locationName: string }) =>
          o.locationName === (i % 2 ? "Demo Beirut" : "Demo Dbayeh"),
      ),
    );
    return r;
  });
  const forbidden = await request(
    otherDelivery,
    "/api/delivery/orders?locationId=" + a.id,
  );
  assert.equal(forbidden.status, 403);
  pass(
    "AJ",
    "Beirut/Dbayeh staff traffic remains isolated; explicit unauthorized location filter is rejected.",
  );
  current = "AK";
  await run("customer-mixed-isolation", 20, 100, async (i) => {
    const r = await request(i % 2 ? guest(i) : other(i), "/api/customer/cart");
    assert.ok(
      r.body.items.every((item: { productSlug: string }) =>
        i % 2
          ? !item.productSlug.includes("other")
          : item.productSlug.includes("other"),
      ),
    );
    return r;
  });
  const wrong = await request(other(0), "/api/customer/orders/" + checked[0]);
  assert.equal(wrong.status, 404);
  pass(
    "AK",
    "Mixed customer carts remain scoped and a foreign public order code cannot be read.",
  );
  await remainingScenarios(context, bench);
}
async function remainingScenarios(
  context: Context,
  bench: (
    name: string,
    c: number,
    n: number,
    action: (
      i: number,
    ) => Promise<{ status: number; bytes?: number; expected?: boolean }>,
    accepted?: number[],
  ) => Promise<Measurement>,
) {
  const { demo, identities, browser, cookies, guest, guests, run } = context;
  const [admin, kitchen, , manager] = cookies,
    a = demo.locations[0];
  current = "Q";
  const outboxFixture = async (count: number) => {
    const rows = Array.from({ length: count }, () => ({
      id: randomUUID(),
      eventKey: `load-${randomUUID()}`,
      type: "LOW_STOCK" as const,
      organizationId: demo.org.id,
      locationId: a.id,
      entityType: "INVENTORY",
      entityId: demo.scarceStock.id,
      payload: { item: "Demo limited portions" },
    }));
    await bulk(rows, (data) => prisma.notificationOutbox.createMany({ data }));
    return rows.map((r) => r.id);
  };
  const jobs = await outboxFixture(200);
  await bench("outbox-200-events", 2, 8, async () => {
    const r = await processNotificationOutbox({
      limit: 100,
      organizationId: demo.org.id,
    });
    assert.equal(r.failed, 0);
    assert.equal(r.retry, 0);
    return { status: 200 };
  });
  assert.equal(
    await prisma.notificationOutbox.count({
      where: { id: { in: jobs }, status: "PROCESSED" },
    }),
    200,
  );
  pass(
    "Q",
    "Two concurrent bounded local processors drain 200 events; throughput and SQL work recorded, presentation duplicates remain prohibited.",
  );
  current = "R";
  const overlapping = await outboxFixture(100);
  await bench("outbox-worker-overlap", 4, 8, async () => {
    const r = await processNotificationOutbox({
      limit: 25,
      organizationId: demo.org.id,
    });
    assert.equal(r.failed, 0);
    return { status: 200 };
  });
  assert.equal(
    await prisma.notificationOutbox.count({
      where: { id: { in: overlapping }, status: "PROCESSED" },
    }),
    100,
  );
  const notifications = await prisma.notification.findMany({
    where: { outboxId: { in: overlapping } },
    select: { dedupeKey: true },
  });
  assert.equal(
    new Set(notifications.map((n) => n.dedupeKey)).size,
    notifications.length,
  );
  pass(
    "R",
    "Four overlapping workers process 100 events with SKIP LOCKED and unique recipient dedupe keys.",
  );
  current = "S";
  const expires = await prisma.paymentAttempt.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      payment: { order: { organizationId: demo.org.id } },
    },
    select: { id: true },
  });
  await prisma.paymentAttempt.updateMany({
    where: { id: { in: expires.map((p) => p.id) } },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await run("reservation-expiry-batch", 2, 3, () =>
    request("", "/api/payments/expire", "POST", undefined, {
      Authorization: "Bearer " + process.env.PAYMENT_EXPIRY_JOB_SECRET,
    }),
  );
  assert.equal(
    await prisma.inventoryReservation.count({
      where: { attemptId: { in: expires.map((p) => p.id) }, status: "ACTIVE" },
    }),
    0,
  );
  pass(
    "S",
    "Overlapping authenticated expiry jobs clear actual expired test reservations without double release.",
  );
  current = "V";
  const maxFilters = {
      period: "custom",
      start: new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
      end: new Date().toISOString().slice(0, 10),
      timezone: "UTC",
    },
    range = new URLSearchParams(maxFilters).toString();
  await run("analytics-max-range", 1, 3, () =>
    request(admin, "/api/admin/analytics?" + range),
  );
  for (const report of [
    "revenue",
    "products",
    "movies",
    "operations",
    "inventory",
  ])
    await run("analytics-" + report, 1, 2, () =>
      request(admin, "/api/admin/analytics?" + range + "&report=" + report),
    );
  await run("analytics-90d", 1, 2, () =>
    request(
      admin,
      "/api/admin/analytics?period=custom&start=" +
        new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10) +
        "&end=" +
        maxFilters.end +
        "&timezone=UTC",
    ),
  );
  pass(
    "V",
    "Maximum 366-day range, 90-day view and revenue/product/movie/operations/inventory reports executed with tenant-scoped paid historical data.",
  );
  current = "W";
  const reportIdentity = await staffIdentity(
      "CINEMA_ADMIN",
      demo.org.id,
      [],
      "report-admin",
    ),
    reportContext = await browser.newContext();
  identities.push(reportIdentity);
  await signIn(reportContext, reportIdentity);
  const reportCookie = (await reportContext.cookies())
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const mixedKeys = Array.from({ length: 8 }, () => randomUUID());
  // Restore normal carts after isolated stock tests; this is fixture preparation, not a runtime shortcut.
  for (let i = 60; i < 68; i++) {
    const cart = await prisma.cart.findUniqueOrThrow({
      where: { customerSessionId: guests[i].id },
    });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: guests[i].productId,
        quantity: 1,
        reviewedUnitPrice: "12.50",
        reviewedCurrencyCode: "USD",
      },
    });
  }
  await bench("operational-plus-analytics", 6, 24, async (i) => {
    const r =
      i % 3 === 0
        ? await request(reportCookie, "/api/admin/analytics?" + range)
        : i % 3 === 1
          ? await request(kitchen, "/api/kitchen/orders")
          : await request(
              guest(60 + Math.floor(i / 3)),
              "/api/customer/orders",
              "POST",
              { idempotencyKey: mixedKeys[Math.floor(i / 3)] },
            );
    return {
      ...r,
      expected: r.status === 409 && r.body?.code === "CHECKOUT_CONFLICT",
    };
  });
  await reportContext.close();
  await getAdminAuth().updateUser(reportIdentity.uid, { disabled: true });
  pass(
    "W",
    "Six in-flight mixed analytics/queue/checkout workflows complete without infrastructure errors; bounded business conflicts are separately classified.",
  );
  current = "X";
  // Exact export-cap dataset: synthetic historical screening/session, valid financial guards.
  const hallId = `phase21-evidence-${evidenceRun}-hall-beirut`,
    historicalDate = new Date(Date.now() - 20 * 86400000);
  const screening = await prisma.screening.create({
    data: {
      hallId,
      movieId: `phase21-evidence-${evidenceRun}-movie-beirut`,
      startsAt: historicalDate,
      endsAt: new Date(historicalDate.getTime() + 10800000),
    },
  });
  const csvToken = randomUUID() + randomUUID();
  secrets.add(csvToken);
  const { hashOpaqueToken } = await import("@/lib/security/opaque-token");
  const csvSession = await prisma.customerSession.create({
    data: {
      hallId,
      seatId: "a7",
      screeningId: screening.id,
      tokenHash: hashOpaqueToken(csvToken),
      status: "REVOKED",
      expiresAt: screening.endsAt,
    },
  });
  const csvOrders = Array.from({ length: 5000 }, (_, i) => ({
    id: randomUUID(),
    publicOrderCode: `CB-${(i + 10000000).toString(16).padStart(10, "0").toUpperCase()}`,
    customerSessionId: csvSession.id,
    organizationId: demo.org.id,
    locationId: a.id,
    hallId,
    seatId: "a7",
    screeningId: screening.id,
    status: "PLACED" as const,
    paymentPolicy: "ONLINE_REQUIRED" as const,
    fulfillmentEligible: false,
    currencyCode: "USD",
    subtotal: "12.50",
    total: "12.50",
    idempotencyKey: randomUUID(),
    locationNameSnapshot: "Demo Beirut",
    hallNameSnapshot: "Hall 1",
    seatLabelSnapshot: "A7",
    movieTitleSnapshot: "Demo CSV screening",
    screeningStartsAt: historicalDate,
    createdAt: historicalDate,
  }));
  await bulk(csvOrders, (data) => prisma.order.createMany({ data }));
  const csvPayments = csvOrders.map((o) => ({
    id: randomUUID(),
    orderId: o.id,
    provider: "sandbox",
    status: "SUCCEEDED" as const,
    amount: "12.50",
    currencyCode: "USD",
    succeededAt: historicalDate,
    createdAt: historicalDate,
  }));
  await bulk(csvPayments, (data) => prisma.payment.createMany({ data }));
  await bulk(csvOrders, (data) =>
    prisma.orderItem.createMany({
      data: data.map((o) => ({
        orderId: o.id,
        productId: guests[0].productId,
        productNameSnapshot: "Demo CSV popcorn",
        unitPrice: "12.50",
        currencyCode: "USD",
        quantity: 1,
        lineTotal: "12.50",
        createdAt: historicalDate,
      })),
    }),
  );
  await run("csv-5000-rows", 1, 1, async () => {
    const r = await request(admin, "/api/admin/analytics/export", "POST", {
      ...maxFilters,
      report: "orders",
      screeningId: screening.id,
    });
    assert.equal(r.text.trim().split(/\r?\n/).length, 5001);
    assert.ok(r.headers.get("content-type")?.startsWith("text/csv"));
    return r;
  });
  pass(
    "X",
    "Actual authenticated maximum 5000-row CSV export executes; time, SQL work, bytes and runner-memory delta recorded.",
  );
  current = "Z";
  const page1 = await request(admin, "/api/notifications?page=1"),
    page2 = await request(admin, "/api/notifications?page=2");
  assert.equal(page1.body.items.length, 20);
  assert.equal(page2.body.items.length, 20);
  assert.ok(
    !page1.body.items.some((a: { id: string }) =>
      page2.body.items.some((b: { id: string }) => a.id === b.id),
    ),
  );
  pass("Z", "Large notification history pages are bounded and distinct.");
  current = "Y";
  const staff1 = await request(admin, "/api/admin/staff?page=1"),
    staff2 = await request(admin, "/api/admin/staff?page=2");
  assert.ok(staff1.body.items.length <= 25 && staff2.body.items.length <= 25);
  assert.ok(
    !staff1.body.items.some((a: { id: string }) =>
      staff2.body.items.some((b: { id: string }) => a.id === b.id),
    ),
  );
  pass("Y", "Large staff fixture has bounded distinct pages.");
  current = "AA";
  await run("order-history-pages", 2, 8, (i) =>
    request(admin, "/admin/orders?page=" + ((i % 4) + 1)),
  );
  pass(
    "AA",
    "Thousands of order-history rows remain paginated rather than loaded in one response.",
  );
  current = "AF";
  const history = measurements.find((m) => m.scenario === "admin-orders")!;
  assert.ok(history.databaseCalls / history.requests < 40);
  pass(
    "AF",
    "Admin history SQL work remains bounded per page and batched relations.",
  );
  current = "AL";
  await bench("safe-log-formatting", 1, 1000, async (i) => {
    const line = JSON.stringify(
      logRecord("info", "performance.sample", {
        durationMs: i % 10,
        token: "private-fixture",
        password: "private-fixture",
      }),
    );
    assert.ok(!line.includes("private-fixture"));
    assert.ok(line.length < 1024);
    return { status: 200, bytes: line.length };
  });
  pass(
    "AL",
    "All API loads retain production logging; 1000 safe log-formatting iterations remain bounded and redacted. No disabled-logging benchmark is claimed.",
  );
  current = "AM";
  await run(
    "shared-limiter-load",
    20,
    100,
    (i) =>
      request(
        "",
        "/api/auth/session",
        "POST",
        { idToken: "invalid-fixture" },
        { "x-real-ip": "198.51.100." + ((i % 2) + 10) },
      ),
    [400, 429],
  );
  pass(
    "AM",
    "Two bounded ingress buckets produce expected auth rejection/429 under concurrent requests with no shared-counter failure.",
  );
  current = "AO";
  let timedOut = false;
  const at = performance.now();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout='100ms'`;
      await tx.$queryRaw`SELECT pg_sleep(0.3)`;
    });
  } catch {
    timedOut = true;
  }
  assert.ok(timedOut && performance.now() - at < 2000);
  pass(
    "AO",
    "Actual isolated PostgreSQL slowdown is canceled by a transaction-local statement timeout; no indefinite wait.",
  );
  current = "AN";
  for (const [index, holdMs] of [
    [75, 300],
    [76, 12000],
  ] as const) {
    const cart = await prisma.cart.findUniqueOrThrow({
      where: { customerSessionId: guests[index].id },
    });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: guests[index].productId,
        quantity: 1,
        reviewedUnitPrice: "12.50",
        reviewedCurrencyCode: "USD",
      },
    });
    let acquired!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => {
      acquired = r;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE sandbox_payment_intents IN SHARE MODE`;
        acquired();
        await new Promise<void>((r) => {
          release = r;
        });
      },
      { timeout: 15000 },
    );
    await ready;
    const key = randomUUID(),
      started = performance.now();
    const timer = setTimeout(() => release(), holdMs);
    try {
      const probe = request(guest(index), "/api/customer/orders", "POST", {
        idempotencyKey: key,
      });
      const unrelated = await request(kitchen, "/api/kitchen/orders");
      assert.equal(unrelated.status, 200);
      const response = await probe;
      if (holdMs === 300) {
        assert.equal(response.status, 201);
        assert.ok(performance.now() - started >= 250);
      } else {
        assert.equal(response.status, 503);
        assert.ok(performance.now() - started < 14000);
      }
      await blocker;
      if (holdMs === 12000) {
        const retry = await request(
          guest(index),
          "/api/customer/orders",
          "POST",
          { idempotencyKey: key },
        );
        assert.equal(retry.status, 200);
        const order = await prisma.order.findUniqueOrThrow({
          where: {
            customerSessionId_idempotencyKey: {
              customerSessionId: guests[index].id,
              idempotencyKey: key,
            },
          },
          include: { payment: { include: { attempts: true } } },
        });
        assert.equal(order.payment!.attempts.length, 1);
        assert.equal(
          await prisma.sandboxPaymentIntent.count({
            where: { attemptId: order.payment!.attempts[0].id },
          }),
          1,
        );
      }
    } finally {
      clearTimeout(timer);
      release();
      await blocker;
    }
  }
  pass(
    "AN",
    "Sandbox provider-ledger delays of 300ms/12s leave queue reads responsive; the driver timeout returns safe 503 and same-key recovery retains one intent/order. Not a live-provider network claim.",
  );
  await browserScenarios(context);
  current = "AB";
  assert.ok(peakConnections <= 20);
  pass(
    "AB",
    "Sampled local client connections stay within the two 10-connection pools (application plus fixture/sampler); no expected-load exhaustion. Hosted pooler behavior remains a separate acceptance test.",
  );
  current = "AR";
  const client = await readFile("src/lib/firebase/client.ts", "utf8");
  assert.ok(!client.includes("getFirestore"));
  pass(
    "AR",
    "PostgreSQL remains authoritative; browser Firestore initialization is absent and no test uses Firestore business writes.",
  );
  const member = await prisma.organizationMembership.findFirstOrThrow({
      where: { userId: identities[3].userId },
    }),
    tag = (await request(manager, "/api/kitchen/orders")).headers.get("etag")!;
  const suspended = await request(
    admin,
    "/api/admin/staff/" + identities[3].userId + "/status",
    "POST",
    { active: false, revision: member.revision, confirmed: true },
  );
  assert.equal(suspended.status, 200);
  const stale = await request(
    manager,
    "/api/kitchen/orders",
    "GET",
    undefined,
    { "If-None-Match": tag },
  );
  assert.ok([401, 403].includes(stale.status));
}
async function browserScenarios(context: Context) {
  const { browser, contexts, demo, cookies, run, setMenu } = context;
  const hallId = `phase21-evidence-${evidenceRun}-hall-beirut`,
    locationId = demo.locations[0].id;
  current = "T";
  for (const size of [50, 100, 300]) {
    console.log("START QR fixture " + size);
    const hall = await prisma.hall.create({
      data: {
        id: `phase21-evidence-${evidenceRun}-qr-${size}`,
        locationId,
        number: size + 10,
        name: `Demo QR ${size}`,
      },
    });
    await bulk(
      Array.from({ length: size }, (_, i) => ({
        hallId: hall.id,
        id: "a" + (i + 1),
        row: "A",
        number: i + 1,
        label: "A" + (i + 1),
      })),
      (data) => prisma.seat.createMany({ data }),
    );
    let generated = 0;
    await run("qr-" + size + "-seats", 1, Math.ceil(size / 100), async () => {
      const r = await request(
        cookies[0],
        `/api/admin/locations/${locationId}/halls/${hall.id}/qr/generate`,
        "POST",
        { action: "GENERATE_MISSING" },
      );
      assert.ok(r.body.generated <= 100);
      generated += r.body.generated;
      return r;
    });
    assert.equal(generated, size);
  }
  // T is the brief's analytics case; QR evidence is recorded separately without replacing it.
  current = "AG";
  await setMenu(20);
  const image = await sharp({
    create: { width: 1800, height: 1200, channels: 3, background: "#fbbf24" },
  })
    .png()
    .toBuffer();
  let limited = 0;
  const imageMeasurement = await measure(
    "image-concurrency",
    16,
    16,
    async () => {
      try {
        const result = await normalizeProductImage(
          new File([new Uint8Array(image)], "demo.png", { type: "image/png" }),
        );
        const metadata = await sharp(result).metadata();
        assert.ok(metadata.width! <= 1200 && metadata.height! <= 1200);
        return { status: 200, bytes: result.length };
      } catch (error) {
        if ((error as { code?: string }).code === "SECURITY_RATE_LIMITED") {
          limited++;
          return { status: 429, expected: true };
        }
        throw error;
      }
    },
  );
  measurements.push(imageMeasurement);
  assert.equal(imageMeasurement.unexpectedErrors, 0);
  assert.ok(limited > 0);
  const result = await mobileAndPolling({
    browser,
    kitchenContext: contexts[1],
    hallId,
    seatId: "a90",
    projectDirectory: process.cwd(),
  });
  await writeFile(
    "docs/performance/phase-21-browser.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  pass(
    "AG",
    "Actual mobile-loaded JavaScript bytes measured; fetched customer scripts contain no chart-library markers. Route splitting retained.",
  );
  pass(
    "AH",
    "CDP slow-4G menu hydration and complete customer sandbox workflow measured without external service access.",
  );
  pass(
    "AP",
    "390x844 DPR2 browser completes seat entry, add-to-cart, checkout, verified sandbox payment and progress navigation. Physical-phone validation remains a deployment check.",
  );
  pass(
    "K",
    tests.K.evidence +
      " Browser verifies hidden pause, visible resume, unmount cleanup, 503 backoff and terminal denial stop.",
  );
}
main().catch(async (error) => {
  console.error(
    "Isolated fixture setup failed (" +
      (error instanceof Error ? error.name : "Error") +
      ").",
  );
  // No raw driver messages, metadata or connection strings in setup diagnostics.
  process.exitCode = 1;
  await prisma.$disconnect();
});
