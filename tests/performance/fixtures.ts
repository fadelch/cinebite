import { base, evidenceRun, secrets } from "./environment";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { BrowserContext } from "playwright-core";
import { prisma } from "@/lib/db/prisma";
import { getAdminAuth } from "@/lib/firebase/admin";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/security/opaque-token";
export async function baseFixture() {
  const org = await prisma.organization.create({
    data: {
      id: `phase21-evidence-${evidenceRun}-org`,
      slug: `phase21-evidence-${evidenceRun}-cinemas`,
      name: "Demo CineBite Cinemas",
      status: "ACTIVE",
    },
  });
  return prisma.$transaction(
    async (tx) => {
      const other = await tx.organization.upsert({
        where: { slug: `phase21-evidence-${evidenceRun}-other-cinema` },
        create: {
          id: `phase21-evidence-${evidenceRun}-other-org`,
          slug: `phase21-evidence-${evidenceRun}-other-cinema`,
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
          where: { id: `phase21-evidence-${evidenceRun}-${suffix}` },
          create: {
            id: `phase21-evidence-${evidenceRun}-${suffix}`,
            organizationId,
            name,
            slug: `phase21-evidence-${evidenceRun}-${suffix}`,
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
          where: { id: `phase21-evidence-${evidenceRun}-hall-${suffix}` },
          create: {
            id: `phase21-evidence-${evidenceRun}-hall-${suffix}`,
            locationId: location.id,
            name: "Hall 1",
            number: 1,
            status: "ACTIVE",
          },
          update: {},
        });
        const movie = await tx.movie.upsert({
          where: { id: `phase21-evidence-${evidenceRun}-movie-${suffix}` },
          create: {
            id: `phase21-evidence-${evidenceRun}-movie-${suffix}`,
            organizationId,
            title: "Interstellar",
            slug: `phase21-evidence-${evidenceRun}-interstellar-${suffix}`,
            durationMinutes: 180,
          },
          update: {},
        });
        const screening = await tx.screening.upsert({
          where: { id: `phase21-evidence-${evidenceRun}-screening-${suffix}` },
          create: {
            id: `phase21-evidence-${evidenceRun}-screening-${suffix}`,
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
          where: { id: `phase21-evidence-${evidenceRun}-category-${suffix}` },
          create: {
            id: `phase21-evidence-${evidenceRun}-category-${suffix}`,
            organizationId,
            name: "Cinema favorites",
            slug: `phase21-evidence-${evidenceRun}-favorites-${suffix}`,
          },
          update: {},
        });
        const product = await tx.product.upsert({
          where: { id: `phase21-evidence-${evidenceRun}-product-${suffix}` },
          create: {
            id: `phase21-evidence-${evidenceRun}-product-${suffix}`,
            organizationId,
            categoryId: category.id,
            name: "Large Popcorn",
            slug: `phase21-evidence-${evidenceRun}-popcorn-${suffix}`,
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
            id: `phase21-evidence-${evidenceRun}-offer-${suffix}`,
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
            where: { id: `phase21-evidence-${evidenceRun}-kernels` },
            create: {
              id: `phase21-evidence-${evidenceRun}-kernels`,
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
              id: `phase21-evidence-${evidenceRun}-stock`,
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
              id: `phase21-evidence-${evidenceRun}-recipe`,
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
              id: `phase21-evidence-${evidenceRun}-cups`,
              organizationId,
              name: "Demo cups",
              sku: `PH19-${evidenceRun}-CUPS`,
              unit: "EACH",
            },
          });
          await tx.locationInventory.create({
            data: {
              id: `phase21-evidence-${evidenceRun}-cup-stock`,
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

export async function staffIdentity(
  role:
    "KITCHEN_STAFF" | "LOCATION_MANAGER" | "DELIVERY_STAFF" | "CINEMA_ADMIN",
  organizationId: string,
  locationIds: string[],
  suffix: string,
) {
  const email = `cinebite.phase21.${evidenceRun}.${suffix}@example.test`;
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

export async function signIn(
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
  for (const cookie of await context.cookies()) secrets.add(cookie.value);
}
