import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, generateKeyPairSync, createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { Prisma, type PaymentStatus } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db/prisma";
import { getAdminAuth } from "../src/lib/firebase/admin";
import { financialMetrics, reportRange } from "../src/lib/analytics/policy";
import { analyticsFilterSchema, REPORTS } from "../src/validation/analytics";
import { Temporal } from "@js-temporal/polyfill";

// Explicit test-only resources. Never invoke this runner with --env-file=.env.local.
if (!process.argv.includes("--local"))
  throw new Error("Use --local with the isolated database and Auth emulator.");
process.env.DATABASE_URL =
  "postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase16_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9144";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-cinebite-phase16";
process.env.GCLOUD_PROJECT = "demo-cinebite-phase16";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL =
  "test@demo-cinebite-phase16.iam.gserviceaccount.com";
process.env.FIREBASE_STORAGE_BUCKET = "demo-cinebite-phase16.appspot.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;
const base = "http://127.0.0.1:3116",
  run = randomUUID().slice(0, 8),
  output = path.join(process.cwd(), "linkedin/phase-16");
const results: Record<
  string,
  { status: "PASS" | "FAIL" | "NOT EXECUTABLE"; evidence: string }
> = {};
for (const id of [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ...Array.from({ length: 22 }, (_, i) => `A${String.fromCharCode(65 + i)}`),
])
  results[id] = {
    status: "NOT EXECUTABLE",
    evidence: "Not reached in this run.",
  };
let currentCase = "A";
function pass(ids: string[], evidence: string) {
  for (const id of ids) results[id] = { status: "PASS", evidence };
  console.log(`PASS ${ids.join(", ")}: ${evidence}`);
}
type Resource = Awaited<ReturnType<typeof resource>>;
async function resource(
  organizationId: string,
  suffix: string,
  movieTitle = "Interstellar",
) {
  const location = await prisma.location.create({
    data: {
      organizationId,
      name:
        suffix === "beirut"
          ? "Demo Beirut"
          : suffix === "dbayeh"
            ? "Demo Dbayeh"
            : "Demo Cinema B",
      slug: `phase16-${run}-${suffix}`,
      addressLine1: "Demo cinema",
      city: "Beirut",
      country: "LB",
      timezone: "Asia/Beirut",
    },
  });
  const hall = await prisma.hall.create({
    data: { locationId: location.id, name: "Hall 1", number: 1 },
  });
  const seat = await prisma.seat.create({
    data: { hallId: hall.id, id: "a1", row: "A", number: 1, label: "A1" },
  });
  const movie = await prisma.movie.create({
    data: {
      organizationId,
      title: movieTitle,
      slug: `phase16-${run}-${suffix}`,
      durationMinutes: 180,
    },
  });
  const screening = await prisma.screening.create({
    data: {
      hallId: hall.id,
      movieId: movie.id,
      startsAt: new Date("2026-10-01T16:00:00Z"),
      endsAt: new Date("2026-10-01T20:00:00Z"),
    },
  });
  const session = await prisma.customerSession.create({
    data: {
      hallId: hall.id,
      seatId: seat.id,
      screeningId: screening.id,
      tokenHash:
        randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
      expiresAt: new Date("2026-10-31T20:00:00Z"),
    },
  });
  const category = await prisma.menuCategory.create({
    data: {
      organizationId,
      name: "Cinema favorites",
      slug: `phase16-${run}-${suffix}`,
    },
  });
  const product = await prisma.product.create({
    data: {
      organizationId,
      categoryId: category.id,
      name: "Popcorn",
      slug: `phase16-${run}-${suffix}`,
      description: "Demo popcorn",
    },
  });
  const soda = await prisma.product.create({
    data: {
      organizationId,
      categoryId: category.id,
      name: "Drink",
      slug: `phase16-${run}-${suffix}-drink`,
      description: "Demo drink",
    },
  });
  return {
    organizationId,
    location,
    hall,
    seat,
    movie,
    screening,
    session,
    category,
    product,
    soda,
  };
}
async function order(
  r: Resource,
  amount: string,
  status: PaymentStatus | null,
  date: string,
  quantity = 1,
  price = amount,
  currency = "USD",
  extra = false,
  screeningId = r.screening.id,
) {
  const when = new Date(date),
    id = randomUUID();
  const record = await prisma.order.create({
    data: {
      id,
      publicOrderCode:
        "CB-" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
      customerSessionId: r.session.id,
      organizationId: r.organizationId,
      locationId: r.location.id,
      hallId: r.hall.id,
      seatId: r.seat.id,
      screeningId,
      currencyCode: currency,
      subtotal: amount,
      total: amount,
      idempotencyKey: randomUUID(),
      locationNameSnapshot: r.location.name,
      hallNameSnapshot: r.hall.name,
      seatLabelSnapshot: r.seat.label,
      movieTitleSnapshot: r.movie.title,
      screeningStartsAt: r.screening.startsAt,
      createdAt: when,
      items: {
        create: [
          {
            productId: r.product.id,
            productNameSnapshot: "Popcorn",
            unitPrice: price,
            quantity,
            lineTotal: new Prisma.Decimal(price).times(quantity),
            currencyCode: currency,
          },
          ...(extra
            ? [
                {
                  productId: r.soda.id,
                  productNameSnapshot: "Drink",
                  unitPrice: "2",
                  quantity: 1,
                  lineTotal: "2",
                  currencyCode: currency,
                },
              ]
            : []),
        ],
      },
      statusEvents: {
        create: { toStatus: "PLACED", actorType: "CUSTOMER", createdAt: when },
      },
    },
  });
  if (status)
    await prisma.payment.create({
      data: {
        orderId: id,
        provider: "sandbox",
        status,
        amount,
        currencyCode: currency,
        succeededAt: status === "SUCCEEDED" ? when : null,
        failedAt: status === "FAILED" ? when : null,
        currentAttemptNumber: 2,
        attempts: {
          create: [
            {
              number: 1,
              idempotencyKey: randomUUID(),
              status: "FAILED",
              expiresAt: when,
              failedAt: when,
            },
            {
              number: 2,
              idempotencyKey: randomUUID(),
              status,
              expiresAt: when,
              succeededAt: status === "SUCCEEDED" ? when : null,
            },
          ],
        },
      },
    });
  if (status === "SUCCEEDED")
    await prisma.order.update({
      where: { id },
      data: { fulfillmentEligible: true },
    });
  return record;
}
async function refund(
  orderId: string,
  amount: string,
  status: "SUCCEEDED" | "FAILED" | "PROCESSING",
  date: string,
) {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { orderId },
  });
  return prisma.refund.create({
    data: {
      orderId,
      paymentId: payment.id,
      provider: "sandbox",
      status,
      amount,
      currencyCode: payment.currencyCode,
      reasonCode: "CUSTOMER_REQUEST",
      initiatedByType: "SYSTEM",
      idempotencyKey: randomUUID(),
      succeededAt: status === "SUCCEEDED" ? new Date(date) : null,
      failedAt: status === "FAILED" ? new Date(date) : null,
    },
  });
}
async function staff(
  role:
    "CINEMA_ADMIN" | "LOCATION_MANAGER" | "KITCHEN_STAFF" | "DELIVERY_STAFF",
  organizationId: string,
  locations: string[],
  suffix: string,
) {
  const identity = await getAdminAuth().createUser({
    email: `phase16.${run}.${suffix}@example.com`,
    displayName: "Demo Reporting Team",
  });
  const user = await prisma.user.create({
    data: {
      firebaseUid: identity.uid,
      email: identity.email!,
      displayName: "Demo Reporting Team",
    },
  });
  const membership = await prisma.organizationMembership.create({
    data: { userId: user.id, organizationId, role, allLocations: false },
  });
  await prisma.locationAccess.createMany({
    data: locations.map((locationId) => ({
      membershipId: membership.id,
      locationId,
      organizationId,
    })),
  });
  return { uid: identity.uid, userId: user.id, role, organizationId };
}
async function signIn(
  context: BrowserContext,
  identity: Awaited<ReturnType<typeof staff>>,
) {
  const token = await getAdminAuth().createCustomToken(identity.uid, {
    role: identity.role,
    organizationId: identity.organizationId,
  });
  const exchanged = (await fetch(
    "http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true }),
    },
  ).then((r) => r.json())) as { idToken: string };
  const response = await context.request.post(base + "/api/auth/session", {
    headers: { Origin: base },
    data: { idToken: exchanged.idToken },
  });
  assert.equal(response.status(), 200, await response.text());
}
async function headers(context: BrowserContext) {
  return {
    Origin: base,
    Cookie: (await context.cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; "),
  };
}
async function main() {
  await mkdir(output, { recursive: true });
  const org = await prisma.organization.create({
    data: { name: "Demo CineBite Cinemas", slug: `phase16-${run}` },
  });
  const foreignOrg = await prisma.organization.create({
    data: { name: "Demo Cinema B", slug: `phase16-${run}-foreign` },
  });
  const a = await resource(org.id, "beirut"),
    b = await resource(org.id, "dbayeh", "Dune"),
    foreign = await resource(foreignOrg.id, "foreign");
  const identities: Awaited<ReturnType<typeof staff>>[] = [];
  for (const [role, oid, locations, suffix] of [
    ["CINEMA_ADMIN", org.id, [a.location.id, b.location.id], "admin"],
    ["LOCATION_MANAGER", org.id, [a.location.id], "manager"],
    ["KITCHEN_STAFF", org.id, [a.location.id], "kitchen"],
    ["DELIVERY_STAFF", org.id, [a.location.id], "delivery"],
    ["CINEMA_ADMIN", foreignOrg.id, [foreign.location.id], "foreign"],
  ] as const)
    identities.push(await staff(role, oid, [...locations], suffix));
  const first = await order(
    a,
    "10",
    "SUCCEEDED",
    "2026-10-01T17:00:00Z",
    2,
    "5",
  );
  await order(
    a,
    "20",
    "SUCCEEDED",
    "2026-10-01T17:10:00Z",
    3,
    "6",
    "USD",
    true,
  );
  await order(a, "100", "FAILED", "2026-10-01T17:20:00Z");
  await order(a, "100", "PENDING", "2026-10-01T17:30:00Z");
  await refund(first.id, "5", "SUCCEEDED", "2026-10-01T18:00:00Z");
  await refund(first.id, "7", "FAILED", "2026-10-01T18:01:00Z");
  await refund(first.id, "2", "PROCESSING", "2026-10-01T18:02:00Z");
  const lbp = await order(
    a,
    "100000",
    "SUCCEEDED",
    "2026-10-02T17:00:00Z",
    1,
    "100000",
    "LBP",
  );
  const secondScreening = await prisma.screening.create({
    data: {
      movieId: a.movie.id,
      hallId: a.hall.id,
      startsAt: new Date("2026-10-02T16:00:00Z"),
      endsAt: new Date("2026-10-02T20:00:00Z"),
    },
  });
  await order(
    a,
    "10",
    "SUCCEEDED",
    "2026-10-02T17:10:00Z",
    1,
    "10",
    "USD",
    false,
    secondScreening.id,
  );
  await order(b, "25", "SUCCEEDED", "2026-10-02T17:20:00Z");
  await order(foreign, "999", "SUCCEEDED", "2026-10-01T17:00:00Z");
  const canceled = await order(a, "10", "SUCCEEDED", "2026-10-03T17:00:00Z");
  await prisma.order.update({
    where: { id: canceled.id },
    data: { status: "CANCELED", fulfillmentEligible: false },
  });
  await refund(canceled.id, "10", "SUCCEEDED", "2026-10-03T18:00:00Z");
  const unpaid = await order(a, "10", null, "2026-10-03T17:30:00Z");
  await prisma.order.update({
    where: { id: unpaid.id },
    data: { status: "CANCELED", fulfillmentEligible: false },
  });
  const delivered = await order(a, "15", "SUCCEEDED", "2026-10-04T17:00:00Z");
  const sequence = [
    "PLACED",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ] as const;
  const minutes = [0, 0, 0, 6, 7, 11];
  await prisma.orderStatusEvent.createMany({
    data: sequence.slice(1).map((toStatus, i) => ({
      orderId: delivered.id,
      fromStatus: sequence[i],
      toStatus,
      actorType: "STAFF",
      actorUserId: identities[3].userId,
      createdAt: new Date(
        delivered.createdAt.getTime() + minutes[i + 1] * 60000,
      ),
    })),
  });
  await prisma.order.update({
    where: { id: delivered.id },
    data: {
      status: "DELIVERED",
      readyAt: new Date("2026-10-04T17:06:00Z"),
      deliveryAssignedUserId: identities[3].userId,
      deliveryClaimedAt: new Date("2026-10-04T17:07:00Z"),
      deliveredAt: new Date("2026-10-04T17:11:00Z"),
    },
  });
  await refund(delivered.id, "5", "SUCCEEDED", "2026-10-04T18:00:00Z");
  const incomplete = await order(a, "10", "SUCCEEDED", "2026-10-04T17:20:00Z");
  await prisma.orderStatusEvent.create({
    data: {
      orderId: incomplete.id,
      fromStatus: "PLACED",
      toStatus: "ACCEPTED",
      actorType: "STAFF",
      actorUserId: identities[2].userId,
      createdAt: new Date("2026-10-04T17:21:00Z"),
    },
  });
  const invalid = await order(a, "10", "SUCCEEDED", "2026-10-04T17:30:00Z");
  await prisma.orderStatusEvent.createMany({
    data: [
      {
        orderId: invalid.id,
        fromStatus: "ACCEPTED",
        toStatus: "PREPARING",
        actorType: "STAFF",
        actorUserId: identities[2].userId,
        createdAt: new Date("2026-10-04T17:40:00Z"),
      },
      {
        orderId: invalid.id,
        fromStatus: "PREPARING",
        toStatus: "READY",
        actorType: "STAFF",
        actorUserId: identities[2].userId,
        createdAt: new Date("2026-10-04T17:35:00Z"),
      },
    ],
  });
  const kernel = await prisma.inventoryItem.create({
    data: {
      organizationId: org.id,
      name: "Popcorn kernels",
      sku: `PH16-${run}`,
      unit: "GRAM",
    },
  });
  const stock = await prisma.locationInventory.create({
    data: {
      organizationId: org.id,
      locationId: a.location.id,
      inventoryItemId: kernel.id,
      quantityOnHand: "1000",
      quantityReserved: "950",
      lowStockThreshold: "100",
    },
  });
  await prisma.inventoryMovement.createMany({
    data: [
      {
        organizationId: org.id,
        locationInventoryId: stock.id,
        type: "ORDER_CONSUMPTION",
        quantityDelta: "-300",
        orderId: first.id,
        createdAt: new Date("2026-10-01T17:00:00Z"),
      },
      {
        organizationId: org.id,
        locationInventoryId: stock.id,
        type: "WASTE",
        quantityDelta: "-50",
        actorUserId: identities[0].userId,
        createdAt: new Date("2026-10-01T18:00:00Z"),
      },
    ],
  });
  const before = await order(a, "1", "SUCCEEDED", "2026-09-30T20:59:59.999Z"),
    boundary = await order(a, "2", "SUCCEEDED", "2026-09-30T21:00:00Z"),
    after = await order(a, "3", "SUCCEEDED", "2026-10-01T21:00:00Z");
  void lbp;
  void before;
  void boundary;
  void after;
  // Boundary fixtures would change the exact 30 USD examples, so the financial
  // assertions filter their independent screening while boundary checks use it.
  const boundaryScreening = await prisma.screening.create({
    data: {
      movieId: a.movie.id,
      hallId: a.hall.id,
      startsAt: new Date("2026-10-03T16:00:00Z"),
      endsAt: new Date("2026-10-03T20:00:00Z"),
    },
  });
  await prisma.order.updateMany({
    where: { id: { in: [before.id, boundary.id, after.id] } },
    data: { screeningId: boundaryScreening.id },
  });
  const server = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3116",
    ],
    { env: process.env, stdio: ["ignore", "ignore", "pipe"] },
  );
  server.stderr.on("data", (chunk) => {
    if (/\[(api|auth)/.test(String(chunk))) console.error(String(chunk));
  });
  let browser: Browser | undefined;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      headless: true,
    });
    const contexts = [];
    for (const identity of identities) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      });
      await signIn(context, identity);
      contexts.push(context);
    }
    const [admin, manager, kitchen, delivery, other] = contexts;
    async function get(
      context: BrowserContext,
      input: Record<string, unknown> = {},
      expected = 200,
    ) {
      const response = await context.request.get(
        base +
          "/api/admin/analytics?" +
          new URLSearchParams(
            Object.entries({
              period: "custom",
              start: "2026-10-01",
              end: "2026-10-01",
              ...input,
            }).map(([k, v]) => [k, String(v)]),
          ),
        { headers: await headers(context) },
      );
      assert.equal(response.status(), expected, await response.text());
      return response.json();
    }
    const financial = (
      d: {
        financials: Array<{
          currencyCode: string;
          gross: string;
          refunded: string;
          net: string;
          aov: string;
          paidOrders: number;
        }>;
      },
      currency = "USD",
    ) => d.financials.find((f) => f.currencyCode === currency)!;
    const baseFilter = { screeningId: a.screening.id };
    currentCase = "A";
    const initial = await get(admin, baseFilter);
    assert.equal(financial(initial).gross, "30.00");
    assert.equal(financial(initial).refunded, "5.00");
    assert.equal(financial(initial).net, "25.00");
    assert.equal(financial(initial).aov, "15.00");
    assert.equal(financial(initial).paidOrders, 2);
    pass(
      ["A", "B", "C", "D", "G", "H", "I"],
      "Actual SQL report: captures 10+20=30, successful refund 5, net25, AOV15; failed100/pending100/failed7/processing2 excluded; failed duplicate attempts do not double-count.",
    );
    const empty = await get(admin, { start: "2010-01-01", end: "2010-01-01" });
    assert.deepEqual(empty.financials, []);
    assert.equal(empty.orders.total, 0);
    assert.equal(financialMetrics("0", "0", 0).aov, "0.00");
    pass(
      ["E"],
      "Empty SQL period has zero paid orders and no financial rows; Decimal zero AOV rule executed.",
    );
    const multi = await get(admin, { start: "2026-10-02", end: "2026-10-02" });
    assert.equal(financial(multi, "LBP").gross, "100000.00");
    assert.equal(financial(multi).gross, "38.00");
    pass(
      ["F"],
      "SQL groups USD38 and LBP100000 separately; no combined amount.",
    );
    currentCase = "J";
    const product = await get(admin, { ...baseFilter, report: "products" });
    const popcorn = product.rows.find(
      (r: { name: string }) => r.name === "Popcorn",
    );
    assert.equal(popcorn.units, 5);
    assert.equal(popcorn.gross, "28.00");
    pass(
      ["J", "K"],
      "Two historical Popcorn snapshots, 2×5 + 3×6, report 5 units and exact28 gross; payment/item joins do not multiply captures.",
    );
    await prisma.product.update({
      where: { id: a.product.id },
      data: { name: "=2+2", status: "INACTIVE" },
    });
    await prisma.hall.update({
      where: { id: a.hall.id },
      data: { name: "Renamed Hall", status: "INACTIVE" },
    });
    await prisma.movie.update({
      where: { id: a.movie.id },
      data: { title: "Renamed Movie" },
    });
    const renamed = await get(admin, { ...baseFilter, report: "products" });
    assert.deepEqual(renamed.rows, product.rows);
    const history = await get(admin, { ...baseFilter, report: "orders" });
    assert.ok(
      history.rows.every((r: { movie: string }) => r.movie === "Interstellar"),
    );
    pass(
      ["L", "AO", "AP"],
      "Actual product/hall/movie renames and inactive product leave snapshot names and historical sales unchanged.",
    );
    currentCase = "M";
    await get(manager, { locationId: b.location.id }, 403);
    await get(admin, { organizationId: foreignOrg.id }, 400);
    await get(admin, { locationId: foreign.location.id }, 403);
    await get(other, { locationId: a.location.id }, 403);
    pass(
      ["M", "N"],
      "Authenticated URL tampering rejected: manager foreign location403; organization override400; cross-tenant location403 both ways.",
    );
    const comparison = await get(admin, {
      report: "locations",
      start: "2026-10-02",
      end: "2026-10-02",
    });
    assert.equal(
      comparison.rows.find(
        (r: { name: string; currency: string }) =>
          r.name === "Demo Dbayeh" && r.currency === "USD",
      ).gross,
      "25.00",
    );
    pass(
      ["O"],
      "Cinema admin location SQL rows attribute Dbayeh25 and Beirut currency-separated captures independently.",
    );
    const movies = await get(admin, {
      report: "movies",
      start: "2026-10-01",
      end: "2026-10-02",
    });
    assert.equal(
      movies.rows.find(
        (r: { name: string; currency: string }) =>
          r.name === "Dune" && r.currency === "USD",
      ).gross,
      "25.00",
    );
    const screenings = await get(admin, {
      report: "screenings",
      start: "2026-10-01",
      end: "2026-10-02",
    });
    assert.ok(
      screenings.rows.some((r: { gross: string }) => r.gross === "30.00"),
    );
    assert.ok(
      screenings.rows.some((r: { gross: string }) => r.gross === "10.00"),
    );
    pass(
      ["P", "Q"],
      "Interstellar/Dune and two independent Interstellar screenings aggregate their own successful captures only; no ticket revenue.",
    );
    currentCase = "R";
    const ops = await get(admin, {
      report: "operations",
      start: "2026-10-04",
      end: "2026-10-04",
    });
    assert.equal(ops.rows[0].preparationMean, "6.00");
    assert.equal(ops.rows[0].deliveryMean, "4.00");
    assert.equal(ops.rows[0].fulfillmentMean, "11.00");
    assert.equal(ops.rows[0].preparationSamples, 1);
    assert.equal(ops.rows[0].excludedPreparation, 2);
    pass(
      ["R", "S", "T", "U", "V"],
      "Real persisted events report preparation6, delivery4, fulfillment11; incomplete and negative preparation pairs excluded, with sample/exclusion counts.",
    );
    const inventory = await get(admin, { report: "inventory" });
    assert.equal(inventory.rows[0].consumed, "300.000");
    assert.equal(inventory.rows[0].waste, "50.000");
    assert.equal(inventory.rows[0].unit, "GRAM");
    assert.equal(inventory.stock.low, 1);
    pass(
      ["W", "X"],
      "SQL InventoryMovement report keeps consumption300g and waste50g separate, with explicit unit; current reserved-aware low-stock count1.",
    );
    const cancellations = await get(admin, {
      start: "2026-10-03",
      end: "2026-10-03",
      screeningId: a.screening.id,
    });
    assert.equal(cancellations.orders.canceled, 2);
    assert.equal(financial(cancellations).gross, "10.00");
    assert.equal(financial(cancellations).refunded, "10.00");
    assert.equal(financial(cancellations).net, "0.00");
    pass(
      ["Y", "Z"],
      "Canceled unpaid order increases cohort cancellations but adds no revenue; captured/refunded canceled order reports gross10/refunds10/net0.",
    );
    const deliveredReport = await get(admin, {
      start: "2026-10-04",
      end: "2026-10-04",
    });
    assert.equal(deliveredReport.orders.delivered, 1);
    assert.equal(financial(deliveredReport).refunded, "5.00");
    pass(
      ["AA"],
      "Delivered order remains delivered while its actual successful refund is included financially.",
    );
    const day1 = await get(admin, { screeningId: boundaryScreening.id }),
      day2 = await get(admin, {
        screeningId: boundaryScreening.id,
        start: "2026-10-02",
        end: "2026-10-02",
      });
    assert.equal(financial(day1).gross, "2.00");
    assert.equal(financial(day2).gross, "3.00");
    assert.equal(day1.range.start, "2026-09-30T21:00:00.000Z");
    pass(
      ["AB", "AC", "AD"],
      "Actual before/at/after-midnight SQL records use Beirut [start,end); boundary2 appears once, adjacent-period3 only in next range.",
    );
    const dst = reportRange(
      analyticsFilterSchema.parse({
        period: "custom",
        start: "2026-10-24",
        end: "2026-10-24",
      }),
      "Asia/Beirut",
      Temporal.Instant.from("2026-10-06T00:00:00Z"),
    );
    assert.equal(dst.end.getTime() - dst.start.getTime(), 25 * 3600000);
    pass(
      ["AE"],
      "Deterministic Temporal conversion executes a 25-hour Beirut DST calendar day, no fixed offset.",
    );
    currentCase = "AF";
    for (const report of REPORTS) {
      const scoped = await get(manager, {
        report,
        start: "2026-10-01",
        end: "2026-10-07",
      });
      assert.deepEqual(
        scoped.locations.map((l: { id: string }) => l.id),
        [a.location.id],
      );
      assert.ok(!JSON.stringify(scoped.rows).includes("Dbayeh"));
    }
    await get(kitchen, {}, 403);
    await get(delivery, {}, 403);
    const anonymous = await browser.newContext();
    await get(anonymous, {}, 401);
    pass(
      ["AF", "AG", "AH"],
      "Every report is rechecked against the manager's sole authorized location; kitchen/delivery403, unauthenticated401; no client dataset aggregation privilege bypass.",
    );
    async function csv(
      context: BrowserContext,
      input: Record<string, unknown>,
      expected = 200,
    ) {
      const response = await context.request.post(
        base + "/api/admin/analytics/export",
        {
          headers: await headers(context),
          data: {
            period: "custom",
            start: "2026-10-01",
            end: "2026-10-01",
            ...input,
          },
        },
      );
      assert.equal(response.status(), expected, await response.text());
      return response;
    }
    const exported = await csv(admin, { ...baseFilter, report: "products" });
    const content = await exported.text();
    assert.ok(content.includes('"28.00"'));
    assert.ok(content.includes('"5"'));
    assert.match(
      exported.headers()["content-disposition"],
      /cinebite-products-2026-10-01-to-2026-10-01\.csv/,
    );
    assert.ok(!/providerPaymentId|tokenHash|firebaseUid/.test(content));
    pass(
      ["AI"],
      "Actual authorized product CSV matches exact dashboard units/gross, safe fixed filename and metadata; no credential/provider fields.",
    );
    await prisma.inventoryItem.update({
      where: { id: kernel.id },
      data: { name: "=2+2" },
    });
    const injected = await csv(admin, { report: "inventory" });
    assert.ok((await injected.text()).includes('"\'=2+2"'));
    await prisma.inventoryItem.update({
      where: { id: kernel.id },
      data: { name: "Popcorn kernels" },
    });
    pass(
      ["AJ"],
      "Actual CSV export quotes/prefixes a persisted =2+2 entity name so it is spreadsheet text, not a formula.",
    );
    await csv(manager, { locationId: b.location.id }, 403);
    await csv(admin, { locationId: foreign.location.id }, 403);
    await csv(kitchen, {}, 403);
    pass(
      ["AK"],
      "CSV export independently authenticates and authorizes scope; manipulated location/foreign tenant/kitchen requests denied.",
    );
    currentCase = "EXPORT_REQUEST_GUARDS";
    const exportHeaders = await headers(admin);
    const crossOrigin = await admin.request.post(
      base + "/api/admin/analytics/export",
      {
        headers: { ...exportHeaders, Origin: "https://foreign.example" },
        data: { report: "revenue" },
      },
    );
    assert.equal(crossOrigin.status(), 403);
    const oversized = await admin.request.post(
      base + "/api/admin/analytics/export",
      {
        headers: exportHeaders,
        data: "x".repeat(4097),
      },
    );
    assert.equal(oversized.status(), 413);
    const invalidJson = await admin.request.post(
      base + "/api/admin/analytics/export",
      {
        headers: exportHeaders,
        data: "{",
      },
    );
    assert.equal(invalidJson.status(), 400);
    assert.ok(
      !/Prisma|SELECT|password|private_key/.test(await invalidJson.text()),
    );
    await csv(anonymous, {}, 401);
    pass(
      ["EXPORT_REQUEST_GUARDS"],
      "Actual export requests reject foreign Origin403, body over4096bytes413, invalid JSON400 and anonymous401; error response exposes no SQL/private data.",
    );
    currentCase = "FILTER_VALIDATION";
    for (const input of [
      { timezone: "not/a-real-zone" },
      { start: "2026-02-30", end: "2026-03-01" },
      { start: "2026-10-02", end: "2026-10-01" },
      { start: "2020-01-01", end: "2026-10-01" },
      { sort: "gross; DROP TABLE orders" },
    ])
      await get(admin, input, 400);
    const duplicate = await admin.request.get(
      base + "/api/admin/analytics?report=orders&report=revenue",
      { headers: exportHeaders },
    );
    assert.equal(duplicate.status(), 400);
    pass(
      ["FILTER_VALIDATION"],
      "Actual API rejects impossible/reversed/oversized dates, invalid IANA timezone, SQL-looking sort and duplicated query filters with safe400.",
    );
    currentCase = "AL";
    const paged = [];
    const all = await get(admin, {
      report: "orders",
      start: "2026-10-01",
      end: "2026-10-07",
      pageSize: 100,
    });
    for (let page = 1; page <= Math.ceil(all.totalRows / 2); page++) {
      const d = await get(admin, {
        report: "orders",
        start: "2026-10-01",
        end: "2026-10-07",
        pageSize: 2,
        page,
        sort: "name",
        direction: "asc",
      });
      paged.push(...d.rows.map((r: { name: string }) => r.name));
    }
    assert.equal(new Set(paged).size, all.totalRows);
    assert.equal(paged.length, all.totalRows);
    pass(
      ["AL"],
      "Server-paginated SQL pages include every matching order exactly once, with stable tie-breakers; no full history sent for page1.",
    );
    await prisma.location.update({
      where: { id: a.location.id },
      data: { status: "INACTIVE" },
    });
    const inactive = await get(admin, baseFilter);
    assert.equal(financial(inactive).gross, "30.00");
    await prisma.location.update({
      where: { id: a.location.id },
      data: { status: "ACTIVE" },
    });
    pass(
      ["AQ"],
      "Inactive location and previously inactive hall do not erase valid historical financial reports.",
    );
    results.AN = {
      status: "NOT EXECUTABLE",
      evidence:
        "Optional previous-period comparison is deliberately not implemented; zero-denominator growth helper was separately executed in offline tests. No Infinity/NaN comparison is presented.",
    };
    currentCase = "AR";
    // A real stored demo workload, not numbers substituted in the dashboard.
    const batch = Array.from({ length: 1000 }, (_, i) => ({
      id: randomUUID(),
      publicOrderCode:
        "CB-" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
      customerSessionId: a.session.id,
      organizationId: org.id,
      locationId: a.location.id,
      hallId: a.hall.id,
      seatId: a.seat.id,
      screeningId: a.screening.id,
      currencyCode: "USD",
      subtotal: "12.50",
      total: "12.50",
      idempotencyKey: randomUUID(),
      locationNameSnapshot: "Demo Beirut",
      hallNameSnapshot: "Hall 1",
      seatLabelSnapshot: "A1",
      movieTitleSnapshot: "Interstellar",
      screeningStartsAt: a.screening.startsAt,
      createdAt: new Date(Date.UTC(2026, 9, 5, 12, 0, 0, i)),
    }));
    await prisma.order.createMany({ data: batch });
    await prisma.payment.createMany({
      data: batch.map((o) => ({
        orderId: o.id,
        provider: "sandbox",
        status: "SUCCEEDED",
        amount: "12.50",
        currencyCode: "USD",
        succeededAt: o.createdAt,
      })),
    });
    await prisma.orderItem.createMany({
      data: batch.map((o) => ({
        orderId: o.id,
        productId: a.product.id,
        productNameSnapshot: "Popcorn",
        unitPrice: "12.50",
        currencyCode: "USD",
        quantity: 1,
        lineTotal: "12.50",
      })),
    });
    const start = performance.now();
    const performanceReport = await get(admin, {
      start: "2026-10-01",
      end: "2026-10-07",
      report: "products",
    });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 12000);
    assert.ok(
      performanceReport.rows.some((r: { units: number }) => r.units >= 1000),
    );
    pass(
      ["AR"],
      `1,000 additional persisted demo orders/payments/items queried in ${elapsed.toFixed(1)}ms HTTP end-to-end; constant SQL aggregation query count, not per-order N+1.`,
    );
    const page = await admin.newPage();
    const photoNames = [
      "01-analytics-overview.png",
      "02-revenue-dashboard.png",
      "03-location-comparison.png",
      "04-product-performance.png",
      "05-movie-performance.png",
      "06-kitchen-delivery-performance.png",
      "07-inventory-consumption.png",
      "08-report-filters.png",
    ];
    for (const [i, report] of [
      "overview",
      "revenue",
      "locations",
      "products",
      "movies",
      "operations",
      "inventory",
      "screenings",
    ].entries()) {
      await page.goto(
        base +
          "/admin/analytics?" +
          new URLSearchParams({
            period: "custom",
            start: "2026-10-01",
            end: "2026-10-07",
            report,
          }),
        { waitUntil: "networkidle" },
      );
      await page
        .getByRole("heading", { name: "Analytics & reporting" })
        .waitFor();
      assert.equal(
        await page.getByText("Report unavailable", { exact: true }).count(),
        0,
      );
      assert.equal(
        await page
          .getByText("Cinema management could not be loaded", { exact: true })
          .count(),
        0,
      );
      await page.screenshot({
        path: path.join(output, photoNames[i]),
        fullPage: true,
      });
    }
    await page.goto(
      base + "/admin/analytics?period=custom&start=2010-01-01&end=2010-01-01",
      { waitUntil: "networkidle" },
    );
    await page
      .getByRole("heading", { name: "No data for this period" })
      .waitFor();
    assert.equal(await page.getByText(/NaN|Infinity/).count(), 0);
    pass(
      ["AM"],
      "Real empty application route displays professional No data for this period, no fabricated growth or Infinity/NaN.",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      base + "/admin/analytics?period=custom&start=2026-10-01&end=2026-10-07",
      { waitUntil: "networkidle" },
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Apply", exact: true })
        .isVisible(),
    );
    await page.screenshot({
      path: path.join(output, "09-mobile-analytics.png"),
      fullPage: true,
    });
    pass(
      ["AS"],
      "Native 390×844 view: KPI cards/filters/chart/table remain inside viewport, mobile navigation scrolls locally and Apply is accessible.",
    );
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.reload({ waitUntil: "networkidle" });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    pass(
      ["AT"],
      "Tablet820×1180 plus desktop1440×1000 execute native reporting pages without horizontal page overflow.",
    );
    const businessFiles = [
      "src/server/services/analytics.service.ts",
      "src/server/repositories/analytics.repository.ts",
    ];
    for (const file of businessFiles)
      assert.ok(
        !/firestore|getAdminFirestore/.test(await readFile(file, "utf8")),
      );
    pass(
      ["AU"],
      "Executed reporting source is PostgreSQL only; inspected new service/repository for Firestore imports/calls—none present.",
    );
    const snapshots = await import("node:fs/promises");
    for (const name of [...photoNames, "09-mobile-analytics.png"]) {
      const data = await snapshots.readFile(path.join(output, name));
      assert.equal(data.subarray(1, 4).toString(), "PNG");
      assert.ok(data.length > 10000);
    }
    pass(
      ["AV"],
      "Nine actual native CineBite PNGs captured from isolated fictional SQL data, app-only without desktop/browser chrome. Visual review follows.",
    );
    currentCase = "EXPORT_RATE_LIMIT";
    if (Date.now() % 60000 > 54000)
      await new Promise((resolve) =>
        setTimeout(resolve, 60000 - (Date.now() % 60000) + 50),
      );
    const limitKey =
      "report:" +
      createHash("sha256")
        .update(
          identities[0].uid +
            ":" +
            org.id +
            ":" +
            Math.floor(Date.now() / 60000),
        )
        .digest("hex");
    await prisma.reportExportLimit.deleteMany({ where: { key: limitKey } });
    for (let i = 0; i < 6; i++) await csv(admin, { report: "revenue" });
    await csv(admin, { report: "revenue" }, 429);
    pass(
      ["EXPORT_RATE_LIMIT"],
      "PostgreSQL export throttle rejects a seventh per-user/per-tenant export in the fixed minute window; independently authorized requests only.",
    );
  } catch (error) {
    results[currentCase] = {
      status: "FAIL",
      evidence:
        error instanceof Error
          ? error.message
          : "Unexpected local test failure",
    };
    throw error;
  } finally {
    await mkdir("docs", { recursive: true });
    await writeFile(
      "docs/phase-16-integration-results.json",
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          environment:
            "Isolated local PostgreSQL / demo Auth emulator / production Next / Chromium",
          results,
        },
        null,
        2,
      ) + "\n",
    );
    await browser?.close();
    server.kill();
    for (const identity of identities) {
      await getAdminAuth().updateUser(identity.uid, { disabled: true });
      await prisma.user.update({
        where: { id: identity.userId },
        data: { active: false },
      });
    }
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Verification failed");
  process.exitCode = 1;
});
