import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type APIResponse,
} from "playwright-core";
import { getAdminAuth } from "../src/lib/firebase/admin";
import { prisma } from "../src/lib/db/prisma";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "../src/lib/security/opaque-token";
import { CUSTOMER_SESSION_COOKIE } from "../src/lib/customer-session/policy";
import { sandboxSignature } from "../src/lib/payments/provider";
import { processNotificationOutbox } from "../src/server/notifications/processor";
import { pruneOperationalTelemetry } from "../src/server/observability/operations";
import { runObservedJob } from "../src/server/observability/jobs";
import { recordIncident } from "../src/server/observability/incident";
import {
  observationScope,
  newRequestId,
} from "../src/lib/observability/context";
import { logRecord } from "../src/lib/observability/logger";
import { normalizeError } from "../src/lib/observability/errors";
import { captureTrackedError } from "../src/lib/observability/error-tracker";

if (!process.argv.includes("--local"))
  throw new Error(
    "Use --local with isolated Phase 19 PostgreSQL and Firebase emulators. Never load .env.local into this runner.",
  );
process.env.DATABASE_URL =
  "postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase19_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9144";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9198";
process.env.STORAGE_EMULATOR_HOST = "http://127.0.0.1:9198";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-cinebite-phase19";
process.env.GCLOUD_PROJECT = "demo-cinebite-phase19";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL =
  "test@demo-cinebite-phase19.iam.gserviceaccount.com";
process.env.FIREBASE_STORAGE_BUCKET = "demo-cinebite-phase19.appspot.com";
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
process.env.OBSERVABILITY_JOB_SECRET = randomUUID() + randomUUID();
process.env.PAYMENT_RESERVATION_MINUTES = "12";
process.env.OBSERVABILITY_ENVIRONMENT = "test";
process.env.OBSERVABILITY_RELEASE = "phase-19-isolated-evidence";
process.env.OBSERVABILITY_BACKLOG_SECONDS = "120";
process.env.OBSERVABILITY_JOB_STALE_SECONDS = "300";
const base = "http://127.0.0.1:3119",
  evidenceRun = randomUUID().slice(0, 8),
  output = path.join(process.cwd(), "linkedin", "phase-19");
const secrets = new Set<string>([
  process.env.FIREBASE_ADMIN_PRIVATE_KEY!,
  process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET!,
  process.env.PAYMENT_EXPIRY_JOB_SECRET!,
  process.env.NOTIFICATION_JOB_SECRET!,
  process.env.OBSERVABILITY_JOB_SECRET!,
]);
const results = new Map<
  string,
  { status: "PASS" | "FAIL" | "NOT EXECUTABLE"; evidence: string }
>();
for (const id of [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ...Array.from({ length: 16 }, (_, i) => "A" + String.fromCharCode(65 + i)),
])
  results.set(id, {
    status: "NOT EXECUTABLE",
    evidence: "Not reached in this run.",
  });
let currentCase = "A";
function pass(ids: string[], evidence: string) {
  for (const id of ids) results.set(id, { status: "PASS", evidence });
  console.log("PASS " + ids.join(", ") + ": " + evidence);
}
function pg(mode: "stop" | "start") {
  const cluster = path.join(process.cwd(), ".phase13-test", "pgdata");
  assert.equal(
    cluster,
    "C:\\Users\\FADEL\\Desktop\\cinebite\\.phase13-test\\pgdata",
  );
  const command =
    mode === "stop"
      ? ["-D", cluster, "stop", "-m", "fast"]
      : [
          "-D",
          cluster,
          "-l",
          path.join(process.cwd(), ".phase19-test", "postgres.log"),
          "-o",
          "-p 55414 -h 127.0.0.1 -c timezone=UTC",
          "start",
        ];
  assert.equal(
    spawnSync("C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe", command, {
      windowsHide: true,
      stdio: "ignore",
    }).status,
    0,
    "Isolated test PostgreSQL operation failed.",
  );
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(output, name),
    fullPage: true,
    animations: "disabled",
  });
}
async function finishResponse(response: APIResponse, status: number) {
  assert.ok(
    (response.headers()["content-type"] ?? "").includes("application/json"),
    "Unexpected non-JSON response: " + response.status(),
  );
  const body = await response.json();
  assert.equal(
    response.status(),
    status,
    "Unexpected HTTP status; safe code: " + String(body.code ?? "none"),
  );
  return body;
}

async function fixture() {
  const org = await prisma.organization.create({
    data: {
      id: `phase19-evidence-${evidenceRun}-org`,
      slug: `phase19-evidence-${evidenceRun}-cinemas`,
      name: "Demo CineBite Cinemas",
      status: "ACTIVE",
    },
  });
  return prisma.$transaction(
    async (tx) => {
      const other = await tx.organization.upsert({
        where: { slug: `phase19-evidence-${evidenceRun}-other-cinema` },
        create: {
          id: `phase19-evidence-${evidenceRun}-other-org`,
          slug: `phase19-evidence-${evidenceRun}-other-cinema`,
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
          where: { id: `phase19-evidence-${evidenceRun}-${suffix}` },
          create: {
            id: `phase19-evidence-${evidenceRun}-${suffix}`,
            organizationId,
            name,
            slug: `phase19-evidence-${evidenceRun}-${suffix}`,
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
          where: { id: `phase19-evidence-${evidenceRun}-hall-${suffix}` },
          create: {
            id: `phase19-evidence-${evidenceRun}-hall-${suffix}`,
            locationId: location.id,
            name: "Hall 1",
            number: 1,
            status: "ACTIVE",
          },
          update: {},
        });
        const movie = await tx.movie.upsert({
          where: { id: `phase19-evidence-${evidenceRun}-movie-${suffix}` },
          create: {
            id: `phase19-evidence-${evidenceRun}-movie-${suffix}`,
            organizationId,
            title: "Interstellar",
            slug: `phase19-evidence-${evidenceRun}-interstellar-${suffix}`,
            durationMinutes: 180,
          },
          update: {},
        });
        const screening = await tx.screening.upsert({
          where: { id: `phase19-evidence-${evidenceRun}-screening-${suffix}` },
          create: {
            id: `phase19-evidence-${evidenceRun}-screening-${suffix}`,
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
          where: { id: `phase19-evidence-${evidenceRun}-category-${suffix}` },
          create: {
            id: `phase19-evidence-${evidenceRun}-category-${suffix}`,
            organizationId,
            name: "Cinema favorites",
            slug: `phase19-evidence-${evidenceRun}-favorites-${suffix}`,
          },
          update: {},
        });
        const product = await tx.product.upsert({
          where: { id: `phase19-evidence-${evidenceRun}-product-${suffix}` },
          create: {
            id: `phase19-evidence-${evidenceRun}-product-${suffix}`,
            organizationId,
            categoryId: category.id,
            name: "Large Popcorn",
            slug: `phase19-evidence-${evidenceRun}-popcorn-${suffix}`,
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
            id: `phase19-evidence-${evidenceRun}-offer-${suffix}`,
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
            where: { id: `phase19-evidence-${evidenceRun}-kernels` },
            create: {
              id: `phase19-evidence-${evidenceRun}-kernels`,
              organizationId,
              name: "Demo snack portions",
              sku: `PH19-${evidenceRun}-KERNELS`,
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
              id: `phase19-evidence-${evidenceRun}-stock`,
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
              id: `phase19-evidence-${evidenceRun}-recipe`,
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
              id: `phase19-evidence-${evidenceRun}-cups`,
              organizationId,
              name: "Demo cups",
              sku: `PH19-${evidenceRun}-CUPS`,
              unit: "EACH",
            },
          });
          await tx.locationInventory.create({
            data: {
              id: `phase19-evidence-${evidenceRun}-cup-stock`,
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
          ? Array.from({ length: 4 }, (_, i) => i + 7)
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
  const email = `cinebite.phase19.${evidenceRun}.${suffix}@example.test`;
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
  staff: { uid: string; organizationId: string | null },
) {
  const db = await prisma.user.findUniqueOrThrow({
    where: { firebaseUid: staff.uid },
    include: {
      memberships: { where: { organizationId: staff.organizationId ?? "" } },
    },
  });
  const token = await getAdminAuth().createCustomToken(staff.uid, {
    role:
      db.platformRole === "SUPER_ADMIN"
        ? "SUPER_ADMIN"
        : db.memberships[0].role,
    organizationId: staff.organizationId,
    authorizationVersion: db.authorizationVersion,
  });
  secrets.add(token);
  const identity = (await fetch(
    "http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true }),
    },
  ).then((r) => r.json())) as { idToken?: string };
  assert.ok(identity.idToken, "Demo staff token exchange failed");
  secrets.add(identity.idToken);
  const response = await context.request.post(base + "/api/auth/session", {
    headers: { Origin: base },
    data: { idToken: identity.idToken },
  });
  assert.equal(response.status(), 200, "Demo staff cookie exchange failed.");
}

async function sessionHeaders(context: BrowserContext) {
  return {
    Origin: base,
    Cookie: (await context.cookies())
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; "),
  };
}

async function read(context: BrowserContext, url: string) {
  return context.request.get(base + url, {
    headers: await sessionHeaders(context),
  });
}

async function main() {
  await mkdir(output, { recursive: true });
  const database = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  assert.equal(
    database[0].name,
    "cinebite_phase19_test",
    "Never mutate a non-test database.",
  );
  const demo = await fixture(),
    location = demo.locations[0];
  const identities = await Promise.all([
    staffIdentity("CINEMA_ADMIN", demo.org.id, [location.id], "admin"),
    staffIdentity("KITCHEN_STAFF", demo.org.id, [location.id], "kitchen-a"),
    staffIdentity("KITCHEN_STAFF", demo.org.id, [location.id], "kitchen-b"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [location.id], "worker-a"),
    staffIdentity("DELIVERY_STAFF", demo.org.id, [location.id], "worker-b"),
    staffIdentity(
      "CINEMA_ADMIN",
      demo.other.id,
      [demo.locations[2].id],
      "other-admin",
    ),
  ]);
  const superIdentity = await getAdminAuth().createUser({
    email: `phase19.${evidenceRun}.platform@example.test`,
    displayName: "Demo Platform Operator",
  });
  await prisma.user.create({
    data: {
      firebaseUid: superIdentity.uid,
      email: superIdentity.email!,
      displayName: "Demo Platform Operator",
      platformRole: "SUPER_ADMIN",
      active: true,
    },
  });
  const server = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3119",
    ],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  let rawLogs = "",
    browser: Browser | undefined,
    stopped = false;
  server.stdout.on("data", (chunk) => {
    rawLogs += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    rawLogs += chunk.toString();
  });
  const events = () =>
    rawLogs.split(/\r?\n/).flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return typeof event.timestamp === "string" &&
          typeof event.event === "string"
          ? [event]
          : [];
      } catch {
        return [];
      }
    });
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      headless: true,
    });
    const staff = await Promise.all(
      identities.map(() =>
        browser!.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: 2,
          reducedMotion: "reduce",
        }),
      ),
    );
    await Promise.all(staff.map((ctx, i) => signIn(ctx, identities[i])));
    const platform = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    await signIn(platform, { uid: superIdentity.uid, organizationId: null });
    for (const context of [...staff, platform])
      for (const cookie of await context.cookies()) secrets.add(cookie.value);
    const guests = await Promise.all(
      demo.sessions
        .filter((s) => s.suffix === "beirut")
        .map(async (s) => {
          secrets.add(s.token);
          const ctx = await browser!.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            reducedMotion: "reduce",
          });
          await ctx.addCookies([
            {
              name: CUSTOMER_SESSION_COOKIE,
              value: s.token,
              url: base,
              httpOnly: true,
              sameSite: "Lax",
            },
          ]);
          return ctx;
        }),
    );
    const request = async (ctx: BrowserContext, url: string, input: unknown) =>
      ctx.request.post(base + url, {
        headers: await sessionHeaders(ctx),
        data: input,
      });
    const job = async (url: string, secret: string) =>
      platform.request.post(base + url, {
        headers: { Authorization: "Bearer " + secret },
      });
    const snapshot = async () =>
      finishResponse(await read(platform, "/api/super-admin/operations"), 200);
    currentCase = "A";
    const live = await fetch(base + "/api/health", {
      headers: { "X-Request-ID": "UNTRUSTED-FIXTURE" },
    });
    const liveId = live.headers.get("x-request-id");
    assert.match(liveId!, /^REQ-/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(events().some((e) => e.requestId === liveId));
    pass(
      ["A"],
      "Actual HTTP response and structured server log share a server-generated request reference; untrusted upstream ID ignored.",
    );
    const independent = await Promise.all(
      Array.from({ length: 8 }, () =>
        fetch(base + "/api/health").then((r) => r.headers.get("x-request-id")),
      ),
    );
    assert.equal(new Set(independent).size, 8);
    pass(
      ["B"],
      "Eight independent actual requests receive distinct cryptographic request IDs.",
    );
    currentCase = "C";
    const marker = "PRIVATE-REDACTION-" + randomUUID();
    secrets.add(marker);
    const scrubbed = JSON.stringify(
      logRecord("warn", "test.redaction", {
        authorization: marker,
        cookie: marker,
        password: marker,
        token: marker,
        secret: marker,
        privateKey: marker,
        cardNumber: marker,
        cvv: marker,
        nested: { password: marker },
      }),
    );
    assert.ok(!scrubbed.includes(marker));
    pass(
      ["C"],
      "Actual logger serialization redacts all specified secret keys, including nested data.",
    );
    currentCase = "D";
    const fakeSession = createOpaqueToken();
    secrets.add(fakeSession);
    const denied = await platform.request.get(base + "/api/customer/cart", {
      headers: { Cookie: CUSTOMER_SESSION_COOKIE + "=" + fakeSession },
    });
    assert.equal(denied.status(), 401);
    assert.ok(!rawLogs.includes(fakeSession));
    pass(
      ["D"],
      "Real customer API denial with a cookie present emits no raw session token.",
    );
    currentCase = "E";
    const qr = createOpaqueToken();
    secrets.add(qr);
    assert.equal(
      (
        await request(guests[0], "/api/customer/session", { credential: qr })
      ).status(),
      404,
    );
    assert.ok(!rawLogs.includes(qr));
    pass(
      ["E"],
      "Invalid real QR/session-start request is rejected without logging its credential.",
    );
    const dbSecret =
      "postgresql://private:PRIVATE_PASS@127.0.0.1/phase19-test";
    assert.ok(
      !JSON.stringify(
        logRecord("error", "test.database", {
          DATABASE_URL: dbSecret,
          DIRECT_URL: dbSecret,
          errorCode: normalizeError({ code: "P1001", message: dbSecret }).code,
        }),
      ).includes("PRIVATE_PASS"),
    );
    pass(
      ["G"],
      "Environment/database error fixture remains classified without logging database URLs or credentials.",
    );
    currentCase = "H";
    const started = performance.now();
    assert.deepEqual(await live.json(), { status: "ok" });
    assert.ok(performance.now() - started < 1500);
    pass(
      ["H", "J"],
      "Actual liveness returns minimal no-store status only, with no database/provider topology or expensive dependency work.",
    );
    assert.equal((await fetch(base + "/api/ready")).status, 200);
    pass(
      ["I"],
      "Actual readiness is healthy with isolated PostgreSQL available; outage portion executed below.",
    );
    const normal = await snapshot();
    assert.equal(normal.database.status, "HEALTHY");
    assert.equal(typeof normal.database.latencyMs, "number");
    pass(
      ["K"],
      "Authorized operational API measures real database probe latency without hostname or SQL.",
    );
    currentCase = "AG";
    assert.equal(
      (await read(staff[0], "/api/super-admin/operations")).status(),
      403,
    );
    assert.equal(
      (await read(staff[5], "/api/super-admin/operations")).status(),
      403,
    );
    const wrongPage = await staff[0].newPage();
    await wrongPage.goto(base + "/super-admin/operations");
    assert.ok(wrongPage.url().includes("/unauthorized"));
    pass(
      ["AG", "AH"],
      "Both cinema admins are denied platform operations; verified Super Admin obtains the safe platform snapshot.",
    );
    results.set("AI", {
      status: "NOT EXECUTABLE",
      evidence:
        "No optional Cinema Admin operational endpoint is implemented. Both tenants are denied the platform API/page; existing tenant financial views remain separately authorized.",
    });
    currentCase = "X";
    const controlled = await request(guests[1], "/api/customer/orders", {
      idempotencyKey: "bad",
    });
    const checkoutError = await finishResponse(controlled, 400);
    assert.equal(checkoutError.requestId, controlled.headers()["x-request-id"]);
    assert.ok(
      events().some(
        (e) =>
          e.requestId === checkoutError.requestId &&
          e.operation === "checkout.input_validation" &&
          e.errorCode === "VALIDATION_ERROR",
      ),
    );
    pass(
      ["X"],
      "Controlled actual checkout validation failure correlates response, request and checkout stage with safe code, without cookie/cart data.",
    );
    currentCase = "AK";
    const note =
      "PRIVATE_DEMO_NOTE_" +
      randomUUID() +
      "\n<script>not-executed</script>" +
      "x".repeat(150);
    secrets.add(note);
    const first = await finishResponse(
      await request(guests[0], "/api/customer/orders", {
        idempotencyKey: randomUUID(),
        customerNote: note,
      }),
      201,
    );
    const order = await prisma.order.findUniqueOrThrow({
      where: { publicOrderCode: first.order.publicOrderCode },
      include: { payment: { include: { attempts: true } } },
    });
    const attempt = order.payment!.attempts[0],
      intent = await prisma.sandboxPaymentIntent.findUniqueOrThrow({
        where: { id: attempt.providerPaymentId! },
      });
    const sendWebhook = async (
      event: Record<string, unknown>,
      valid = true,
    ) => {
      const raw = JSON.stringify(event);
      return platform.request.post(base + "/api/payments/webhook", {
        headers: {
          "Content-Type": "application/json",
          "x-cinebite-sandbox-signature": valid
            ? sandboxSignature(raw)
            : "invalid",
        },
        data: raw,
      });
    };
    const paymentEvent = {
      eventId: "phase19-valid-" + randomUUID(),
      attemptId: attempt.id,
      providerPaymentId: intent.id,
      amountMinor: intent.amountMinor,
      currencyCode: intent.currencyCode,
      status: "SUCCEEDED",
    };
    await prisma.sandboxPaymentIntent.update({
      where: { id: intent.id },
      data: { status: "SUCCEEDED" },
    });
    currentCase = "L";
    assert.equal((await sendWebhook(paymentEvent)).status(), 200);
    const webhook = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: {
        provider_providerEventId: {
          provider: "sandbox",
          providerEventId: paymentEvent.eventId,
        },
      },
    });
    assert.equal(webhook.status, "PROCESSED");
    assert.ok(
      ["webhook.received", "webhook.verified", "webhook.processed"].every(
        (name) => events().some((e) => e.event === name),
      ),
    );
    pass(
      ["L"],
      "Valid signed sandbox webhook is received, verified and processed, reflected in the authoritative event journal and scrubbed stage logs.",
    );
    currentCase = "M";
    const invalid = await sendWebhook(
      { ...paymentEvent, eventId: "invalid-" + randomUUID() },
      false,
    );
    assert.equal(invalid.status(), 400);
    assert.ok(
      events().some(
        (e) =>
          e.operation === "webhook.verify" &&
          e.errorCode === "PAYMENT_SIGNATURE_INVALID",
      ),
    );
    pass(
      ["M"],
      "Invalid actual webhook signature is rejected and classified as a warning without raw payload or authentication material.",
    );
    const replay = await finishResponse(await sendWebhook(paymentEvent), 200);
    assert.equal(replay.duplicate, true);
    assert.ok(events().some((e) => e.event === "webhook.duplicate"));
    assert.equal(
      await prisma.paymentWebhookEvent.count({
        where: { providerEventId: paymentEvent.eventId },
      }),
      1,
    );
    pass(
      ["N"],
      "Actual duplicate webhook is classified as idempotent replay, with one journal row and no duplicate settlement.",
    );
    currentCase = "O";
    const failureEvent = {
      ...paymentEvent,
      eventId: "phase19-fail-" + randomUUID(),
      status: "FAILED",
    };
    await prisma.$executeRawUnsafe(
      "CREATE OR REPLACE FUNCTION phase19_webhook_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"providerEventId\" LIKE 'phase19-fail-%' THEN RAISE EXCEPTION 'controlled test processing failure' USING ERRCODE='XX000'; END IF; RETURN NEW; END $$",
    );
    await prisma.$executeRawUnsafe(
      "CREATE TRIGGER phase19_webhook_failure BEFORE INSERT ON payment_webhook_events FOR EACH ROW EXECUTE FUNCTION phase19_webhook_failure()",
    );
    try {
      assert.equal((await sendWebhook(failureEvent)).status(), 500);
      assert.equal(
        (
          await prisma.payment.findUniqueOrThrow({
            where: { id: order.payment!.id },
          })
        ).status,
        "SUCCEEDED",
      );
      const failedSnapshot = await snapshot();
      assert.ok(
        failedSnapshot.data.incidents.some((row: { domain: string }) =>
          row.domain.includes("webhook"),
        ),
      );
    } finally {
      await prisma.$executeRawUnsafe(
        "DROP TRIGGER IF EXISTS phase19_webhook_failure ON payment_webhook_events",
      );
      await prisma.$executeRawUnsafe(
        "DROP FUNCTION IF EXISTS phase19_webhook_failure()",
      );
    }
    assert.equal((await sendWebhook(failureEvent)).status(), 200);
    pass(
      ["O"],
      "Actual SQL-injected webhook failure rolls back settlement/journal changes and is visible as a safe operational incident; replay succeeds after fixture removal.",
    );
    assert.ok(!rawLogs.includes(process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET!));
    pass(
      ["F"],
      "Actual successful/invalid/failed webhook logs contain no provider/webhook secret.",
    );
    currentCase = "Z";
    const accepts = await Promise.all([
      request(staff[1], "/api/kitchen/orders/" + order.publicOrderCode, {
        expectedStatus: "PLACED",
        toStatus: "ACCEPTED",
      }),
      request(staff[2], "/api/kitchen/orders/" + order.publicOrderCode, {
        expectedStatus: "PLACED",
        toStatus: "ACCEPTED",
      }),
    ]);
    assert.deepEqual(accepts.map((r) => r.status()).sort(), [200, 409]);
    assert.ok(
      events().some(
        (e) =>
          e.operation === "kitchen.transition" &&
          e.statusCode === 409 &&
          e.level === "warn",
      ),
    );
    pass(
      ["Z"],
      "Actual double kitchen acceptance has one winner and one ordinary 409 warning, not a critical platform exception.",
    );
    for (const [expectedStatus, toStatus] of [
      ["ACCEPTED", "PREPARING"],
      ["PREPARING", "READY"],
    ])
      assert.equal(
        (
          await request(
            staff[1],
            "/api/kitchen/orders/" + order.publicOrderCode,
            { expectedStatus, toStatus },
          )
        ).status(),
        200,
      );
    currentCase = "AA";
    const claims = await Promise.all([
      request(staff[3], "/api/delivery/orders/" + order.publicOrderCode, {
        expectedStatus: "READY",
        toStatus: "OUT_FOR_DELIVERY",
      }),
      request(staff[4], "/api/delivery/orders/" + order.publicOrderCode, {
        expectedStatus: "READY",
        toStatus: "OUT_FOR_DELIVERY",
      }),
    ]);
    assert.deepEqual(claims.map((r) => r.status()).sort(), [200, 409]);
    assert.ok(
      events().some(
        (e) =>
          e.operation === "delivery.transition" &&
          e.statusCode === 409 &&
          e.level === "warn",
      ),
    );
    pass(
      ["AA"],
      "Two real delivery workers compete for one order; one succeeds and the other is a safe business conflict.",
    );
    currentCase = "AB";
    const foreign = await read(
      staff[1],
      "/api/kitchen/orders?locationId=" + demo.locations[2].id,
    );
    assert.equal(foreign.status(), 403);
    const foreignBody = await foreign.json();
    assert.ok(!JSON.stringify(foreignBody).includes(demo.other.name));
    assert.ok(
      events().some(
        (e) =>
          e.errorCode === "UNAUTHORIZED_LOCATION" ||
          e.errorCode === "LOCATION_ACCESS_DENIED",
      ),
    );
    pass(
      ["AB"],
      "Cross-location denial is safe and logged by code, without unauthorized tenant/entity details.",
    );
    currentCase = "P";
    const refunded = await finishResponse(
      await request(staff[0], "/api/admin/orders/" + order.id + "/refunds", {
        kind: "PARTIAL",
        amount: "1.00",
        reasonCode: "OPERATIONAL_ISSUE",
        idempotencyKey: randomUUID(),
        confirmed: true,
      }),
      200,
    );
    const refund = refunded.refunds.find(
      (r: { status: string }) =>
        r.status === "PROCESSING" || r.status === "PENDING",
    );
    assert.ok(refund);
    assert.equal(
      (
        await request(
          staff[0],
          "/api/admin/orders/" + order.id + "/refunds/sandbox",
          { refundId: refund.id, outcome: "FAILED", confirmed: true },
        )
      ).status(),
      200,
    );
    const failedRefunds = await snapshot();
    assert.ok(
      failedRefunds.data.refunds.rows.some(
        (r: { id: string }) => r.id === refund.id,
      ),
    );
    pass(
      ["P"],
      "Actual sandbox refund failure persists FAILED, reuses cinema-scoped notifications/issues and is visible in the restricted operational queue.",
    );
    currentCase = "Q";
    await processNotificationOutbox({
      organizationId: demo.org.id,
      limit: 100,
    });
    const outbox = await prisma.notificationOutbox.create({
      data: {
        eventKey: "phase19-evidence-" + randomUUID(),
        type: "REFUND_FAILED",
        organizationId: demo.org.id,
        locationId: location.id,
        entityType: "ORDER",
        entityId: order.id,
        createdAt: new Date(Date.now() - 180000),
      },
    });
    let health = await snapshot();
    assert.ok(health.data.outbox.pending >= 1);
    assert.ok(health.data.outbox.oldestSeconds >= 180);
    assert.equal(health.data.outbox.status, "DEGRADED");
    pass(
      ["Q", "R"],
      "Actual aged pending outbox event increases pending count and degrades notification health at the configured threshold.",
    );
    currentCase = "S";
    const unsuccessful = await runObservedJob(
      "NOTIFICATIONS",
      () =>
        processNotificationOutbox({
          organizationId: demo.org.id,
          limit: 100,
          provider: {
            channel: "IN_APP",
            async send() {
              throw new Error("PRIVATE_NOTIFICATION_PAYLOAD");
            },
          },
        }),
      (r) => ({ processed: r.processed, failed: r.failed + r.retry }),
    );
    assert.ok(unsuccessful.retry > 0);
    const retried = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    assert.equal(retried.attemptCount, 1);
    assert.equal(retried.status, "PENDING");
    assert.equal(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
      "OUT_FOR_DELIVERY",
    );
    health = await snapshot();
    assert.ok(health.data.outbox.retrying > 0);
    assert.ok(
      health.data.jobs.some((j: { status: string }) => j.status === "PARTIAL"),
    );
    pass(
      ["S", "V", "AF"],
      "Actual failing notification adapter preserves the committed order, retains retry state and records a PARTIAL job with safe failure count.",
    );
    await prisma.notificationOutbox.updateMany({
      where: { organizationId: demo.org.id, status: "PENDING" },
      data: { nextAttemptAt: new Date() },
    });
    currentCase = "T";
    const recovered = await job(
      "/api/notifications/process",
      process.env.NOTIFICATION_JOB_SECRET!,
    );
    assert.equal(recovered.status(), 200);
    assert.equal(
      (
        await prisma.notificationOutbox.findUniqueOrThrow({
          where: { id: outbox.id },
        })
      ).status,
      "PROCESSED",
    );
    health = await snapshot();
    assert.equal(health.data.outbox.pending, 0);
    assert.equal(health.data.outbox.status, "HEALTHY");
    const latestRun = await prisma.jobRun.findFirstOrThrow({
      where: { jobType: "NOTIFICATIONS" },
      orderBy: { startedAt: "desc" },
    });
    assert.equal(latestRun.status, "SUCCEEDED");
    assert.ok(latestRun.durationMs! >= 0);
    assert.ok(latestRun.processedCount > 0);
    pass(
      ["T", "U"],
      "Real authorized scheduled processor recovers the event and records correlated start/success/duration/processed counts; backlog becomes healthy.",
    );
    currentCase = "W";
    const overlap = await Promise.all([
      job("/api/notifications/process", process.env.NOTIFICATION_JOB_SECRET!),
      job("/api/notifications/process", process.env.NOTIFICATION_JOB_SECRET!),
    ]);
    assert.ok(overlap.every((r) => r.status() === 200));
    const notices = await prisma.notification.findMany({
      where: { outboxId: outbox.id },
      select: { dedupeKey: true },
    });
    assert.equal(new Set(notices.map((n) => n.dedupeKey)).size, notices.length);
    pass(
      ["W"],
      "Concurrent actual processor runs use existing row locks/SKIP LOCKED and retain one notification per dedupe key.",
    );
    currentCase = "AE";
    await prisma.$executeRawUnsafe(
      "CREATE OR REPLACE FUNCTION phase19_provider_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled provider failure' USING ERRCODE='XX000'; END $$",
    );
    await prisma.$executeRawUnsafe(
      "CREATE TRIGGER phase19_provider_failure BEFORE INSERT ON sandbox_payment_intents FOR EACH ROW EXECUTE FUNCTION phase19_provider_failure()",
    );
    const retryKey = randomUUID();
    try {
      const providerFailure = await request(guests[1], "/api/customer/orders", {
        idempotencyKey: retryKey,
      });
      assert.equal(providerFailure.status(), 503);
      const message = await providerFailure.json();
      assert.ok(!JSON.stringify(message).includes("controlled provider"));
      const durable = await prisma.order.findUniqueOrThrow({
        where: {
          customerSessionId_idempotencyKey: {
            customerSessionId: demo.sessions[1].id,
            idempotencyKey: retryKey,
          },
        },
        include: { payment: true },
      });
      assert.equal(durable.payment!.status, "PENDING");
      assert.equal(durable.fulfillmentEligible, false);
    } finally {
      await prisma.$executeRawUnsafe(
        "DROP TRIGGER IF EXISTS phase19_provider_failure ON sandbox_payment_intents",
      );
      await prisma.$executeRawUnsafe(
        "DROP FUNCTION IF EXISTS phase19_provider_failure()",
      );
    }
    const providerRecovery = await finishResponse(
      await request(guests[1], "/api/customer/orders", {
        idempotencyKey: retryKey,
      }),
      200,
    );
    assert.equal(providerRecovery.replayed, true);
    pass(
      ["AE"],
      "Actual sandbox provider-create failure returns safe retryable 503 with durable pending order/reservation; same-key recovery reuses the order rather than charging twice.",
    );
    currentCase = "Y";
    const stock = await prisma.locationInventory.findUniqueOrThrow({
      where: { id: `phase19-evidence-${evidenceRun}-stock` },
    });
    await prisma.locationInventory.update({
      where: { id: stock.id },
      data: { quantityOnHand: stock.quantityReserved.plus(300) },
    });
    const stockRace = await Promise.all([
      request(guests[2], "/api/customer/orders", {
        idempotencyKey: randomUUID(),
      }),
      request(guests[3], "/api/customer/orders", {
        idempotencyKey: randomUUID(),
      }),
    ]);
    assert.deepEqual(stockRace.map((r) => r.status()).sort(), [201, 409]);
    assert.ok(
      events().some(
        (e) => e.errorCode === "INSUFFICIENT_STOCK" && e.level === "warn",
      ),
    );
    pass(
      ["Y"],
      "Actual last-stock concurrent checkout has one reservation winner; insufficient stock is a normal conflict warning, not catastrophic failure.",
    );
    assert.ok(!rawLogs.includes(note));
    pass(
      ["AK"],
      "Long malicious demo customer note is stored only as business data and absent from standard operational logs.",
    );
    currentCase = "AJ";
    const injected = JSON.stringify(
      logRecord("warn", "bad\nspoof", {
        operation: "bad\nspoof",
        note: "FORGED_LOG_LINE\n",
        count: 1,
      }),
    );
    assert.ok(!injected.includes("FORGED_LOG_LINE"));
    assert.equal(JSON.parse(injected).event, "telemetry.invalid_event");
    pass(
      ["AJ"],
      "Actual serialized logger rejects multiline event/operation injection and drops note content.",
    );
    assert.ok(
      events().every(
        (e) =>
          e.environment === "test" &&
          e.release === "phase-19-isolated-evidence",
      ),
    );
    pass(
      ["AL", "AM"],
      "Actual server telemetry includes explicit test environment and safe release label.",
    );
    currentCase = "AD";
    pg("stop");
    stopped = true;
    try {
      assert.equal((await fetch(base + "/api/health")).status, 200);
      const notReady = await fetch(base + "/api/ready");
      assert.equal(notReady.status, 503);
      assert.deepEqual(await notReady.json(), { status: "unavailable" });
      const unavailable = await read(guests[0], "/api/customer/cart");
      assert.equal(unavailable.status(), 503);
      assert.ok(!(await unavailable.text()).includes("postgresql"));
      const recoveryPage = await guests[0].newPage();
      await recoveryPage.goto(base + "/customer/cart");
      await recoveryPage
        .getByRole("heading", { name: /temporarily unavailable/ })
        .waitFor();
      const text = await recoveryPage.locator("body").innerText();
      assert.ok(!text.includes("PrismaClient"));
      assert.ok(!text.includes("SELECT"));
      assert.ok(!text.includes("C:\\Users"));
      pass(
        ["I", "AC", "AD"],
        "Actual isolated database shutdown leaves liveness responsive, readiness/API safely unavailable and production UI in a friendly recovery boundary without stack or false success.",
      );
    } finally {
      pg("start");
      stopped = false;
    }
    assert.equal((await fetch(base + "/api/ready")).status, 200);
    currentCase = "AO";
    const phase19Files = await readdir(
      path.join(process.cwd(), "src/server/observability"),
    );
    const source = (
      await Promise.all(
        phase19Files
          .filter((n) => n.endsWith(".ts"))
          .map((n) =>
            readFile(
              path.join(process.cwd(), "src/server/observability", n),
              "utf8",
            ),
          ),
      )
    ).join("\n");
    assert.ok(!source.includes("getFirestore"));
    assert.ok(!source.includes("firebase-admin/firestore"));
    assert.ok((await prisma.jobRun.count()) > 0);
    pass(
      ["AO"],
      "Operational jobs/incidents persist in actual PostgreSQL; Phase 19 server modules contain no Firestore dependency/writes.",
    );
    currentCase = "AP";
    assert.equal(
      (
        await job(
          "/api/payments/expire",
          process.env.PAYMENT_EXPIRY_JOB_SECRET!,
        )
      ).status(),
      200,
    );
    assert.equal(
      (
        await job(
          "/api/operations/monitor",
          process.env.OBSERVABILITY_JOB_SECRET!,
        )
      ).status(),
      200,
    );
    // Actual incident-deduplication/recovery and telemetry-retention checks.
    await observationScope({ requestId: newRequestId() }, async () => {
        await recordIncident("test.incident." + evidenceRun, "TEST_DEGRADED");
        await recordIncident("test.incident." + evidenceRun, "TEST_DEGRADED");
        await recordIncident("test.incident." + evidenceRun, "TEST_DEGRADED", false);
    });
    const incident = await prisma.operationalIncident.findFirstOrThrow({
      where: { domain: "test.incident." + evidenceRun },
    });
    assert.equal(incident.occurrences, 2);
    assert.equal(incident.status, "RESOLVED");
    const oldJob = await prisma.jobRun.create({
      data: {
        id: "JOB-" + randomUUID(),
        jobType: "NOTIFICATIONS",
        environment: "test",
        status: "SUCCEEDED",
        startedAt: new Date(Date.now() - 31 * 86400000),
      },
    });
    const orderCount = await prisma.order.count();
    await pruneOperationalTelemetry();
    assert.equal(await prisma.jobRun.count({ where: { id: oldJob.id } }), 0);
    assert.equal(await prisma.order.count(), orderCount);
    let trackerSafe = false;
    await captureTrackedError(
      "test.tracker",
      { password: marker, cookie: marker },
      {
        async capture(event) {
          trackerSafe = !JSON.stringify(event).includes(marker);
          throw new Error("provider unavailable");
        },
      },
    );
    assert.ok(trackerSafe);
    pass(
      ["EXTRA_RELIABILITY"],
      "Actual incident deduplication/recovery and bounded telemetry retention passed without deleting orders; injected external tracking adapter receives only a scrubbed envelope and failure is isolated.",
    );
    const page = await platform.newPage();
    for (const [view, name] of [
      ["overview", "01-operations-dashboard.png"],
      ["database", "02-database-health.png"],
      ["webhooks", "03-webhook-monitoring.png"],
      ["outbox", "04-notification-outbox-health.png"],
      ["jobs", "05-background-job-status.png"],
      ["refunds", "06-refund-failure-monitoring.png"],
      ["errors", "07-request-correlation-error.png"],
    ]) {
      await page.goto(base + "/super-admin/operations?view=" + view);
      await page
        .getByRole("heading", { name: "Platform operations", exact: true })
        .waitFor();
      await page
        .getByRole("heading", { name: "Operational safety", exact: true })
        .waitFor();
      await capture(page, name);
    }
    const mobile = await platform.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(base + "/super-admin/operations");
    await mobile
      .getByRole("heading", { name: "Operational safety", exact: true })
      .waitFor();
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await capture(mobile, "08-mobile-operations-view.png");
    pass(
      ["AN"],
      "Real 390x844 operations page has readable loaded cards and no horizontal overflow.",
    );
    for (const secret of secrets)
      assert.ok(
        !rawLogs.includes(secret),
        "Private fixture value appeared in application logs.",
      );
    pass(
      ["AP"],
      "Eight real high-density app-only full-page PNGs captured with synthetic operational records; application logs scanned against ephemeral credentials.",
    );
    results.set("EXTERNAL_MONITORING", {
      status: "NOT EXECUTABLE",
      evidence:
        "No external error/alert provider or production credentials are configured; only local JSON logs and an injected scrubbed-adapter failure were tested. No live ingestion/delivery claimed.",
    });
  } catch (error) {
    const safeFrames =
      error instanceof Error
        ? error.stack
            ?.split("\n")
            .filter((line) => line.includes("verify-phase-19.ts"))
            .map((line) => line.match(/verify-phase-19.ts:\d+:\d+/)?.[0])
            .filter(Boolean)
        : [];
    console.error(
      "Safe diagnostic: " +
        (error instanceof Error ? error.name : "unknown") +
        " " +
        JSON.stringify(safeFrames),
    );
    results.set(currentCase, {
      status: "FAIL",
      evidence:
        error instanceof assert.AssertionError
          ? error.message.slice(0, 250)
          : "Unexpected isolated verification failure; inspect locally without printing private payloads.",
    });
    throw error;
  } finally {
    if (stopped) pg("start");
    const report = {
      executedAt: new Date().toISOString(),
      environment:
        "Isolated PostgreSQL 17, official Firebase emulators, sandbox payment, production Next and Chromium",
      provider: "Local structured logging only",
      results: Object.fromEntries(results),
    };
    await writeFile(
      path.join(process.cwd(), ".phase19-test/events.json"),
      JSON.stringify(events(), null, 2),
    );
    await mkdir(path.join(process.cwd(), "docs"), { recursive: true });
    await writeFile(
      path.join(process.cwd(), "docs/phase-19-integration-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    await browser?.close();
    server.kill();
    for (const uid of [
      ...identities.map((identity) => identity.uid),
      superIdentity.uid,
    ])
      await getAdminAuth()
        .updateUser(uid, { disabled: true })
        .catch(() => undefined);
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Phase 19 isolated verification failed; see safe per-case results. Raw credentials/errors intentionally omitted.",
  );
  process.exitCode = 1;
});
