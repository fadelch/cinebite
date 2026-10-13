import { assertNonProductionToolEnvironment } from "../src/lib/operations/environment";
assertNonProductionToolEnvironment();
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import { getAdminAuth, getAdminStorageBucket } from "../src/lib/firebase/admin";
import { prisma } from "../src/lib/db/prisma";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "../src/lib/security/opaque-token";
import { processNotificationOutbox } from "../src/server/notifications/processor";
import type {
  OrganizationSettingsDto,
  StaffDto,
  StaffListDto,
  LocationSettingsDto,
} from "../src/types/settings";

if (!process.argv.includes("--local"))
  throw new Error(
    "Use --local with the isolated database/Auth/Storage emulators. Never load .env.local into this runner.",
  );
process.env.DATABASE_URL =
  "postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase18_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9144";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9198";
process.env.STORAGE_EMULATOR_HOST = "http://127.0.0.1:9198";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-cinebite-phase18";
process.env.GCLOUD_PROJECT = "demo-cinebite-phase18";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL =
  "test@demo-cinebite-phase18.iam.gserviceaccount.com";
process.env.FIREBASE_STORAGE_BUCKET = "demo-cinebite-phase18.appspot.com";
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
const base = "http://127.0.0.1:3118",
  evidenceRun = randomUUID().slice(0, 8),
  output = path.join(process.cwd(), "linkedin", "phase-18");
const secrets = new Set<string>([
  process.env.FIREBASE_ADMIN_PRIVATE_KEY!,
  process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET!,
  process.env.NOTIFICATION_JOB_SECRET!,
]);
const passwords = new Map<string, string>(),
  extraIdentities: string[] = [];
const results = new Map<
  string,
  { status: "PASS" | "FAIL" | "NOT EXECUTABLE"; evidence: string }
>();
for (const id of [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ...Array.from({ length: 12 }, (_, i) => "A" + String.fromCharCode(65 + i)),
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
function sanitized(message: string) {
  let safe = message;
  for (const value of secrets)
    safe = safe.replaceAll(value, "[private value omitted]");
  return safe
    .replace(/oobCode[=:][^&\s"]+/gi, "oobCode=[omitted]")
    .slice(0, 900);
}
async function capture(page: Page, name: string) {
  assert.equal(
    await page
      .getByRole("heading", {
        name: "Private staff account setup",
        exact: true,
      })
      .count(),
    0,
    "Never capture setup-link UI.",
  );
  await page.evaluate(() => document.fonts.ready);
  for (const button of await page
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .all())
    await button.click();
  await page.waitForTimeout(250);
  const viewport = page.viewportSize()!,
    height = await page
      .locator("body")
      .evaluate((el) => Math.ceil(el.scrollHeight));
  if (await page.locator("dialog[open]").count())
    await page.setViewportSize({
      width: viewport.width,
      height: Math.max(viewport.height, height),
    });
  await page.screenshot({
    path: path.join(output, name),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize(viewport);
}
async function fixture() {
  const org = await prisma.organization.create({
    data: {
      id: `phase18-evidence-${evidenceRun}-org`,
      slug: `phase18-evidence-${evidenceRun}-cinemas`,
      name: "Demo CineBite Cinemas",
      status: "ACTIVE",
    },
  });
  return prisma.$transaction(
    async (tx) => {
      const other = await tx.organization.upsert({
        where: { slug: `phase18-evidence-${evidenceRun}-other-cinema` },
        create: {
          id: `phase18-evidence-${evidenceRun}-other-org`,
          slug: `phase18-evidence-${evidenceRun}-other-cinema`,
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
          where: { id: `phase18-evidence-${evidenceRun}-${suffix}` },
          create: {
            id: `phase18-evidence-${evidenceRun}-${suffix}`,
            organizationId,
            name,
            slug: `phase18-evidence-${evidenceRun}-${suffix}`,
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
          where: { id: `phase18-evidence-${evidenceRun}-hall-${suffix}` },
          create: {
            id: `phase18-evidence-${evidenceRun}-hall-${suffix}`,
            locationId: location.id,
            name: "Hall 1",
            number: 1,
            status: "ACTIVE",
          },
          update: {},
        });
        const movie = await tx.movie.upsert({
          where: { id: `phase18-evidence-${evidenceRun}-movie-${suffix}` },
          create: {
            id: `phase18-evidence-${evidenceRun}-movie-${suffix}`,
            organizationId,
            title: "Interstellar",
            slug: `phase18-evidence-${evidenceRun}-interstellar-${suffix}`,
            durationMinutes: 180,
          },
          update: {},
        });
        const screening = await tx.screening.upsert({
          where: { id: `phase18-evidence-${evidenceRun}-screening-${suffix}` },
          create: {
            id: `phase18-evidence-${evidenceRun}-screening-${suffix}`,
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
          where: { id: `phase18-evidence-${evidenceRun}-category-${suffix}` },
          create: {
            id: `phase18-evidence-${evidenceRun}-category-${suffix}`,
            organizationId,
            name: "Cinema favorites",
            slug: `phase18-evidence-${evidenceRun}-favorites-${suffix}`,
          },
          update: {},
        });
        const product = await tx.product.upsert({
          where: { id: `phase18-evidence-${evidenceRun}-product-${suffix}` },
          create: {
            id: `phase18-evidence-${evidenceRun}-product-${suffix}`,
            organizationId,
            categoryId: category.id,
            name: "Large Popcorn",
            slug: `phase18-evidence-${evidenceRun}-popcorn-${suffix}`,
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
            id: `phase18-evidence-${evidenceRun}-offer-${suffix}`,
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
            where: { id: `phase18-evidence-${evidenceRun}-kernels` },
            create: {
              id: `phase18-evidence-${evidenceRun}-kernels`,
              organizationId,
              name: "Demo snack portions",
              sku: `PH18-${evidenceRun}-KERNELS`,
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
              id: `phase18-evidence-${evidenceRun}-stock`,
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
              id: `phase18-evidence-${evidenceRun}-recipe`,
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
              id: `phase18-evidence-${evidenceRun}-cups`,
              organizationId,
              name: "Demo cups",
              sku: `PH18-${evidenceRun}-CUPS`,
              unit: "EACH",
            },
          });
          await tx.locationInventory.create({
            data: {
              id: `phase18-evidence-${evidenceRun}-cup-stock`,
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
  const email = `cinebite.phase18.${evidenceRun}.${suffix}@example.test`;
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
  staff: { uid: string; organizationId: string },
) {
  const db = await prisma.user.findUniqueOrThrow({
    where: { firebaseUid: staff.uid },
    include: {
      memberships: { where: { organizationId: staff.organizationId } },
    },
  });
  const token = await getAdminAuth().createCustomToken(staff.uid, {
    role: db.memberships[0].role,
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
      "delivery",
    ),
    staffIdentity(
      "CINEMA_ADMIN",
      demo.other.id,
      [demo.locations[2].id],
      "other-admin",
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
      "3118",
    ],
    { stdio: ["ignore", "ignore", "pipe"], env: process.env },
  );
  server.stderr.on("data", (chunk: Buffer) => {
    const value = chunk.toString();
    if (/\[(api|auth)/.test(value)) console.error(sanitized(value));
  });
  let browser: Browser | undefined;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(
      ready,
      "Isolated app failed to start. Build must finish before running verification.",
    );
    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      headless: true,
    });
    const contexts = await Promise.all(
      staff.map(() =>
        browser!.newContext({
          deviceScaleFactor: 2,
          viewport: { width: 1440, height: 1000 },
          reducedMotion: "reduce",
        }),
      ),
    );
    await Promise.all(contexts.map((context, i) => signIn(context, staff[i])));
    const [admin, manager, , , otherAdmin] = contexts;
    async function request(
      ctx: BrowserContext,
      url: string,
      data: unknown,
      method = "POST",
    ) {
      return ctx.request.fetch(base + url, {
        method,
        headers: await sessionHeaders(ctx),
        data,
      });
    }
    async function ok(
      response: Awaited<ReturnType<typeof request>>,
      expected = 200,
    ) {
      if (response.status() !== expected) {
        let code = "UNKNOWN";
        try {
          code = (await response.json()).code ?? "UNKNOWN";
        } catch {}
        throw new Error(
          "Expected " +
            expected +
            " but got " +
            response.status() +
            " (" +
            code +
            ") in " +
            currentCase,
        );
      }
      return response.json();
    }
    async function get<T>(ctx: BrowserContext, url: string): Promise<T> {
      return ok(await read(ctx, base + url));
    }
    const settings = () =>
      get<OrganizationSettingsDto>(admin, "/api/admin/settings");
    const member = (id: string) =>
      get<StaffDto>(admin, "/api/admin/staff/" + id);
    const profile = (s: OrganizationSettingsDto, extras = {}) => ({
      name: s.name,
      customerFacingName: s.customerFacingName,
      supportEmail: s.supportEmail,
      supportPhone: s.supportPhone,
      website: s.website,
      version: s.version,
      ...extras,
    });
    async function upload(
      ctx: BrowserContext,
      png: Buffer,
      version: number,
      mime = "image/png",
    ) {
      return ctx.request.post(base + "/api/admin/settings/logo", {
        headers: await sessionHeaders(ctx),
        multipart: {
          version: String(version),
          image: { name: "demo-logo.png", mimeType: mime, buffer: png },
        },
      });
    }
    async function invite(
      role:
        | "CINEMA_ADMIN"
        | "LOCATION_MANAGER"
        | "KITCHEN_STAFF"
        | "DELIVERY_STAFF",
      name: string,
      locationIds: string[],
      suffix: string,
    ) {
      const response = (await ok(
        await request(admin, "/api/admin/staff", {
          displayName: name,
          email: "phase18." + evidenceRun + "." + suffix + "@example.test",
          role,
          locationIds,
        }),
        201,
      )) as { staff: StaffDto; setupLink: string; delivery: string };
      secrets.add(response.setupLink);
      assert.equal(response.delivery, "MANUAL_PRIVATE_LINK");
      return response;
    }
    async function passwordLogin(
      ctx: BrowserContext,
      email: string,
      password: string,
    ) {
      const identity = (await fetch(
        "http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
      ).then((r) => r.json())) as { idToken?: string };
      assert.ok(identity.idToken, "Emulated password sign-in failed");
      secrets.add(identity.idToken);
      await ok(
        await request(ctx, "/api/auth/session", { idToken: identity.idToken }),
      );
    }
    async function completeSetup(invitation: {
      staff: StaffDto;
      setupLink: string;
    }) {
      const action = new URL(invitation.setupLink),
        oobCode = action.searchParams.get("oobCode");
      assert.ok(oobCode, "Setup action code missing");
      secrets.add(oobCode);
      const password = randomUUID() + "#Demo26";
      secrets.add(password);
      passwords.set(invitation.staff.id, password);
      const response = await fetch(
        "http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oobCode, newPassword: password }),
        },
      );
      assert.equal(
        response.status,
        200,
        "Firebase emulator password setup failed",
      );
      const ctx = await browser!.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      });
      await passwordLogin(ctx, invitation.staff.email, password);
      return ctx;
    }
    async function edit(
      id: string,
      role: StaffDto["role"],
      locationIds: string[],
      extra = {},
    ) {
      const s = await member(id);
      return ok(
        await request(admin, "/api/admin/staff/" + id, {
          displayName: s.displayName,
          role,
          locationIds,
          revision: s.revision,
          confirmedRoleChange: true,
          ...extra,
        }),
      ) as Promise<StaffDto>;
    }
    const page = await admin.newPage(),
      guest = await browser.newContext({
        deviceScaleFactor: 2,
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
    currentCase = "A";
    let s = await settings();
    s = await ok(
      await request(
        admin,
        "/api/admin/settings",
        profile(s, {
          customerFacingName: "Demo Nova Cinemas",
          supportEmail: "cinema-support@example.test",
          supportPhone: "+961 1 000 000",
          website: "https://example.test",
        }),
      ),
    );
    assert.equal(
      (
        await prisma.organization.findUniqueOrThrow({
          where: { id: demo.org.id },
        })
      ).customerFacingName,
      "Demo Nova Cinemas",
    );
    pass(
      ["A"],
      "Cinema Admin saves separate customer display name and public demo support contact in PostgreSQL; customer application verified in F/AH.",
    );
    await page.goto(base + "/admin/settings");
    await page
      .getByRole("heading", { name: "Organization settings", exact: true })
      .waitFor();
    await capture(page, "01-organization-settings.png");
    currentCase = "B";
    const otherBefore = await prisma.organization.findUniqueOrThrow({
      where: { id: demo.other.id },
    });
    assert.equal(
      (
        await request(
          admin,
          "/api/admin/settings",
          profile(s, { organizationId: demo.other.id, name: "Wrong Cinema" }),
        )
      ).status(),
      400,
    );
    assert.equal(
      (
        await prisma.organization.findUniqueOrThrow({
          where: { id: demo.other.id },
        })
      ).name,
      otherBefore.name,
    );
    pass(
      ["B"],
      "Organization is derived from actor; forged foreign organizationId is rejected and foreign settings remain unchanged.",
    );
    currentCase = "C";
    assert.equal(
      (await request(manager, "/api/admin/settings", profile(s))).status(),
      403,
    );
    assert.equal(
      (
        await request(manager, "/api/admin/settings/branding", {
          accent: "TEAL",
          version: s.version,
        })
      ).status(),
      403,
    );
    pass(
      ["C"],
      "Location Manager cannot mutate organization-wide profile or branding.",
    );
    const png = await sharp(
      Buffer.from(
        '<svg width="200" height="200"><rect width="200" height="200" rx="36" fill="#143f3b"/><path d="M148 62a56 56 0 1 0 0 76" stroke="#7de2cb" stroke-width="17" fill="none"/><circle cx="104" cy="99" r="9" fill="#d3fff1"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    currentCase = "D";
    s = await ok(await upload(admin, png, (await settings()).version));
    const logoRow = await prisma.organization.findUniqueOrThrow({
      where: { id: demo.org.id },
    });
    assert.match(
      logoRow.logoStoragePath!,
      new RegExp(
        "^organizations/" + demo.org.id + "/branding/[0-9a-f-]+\\.webp$",
      ),
    );
    const [storedLogo] = await getAdminStorageBucket()
      .file(logoRow.logoStoragePath!)
      .download();
    assert.equal((await sharp(storedLogo).metadata()).format, "webp");
    assert.equal((await admin.request.get(base + s.logoUrl)).status(), 200);
    pass(
      ["D"],
      "Valid PNG decoded/normalized to WebP and saved in actual local Storage emulator under a server-generated branding path; PG reference and public logo route verified.",
    );
    currentCase = "E";
    const beforeImages = (
      await getAdminStorageBucket().getFiles({
        prefix: "organizations/" + demo.org.id + "/branding/",
      })
    )[0].length;
    for (const [contents, mime] of [
      [Buffer.from("fake PNG"), "image/png"],
      [png, "application/octet-stream"],
      [Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"],
      [Buffer.from("<svg/>"), "image/svg+xml"],
    ] as const)
      assert.equal(
        (await upload(admin, contents, s.version, mime)).status(),
        400,
      );
    assert.equal(
      (
        await getAdminStorageBucket().getFiles({
          prefix: "organizations/" + demo.org.id + "/branding/",
        })
      )[0].length,
      beforeImages,
    );
    pass(
      ["E"],
      "Fake content, unsupported MIME, SVG and oversized logo rejected before publishing or replacing branding.",
    );
    s = await ok(
      await request(admin, "/api/admin/settings/branding", {
        accent: "TEAL",
        version: s.version,
      }),
    );
    await page.goto(base + "/admin/settings");
    await page
      .getByRole("heading", { name: "Customer-facing branding", exact: true })
      .waitFor();
    await page.getByAltText("Demo Nova Cinemas logo").waitFor();
    await capture(page, "02-branding-settings.png");
    currentCase = "F";
    const credential = createOpaqueToken();
    secrets.add(credential);
    await prisma.seatQrCode.create({
      data: {
        hallId: "phase18-evidence-" + evidenceRun + "-hall-beirut",
        seatId: "a7",
        tokenHash: hashOpaqueToken(credential),
      },
    });
    const scan = await guest.newPage();
    await scan.goto(base + "/s/" + credential);
    await scan.getByText("Demo Nova Cinemas", { exact: true }).waitFor();
    await scan.getByAltText("Demo Nova Cinemas logo").waitFor();
    await scan.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    await capture(scan, "03-branding-preview.png");
    await ok(
      await request(guest, "/api/customer/session", { credential }),
      201,
    );
    await scan.goto(base + "/customer/menu");
    await scan.getByText("Demo Nova Cinemas", { exact: true }).waitFor();
    pass(
      ["F"],
      "Real seat QR resolution and session-start flow show configured public name/logo on scan and customer menu with safe CineBite identity.",
    );
    currentCase = "G";
    s = await ok(
      await request(
        admin,
        "/api/admin/settings/logo",
        { version: s.version },
        "DELETE",
      ),
    );
    assert.equal(s.logoUrl, null);
    assert.equal(
      (
        await getAdminStorageBucket().file(logoRow.logoStoragePath!).exists()
      )[0],
      false,
    );
    await scan.goto(base + "/customer/menu");
    await scan.getByText("Demo Nova Cinemas", { exact: true }).waitFor();
    assert.equal(await scan.getByAltText("Demo Nova Cinemas logo").count(), 0);
    assert.equal(
      (await read(guest, base + "/api/customer/cart")).status(),
      200,
    );
    pass(
      ["G"],
      "Removing logo commits null reference then removes previous object; fallback header/menu/cart stay functional.",
    );
    s = await ok(await upload(admin, png, s.version));
    currentCase = "H";
    for (const extra of [
      { customerFacingName: "<script>window.phase18_xss=true</script>" },
      { website: "javascript:alert(1)" },
      { css: "body{background:white}" },
    ])
      assert.equal(
        (
          await request(admin, "/api/admin/settings", profile(s, extra))
        ).status(),
        400,
      );
    assert.equal(
      (
        await request(admin, "/api/admin/settings/branding", {
          accent: "white;script()",
          version: s.version,
        })
      ).status(),
      400,
    );
    await prisma.organization.update({
      where: { id: demo.org.id },
      data: { customerFacingName: "<script>window.phase18_xss=true</script>" },
    });
    await scan.goto(base + "/customer/menu");
    await scan
      .getByText("<script>window.phase18_xss=true</script>", { exact: true })
      .waitFor();
    assert.equal(await scan.evaluate(() => "phase18_xss" in window), false);
    await prisma.organization.update({
      where: { id: demo.org.id },
      data: { customerFacingName: "Demo Nova Cinemas" },
    });
    pass(
      ["H"],
      "HTML/script/CSS/unsafe URL mutation rejected; direct legacy malicious text also renders escaped in real customer browser without execution.",
    );

    const offer = await prisma.product.findUniqueOrThrow({
      where: { id: demo.sessions[0].productId },
    });
    await ok(
      await request(
        guest,
        "/api/customer/cart",
        { productSlug: offer.slug, quantity: 1 },
        "PUT",
      ),
    );
    const checkout = await ok(
      await request(guest, "/api/customer/orders", {
        idempotencyKey: randomUUID(),
      }),
      201,
    );
    const order = await prisma.order.findUniqueOrThrow({
      where: { publicOrderCode: checkout.order.publicOrderCode },
    });
    await ok(
      await request(
        guest,
        "/api/customer/payments/" + order.publicOrderCode + "/sandbox",
        { outcome: "SUCCEEDED" },
      ),
    );
    currentCase = "I";
    const invitedKitchen = await invite(
      "KITCHEN_STAFF",
      "Demo Maya Kitchen",
      [demo.locations[0].id],
      "maya",
    );
    const newKitchen = await completeSetup(invitedKitchen);
    let k = await member(invitedKitchen.staff.id);
    assert.equal(k.status, "ACTIVE");
    const kitchenDb = await prisma.user.findUniqueOrThrow({
      where: { id: k.id },
      include: { memberships: { include: { locationAccess: true } } },
    });
    assert.equal(kitchenDb.memberships.length, 1);
    assert.equal(
      kitchenDb.memberships[0].locationAccess[0].locationId,
      demo.locations[0].id,
    );
    assert.equal(
      (await getAdminAuth().getUser(kitchenDb.firebaseUid)).email,
      k.email,
    );
    await ok(
      await request(
        newKitchen,
        "/api/kitchen/orders/" + order.publicOrderCode,
        { expectedStatus: "PLACED", toStatus: "ACCEPTED" },
      ),
    );
    pass(
      ["I"],
      "Invited kitchen user: actual Auth identity/reset link/password setup/password login, PG User/membership/location grants and READY onboarding after verified sign-in; real kitchen acceptance succeeds.",
    );
    currentCase = "J";
    const invitedDelivery = await invite(
      "DELIVERY_STAFF",
      "Demo Karim Delivery",
      [demo.locations[0].id],
      "karim",
    );
    const newDelivery = await completeSetup(invitedDelivery);
    assert.equal(
      (
        await read(
          newDelivery,
          base + "/api/delivery/orders?locationId=" + demo.locations[0].id,
        )
      ).status(),
      200,
    );
    assert.equal(
      (
        await read(
          newDelivery,
          base + "/api/delivery/orders?locationId=" + demo.locations[1].id,
        )
      ).status(),
      403,
    );
    pass(
      ["J"],
      "Delivery invitation/password setup grants only selected Beirut operational queue; Dbayeh request denied.",
    );
    currentCase = "K";
    const invitedManager = await invite(
      "LOCATION_MANAGER",
      "Demo Lina Manager",
      [demo.locations[0].id],
      "lina",
    );
    const newManager = await completeSetup(invitedManager);
    assert.equal(
      (
        await read(
          newManager,
          base + "/api/admin/locations/" + demo.locations[0].id,
        )
      ).status(),
      200,
    );
    assert.equal(
      (
        await read(
          newManager,
          base + "/api/admin/locations/" + demo.locations[1].id,
        )
      ).status(),
      403,
    );
    pass(
      ["K"],
      "Invited manager's fresh password-backed session can read Beirut but not Dbayeh.",
    );
    currentCase = "L";
    const invitedAdmin = await invite(
      "CINEMA_ADMIN",
      "Demo Nadia Admin",
      [],
      "nadia",
    );
    const secondAdmin = await completeSetup(invitedAdmin);
    const newAdminDb = await prisma.organizationMembership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: invitedAdmin.staff.id,
          organizationId: demo.org.id,
        },
      },
      include: { locationAccess: true },
    });
    assert.equal(newAdminDb.allLocations, true);
    assert.equal(newAdminDb.locationAccess.length, 0);
    assert.equal(
      (
        await read(
          secondAdmin,
          base + "/api/admin/locations/" + demo.locations[1].id,
        )
      ).status(),
      200,
    );
    pass(
      ["L"],
      "Second Cinema Admin invitation explicitly grants tenant-wide access, no redundant location rows, and becomes eligible admin only after successful sign-in.",
    );
    await page.goto(base + "/admin/staff");
    await page
      .getByRole("heading", { name: "Staff management", exact: true })
      .waitFor();
    await capture(page, "04-staff-management.png");
    const invitePage = await admin.newPage();
    await invitePage.goto(base + "/admin/staff/invite");
    await invitePage
      .getByLabel("Display name", { exact: true })
      .fill("Demo Noor Kitchen");
    await invitePage
      .getByLabel("Staff email", { exact: true })
      .fill("demo.noor@example.test");
    await invitePage.getByLabel("Demo Beirut", { exact: true }).check();
    await invitePage
      .getByRole("button", { name: "Review invitation", exact: true })
      .click();
    await invitePage
      .getByRole("heading", { name: "Review before inviting", exact: true })
      .waitFor();
    await capture(invitePage, "05-invite-staff.png");
    await invitePage.close();

    currentCase = "M";
    assert.equal(
      (
        await request(admin, "/api/admin/staff", {
          displayName: "Forged Platform Admin",
          email: "phase18." + evidenceRun + ".super@example.test",
          role: "SUPER_ADMIN",
          locationIds: [],
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await request(admin, "/api/admin/staff/" + k.id, {
          displayName: k.displayName,
          role: "SUPER_ADMIN",
          locationIds: [],
          revision: k.revision,
          confirmedRoleChange: true,
        })
      ).status(),
      400,
    );
    pass(
      ["M"],
      "Manually forged SUPER_ADMIN invitation and role-change requests are rejected server-side.",
    );
    currentCase = "N";
    assert.equal(
      (
        await request(admin, "/api/admin/staff", {
          displayName: k.displayName,
          email: k.email,
          role: "KITCHEN_STAFF",
          locationIds: [demo.locations[0].id],
        })
      ).status(),
      409,
    );
    assert.equal(await prisma.user.count({ where: { email: k.email } }), 1);
    assert.equal(
      await prisma.organizationMembership.count({ where: { userId: k.id } }),
      1,
    );
    assert.equal(
      await prisma.locationAccess.count({
        where: { membershipId: kitchenDb.memberships[0].id },
      }),
      1,
    );
    assert.equal(
      (await getAdminAuth().getUserByEmail(k.email)).uid,
      kitchenDb.firebaseUid,
    );
    pass(
      ["N"],
      "Duplicate invitation creates no duplicate Firebase identity, PG User, membership or location access.",
    );
    currentCase = "O";
    const orphan = await getAdminAuth().createUser({
      email: "phase18." + evidenceRun + ".existing@example.test",
      displayName: "Demo Existing Identity",
    });
    extraIdentities.push(orphan.uid);
    assert.equal(
      (
        await request(admin, "/api/admin/staff", {
          displayName: "Demo Existing Identity",
          email: orphan.email,
          role: "KITCHEN_STAFF",
          locationIds: [demo.locations[0].id],
        })
      ).status(),
      409,
    );
    assert.equal(
      await prisma.user.count({ where: { firebaseUid: orphan.uid } }),
      0,
    );
    assert.equal(
      (await getAdminAuth().getUserByEmail(orphan.email!)).uid,
      orphan.uid,
    );
    pass(
      ["O"],
      "Existing unclaimed Firebase identity is safely rejected, not blindly duplicated or automatically linked.",
    );
    currentCase = "P";
    const foreign = await prisma.user.findUniqueOrThrow({
      where: { id: staff[4].userId },
    });
    assert.equal(
      (
        await request(admin, "/api/admin/staff", {
          displayName: "Foreign Identity",
          email: foreign.email,
          role: "KITCHEN_STAFF",
          locationIds: [demo.locations[0].id],
        })
      ).status(),
      409,
    );
    assert.equal(
      await prisma.organizationMembership.count({
        where: { userId: foreign.id },
      }),
      1,
    );
    pass(
      ["P"],
      "Identity already belonging to another organization cannot be reassigned/attached through tenant invitations.",
    );
    currentCase = "Q";
    k = await edit(k.id, "LOCATION_MANAGER", [demo.locations[0].id]);
    assert.equal(k.role, "LOCATION_MANAGER");
    assert.equal(
      (await read(newKitchen, base + "/api/kitchen/orders")).status(),
      401,
    );
    await passwordLogin(newKitchen, k.email, passwords.get(k.id)!);
    assert.equal(
      (
        await read(
          newKitchen,
          base + "/api/admin/locations/" + demo.locations[0].id,
        )
      ).status(),
      200,
    );
    pass(
      ["Q"],
      "Kitchen-to-manager role change atomically updates PG, increments security version, synchronizes claims/revokes refresh tokens; old session fails, fresh password session uses new permissions.",
    );
    currentCase = "R";
    k = await edit(
      k.id,
      "LOCATION_MANAGER",
      demo.locations.slice(0, 2).map((l) => l.id),
    );
    assert.equal(
      (
        await read(
          newKitchen,
          base + "/api/admin/locations/" + demo.locations[1].id,
        )
      ).status(),
      200,
    );
    await page.goto(base + "/admin/staff/" + k.id);
    await page
      .getByRole("heading", { name: "Profile & permissions", exact: true })
      .waitFor();
    await capture(page, "06-staff-role-location-access.png");
    k = await edit(k.id, "LOCATION_MANAGER", [demo.locations[1].id]);
    assert.equal(
      (
        await read(
          newKitchen,
          base + "/api/admin/locations/" + demo.locations[0].id,
        )
      ).status(),
      403,
    );
    assert.equal(
      (
        await read(
          newKitchen,
          base + "/api/admin/locations/" + demo.locations[1].id,
        )
      ).status(),
      200,
    );
    pass(
      ["R"],
      "Location grants added/removed take effect on the very next protected requests with the same unchanged-role session, using fresh PG grants.",
    );
    currentCase = "S";
    assert.equal(
      (
        await request(admin, "/api/admin/staff/" + k.id, {
          displayName: k.displayName,
          role: k.role,
          locationIds: [demo.locations[2].id],
          revision: k.revision,
          confirmedRoleChange: true,
        })
      ).status(),
      403,
    );
    assert.deepEqual(
      (await member(k.id)).locations.map((l) => l.id),
      [demo.locations[1].id],
    );
    pass(
      ["S"],
      "Foreign-organization location ID rejected; existing member/grants unchanged.",
    );
    currentCase = "T";
    const mg = await member(staff[1].userId);
    assert.equal(
      (
        await request(manager, "/api/admin/staff/" + mg.id, {
          displayName: mg.displayName,
          role: "CINEMA_ADMIN",
          locationIds: [],
          revision: mg.revision,
          confirmedRoleChange: true,
        })
      ).status(),
      403,
    );
    pass(
      ["T"],
      "Location Manager cannot promote self or mutate staff roles/access.",
    );
    k = await edit(k.id, "KITCHEN_STAFF", [demo.locations[0].id]);
    await passwordLogin(newKitchen, k.email, passwords.get(k.id)!);
    const historic = await prisma.orderStatusEvent.findFirstOrThrow({
        where: { orderId: order.id, actorUserId: k.id },
      }),
      openKitchen = await newKitchen.newPage();
    await openKitchen.goto(base + "/kitchen");
    await openKitchen
      .getByRole("heading", { name: "Kitchen operations", exact: true })
      .waitFor();
    await page.goto(base + "/admin/staff/" + k.id);
    await page
      .getByRole("button", { name: "Suspend staff", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Suspend " + k.displayName + "?",
        exact: true,
      })
      .waitFor();
    await capture(page, "07-staff-suspension.png");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    currentCase = "U";
    k = await ok(
      await request(admin, "/api/admin/staff/" + k.id + "/status", {
        active: false,
        revision: k.revision,
        confirmed: true,
      }),
    );
    assert.equal(k.status, "SUSPENDED");
    assert.ok(
      await prisma.orderStatusEvent.findUnique({ where: { id: historic.id } }),
    );
    assert.ok(await prisma.user.findUnique({ where: { id: k.id } }));
    pass(
      ["U"],
      "Active kitchen staff suspended without deleting User, membership or historical order actor event.",
    );
    currentCase = "V";
    assert.equal(
      (await read(newKitchen, base + "/api/kitchen/orders")).status(),
      401,
    );
    assert.equal(
      (
        await request(
          newKitchen,
          "/api/kitchen/orders/" + order.publicOrderCode,
          { expectedStatus: "ACCEPTED", toStatus: "PREPARING" },
        )
      ).status(),
      401,
    );
    assert.equal(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
      "ACCEPTED",
    );
    await openKitchen.close();
    pass(
      ["V"],
      "Already-open kitchen identity is denied on next read/write immediately, without waiting for token expiration; order state unchanged.",
    );
    currentCase = "W";
    k = await ok(
      await request(admin, "/api/admin/staff/" + k.id + "/status", {
        active: true,
        revision: k.revision,
        confirmed: true,
      }),
    );
    assert.equal(
      (await read(newKitchen, base + "/api/kitchen/orders")).status(),
      401,
    );
    await passwordLogin(newKitchen, k.email, passwords.get(k.id)!);
    assert.equal(
      (
        await read(
          newKitchen,
          base + "/api/kitchen/orders?locationId=" + demo.locations[0].id,
        )
      ).status(),
      200,
    );
    assert.equal(
      (
        await read(
          newKitchen,
          base + "/api/kitchen/orders?locationId=" + demo.locations[1].id,
        )
      ).status(),
      403,
    );
    pass(
      ["W"],
      "Reactivation restores only configured kitchen/Beirut grants; old pre-suspension cookie remains invalid, fresh password login succeeds.",
    );

    currentCase = "X";
    const lone = await get<StaffDto>(
      otherAdmin,
      "/api/admin/staff/" + staff[4].userId,
    );
    assert.equal(
      (
        await request(otherAdmin, "/api/admin/staff/" + lone.id + "/status", {
          active: false,
          revision: lone.revision,
          confirmed: true,
        })
      ).status(),
      409,
    );
    assert.equal(
      (
        await request(otherAdmin, "/api/admin/staff/" + lone.id, {
          displayName: lone.displayName,
          role: "KITCHEN_STAFF",
          locationIds: [demo.locations[2].id],
          revision: lone.revision,
          confirmedRoleChange: true,
        })
      ).status(),
      409,
    );
    assert.equal(
      await prisma.organizationMembership.count({
        where: {
          organizationId: demo.other.id,
          role: "CINEMA_ADMIN",
          user: { active: true, setupState: "READY" },
        },
      }),
      1,
    );
    pass(
      ["X"],
      "Single active Cinema Admin cannot be suspended or demoted; self-role policy also conservative.",
    );
    currentCase = "Y";
    const raceOrg = await prisma.organization.create({
      data: {
        name: "Demo Concurrent Cinema",
        slug: "phase18-race-" + evidenceRun,
      },
    });
    const racePeople = await Promise.all([
      staffIdentity("CINEMA_ADMIN", raceOrg.id, [], "race-a"),
      staffIdentity("CINEMA_ADMIN", raceOrg.id, [], "race-b"),
    ]);
    const raceCtx = await Promise.all(
      racePeople.map(() => browser!.newContext()),
    );
    await Promise.all(raceCtx.map((ctx, i) => signIn(ctx, racePeople[i])));
    const a = await get<StaffDto>(
        raceCtx[0],
        "/api/admin/staff/" + racePeople[1].userId,
      ),
      b = await get<StaffDto>(
        raceCtx[1],
        "/api/admin/staff/" + racePeople[0].userId,
      );
    const race = await Promise.all([
      request(raceCtx[0], "/api/admin/staff/" + a.id + "/status", {
        active: false,
        revision: a.revision,
        confirmed: true,
      }),
      request(raceCtx[1], "/api/admin/staff/" + b.id + "/status", {
        active: false,
        revision: b.revision,
        confirmed: true,
      }),
    ]);
    assert.equal(race.filter((r) => r.status() === 200).length, 1);
    assert.equal(
      await prisma.organizationMembership.count({
        where: {
          organizationId: raceOrg.id,
          role: "CINEMA_ADMIN",
          user: { active: true, setupState: "READY" },
        },
      }),
      1,
    );
    extraIdentities.push(...racePeople.map((p) => p.uid));
    await Promise.all(raceCtx.map((ctx) => ctx.close()));
    pass(
      ["Y"],
      "Actual concurrent mutual-admin suspension requests serialize under organization lock; exactly one succeeds and at least one active ready admin remains.",
    );
    currentCase = "Z";
    assert.equal(
      (await request(admin, "/api/admin/staff/" + k.id, {}, "DELETE")).status(),
      405,
    );
    await page.goto(base + "/admin/staff/" + k.id);
    assert.equal(
      await page.getByRole("button", { name: /delete/i }).count(),
      0,
    );
    pass(["Z"], "No staff hard-delete route or UI action; DELETE is 405.");
    currentCase = "AA";
    const roleAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: demo.org.id,
        entityId: k.id,
        action: "STAFF_ROLE_CHANGED",
      },
    });
    assert.ok((roleAudit.metadata as Record<string, string>).previousRole);
    assert.ok((roleAudit.metadata as Record<string, string>).newRole);
    pass(
      ["AA"],
      "Role audit records actor/target and safe previous/new role values.",
    );
    currentCase = "AB";
    assert.ok(
      await prisma.auditLog.count({
        where: {
          organizationId: demo.org.id,
          entityId: k.id,
          action: "STAFF_LOCATION_ACCESS_CHANGED",
        },
      }),
    );
    pass(
      ["AB"],
      "Actual add/remove location changes have scoped audit records, not duplicated identity data.",
    );
    currentCase = "AC";
    const suspendAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: demo.org.id,
        entityId: k.id,
        action: "STAFF_SUSPENDED",
      },
    });
    assert.equal(suspendAudit.actorUserId, staff[0].userId);
    assert.equal(
      (suspendAudit.metadata as Record<string, boolean>).newActive,
      false,
    );
    const auditText = JSON.stringify(
      await prisma.auditLog.findMany({
        where: { organizationId: demo.org.id },
      }),
    );
    assert.equal(
      /oobCode|setupLink|password|idToken|refreshToken/i.test(auditText),
      false,
    );
    for (const secret of secrets)
      assert.equal(auditText.includes(secret), false);
    pass(
      ["AC"],
      "Suspension records verified actor/target/status; all tenant audit metadata inspected for raw setup URLs/passwords/tokens—none present.",
    );
    currentCase = "AD";
    const ownList = await get<StaffListDto>(admin, "/api/admin/staff");
    assert.equal(
      ownList.items.some((row) => row.id === staff[4].userId),
      false,
    );
    assert.equal(
      (
        await read(admin, base + "/api/admin/staff/" + staff[4].userId)
      ).status(),
      404,
    );
    assert.equal(
      (
        await read(
          admin,
          base + "/api/admin/staff?organizationId=" + demo.other.id,
        )
      ).status(),
      400,
    );
    pass(
      ["AD"],
      "Staff list/detail strictly tenant scoped; foreign member hidden and arbitrary organization selection rejected.",
    );
    currentCase = "AE";
    const roleList = await get<StaffListDto>(
      admin,
      "/api/admin/staff?role=KITCHEN_STAFF",
    );
    assert.ok(roleList.items.every((row) => row.role === "KITCHEN_STAFF"));
    const activeList = await get<StaffListDto>(
      admin,
      "/api/admin/staff?status=ACTIVE",
    );
    assert.ok(activeList.items.every((row) => row.status === "ACTIVE"));
    const beirutList = await get<StaffListDto>(
      admin,
      "/api/admin/staff?locationId=" + demo.locations[0].id,
    );
    assert.ok(
      beirutList.items.every(
        (row) =>
          row.organizationWide ||
          row.locations.some((l) => l.id === demo.locations[0].id),
      ),
    );
    const searchList = await get<StaffListDto>(
      admin,
      "/api/admin/staff?search=Demo%20Maya",
    );
    assert.equal(searchList.items[0].id, k.id);
    pass(
      ["AE"],
      "Actual role/status/location/name-search filters return only correctly scoped matching staff.",
    );
    currentCase = "AF";
    for (let i = 0; i < 25; i++) {
      const identity = await getAdminAuth().createUser({
        email: "phase18." + evidenceRun + ".page" + i + "@example.test",
        displayName: "Demo Pagination " + String(i).padStart(2, "0"),
      });
      extraIdentities.push(identity.uid);
      await prisma.user.create({
        data: {
          firebaseUid: identity.uid,
          email: identity.email!,
          displayName: identity.displayName!,
          memberships: {
            create: {
              organizationId: demo.org.id,
              role: "KITCHEN_STAFF",
              locationAccess: { create: { locationId: demo.locations[0].id } },
            },
          },
        },
      });
    }
    const p1 = await get<StaffListDto>(admin, "/api/admin/staff?page=1"),
      p2 = await get<StaffListDto>(admin, "/api/admin/staff?page=2");
    assert.equal(p1.items.length, 20);
    assert.equal(
      new Set([...p1.items, ...p2.items].map((r) => r.id)).size,
      p1.total,
    );
    assert.equal(p1.items.length + p2.items.length, p1.total);
    pass(
      ["AF"],
      "Real sufficient Auth/PG fixtures produce complete stable two-page staff list with no duplicates/missing rows.",
    );
    currentCase = "AG";
    const beforeUtc = await prisma.screening.findUniqueOrThrow({
      where: { id: demo.sessions[0].screeningId },
    });
    let loc = await get<LocationSettingsDto>(
      admin,
      "/api/admin/settings/locations/" + demo.locations[0].id,
    );
    const locationBody = ({
      id: _id,
      canEdit: _canEdit,
      ...body
    }: LocationSettingsDto) => {
      void _id;
      void _canEdit;
      return body;
    };
    assert.equal(
      (
        await request(admin, "/api/admin/settings/locations/" + loc.id, {
          ...locationBody(loc),
          timezone: "invalid/timezone",
          confirmTimezoneChange: true,
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await request(admin, "/api/admin/settings/locations/" + loc.id, {
          ...locationBody(loc),
          timezone: "Europe/London",
          confirmTimezoneChange: false,
        })
      ).status(),
      400,
    );
    loc = await ok(
      await request(admin, "/api/admin/settings/locations/" + loc.id, {
        ...locationBody(loc),
        timezone: "Europe/London",
        confirmTimezoneChange: true,
      }),
    );
    const afterUtc = await prisma.screening.findUniqueOrThrow({
      where: { id: beforeUtc.id },
    });
    assert.equal(afterUtc.startsAt.getTime(), beforeUtc.startsAt.getTime());
    assert.equal(afterUtc.endsAt.getTime(), beforeUtc.endsAt.getTime());
    assert.equal(loc.timezone, "Europe/London");
    await scan.goto(base + "/customer/orders/" + order.publicOrderCode);
    await scan
      .getByText("Times shown in Europe/London", { exact: true })
      .waitFor();
    pass(
      ["AG"],
      "Invalid/fixed-zone policy rejected; confirmed IANA timezone edit changes current customer timeline display while historical UTC screening instants remain unchanged.",
    );
    currentCase = "AH";
    for (const url of [
      "/customer/menu",
      "/customer/cart",
      "/customer/orders/" + order.publicOrderCode,
    ]) {
      await scan.goto(base + url);
      await scan.getByText("Demo Nova Cinemas", { exact: true }).waitFor();
      await scan.getByAltText("Demo Nova Cinemas logo").waitFor();
      assert.equal(
        await scan.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    pass(
      ["AH"],
      "Native 390x844 customer menu/cart/order progress retain readable configured logo/name and no horizontal page overflow.",
    );
    currentCase = "AI";
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/admin/settings");
    await page
      .getByRole("heading", { name: "Organization settings", exact: true })
      .waitFor();
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    await capture(page, "08-mobile-settings.png");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.goto(base + "/admin/staff");
    await page
      .getByRole("heading", { name: "Staff management", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    pass(
      ["AI"],
      "390px admin settings and staff screens tested for usable responsive controls/full content/no page overflow; full loaded mobile settings captured.",
    );
    currentCase = "AJ";
    for (const file of [
      "src/server/services/staff-management.service.ts",
      "src/server/services/organization-settings.service.ts",
      "src/server/services/settings-context.ts",
    ])
      assert.equal(
        /firestore|collection\(|\.doc\(/i.test(await readFile(file, "utf8")),
        false,
      );
    assert.ok(
      await prisma.organizationMembership.count({
        where: { organizationId: demo.org.id },
      }),
    );
    pass(
      ["AJ"],
      "New staff/settings business records persisted in actual PostgreSQL only; implementation contains no Firestore writes.",
    );
    currentCase = "AK";
    const diff = spawnSync(
      "git",
      ["diff", "HEAD", "--", "src", "prisma", "scripts", "docs"],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    ).stdout;
    for (const secret of secrets)
      assert.equal(
        diff.includes(secret),
        false,
        "Ephemeral secret leaked into source",
      );
    assert.equal(
      /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\\n]+MII/.test(diff),
      false,
    );
    pass(
      ["AK"],
      "Source diff and actual audit metadata scanned against ephemeral private key/job/webhook/session/setup/password secrets; none embedded. Native visual review and staged local-secret scan follow.",
    );
    currentCase = "AL";
    const images = (await readdir(output)).filter((file) =>
      file.endsWith(".png"),
    );
    assert.equal(images.length, 8);
    for (const file of images)
      assert.equal(
        (await readFile(path.join(output, file)))
          .subarray(0, 8)
          .toString("hex"),
        "89504e470d0a1a0a",
      );
    pass(
      ["AL"],
      "Eight real full-page native browser PNGs captured with fictional reserved-domain demo contacts, no desktop/browser chrome or setup-link UI.",
    );

    currentCase = "EXTRA";
    const currentSettings = await settings();
    const responses = await Promise.all([
      request(
        admin,
        "/api/admin/settings",
        profile(currentSettings, { customerFacingName: "Demo Nova Cinemas" }),
      ),
      request(
        admin,
        "/api/admin/settings",
        profile(currentSettings, { customerFacingName: "Conflicting Save" }),
      ),
    ]);
    assert.equal(responses.filter((r) => r.status() === 200).length, 1);
    assert.equal(responses.filter((r) => r.status() === 409).length, 1);
    let restore = await settings();
    await ok(
      await request(
        admin,
        "/api/admin/settings",
        profile(restore, { customerFacingName: "Demo Nova Cinemas" }),
      ),
    );
    const currentStaff = await member(k.id),
      patch = {
        displayName: currentStaff.displayName,
        role: currentStaff.role,
        locationIds: currentStaff.locations.map((l) => l.id),
        revision: currentStaff.revision,
        confirmedRoleChange: true,
      };
    const updates = await Promise.all([
      request(admin, "/api/admin/staff/" + k.id, patch),
      request(admin, "/api/admin/staff/" + k.id, patch),
    ]);
    assert.equal(updates.filter((r) => r.status() === 200).length, 1);
    assert.equal(updates.filter((r) => r.status() === 409).length, 1);
    const beforeLogo = (
      await prisma.organization.findUniqueOrThrow({
        where: { id: demo.org.id },
      })
    ).logoStoragePath!;
    restore = await settings();
    const logos = await Promise.all([
      upload(admin, png, restore.version),
      upload(admin, png, restore.version),
    ]);
    assert.equal(logos.filter((r) => r.status() === 200).length, 1);
    assert.equal(logos.filter((r) => r.status() === 409).length, 1);
    assert.equal(
      (await getAdminStorageBucket().file(beforeLogo).exists())[0],
      false,
    );
    assert.equal(
      (
        await getAdminStorageBucket().getFiles({
          prefix: "organizations/" + demo.org.id + "/branding/",
        })
      )[0].length,
      1,
    );
    assert.equal(
      (
        await request(
          manager,
          "/api/admin/settings/locations/" + demo.locations[0].id,
          { ...locationBody(loc), version: loc.version },
        )
      ).status(),
      403,
    );
    assert.equal(
      (
        await request(
          admin,
          "/api/admin/settings/locations/" + demo.locations[2].id,
          { ...locationBody(loc), version: 0 },
        )
      ).status(),
      404,
    );
    assert.equal(
      (
        await admin.request.post(base + "/api/admin/settings", {
          headers: {
            ...(await sessionHeaders(admin)),
            Origin: "https://evil.example",
          },
          data: profile(await settings()),
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await request(admin, "/api/admin/staff/" + k.id, {
          ...patch,
          email: "attacker@example.test",
        })
      ).status(),
      400,
    );
    const freshStaff = await member(k.id);
    const reset = await ok(
      await request(admin, "/api/admin/staff/" + k.id + "/setup", {
        revision: freshStaff.revision,
        confirmed: true,
      }),
    );
    secrets.add(reset.setupLink);
    assert.ok(reset.setupLink);
    assert.equal(reset.delivery, "MANUAL_PRIVATE_LINK");
    await processNotificationOutbox({
      organizationId: demo.org.id,
      limit: 100,
    });
    const notices = await prisma.notification.findMany({
      where: {
        organizationId: demo.org.id,
        type: { in: ["STAFF_ROLE_CHANGED", "STAFF_ACCESS_CHANGED"] },
      },
    });
    assert.ok(notices.length >= 2);
    assert.ok(notices.every((n) => n.recipientUserId === k.id));
    results.set("EXTRA_CONCURRENCY_SECURITY", {
      status: "PASS",
      evidence:
        "Executed real concurrent settings CAS/one conflict, staff CAS/one conflict, logo replacement/one conflict with one live object and old/losing cleanup; manager/foreign location denial, CSRF, email-edit denial, private setup restart and target-only Phase 17 staff-change notifications.",
    });
    currentCase = "EXTRA_LIFECYCLE_RACES";
    const current = await member(k.id),
      baseEdit = {
        displayName: current.displayName,
        role: "DELIVERY_STAFF",
        locationIds: current.locations.map((l) => l.id),
        revision: current.revision,
        confirmedRoleChange: true,
      };
    const lifecycleRace = await Promise.all([
      request(admin, "/api/admin/staff/" + k.id, baseEdit),
      request(admin, "/api/admin/staff/" + k.id + "/status", {
        active: false,
        revision: current.revision,
        confirmed: true,
      }),
    ]);
    assert.equal(lifecycleRace.filter((r) => r.status() === 200).length, 1);
    assert.equal(lifecycleRace.filter((r) => r.status() === 409).length, 1);
    let raced = await member(k.id);
    if (raced.status === "SUSPENDED")
      raced = await ok(
        await request(admin, "/api/admin/staff/" + k.id + "/status", {
          active: true,
          revision: raced.revision,
          confirmed: true,
        }),
      );
    raced = await edit(k.id, "KITCHEN_STAFF", [demo.locations[0].id]);
    const ownedMembership =
      await prisma.organizationMembership.findUniqueOrThrow({
        where: {
          userId_organizationId: { userId: k.id, organizationId: demo.org.id },
        },
      });
    await assert.rejects(
      prisma.organizationMembership.create({
        data: {
          userId: k.id,
          organizationId: demo.org.id,
          role: "KITCHEN_STAFF",
        },
      }),
    );
    await assert.rejects(
      prisma.locationAccess.create({
        data: {
          membershipId: ownedMembership.id,
          organizationId: demo.org.id,
          locationId: demo.locations[0].id,
        },
      }),
    );
    await assert.rejects(
      prisma.locationAccess.create({
        data: {
          membershipId: ownedMembership.id,
          organizationId: demo.org.id,
          locationId: demo.locations[2].id,
        },
      }),
    );
    const targetIdentity = await prisma.user.findUniqueOrThrow({
      where: { id: k.id },
    });
    // Simulate an in-flight sync worker: PG change remains committed and old claims
    // cannot authenticate until a later explicit repair synchronizes the new version.
    await prisma.user.update({
      where: { id: k.id },
      data: {
        identitySyncLease: "test-inflight",
        identitySyncLeaseUntil: new Date(Date.now() + 60000),
      },
    });
    raced = await edit(k.id, "DELIVERY_STAFF", [demo.locations[0].id]);
    assert.equal(raced.identitySyncPending, true);
    const staleIdentity = (await fetch(
      "http://127.0.0.1:9144/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: k.email,
          password: passwords.get(k.id),
          returnSecureToken: true,
        }),
      },
    ).then((r) => r.json())) as { idToken: string };
    secrets.add(staleIdentity.idToken);
    assert.equal(
      (
        await request(newKitchen, "/api/auth/session", {
          idToken: staleIdentity.idToken,
        })
      ).status(),
      403,
    );
    await prisma.user.update({
      where: { id: k.id },
      data: { identitySyncLeaseUntil: new Date(Date.now() - 1) },
    });
    raced = await ok(
      await request(admin, "/api/admin/staff/" + k.id + "/sync", {}),
    );
    assert.equal(raced.identitySyncPending, false);
    await passwordLogin(newKitchen, k.email, passwords.get(k.id)!);
    assert.equal(
      (
        await read(
          newKitchen,
          base + "/api/delivery/orders?locationId=" + demo.locations[0].id,
        )
      ).status(),
      200,
    );
    raced = await ok(
      await request(admin, "/api/admin/staff/" + k.id + "/status", {
        active: false,
        revision: raced.revision,
        confirmed: true,
      }),
    );
    await getAdminAuth().updateUser(targetIdentity.firebaseUid, {
      disabled: true,
    });
    assert.equal(
      (
        await request(admin, "/api/admin/staff/" + k.id + "/status", {
          active: true,
          revision: raced.revision,
          confirmed: true,
        })
      ).status(),
      409,
    );
    assert.equal((await member(k.id)).status, "SUSPENDED");
    await getAdminAuth().updateUser(targetIdentity.firebaseUid, {
      disabled: false,
    });
    raced = await ok(
      await request(admin, "/api/admin/staff/" + k.id + "/status", {
        active: true,
        revision: raced.revision,
        confirmed: true,
      }),
    );
    await edit(k.id, "KITCHEN_STAFF", [demo.locations[0].id]);
    results.set(currentCase, {
      status: "PASS",
      evidence:
        "Actual role-vs-suspension race preserves one revision winner; membership/location uniqueness and cross-tenant FK rejection verified; held identity lease leaves stale Firebase claims denied until explicit repair; Firebase-disabled identity cannot be silently reactivated.",
    });
    results.set("REAL_INVITATION_EMAIL", {
      status: "NOT EXECUTABLE",
      evidence:
        "No approved application email provider configured; actual Firebase setup/reset/password sign-in executed on emulator, but no production invitation email sent or claimed.",
    });
  } catch (error) {
    results.set(currentCase, {
      status: "FAIL",
      evidence: sanitized(
        error instanceof Error ? error.message : "Verification failed",
      ),
    });
    throw error;
  } finally {
    await writeFile(
      path.join(process.cwd(), "docs", "phase-18-integration-results.json"),
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          environment:
            "Isolated PostgreSQL 17 / official Firebase Auth+Storage emulators / verified sandbox payment / production Next build / Chromium",
          invitationDelivery:
            "Manual private Firebase setup link; no email provider",
          results: Object.fromEntries(results),
        },
        null,
        2,
      ) + "\n",
    );
    await browser?.close();
    server.kill();
    const invitedUsers = await prisma.user.findMany({
      where: { memberships: { some: { organizationId: demo.org.id } } },
      select: { firebaseUid: true },
    });
    await Promise.all(
      [
        ...new Set([
          ...staff.map((s) => s.uid),
          ...extraIdentities,
          ...invitedUsers.map((u) => u.firebaseUid),
        ]),
      ].map((uid) =>
        getAdminAuth()
          .updateUser(uid, { disabled: true })
          .catch(() => undefined),
      ),
    );
    await prisma.user.updateMany({
      where: { memberships: { some: { organizationId: demo.org.id } } },
      data: { active: false },
    });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    sanitized(
      error instanceof Error
        ? (error.stack ?? error.message)
        : "Verification failed",
    ),
  );
  process.exitCode = 1;
});
