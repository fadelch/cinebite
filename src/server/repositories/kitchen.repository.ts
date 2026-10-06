import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { isPrismaError, isRetryableTransactionError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { isValidKitchenTransition, KITCHEN_STATUSES } from "@/lib/orders/status";
import { localDateBounds } from "@/lib/screenings/timezone";
import { orderDto, orderInclude } from "@/server/repositories/order.repository";
import { assertKitchenLocationAccess, kitchenPermittedLocationIds, requireKitchenActor, type KitchenActor } from "@/server/services/kitchen-access";
import { ServiceError } from "@/server/services/service-error";
import type { KitchenOrder, KitchenQueue, KitchenStatus, OrderStatus } from "@/types/order";
import type { OrderQueueQuery } from "@/validation/kitchen";
import { fulfillmentWhere, isOrderEligibleForFulfillment } from "@/lib/payments/policy";

export const kitchenOrderInclude = {
  ...orderInclude,
  statusEvents: { include: { actor: { select: { displayName: true } } }, orderBy: { createdAt: "asc" as const } },
  screening: { select: { status: true, endsAt: true } },
} as const;

type KitchenRow = Prisma.OrderGetPayload<{ include: typeof kitchenOrderInclude }>;

export function kitchenOrderDto(row: KitchenRow): KitchenOrder {
  return {
    ...orderDto(row),
    history: row.statusEvents.map((event) => ({
      fromStatus: event.fromStatus, toStatus: event.toStatus, actorType: event.actorType,
      createdAt: event.createdAt.toISOString(), ...(event.actor ? { actorDisplayName: event.actor.displayName } : {}),
    })),
    screeningWarning: row.screening.status === "CANCELLED" ? "Screening cancelled — order still requires preparation."
      : row.screening.endsAt <= new Date() ? "Screening ended — order remains active." : null,
  };
}

export async function listKitchenLocationsRecord(actor: KitchenActor) {
  const permitted = kitchenPermittedLocationIds(actor);
  return prisma.location.findMany({
    where: { organizationId: actor.organizationId, ...(permitted === null ? {} : { id: { in: [...permitted] } }) },
    select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" },
  });
}

export async function buildOrderQueueWhere(actor: KitchenActor, query: OrderQueueQuery): Promise<Prisma.OrderWhereInput> {
  const locations = await listKitchenLocationsRecord(actor);
  if (query.locationId) {
    assertKitchenLocationAccess(actor, query.locationId);
    if (!locations.some((location) => location.id === query.locationId)) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
  }
  const selected = query.locationId ? locations.filter((location) => location.id === query.locationId) : locations;
  const locationClauses = selected.map((location) => ({
    locationId: location.id,
    ...(query.date ? { createdAt: (() => {
      try { const bounds = localDateBounds(query.date, location.timezone); return { gte: bounds.start, lt: bounds.end }; }
      catch { throw new ServiceError("SCREENING_TIME_INVALID", 400, "Choose a valid calendar date."); }
    })() } : {}),
  }));
  return {
    organizationId: actor.organizationId, OR: locationClauses,
    ...(query.status ? { status: query.status } : {}),
    ...(query.hall ? { hallNameSnapshot: { contains: query.hall, mode: "insensitive" } } : {}),
    ...(query.code ? { publicOrderCode: { contains: query.code, mode: "insensitive" } } : {}),
  };
}

export async function getKitchenQueueRecord(actor: KitchenActor, query: OrderQueueQuery): Promise<KitchenQueue> {
  const where = { ...await buildOrderQueueWhere(actor, query), AND: [fulfillmentWhere], status: { in: KITCHEN_STATUSES.filter((status) => !query.status || status === query.status) } };
  const pageSize = 25;
  // Each state has its own bounded oldest-first page; one busy state cannot hide another.
  const result = await prisma.$transaction(async (tx) => {
    const counts = await tx.order.groupBy({ by: ["status"], where, _count: { _all: true } });
    const states = query.status ? KITCHEN_STATUSES.filter((status) => status === query.status) : KITCHEN_STATUSES;
    const orders = (await Promise.all(states.map((status) => tx.order.findMany({
      where: { ...where, status }, include: kitchenOrderInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (query.page - 1) * pageSize, take: pageSize,
    })))).flat();
    return { counts, orders };
  }, { isolationLevel: "RepeatableRead" });
  return {
    orders: result.orders.map(kitchenOrderDto),
    counts: Object.fromEntries(KITCHEN_STATUSES.map((status) => [status, result.counts.find((group) => group.status === status)?._count._all ?? 0])) as Record<KitchenStatus, number>,
    page: query.page, pageSize, fetchedAt: new Date().toISOString(),
  };
}

export async function getKitchenOrderRecord(actor: KitchenActor, publicCode: string) {
  const permitted = kitchenPermittedLocationIds(actor);
  const row = await prisma.order.findFirst({
    where: { organizationId: actor.organizationId, publicOrderCode: publicCode, AND: [fulfillmentWhere], ...(permitted === null ? {} : { locationId: { in: [...permitted] } }) },
    include: kitchenOrderInclude,
  });
  if (!row) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found in your permitted locations.");
  return kitchenOrderDto(row);
}

export async function listAdminOrderHistoryRecord(actor: KitchenActor, query: OrderQueueQuery) {
  const where = await buildOrderQueueWhere(actor, query);
  const [rows, total] = await prisma.$transaction([
    prisma.order.findMany({ where, include: orderInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * 30, take: 30 }),
    prisma.order.count({ where }),
  ]);
  return { orders: rows.map((row) => ({ id: row.id, ...orderDto(row) })), total, page: query.page, pageSize: 30 };
}

const transitionAudit = { ACCEPTED: "ORDER_ACCEPTED", PREPARING: "ORDER_PREPARING_STARTED", READY: "ORDER_MARKED_READY" } as const;

export async function transitionKitchenOrderRecord(input: {
  actor: KitchenActor; publicCode: string; expectedStatus: OrderStatus; toStatus: OrderStatus;
}) {
  if (!isValidKitchenTransition(input.expectedStatus, input.toStatus)) {
    throw new ServiceError("INVALID_ORDER_TRANSITION", 409, "Only the next kitchen step is allowed.");
  }
  const target = input.toStatus as keyof typeof transitionAudit;
  try {
    return await prisma.$transaction(async (tx) => {
      // Re-read staff grants in this transaction; cookies/client claims are never RBAC authority.
      const user = await tx.user.findUnique({ where: { firebaseUid: input.actor.uid }, include: {
        memberships: { where: { organizationId: input.actor.organizationId }, include: { locationAccess: true, organization: { select: { status: true } } } },
      } });
      const membership = user?.memberships[0];
      if (!user?.active || !membership || membership.organization.status !== "ACTIVE") throw new ServiceError("AUTHORIZATION_DENIED", 403, "Kitchen access is no longer available.");
      const actor = requireKitchenActor({ ...input.actor, active: user.active, role: membership.role,
        allLocations: membership.allLocations, locationIds: membership.locationAccess.map((grant) => grant.locationId) });
      const permitted = kitchenPermittedLocationIds(actor);
      const order = await tx.order.findFirst({ where: {
        publicOrderCode: input.publicCode, organizationId: actor.organizationId,
        ...(permitted === null ? {} : { locationId: { in: [...permitted] } }),
      } });
      if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found in your permitted locations.");
      if (!isOrderEligibleForFulfillment(order)) throw new ServiceError("PAYMENT_NOT_ELIGIBLE", 409, "This order is not cleared for fulfillment.");
      const update = await tx.order.updateMany({
        where: { id: order.id, organizationId: actor.organizationId, locationId: order.locationId, status: input.expectedStatus },
        data: { status: target },
      });
      if (update.count !== 1) throw new ServiceError("STALE_ORDER_STATE", 409, "This order was already updated. The queue has refreshed.");
      const event = await tx.orderStatusEvent.create({ data: {
        id: randomUUID(), orderId: order.id, fromStatus: input.expectedStatus, toStatus: target,
        actorType: "STAFF", actorUserId: user.id,
      } });
      if (target === "READY") await tx.order.update({ where: { id: order.id }, data: { readyAt: event.createdAt } });
      await tx.auditLog.create({ data: {
        actorUserId: user.id, action: transitionAudit[target], entityType: "ORDER", entityId: order.id,
        organizationId: order.organizationId, locationId: order.locationId, hallId: order.hallId,
        metadata: { publicOrderCode: order.publicOrderCode, fromStatus: input.expectedStatus, toStatus: target },
      } });
      return kitchenOrderDto(await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: kitchenOrderInclude }));
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isRetryableTransactionError(error) || isPrismaError(error, "P2002")) throw new ServiceError("STALE_ORDER_STATE", 409, "Another worker updated this order. The queue has refreshed.");
    throw error;
  }
}
