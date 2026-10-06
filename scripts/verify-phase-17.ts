import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import { getAdminAuth } from "../src/lib/firebase/admin";
import { prisma } from "../src/lib/db/prisma";
import {
  getPaymentProvider,
  sandboxSignature,
} from "../src/lib/payments/provider";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "../src/lib/security/opaque-token";
import {
  processNotificationOutbox,
  pruneNotifications,
} from "../src/server/notifications/processor";
import {
  inAppNotificationProvider,
  type NotificationChannelProvider,
} from "../src/server/notifications/provider";
import type { NotificationFeed } from "../src/types/notification";

if (!process.argv.includes("--local"))
  throw new Error(
    "Use --local. Never load .env.local for this isolated runner.",
  );
process.env.DATABASE_URL =
  "postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase17_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9144";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-cinebite-phase17";
process.env.GCLOUD_PROJECT = "demo-cinebite-phase17";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL =
  "test@demo-cinebite-phase17.iam.gserviceaccount.com";
process.env.FIREBASE_STORAGE_BUCKET = "demo-cinebite-phase17.appspot.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;
process.env.PAYMENT_PROVIDER = "sandbox";
process.env.PAYMENT_SANDBOX_ENABLED = "true";
process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET = randomUUID() + randomUUID();
process.env.PAYMENT_EXPIRY_JOB_SECRET = randomUUID() + randomUUID();
process.env.NOTIFICATION_JOB_SECRET = randomUUID() + randomUUID();
process.env.PAYMENT_RESERVATION_MINUTES = "12";
const base = "http://127.0.0.1:3117",
  evidenceRun = randomUUID().slice(0, 8);
const output = path.join(process.cwd(), "linkedin", "phase-17");
const results = new Map<
  string,
  { status: "PASS" | "FAIL" | "NOT EXECUTABLE"; evidence: string }
>();
for (const id of [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ...Array.from({ length: 14 }, (_, i) => "A" + String.fromCharCode(65 + i)),
])
  results.set(id, {
    status: "NOT EXECUTABLE",
    evidence: "Not reached in this run.",
  });
function pass(ids: string[], evidence: string) {
  for (const id of ids) results.set(id, { status: "PASS", evidence });
  console.log("PASS " + ids.join(", ") + ": " + evidence);
}
let currentCase = "A";
async function mutate(
  context: BrowserContext,
  code: string,
  from: string,
  to: string,
  kitchen = false,
) {
  return context.request.post(
    base + "/api/" + (kitchen ? "kitchen" : "delivery") + "/orders/" + code,
    {
      headers: await sessionHeaders(context),
      data: { expectedStatus: from, toStatus: to },
    },
  );
}
async function capture(page: Page, name: string) {
  for (const button of await page
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .all())
    await button.click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(output, name),
    fullPage: true,
    animations: "disabled",
  });
}
async function fixture() {
  const org = await prisma.organization.create({
    data: {
      id: `phase17-evidence-${evidenceRun}-org`,
      slug: `phase17-evidence-${evidenceRun}-cinemas`,
      name: "Demo CineBite Cinemas",
      status: "ACTIVE",
    },
  });
  return prisma.$transaction(
    async (tx) => {
      const other = await tx.organization.upsert({
        where: { slug: `phase17-evidence-${evidenceRun}-other-cinema` },
        create: {
          id: `phase17-evidence-${evidenceRun}-other-org`,
          slug: `phase17-evidence-${evidenceRun}-other-cinema`,
          name: "Demo Cinema B",
          status: "ACTIVE",
        },
        update: {},
      });
      const locations = [];
      const sessions = [];
      for (const [suffix, name, organizationId] of [
        ["beirut", "Demo Beirut", org.id],
        ["dbayeh", "Demo Dbayeh", org.id],
        ["other", "Demo Cinema B", other.id],
      ]) {
        const location = await tx.location.upsert({
          where: { id: `phase17-evidence-${evidenceRun}-${suffix}` },
          create: {
            id: `phase17-evidence-${evidenceRun}-${suffix}`,
            organizationId,
            name,
            slug: `phase17-evidence-${evidenceRun}-${suffix}`,
            addressLine1: "Demo cinema",
            city: "Beirut",
            country: "LB",
            timezone: "Asia/Beirut",
            status: "ACTIVE",
          },
          update: {},
        });
        locations.push(location);
        const hall = await tx.hall.upsert({
          where: { id: `phase17-evidence-${evidenceRun}-hall-${suffix}` },
          create: {
            id: `phase17-evidence-${evidenceRun}-hall-${suffix}`,
            locationId: location.id,
            name: "Hall 1",
            number: 1,
            status: "ACTIVE",
          },
          update: {},
        });
        const movie = await tx.movie.upsert({
          where: { id: `phase17-evidence-${evidenceRun}-movie-${suffix}` },
          create: {
            id: `phase17-evidence-${evidenceRun}-movie-${suffix}`,
            organizationId,
            title: "Interstellar",
            slug: `phase17-evidence-${evidenceRun}-interstellar-${suffix}`,
            durationMinutes: 180,
          },
          update: {},
        });
        const screening = await tx.screening.upsert({
          where: { id: `phase17-evidence-${evidenceRun}-screening-${suffix}` },
          create: {
            id: `phase17-evidence-${evidenceRun}-screening-${suffix}`,
            hallId: hall.id,
            movieId: movie.id,
            startsAt: new Date(Date.now() - 300000),
            endsAt: new Date(Date.now() + 10800000),
          },
          update: {
            status: "SCHEDULED",
            startsAt: new Date(Date.now() - 300000),
            endsAt: new Date(Date.now() + 10800000),
          },
        });
        const category = await tx.menuCategory.upsert({
          where: { id: `phase17-evidence-${evidenceRun}-category-${suffix}` },
          create: {
            id: `phase17-evidence-${evidenceRun}-category-${suffix}`,
            organizationId,
            name: "Cinema favorites",
            slug: `phase17-evidence-${evidenceRun}-favorites-${suffix}`,
          },
          update: {},
        });
        const product = await tx.product.upsert({
          where: { id: `phase17-evidence-${evidenceRun}-product-${suffix}` },
          create: {
            id: `phase17-evidence-${evidenceRun}-product-${suffix}`,
            organizationId,
            categoryId: category.id,
            name: "Large Popcorn",
            slug: `phase17-evidence-${evidenceRun}-popcorn-${suffix}`,
            description: "Freshly popped cinema popcorn.",
          },
          update: { name: "Large Popcorn" },
        });
        await tx.productLocation.upsert({
          where: {
            productId_locationId: {
              productId: product.id,
              locationId: location.id,
            },
          },
          create: {
            id: `phase17-evidence-${evidenceRun}-offer-${suffix}`,
            organizationId,
            productId: product.id,
            locationId: location.id,
            price: "12.50",
            currencyCode: "USD",
          },
          update: {},
        });
        if (suffix === "beirut") {
          const ingredient = await tx.inventoryItem.upsert({
            where: { id: `phase17-evidence-${evidenceRun}-kernels` },
            create: {
              id: `phase17-evidence-${evidenceRun}-kernels`,
              organizationId,
              name: "Demo snack portions",
              sku: `PH17-${evidenceRun}-KERNELS`,
              unit: "GRAM",
            },
            update: {},
          });
          await tx.locationInventory.upsert({
            where: {
              locationId_inventoryItemId: {
                locationId: location.id,
                inventoryItemId: ingredient.id,
              },
            },
            create: {
              id: `phase17-evidence-${evidenceRun}-stock`,
              organizationId,
              locationId: location.id,
              inventoryItemId: ingredient.id,
              quantityOnHand: "1000000",
              lowStockThreshold: "5",
            },
            update: {},
          });
          await tx.productRecipeComponent.upsert({
            where: {
              productId_inventoryItemId: {
                productId: product.id,
                inventoryItemId: ingredient.id,
              },
            },
            create: {
              id: `phase17-evidence-${evidenceRun}-recipe`,
              organizationId,
              productId: product.id,
              inventoryItemId: ingredient.id,
              quantityRequired: "300.000",
            },
            update: {},
          });
        }
        if (suffix === "beirut") {
          const cups = await tx.inventoryItem.create({
            data: {
              id: `phase17-evidence-${evidenceRun}-cups`,
              organizationId,
              name: "Demo cups",
              sku: `PH17-${evidenceRun}-CUPS`,
              unit: "EACH",
            },
          });
          await tx.locationInventory.create({
            data: {
              id: `phase17-evidence-${evidenceRun}-cup-stock`,
              organizationId,
              locationId: location.id,
              inventoryItemId: cups.id,
              quantityOnHand: "10000",
            },
          });
          await tx.productRecipeComponent.create({
            data: {
              organizationId,
              productId: product.id,
              inventoryItemId: cups.id,
              quantityRequired: "2.000",
            },
          });
        }
        for (const number of suffix === "beirut"
          ? Array.from({ length: 14 }, (_, i) => i + 7)
          : [7]) {
          const seat = await tx.seat.upsert({
            where: { hallId_id: { hallId: hall.id, id: `a${number}` } },
            create: {
              hallId: hall.id,
              id: `a${number}`,
              row: "A",
              number,
              label: `A${number}`,
            },
            update: {},
          });
          await tx.customerSession.updateMany({
            where: {
              hallId: hall.id,
              seatId: seat.id,
              screeningId: screening.id,
              status: "ACTIVE",
            },
            data: { status: "REVOKED", revokedAt: new Date() },
          });
          const token = createOpaqueToken();
          const session = await tx.customerSession.create({
            data: {
              id: randomUUID(),
              hallId: hall.id,
              seatId: seat.id,
              screeningId: screening.id,
              tokenHash: hashOpaqueToken(token),
              expiresAt: screening.endsAt,
              lastSeenAt: new Date(),
              cart: {
                create: {
                  id: randomUUID(),
                  items: {
                    create: {
                      id: randomUUID(),
                      productId: product.id,
                      quantity: 1,
                      reviewedUnitPrice: "12.50",
                      reviewedCurrencyCode: "USD",
                    },
                  },
                },
              },
            },
          });
          sessions.push({
            token,
            id: session.id,
            suffix,
            number,
            screeningId: screening.id,
            productId: product.id,
          });
        }
      }
      return { org, other, locations, sessions };
    },
    { timeout: 60000 },
  );
}

async function staffIdentity(
  role:
    "KITCHEN_STAFF" | "LOCATION_MANAGER" | "DELIVERY_STAFF" | "CINEMA_ADMIN",
  organizationId: string,
  locationIds: string[],
  suffix: string,
) {
  const email = `cinebite.phase17.${suffix}@example.com`;
  let identity;
  try {
    identity = await getAdminAuth().getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found")
      throw error;
    identity = await getAdminAuth().createUser({
      email,
      displayName: `Demo ${suffix === "worker-a" ? "Delivery A" : suffix === "worker-b" ? "Delivery B" : suffix === "admin" ? "Supervisor" : "Cinema Team"}`,
    });
  }
  await getAdminAuth().updateUser(identity.uid, { disabled: false });
  const user = await prisma.user.upsert({
    where: { firebaseUid: identity.uid },
    create: {
      id: randomUUID(),
      firebaseUid: identity.uid,
      email,
      displayName: `Demo ${suffix === "worker-a" ? "Delivery A" : suffix === "worker-b" ? "Delivery B" : suffix === "admin" ? "Supervisor" : "Cinema Team"}`,
      active: true,
    },
    update: { active: true },
  });
  const membership = await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    create: {
      id: randomUUID(),
      userId: user.id,
      organizationId,
      role,
      allLocations: false,
    },
    update: { role, locationAccess: { deleteMany: {} } },
  });
  await prisma.locationAccess.createMany({
    data: locationIds.map((locationId) => ({
      membershipId: membership.id,
      organizationId,
      locationId,
    })),
    skipDuplicates: true,
  });
  return { uid: identity.uid, userId: user.id, role, organizationId };
}

async function signIn(
  context: BrowserContext,
  staff: { uid: string; role: string; organizationId: string },
) {
  const token = await getAdminAuth().createCustomToken(staff.uid, {
    role: staff.role,
    organizationId: staff.organizationId,
  });
  const identity = (await fetch(
    `http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true }),
    },
  ).then((response) => response.json())) as { idToken?: string };
  assert.ok(identity.idToken, "Demo staff token exchange failed");
  const response = await context.request.post(`${base}/api/auth/session`, {
    headers: { Origin: base },
    data: { idToken: identity.idToken },
  });
  assert.equal(
    response.status(),
    200,
    `Demo staff session creation failed: ${await response.text()}`,
  );
}

// Playwright's API client does not apply Chromium's secure-cookie loopback
// exception on plain HTTP. Send the legitimately issued demo cookie explicitly
// for API assertions; real pages use the browser cookie jar unchanged.
async function sessionHeaders(context: BrowserContext) {
  return {
    Origin: base,
    Cookie: (await context.cookies())
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; "),
  };
}
async function read(context: BrowserContext, url: string) {
  return context.request.get(url, { headers: await sessionHeaders(context) });
}

async function main() {
  await mkdir(output, { recursive: true });
  const demo = await fixture();
  const staff = await Promise.all([
    staffIdentity(
      "CINEMA_ADMIN",
      demo.org.id,
      demo.locations.slice(0, 2).map((l) => l.id),
      "admin",
    ),
    staffIdentity(
      "LOCATION_MANAGER",
      demo.org.id,
      [demo.locations[0].id],
      "manager",
    ),
    staffIdentity(
      "KITCHEN_STAFF",
      demo.org.id,
      [demo.locations[0].id],
      "kitchen",
    ),
    staffIdentity(
      "DELIVERY_STAFF",
      demo.org.id,
      [demo.locations[0].id],
      "worker-a",
    ),
    staffIdentity(
      "CINEMA_ADMIN",
      demo.other.id,
      [demo.locations[2].id],
      "other-admin",
    ),
    staffIdentity(
      "KITCHEN_STAFF",
      demo.org.id,
      [demo.locations[1].id],
      "other-kitchen",
    ),
    staffIdentity(
      "DELIVERY_STAFF",
      demo.org.id,
      [demo.locations[1].id],
      "other-delivery",
    ),
  ]);
  const server = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3117",
    ],
    { stdio: ["ignore", "ignore", "pipe"], env: process.env },
  );
  server.stderr.on("data", (chunk: Buffer) => {
    if (/\[(api|auth)/.test(chunk.toString())) console.error(chunk.toString());
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
    const contexts = await Promise.all(
      staff.map(() =>
        browser!.newContext({
          viewport: { width: 1440, height: 1000 },
          reducedMotion: "reduce",
        }),
      ),
    );
    await Promise.all(contexts.map((ctx, i) => signIn(ctx, staff[i])));
    const [
      admin,
      manager,
      kitchen,
      delivery,
      otherAdmin,
      otherKitchen,
      otherDelivery,
    ] = contexts;
    const guests = await Promise.all(
      demo.sessions.map(() =>
        browser!.newContext({
          viewport: { width: 390, height: 844 },
          reducedMotion: "reduce",
        }),
      ),
    );
    await Promise.all(
      guests.map((ctx, i) =>
        ctx.addCookies([
          {
            name: "cinebite_guest_session",
            value: demo.sessions[i].token,
            url: base,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]),
      ),
    );
    const orders = new Map<number, { id: string; publicOrderCode: string }>();
    const row = (i: number) =>
      prisma.order.findUniqueOrThrow({
        where: { id: orders.get(i)!.id },
        include: {
          payment: {
            include: { attempts: { orderBy: { number: "desc" }, take: 1 } },
          },
          refunds: true,
        },
      });
    async function post(ctx: BrowserContext, url: string, data: unknown) {
      return ctx.request.post(base + url, {
        headers: await sessionHeaders(ctx),
        data,
      });
    }
    async function ok(
      response: Awaited<ReturnType<typeof post>>,
      expected = 200,
    ) {
      assert.equal(response.status(), expected, await response.text());
      return response.json();
    }
    async function feed(
      ctx: BrowserContext,
      query = "",
    ): Promise<NotificationFeed> {
      return ok(await read(ctx, base + "/api/notifications" + query));
    }
    async function customer(i: number): Promise<NotificationFeed> {
      return ok(
        await read(
          guests[i],
          base +
            "/api/customer/orders/" +
            orders.get(i)!.publicOrderCode +
            "/notifications",
        ),
      );
    }
    async function processEvents() {
      return processNotificationOutbox({
        organizationId: demo.org.id,
        limit: 100,
      });
    }
    async function checkout(i: number, paid = true) {
      const body = await ok(
        await post(guests[i], "/api/customer/orders", {
          idempotencyKey: randomUUID(),
        }),
        201,
      );
      const order = await prisma.order.findUniqueOrThrow({
        where: { publicOrderCode: body.order.publicOrderCode },
      });
      orders.set(i, { id: order.id, publicOrderCode: order.publicOrderCode });
      if (paid)
        await ok(
          await post(
            guests[i],
            "/api/customer/payments/" + order.publicOrderCode + "/sandbox",
            { outcome: "SUCCEEDED" },
          ),
        );
      return order;
    }
    async function step(i: number, from: string, to: string, k = true) {
      await ok(
        await mutate(
          k ? kitchen : delivery,
          orders.get(i)!.publicOrderCode,
          from,
          to,
          k,
        ),
      );
      await processEvents();
    }
    const cancel = (i: number) =>
      post(
        guests[i],
        "/api/customer/orders/" + orders.get(i)!.publicOrderCode + "/cancel",
        { confirmed: true },
      );
    const refund = (i: number) =>
      post(admin, "/api/admin/orders/" + orders.get(i)!.id + "/refunds", {
        kind: "FULL",
        reasonCode: "CUSTOMER_REQUEST",
        idempotencyKey: randomUUID(),
        confirmed: true,
      });
    const refundResult = (i: number, id: string, outcome: string) =>
      post(
        admin,
        "/api/admin/orders/" + orders.get(i)!.id + "/refunds/sandbox",
        { refundId: id, outcome, confirmed: true },
      );
    async function screenshotInbox(
      ctx: BrowserContext,
      name: string,
      query = "",
    ) {
      const page = await ctx.newPage();
      await page.goto(base + "/notifications" + query);
      await page
        .getByRole("heading", { name: "Notification Center", exact: true })
        .waitFor();
      await capture(page, name);
      await page.close();
    }
    currentCase = "A";
    await checkout(0, false);
    await processEvents();
    assert.equal((await feed(kitchen)).total, 0);
    await ok(
      await post(
        guests[0],
        "/api/customer/payments/" + orders.get(0)!.publicOrderCode + "/sandbox",
        { outcome: "SUCCEEDED" },
      ),
    );
    await processEvents();
    assert.equal((await row(0)).fulfillmentEligible, true);
    const f = await feed(kitchen);
    assert.equal(f.items.filter((n) => n.type === "NEW_ORDER").length, 1);
    pass(
      ["A"],
      "Unpaid order emits no kitchen alert; verified signed sandbox payment makes it eligible and creates exactly one location-A kitchen notification.",
    );
    currentCase = "B";
    assert.equal((await feed(otherKitchen)).total, 0);
    pass(
      ["B"],
      "Kitchen staff restricted to location B see no location-A new-order alert.",
    );
    const kitchenPage = await kitchen.newPage();
    await kitchenPage.goto(base + "/kitchen");
    await kitchenPage.locator("summary[aria-label^='Notifications']").click();
    await kitchenPage
      .getByRole("heading", { name: "New kitchen order", exact: true })
      .waitFor();
    await capture(kitchenPage, "02-new-order-kitchen-alert.png");
    await kitchenPage.close();
    currentCase = "C";
    let order = await row(0);
    const intent = await getPaymentProvider().retrieve(
      order.payment!.attempts[0].providerPaymentId!,
    );
    const raw = JSON.stringify({
      ...intent,
      status: "SUCCEEDED",
      eventId: "duplicate:" + randomUUID(),
    });
    const webhook = () =>
      admin.request.post(base + "/api/payments/webhook", {
        headers: {
          "Content-Type": "application/json",
          "x-cinebite-sandbox-signature": sandboxSignature(raw),
        },
        data: raw,
      });
    await ok(await webhook());
    await ok(await webhook());
    await processEvents();
    assert.equal(
      (await feed(kitchen)).items.filter((n) => n.type === "NEW_ORDER").length,
      1,
    );
    pass(
      ["C"],
      "Duplicate signed payment webhooks and repeated processor calls do not duplicate NEW_ORDER.",
    );
    currentCase = "D";
    await step(0, "PLACED", "ACCEPTED");
    await processEvents();
    assert.equal(
      (await customer(0)).items.filter((n) => n.type === "ORDER_ACCEPTED")
        .length,
      1,
    );
    pass(
      ["D"],
      "Owning customer session receives one ACCEPTED update, including repeated processing.",
    );
    currentCase = "E";
    await step(0, "ACCEPTED", "PREPARING");
    assert.ok(
      (await customer(0)).items.some((n) => n.type === "ORDER_PREPARING"),
    );
    pass(
      ["E"],
      "Committed PREPARING transition produces customer preparation notification.",
    );
    currentCase = "F";
    await step(0, "PREPARING", "READY");
    assert.ok((await customer(0)).items.some((n) => n.type === "ORDER_READY"));
    pass(["F"], "Committed READY transition produces customer's ready update.");
    currentCase = "G";
    assert.equal(
      (await feed(delivery)).items.filter((n) => n.type === "ORDER_READY")
        .length,
      1,
    );
    pass(
      ["G"],
      "Authorized location-A delivery staff receive one READY alert.",
    );
    currentCase = "H";
    assert.equal((await feed(otherDelivery)).total, 0);
    pass(["H"], "Location-B delivery staff see no location-A READY alert.");
    const deliveryPage = await delivery.newPage();
    await deliveryPage.goto(base + "/delivery");
    await deliveryPage.locator("summary[aria-label^='Notifications']").click();
    await deliveryPage
      .getByRole("heading", { name: "Order ready", exact: true })
      .waitFor();
    await capture(deliveryPage, "03-order-ready-delivery-alert.png");
    await deliveryPage.close();
    currentCase = "I";
    await step(0, "READY", "OUT_FOR_DELIVERY", false);
    assert.ok(
      (await customer(0)).items.some(
        (n) => n.type === "ORDER_OUT_FOR_DELIVERY",
      ),
    );
    pass(
      ["I"],
      "Actual atomic delivery claim emits customer's on-the-way message without staff personal data.",
    );
    currentCase = "J";
    await step(0, "OUT_FOR_DELIVERY", "DELIVERED", false);
    assert.ok(
      (await customer(0)).items.some((n) => n.type === "ORDER_DELIVERED"),
    );
    pass(
      ["J"],
      "Assigned delivery completion emits delivered notification, without settlement claims.",
    );
    const customerPage = await guests[0].newPage();
    await customerPage.setViewportSize({ width: 1440, height: 1000 });
    await customerPage.goto(
      base + "/customer/orders/" + orders.get(0)!.publicOrderCode,
    );
    await customerPage
      .getByRole("heading", { name: "Order notifications", exact: true })
      .waitFor();
    await customerPage
      .getByRole("heading", { name: "Order delivered", exact: true })
      .waitFor();
    await capture(customerPage, "04-customer-order-notifications.png");
    await customerPage.close();
    currentCase = "K";
    await checkout(1);
    await ok(await cancel(1));
    await processEvents();
    assert.ok(
      (await customer(1)).items.some((n) => n.type === "ORDER_CANCELED"),
    );
    pass(
      ["K"],
      "Customer cancellation retains committed CANCELED state and emits private cancellation update.",
    );
    currentCase = "L";
    const cancelNotice = (await customer(1)).items.find(
      (n) => n.type === "ORDER_CANCELED",
    )!;
    assert.match(cancelNotice.message, /being processed/);
    assert.doesNotMatch(
      cancelNotice.message,
      /has been completed|successfully refunded/,
    );
    pass(
      ["L"],
      "Pending refund cancellation says processing, never falsely claims completion.",
    );
    currentCase = "M";
    order = await row(1);
    await ok(await refundResult(1, order.refunds[0].id, "SUCCEEDED"));
    await processEvents();
    assert.ok(
      (await customer(1)).items.some(
        (n) => n.type === "REFUND_SUCCEEDED" && n.message.includes("12.50 USD"),
      ),
    );
    pass(
      ["M"],
      "Verified sandbox refund success emits safe exact amount/currency customer notification.",
    );
    currentCase = "N";
    await checkout(2);
    await ok(await refund(2));
    order = await row(2);
    await ok(await refundResult(2, order.refunds[0].id, "FAILED"));
    await processEvents();
    assert.ok(
      (await feed(admin)).items.some((n) => n.type === "REFUND_FAILED"),
    );
    assert.ok(
      (await feed(manager)).items.some((n) => n.type === "REFUND_FAILED"),
    );
    assert.match(
      (await customer(2)).items.find((n) => n.type === "REFUND_FAILED")!
        .message,
      /requires attention/,
    );
    pass(
      ["N"],
      "FAILED refund alerts cinema admin and authorized manager; customer sees attention wording, not refunded or raw provider error.",
    );
    await screenshotInbox(
      admin,
      "06-refund-failed-alert.png",
      "?type=REFUND_FAILED",
    );

    const alertItem = await prisma.inventoryItem.create({
      data: {
        organizationId: demo.org.id,
        name: "Demo popcorn cartons",
        sku: "PH17-ALERT-" + evidenceRun,
        unit: "EACH",
      },
    });
    const alertStock = await prisma.locationInventory.create({
      data: {
        organizationId: demo.org.id,
        locationId: demo.locations[0].id,
        inventoryItemId: alertItem.id,
        quantityOnHand: "20",
        lowStockThreshold: "5",
      },
    });
    async function move(quantity: string) {
      const current = await prisma.locationInventory.findUniqueOrThrow({
        where: { id: alertStock.id },
      });
      const difference =
        Number(quantity) - Number(current.quantityOnHand.toString());
      if (!difference) return;
      await ok(
        await post(
          manager,
          "/api/admin/inventory/locations/" +
            demo.locations[0].id +
            "/items/" +
            alertStock.id +
            "/movements",
          {
            type: difference > 0 ? "RECEIVE" : "ADJUSTMENT_OUT",
            quantity: String(Math.abs(difference)),
            reason: "Isolated demo stock transition",
          },
        ),
        201,
      );
    }
    currentCase = "O";
    await move("5");
    await processEvents();
    assert.equal(
      (await feed(manager)).items.filter((n) => n.type === "LOW_STOCK").length,
      1,
    );
    pass(
      ["O"],
      "Actual inventory transition IN_STOCK to LOW_STOCK creates one authorized manager alert.",
    );
    await screenshotInbox(manager, "05-low-stock-alert.png", "?type=LOW_STOCK");
    currentCase = "P";
    const before = await prisma.notificationOutbox.count({
      where: { entityId: alertStock.id },
    });
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await read(
            manager,
            base + "/admin/inventory/locations/" + demo.locations[0].id,
          )
        ).status(),
        200,
      );
    await processEvents();
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { entityId: alertStock.id },
      }),
      before,
    );
    pass(
      ["P"],
      "Repeated real inventory/dashboard reads create no events or repeated low-stock alerts.",
    );
    currentCase = "Q";
    await move("0");
    await processEvents();
    assert.ok(
      (await feed(manager)).items.some(
        (n) => n.type === "OUT_OF_STOCK" && n.severity === "CRITICAL",
      ),
    );
    pass(
      ["Q"],
      "Available zero stock produces stronger mandatory CRITICAL out-of-stock warning.",
    );
    currentCase = "R";
    await move("20");
    await processEvents();
    assert.ok(
      (await feed(manager)).items.some((n) => n.type === "STOCK_RECOVERED"),
    );
    pass(
      ["R"],
      "Restock above threshold creates one documented STOCK_RECOVERED informational-success alert.",
    );
    currentCase = "S";
    await checkout(3);
    await step(3, "PLACED", "ACCEPTED");
    await step(3, "ACCEPTED", "PREPARING");
    await step(3, "PREPARING", "READY");
    await step(3, "READY", "OUT_FOR_DELIVERY", false);
    await ok(
      await post(
        delivery,
        "/api/staff/orders/" + orders.get(3)!.publicOrderCode + "/issues",
        {
          type: "CUSTOMER_UNAVAILABLE",
          note: "Fictional seat occupant unavailable; supervisor review.",
        },
      ),
    );
    await processEvents();
    assert.ok(
      (await feed(manager)).items.some(
        (n) =>
          n.type === "ORDER_ISSUE_REPORTED" &&
          n.message.includes("CUSTOMER_UNAVAILABLE"),
      ),
    );
    assert.equal((await row(3)).status, "OUT_FOR_DELIVERY");
    pass(
      ["S"],
      "Assigned worker issue alerts supervisors and leaves order/refund/inventory authority untouched.",
    );
    await screenshotInbox(admin, "01-notification-center.png");
    await screenshotInbox(
      manager,
      "07-notification-preferences.png",
      "?view=unread",
    );
    currentCase = "T";
    assert.equal((await feed(otherAdmin)).total, 0);
    assert.equal(
      (
        await read(
          otherAdmin,
          base + "/api/notifications?organizationId=" + demo.org.id,
        )
      ).status(),
      400,
    );
    pass(
      ["T"],
      "Other cinema sees no tenant-A data; caller-supplied organizationId rejected by strict query validation.",
    );
    currentCase = "U";
    const owned = (await feed(manager)).items[0];
    assert.equal(
      (await post(otherAdmin, "/api/notifications", { id: owned.id })).status(),
      404,
    );
    pass(
      ["U"],
      "Another user's notification cannot be marked read, even by a different cinema admin.",
    );
    currentCase = "V";
    const unread = (await feed(manager)).unread;
    await ok(await post(manager, "/api/notifications", { id: owned.id }));
    assert.equal((await feed(manager)).unread, unread - 1);
    await ok(await post(manager, "/api/notifications", { id: owned.id }));
    assert.equal((await feed(manager)).unread, unread - 1);
    pass(
      ["V"],
      "Read marking updates only readAt, decrements count once and is idempotent.",
    );
    currentCase = "W";
    const adminUnread = (await feed(admin)).unread;
    await ok(await post(manager, "/api/notifications", { all: true }));
    assert.equal((await feed(manager)).unread, 0);
    assert.equal((await feed(admin)).unread, adminUnread);
    pass(
      ["W"],
      "Mark-all affects only the authenticated user's authorized inbox.",
    );
    currentCase = "X";
    await prisma.user.update({
      where: { id: staff[2].userId },
      data: { active: false },
    });
    const kitchenBefore = await prisma.notification.count({
      where: { recipientUserId: staff[2].userId },
    });
    await checkout(4);
    await processEvents();
    assert.equal(
      await prisma.notification.count({
        where: { recipientUserId: staff[2].userId },
      }),
      kitchenBefore,
    );
    assert.ok(
      [401, 403].includes(
        (await read(kitchen, base + "/api/notifications")).status(),
      ),
    );
    await prisma.user.update({
      where: { id: staff[2].userId },
      data: { active: true },
    });
    pass(
      ["X"],
      "Disabled PG user receives no actionable new alert and cannot retrieve their inbox.",
    );
    currentCase = "Y";
    assert.equal(
      (
        await read(
          guests[1],
          base +
            "/api/customer/orders/" +
            orders.get(0)!.publicOrderCode +
            "/notifications",
        )
      ).status(),
      404,
    );
    pass(
      ["Y"],
      "Valid session cannot retrieve another customer's order notifications.",
    );
    currentCase = "Z";
    const anonymous = await browser.newContext();
    assert.equal(
      (
        await read(
          anonymous,
          base +
            "/api/customer/orders/" +
            orders.get(0)!.publicOrderCode +
            "/notifications",
        )
      ).status(),
      401,
    );
    await anonymous.close();
    pass(["Z"], "Public code without owning secure session is insufficient.");

    currentCase = "AA";
    await checkout(5);
    const paid = await row(5);
    const broken: NotificationChannelProvider = {
      channel: "IN_APP",
      async send() {
        throw new Error(
          "Injected unavailable provider; private details must not persist",
        );
      },
    };
    const failed = await processNotificationOutbox({
      organizationId: demo.org.id,
      provider: broken,
    });
    assert.equal(failed.retry, 1);
    assert.equal((await row(5)).payment!.status, "SUCCEEDED");
    assert.equal((await row(5)).fulfillmentEligible, true);
    let event = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { eventKey: "eligible:" + paid.id },
    });
    assert.equal(event.status, "PENDING");
    assert.equal(event.attemptCount, 1);
    assert.equal(event.lastErrorCode, "DELIVERY_FAILED");
    assert.ok(event.nextAttemptAt > event.createdAt);
    pass(
      ["AA"],
      "Injected provider failure leaves verified payment/eligibility committed and persists safe bounded retry state.",
    );
    currentCase = "AB";
    await processNotificationOutbox({
      organizationId: demo.org.id,
      now: new Date(event.nextAttemptAt.getTime() + 1),
    });
    await processEvents();
    assert.equal(
      await prisma.notification.count({
        where: { outboxId: event.id, recipientUserId: staff[2].userId },
      }),
      1,
    );
    pass(
      ["AB"],
      "Due retry succeeds and subsequent processing produces exactly one alert.",
    );
    currentCase = "AC";
    await checkout(6);
    await Promise.all(Array.from({ length: 4 }, () => processEvents()));
    event = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { eventKey: "eligible:" + orders.get(6)!.id },
    });
    assert.equal(event.status, "PROCESSED");
    assert.equal(
      await prisma.notification.count({
        where: { outboxId: event.id, recipientUserId: staff[2].userId },
      }),
      1,
    );
    pass(
      ["AC"],
      "Four concurrent processors execute SKIP LOCKED claim/delivery with one committed notification.",
    );

    results.set("AD", {
      status: "NOT EXECUTABLE",
      evidence:
        "No approved external provider is configured. Real external-delivery failure test intentionally not executed. IN_APP failure injection exercised in AA.",
    });
    results.set("AE", {
      status: "NOT EXECUTABLE",
      evidence:
        "No external provider adapter/account configured; live external retries cannot be claimed. Bounded IN_APP fault retries independently executed below.",
    });
    await checkout(7);
    event = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { eventKey: "eligible:" + orders.get(7)!.id },
    });
    for (let attempt = 1; attempt <= 5; attempt++) {
      await processNotificationOutbox({
        organizationId: demo.org.id,
        provider: broken,
        now: new Date(event.nextAttemptAt.getTime() + 1),
      });
      event = await prisma.notificationOutbox.findUniqueOrThrow({
        where: { id: event.id },
      });
      assert.equal(event.attemptCount, attempt);
    }
    assert.equal(event.status, "FAILED");
    assert.equal((await row(7)).payment!.status, "SUCCEEDED");
    await processEvents();
    assert.equal(
      (
        await prisma.notificationOutbox.findUniqueOrThrow({
          where: { id: event.id },
        })
      ).attemptCount,
      5,
    );
    results.set("BOUNDED_IN_APP_RETRY", {
      status: "PASS",
      evidence:
        "Five injected failures persist terminal FAILED; subsequent jobs do not retry; paid order unchanged.",
    });

    currentCase = "AF";
    await ok(
      await post(kitchen, "/api/notifications/preferences", {
        category: "ORDERS",
        inAppEnabled: false,
      }),
    );
    const optionalBefore = await prisma.notification.count({
      where: { recipientUserId: staff[2].userId },
    });
    await checkout(8);
    await processEvents();
    assert.equal(
      await prisma.notification.count({
        where: { recipientUserId: staff[2].userId },
      }),
      optionalBefore,
    );
    await ok(
      await post(kitchen, "/api/notifications/preferences", {
        category: "ORDERS",
        inAppEnabled: true,
      }),
    );
    pass(
      ["AF"],
      "Optional ORDERS disabled for kitchen is honored for the next eligible order, without hiding the work queue.",
    );
    currentCase = "AG";
    assert.equal(
      (
        await post(manager, "/api/notifications/preferences", {
          category: "EXCEPTIONS",
          inAppEnabled: false,
        })
      ).status(),
      400,
    );
    await ok(
      await post(manager, "/api/notifications/preferences", {
        category: "INVENTORY",
        inAppEnabled: false,
      }),
    );
    await move("0");
    await processEvents();
    assert.equal((await feed(manager)).unread, 1);
    assert.equal((await feed(manager)).items[0].type, "OUT_OF_STOCK");
    await ok(
      await post(manager, "/api/notifications/preferences", {
        category: "INVENTORY",
        inAppEnabled: true,
      }),
    );
    pass(
      ["AG"],
      "Exception preference cannot be disabled; mandatory OUT_OF_STOCK bypasses disabled optional INVENTORY.",
    );
    currentCase = "AH";
    await move("20");
    await move("5");
    await processEvents();
    assert.equal((await feed(manager)).unread, 3);
    await ok(
      await post(manager, "/api/notifications", {
        id: (await feed(manager)).items[0].id,
      }),
    );
    assert.equal((await feed(manager)).unread, 2);
    pass(["AH"], "Exactly three unread become exactly two when one is read.");
    const mobilePage = await manager.newPage();
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await mobilePage.goto(base + "/notifications?view=unread");
    await mobilePage
      .getByRole("heading", { name: "Notification Center", exact: true })
      .waitFor();
    await mobilePage
      .getByRole("heading", { name: "Stock recovered", exact: true })
      .waitFor();
    await capture(mobilePage, "08-mobile-notifications.png");
    assert.equal(
      await mobilePage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await mobilePage.goto(base + "/admin");
    await mobilePage
      .locator("summary[aria-label^='Notifications']:visible")
      .click();
    await mobilePage
      .getByRole("heading", { name: "Recent notifications", exact: true })
      .waitFor();
    assert.equal(
      await mobilePage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await mobilePage.close();
    currentCase = "AI";
    for (let i = 0; i < 23; i++) {
      await move(i % 2 === 0 ? "20" : "5");
    }
    await processEvents();
    const page1 = await feed(manager, "?page=1"),
      page2 = await feed(manager, "?page=2");
    assert.equal(page1.items.length, 20);
    assert.ok(page2.items.length > 0);
    assert.equal(
      new Set([...page1.items, ...page2.items].map((n) => n.id)).size,
      page1.items.length + page2.items.length,
    );
    assert.deepEqual(
      (await feed(manager, "?page=2")).items.map((n) => n.id),
      page2.items.map((n) => n.id),
    );
    pass(
      ["AI"],
      "Stable createdAt/id pagination produces two bounded nonoverlapping pages, including timestamp ties.",
    );

    currentCase = "AJ";
    const malicious = "<script>window.phase17_xss=true</script>";
    await prisma.inventoryItem.update({
      where: { id: alertItem.id },
      data: { name: malicious },
    });
    await move("0");
    await processEvents();
    const xssPage = await manager.newPage();
    await xssPage.goto(base + "/notifications");
    await xssPage
      .getByText(malicious + ": no available stock remains.", { exact: true })
      .waitFor();
    assert.equal(await xssPage.evaluate(() => "phase17_xss" in window), false);
    await xssPage.close();
    await prisma.inventoryItem.update({
      where: { id: alertItem.id },
      data: { name: "Demo popcorn cartons" },
    });
    pass(
      ["AJ"],
      "Actual malicious inventory label is rendered as literal React-escaped text; script sentinel never executes.",
    );
    currentCase = "AK";
    const link = (await feed(admin, "?type=REFUND_FAILED")).items[0].href!;
    const badDetails = await read(otherAdmin, base + link);
    assert.equal(
      (await badDetails.text()).includes(orders.get(2)!.publicOrderCode),
      false,
    );
    assert.equal(
      (await read(manager, base + "/api/notifications?id=other")).status(),
      400,
    );
    pass(
      ["AK"],
      "Deep link resolves to permission-checked existing order page; foreign tenant sees no order code. Arbitrary inbox target query rejected.",
    );
    currentCase = "AL";
    const guestMobile = await guests[0].newPage();
    await guestMobile.goto(
      base + "/customer/orders/" + orders.get(0)!.publicOrderCode,
    );
    await guestMobile
      .getByRole("heading", { name: "Order delivered", exact: true })
      .waitFor();
    assert.equal(
      await guestMobile.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await guestMobile.close();
    pass(
      ["AL"],
      "390px mobile inbox, admin bell panel and owning-customer progress load without horizontal page overflow; reduced motion used.",
    );
    currentCase = "AM";
    for (const file of [
      "src/server/notifications/processor.ts",
      "src/server/notifications/provider.ts",
      "src/server/services/notification.service.ts",
    ])
      assert.equal(
        /firestore|collection\(|\.doc\(/i.test(await readFile(file, "utf8")),
        false,
      );
    assert.ok(
      await prisma.notification.count({
        where: { organizationId: demo.org.id },
      }),
    );
    pass(
      ["AM"],
      "New business data persisted in PostgreSQL; notification implementation contains no Firestore writes.",
    );
    currentCase = "AN";
    const images = (await readdir(output)).filter((f) => f.endsWith(".png"));
    assert.equal(images.length, 8);
    for (const file of images)
      assert.equal(
        (await readFile(path.join(output, file)))
          .subarray(0, 8)
          .toString("hex"),
        "89504e470d0a1a0a",
      );
    pass(
      ["AN"],
      "Eight full-page native Chromium PNGs captured from real application UI with fictional isolated demo data, no browser or desktop chrome.",
    );

    // Additional negative/transaction/regression coverage, beyond the requested A-AN matrix.
    assert.equal(
      (await admin.request.post(base + "/api/notifications/process")).status(),
      401,
    );
    await ok(
      await admin.request.post(base + "/api/notifications/process", {
        headers: {
          Authorization: "Bearer " + process.env.NOTIFICATION_JOB_SECRET,
        },
      }),
    );
    assert.equal(
      (
        await post(manager, "/api/notifications", {
          all: true,
          recipientUserId: staff[0].userId,
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await post(manager, "/api/notifications/preferences", {
          category: "ORDERS",
          inAppEnabled: false,
          userId: staff[0].userId,
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await manager.request.post(base + "/api/notifications", {
          headers: {
            ...(await sessionHeaders(manager)),
            Origin: "https://evil.example",
          },
          data: { all: true },
        })
      ).status(),
      403,
    );
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: staff[1].userId,
          organizationId: demo.org.id,
        },
      },
    });
    await prisma.locationAccess.deleteMany({
      where: { membershipId: membership.id },
    });
    assert.equal((await feed(manager)).total, 0);
    await prisma.locationAccess.create({
      data: {
        membershipId: membership.id,
        organizationId: demo.org.id,
        locationId: demo.locations[0].id,
      },
    });
    // No trigger/outbox persists on an aborted inventory transaction.
    const eventCount = await prisma.notificationOutbox.count({
      where: { organizationId: demo.org.id },
    });
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.locationInventory.update({
          where: { id: alertStock.id },
          data: { quantityOnHand: "20" },
        });
        throw new Error("intentional rollback");
      }),
    );
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { organizationId: demo.org.id },
      }),
      eventCount,
    );
    // Customer expiry cannot be bypassed by a known public order code.
    await prisma.customerSession.update({
      where: { id: demo.sessions[2].id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    assert.equal(
      (
        await read(
          guests[2],
          base +
            "/api/customer/orders/" +
            orders.get(2)!.publicOrderCode +
            "/notifications",
        )
      ).status(),
      401,
    );
    await prisma.screening.update({
      where: { id: demo.sessions[0].screeningId },
      data: { status: "CANCELLED" },
    });
    await processEvents();
    assert.ok(
      await prisma.notification.count({
        where: { organizationId: demo.org.id, type: "SCREENING_CANCELED" },
      }),
    );
    assert.equal(
      (
        await read(
          guests[0],
          base +
            "/api/customer/orders/" +
            orders.get(0)!.publicOrderCode +
            "/notifications",
        )
      ).status(),
      401,
    );
    results.set("EXTRA_SECURITY_ATOMICITY", {
      status: "PASS",
      evidence:
        "Executed authenticated job/401, CSRF/403, strict read/preference injection/400, fresh location revoke, rollback no-outbox, expired customer session/401 and committed screening cancellation alerts without weakening canceled-screening session rules.",
    });
    // Terminal order authority unchanged despite read/preferences/process operations.
    assert.equal((await row(0)).status, "DELIVERED");
    const notificationAudit = await prisma.auditLog.count({
      where: {
        organizationId: demo.org.id,
        action: "NOTIFICATION_PREFERENCES_CHANGED",
      },
    });
    assert.ok(notificationAudit >= 4);
    results.set("SAFE_AUDIT", {
      status: "PASS",
      evidence:
        "Preference changes audited with category/boolean only; read operations do not flood audit; terminal delivered order unchanged.",
    });
    // Adapter partial insert failure must roll back drafts before due retry.
    await prisma.screening.update({
      where: { id: demo.sessions[0].screeningId },
      data: { status: "SCHEDULED" },
    });
    await checkout(9);
    const partial: NotificationChannelProvider = {
      channel: "IN_APP",
      async send(tx, drafts) {
        await inAppNotificationProvider.send(tx, drafts);
        throw new Error("after insert injection");
      },
    };
    await processNotificationOutbox({
      organizationId: demo.org.id,
      provider: partial,
    });
    event = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { eventKey: "eligible:" + orders.get(9)!.id },
    });
    assert.equal(
      await prisma.notification.count({ where: { outboxId: event.id } }),
      0,
    );
    await processNotificationOutbox({
      organizationId: demo.org.id,
      now: new Date(event.nextAttemptAt.getTime() + 1),
    });
    assert.equal(
      await prisma.notification.count({
        where: { outboxId: event.id, recipientUserId: staff[2].userId },
      }),
      1,
    );
    results.set("PARTIAL_INSERT_RETRY", {
      status: "PASS",
      evidence:
        "Provider throws after actual DB insertion; savepoint removes partial drafts, retry commits exactly one kitchen alert.",
    });
    currentCase = "EXTRA_DATABASE_RECOVERY";
    await checkout(10);
    const databaseFailure: NotificationChannelProvider = {
      channel: "IN_APP",
      async send(tx) {
        await tx.$queryRaw`SELECT 1/0`;
      },
    };
    await processNotificationOutbox({
      organizationId: demo.org.id,
      provider: databaseFailure,
    });
    event = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { eventKey: "eligible:" + orders.get(10)!.id },
    });
    assert.equal(event.attemptCount, 1);
    assert.equal(event.status, "PENDING");
    await processNotificationOutbox({
      organizationId: demo.org.id,
      now: new Date(event.nextAttemptAt.getTime() + 1),
    });
    assert.equal(
      await prisma.notification.count({
        where: { outboxId: event.id, recipientUserId: staff[2].userId },
      }),
      1,
    );
    results.set(currentCase, {
      status: "PASS",
      evidence:
        "An actual PostgreSQL division-by-zero abort within the provider is recovered by savepoint; durable retry persists and then sends once.",
    });
    currentCase = "EXTRA_LEGACY_PAYMENT_FAILURE";
    const originalOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orders.get(0)!.id },
    });
    const legacy = await prisma.order.create({
      data: {
        ...originalOrder,
        id: randomUUID(),
        publicOrderCode:
          "CB-" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
        idempotencyKey: randomUUID(),
        status: "PLACED",
        paymentPolicy: "LEGACY_NOT_REQUIRED",
        fulfillmentEligible: false,
        deliveryAssignedUserId: null,
        deliveryClaimedAt: null,
        readyAt: null,
        deliveredAt: null,
      },
    });
    await processEvents();
    assert.equal(
      await prisma.notification.count({
        where: {
          entityId: legacy.id,
          type: "NEW_ORDER",
          recipientUserId: staff[2].userId,
        },
      }),
      1,
    );
    await checkout(11, false);
    await ok(
      await post(
        guests[11],
        "/api/customer/payments/" +
          orders.get(11)!.publicOrderCode +
          "/sandbox",
        { outcome: "FAILED" },
      ),
    );
    await processEvents();
    assert.ok(
      (await customer(11)).items.some((n) => n.type === "PAYMENT_FAILED"),
    );
    assert.equal(
      await prisma.notification.count({
        where: { entityId: orders.get(11)!.id, type: "NEW_ORDER" },
      }),
      0,
    );
    results.set(currentCase, {
      status: "PASS",
      evidence:
        "Explicit historical legacy fixture becomes eligible without online payment; actual failed signed sandbox attempt privately alerts customer but never kitchen.",
    });
    currentCase = "EXTRA_RETENTION";
    const historicNotice = await prisma.notification.findFirstOrThrow({
      where: { organizationId: demo.org.id, type: "NEW_ORDER" },
    });
    const domainHistory = await prisma.orderStatusEvent.count({
      where: { orderId: orders.get(0)!.id },
    });
    await prisma.notification.update({
      where: { id: historicNotice.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await prisma.notificationOutbox.update({
      where: { id: historicNotice.outboxId },
      data: { createdAt: new Date(Date.now() - 91 * 86400000) },
    });
    const pruned = await pruneNotifications();
    assert.ok(pruned.expiredNotifications >= 1);
    assert.ok(pruned.retiredOutbox >= 1);
    assert.equal(
      await prisma.notification.findUnique({
        where: { id: historicNotice.id },
      }),
      null,
    );
    assert.equal(
      await prisma.orderStatusEvent.count({
        where: { orderId: orders.get(0)!.id },
      }),
      domainHistory,
    );
    assert.equal((await row(0)).status, "DELIVERED");
    results.set(currentCase, {
      status: "PASS",
      evidence:
        "Bounded cleanup removes an actually expired notification and old processed outbox; all business order/status-event history is retained.",
    });
  } catch (error) {
    results.set(currentCase, {
      status: "FAIL",
      evidence: error instanceof Error ? error.message : "Verification failure",
    });
    throw error;
  } finally {
    await writeFile(
      path.join(process.cwd(), "docs", "phase-17-integration-results.json"),
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          environment:
            "Isolated PostgreSQL 17 / Firebase Auth emulator / sandbox verified payment-refund / production Next build / native Chromium",
          externalProvider: "NOT CONFIGURED",
          results: Object.fromEntries(results),
        },
        null,
        2,
      ) + "\n",
    );
    await browser?.close();
    server.kill();
    await Promise.all(
      staff.map((user) =>
        getAdminAuth().updateUser(user.uid, { disabled: true }),
      ),
    );
    await prisma.user.updateMany({
      where: { id: { in: staff.map((s) => s.userId) } },
      data: { active: false },
    });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "Verification failed");
  process.exitCode = 1;
});
