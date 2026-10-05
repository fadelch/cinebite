import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isPrismaError } from "@/lib/db/errors";
import { localDateBounds } from "@/lib/screenings/timezone";
import { kitchenOrderDto, kitchenOrderInclude } from "@/server/repositories/kitchen.repository";
import { assertDeliveryLocationAccess, deliveryPermittedLocationIds, requireDeliveryActor, requireDeliveryWorker, type DeliveryActor } from "@/server/services/delivery-access";
import { ServiceError } from "@/server/services/service-error";
import type { DeliveryOrder, DeliveryQueue } from "@/types/order";
import type { DeliveryQueueQuery, DeliveryTransition } from "@/validation/delivery";
import { fulfillmentWhere, isOrderEligibleForFulfillment } from "@/lib/payments/policy";

export const deliveryOrderInclude = { ...kitchenOrderInclude, deliveryAssignedUser: { select: { displayName: true } } } as const;
type DeliveryRow = Prisma.OrderGetPayload<{ include: typeof deliveryOrderInclude }>;
export function deliveryOrderDto(row: DeliveryRow, actor: DeliveryActor): DeliveryOrder {
  const mine = row.deliveryAssignedUserId === actor.userId;
  return { ...kitchenOrderDto(row),
    screeningWarning: row.screening.status === "CANCELLED" ? "Screening cancelled — confirm the destination; this order still requires delivery." : row.screening.endsAt <= new Date() ? "Screening ended — this order still requires delivery." : null,
    readyAt: row.readyAt?.toISOString() ?? row.statusEvents.find((e) => e.toStatus === "READY")?.createdAt.toISOString() ?? null,
    deliveryClaimedAt: row.deliveryClaimedAt?.toISOString() ?? null, deliveredAt: row.deliveredAt?.toISOString() ?? null,
    assignedToMe: mine, assignedStaffName: actor.role === "DELIVERY_STAFF" ? null : row.deliveryAssignedUser?.displayName ?? null,
    canClaim: actor.role === "DELIVERY_STAFF" && row.status === "READY" && row.deliveryAssignedUserId === null,
    canDeliver: actor.role === "DELIVERY_STAFF" && row.status === "OUT_FOR_DELIVERY" && mine };
}
export async function listDeliveryLocationsRecord(actor: DeliveryActor) {
  const ids = deliveryPermittedLocationIds(actor);
  return prisma.location.findMany({ where: { organizationId: actor.organizationId, ...(ids === null ? {} : { id: { in: [...ids] } }) }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } });
}
export async function listDeliveryStaffRecord(actor: DeliveryActor) {
  if (actor.role === "DELIVERY_STAFF") return [];
  const ids = deliveryPermittedLocationIds(actor);
  return prisma.user.findMany({ where: { active: true, memberships: { some: { organizationId: actor.organizationId, role: "DELIVERY_STAFF",
    ...(ids === null ? {} : { OR: [{ allLocations: true }, { locationAccess: { some: { locationId: { in: [...ids] } } } }] }) } } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" }, take: 100 });
}
export async function buildDeliveryQueueWhere(actor: DeliveryActor, query: DeliveryQueueQuery): Promise<Prisma.OrderWhereInput> {
  const locations = await listDeliveryLocationsRecord(actor);
  if (query.locationId) {
    assertDeliveryLocationAccess(actor, query.locationId);
    if (!locations.some((l) => l.id === query.locationId)) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
  }
  if (actor.role === "DELIVERY_STAFF" && query.staffId) throw new ServiceError("AUTHORIZATION_DENIED", 403, "Staff filters are reserved for supervisors.");
  return { organizationId: actor.organizationId, AND: [fulfillmentWhere], OR: locations.filter((l) => !query.locationId || l.id === query.locationId).map((l) => {
    let bounds;
    try { bounds = query.date ? localDateBounds(query.date, l.timezone) : null; } catch { throw new ServiceError("SCREENING_TIME_INVALID", 400, "Choose a valid calendar date."); }
    return { locationId: l.id, ...(bounds ? { deliveredAt: { gte: bounds.start, lt: bounds.end } } : {}) };
  }), ...(query.hall ? { hallNameSnapshot: { contains: query.hall, mode: "insensitive" } } : {}), ...(query.code ? { publicOrderCode: { contains: query.code, mode: "insensitive" } } : {}) };
}
export async function getDeliveryQueueRecord(actor: DeliveryActor, query: DeliveryQueueQuery): Promise<DeliveryQueue> {
  const liveWhere = await buildDeliveryQueueWhere(actor, { ...query, date: undefined });
  const historyWhere = query.date ? await buildDeliveryQueueWhere(actor, query) : liveWhere;
  const assigned = actor.role === "DELIVERY_STAFF" ? actor.userId : query.staffId;
  const where = {
    ready: { ...liveWhere, status: "READY", deliveryAssignedUserId: null } as Prisma.OrderWhereInput,
    active: { ...liveWhere, status: "OUT_FOR_DELIVERY", ...(assigned ? { deliveryAssignedUserId: assigned } : {}) } as Prisma.OrderWhereInput,
    delivered: { ...historyWhere, status: "DELIVERED", ...(assigned ? { deliveryAssignedUserId: assigned } : {}) } as Prisma.OrderWhereInput };
  const pageSize = 20;
  return prisma.$transaction(async (tx) => {
    const [ready, active, delivered, readyCount, activeCount, deliveredCount] = await Promise.all([
      tx.order.findMany({ where: where.ready, include: deliveryOrderInclude, orderBy: [{ readyAt: "asc" }, { id: "asc" }], take: pageSize, skip: (query.page - 1) * pageSize }),
      tx.order.findMany({ where: where.active, include: deliveryOrderInclude, orderBy: [{ deliveryClaimedAt: "asc" }, { id: "asc" }], take: pageSize, skip: (query.page - 1) * pageSize }),
      tx.order.findMany({ where: where.delivered, include: deliveryOrderInclude, orderBy: [{ deliveredAt: "desc" }, { id: "desc" }], take: pageSize, skip: (query.page - 1) * pageSize }),
      tx.order.count({ where: where.ready }), tx.order.count({ where: where.active }), tx.order.count({ where: where.delivered }) ]);
    return { ready: ready.map((r) => deliveryOrderDto(r, actor)), active: active.map((r) => deliveryOrderDto(r, actor)), delivered: delivered.map((r) => deliveryOrderDto(r, actor)),
      counts: { ready: readyCount, active: activeCount, delivered: deliveredCount }, page: query.page, pageSize, fetchedAt: new Date().toISOString() };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getDeliveryOrderRecord(actor: DeliveryActor, publicCode: string) {
  const ids = deliveryPermittedLocationIds(actor);
  const row = await prisma.order.findFirst({ where: { organizationId: actor.organizationId, publicOrderCode: publicCode, AND: [fulfillmentWhere],
    ...(ids === null ? {} : { locationId: { in: [...ids] } }), ...(actor.role === "DELIVERY_STAFF" ? { OR: [ { status: "READY", deliveryAssignedUserId: null },
      { status: { in: ["OUT_FOR_DELIVERY", "DELIVERED"] }, deliveryAssignedUserId: actor.userId } ] } : { status: { in: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"] } }) }, include: deliveryOrderInclude });
  if (!row) throw new ServiceError("ORDER_NOT_FOUND", 404, "Delivery not found in your permitted queue.");
  return deliveryOrderDto(row, actor);
}
export async function transitionDeliveryOrderRecord(input: { actor: DeliveryActor; publicCode: string } & DeliveryTransition) {
  const claim = input.expectedStatus === "READY" && input.toStatus === "OUT_FOR_DELIVERY";
  const deliver = input.expectedStatus === "OUT_FOR_DELIVERY" && input.toStatus === "DELIVERED";
  if (!claim && !deliver) throw new ServiceError("INVALID_DELIVERY_TRANSITION", 409, "Claim a ready order before marking it delivered.");
  requireDeliveryWorker(input.actor);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { firebaseUid: input.actor.uid }, include: { memberships: { where: { organizationId: input.actor.organizationId }, include: { locationAccess: true, organization: { select: { status: true } } } } } });
      const membership = user?.memberships[0];
      if (!user?.active || !membership || membership.organization.status !== "ACTIVE") throw new ServiceError("AUTHORIZATION_DENIED", 403, "Delivery access is no longer available.");
      const actor = requireDeliveryActor({ ...input.actor, role: membership.role, active: user.active, allLocations: membership.allLocations, locationIds: membership.locationAccess.map((g) => g.locationId) }, user.id);
      requireDeliveryWorker(actor);
      const ids = deliveryPermittedLocationIds(actor);
      const order = await tx.order.findFirst({ where: { publicOrderCode: input.publicCode, organizationId: actor.organizationId, ...(ids === null ? {} : { locationId: { in: [...ids] } }) } });
      if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Delivery not found in your permitted locations.");
      if (!isOrderEligibleForFulfillment(order)) throw new ServiceError("PAYMENT_NOT_ELIGIBLE", 409, "This order is not cleared for fulfillment.");
      if (order.status === "DELIVERED") throw new ServiceError("ORDER_ALREADY_DELIVERED", 409, "This order is already delivered.");
      if (claim && (order.deliveryAssignedUserId !== null || order.status === "OUT_FOR_DELIVERY")) throw new ServiceError("ORDER_ALREADY_CLAIMED", 409, "Another worker already claimed this order. The queue has refreshed.");
      if (claim && order.status !== "READY") throw new ServiceError("ORDER_NOT_READY", 409, "This order is not ready for delivery.");
      if (deliver && order.status !== "OUT_FOR_DELIVERY") throw new ServiceError("INVALID_DELIVERY_TRANSITION", 409, "Claim this order before marking it delivered.");
      if (deliver && order.deliveryAssignedUserId !== user.id) throw new ServiceError("NOT_ASSIGNED_TO_YOU", 403, "Only the assigned delivery worker can complete this order.");
      // Database default provides one trusted timestamp. Losing CAS rolls this event back.
      const event = await tx.orderStatusEvent.create({ data: { id: randomUUID(), orderId: order.id, fromStatus: input.expectedStatus, toStatus: input.toStatus, actorType: "STAFF", actorUserId: user.id } });
      const result = await tx.order.updateMany({ where: { id: order.id, organizationId: actor.organizationId, locationId: order.locationId, status: input.expectedStatus, deliveryAssignedUserId: claim ? null : user.id },
        data: claim ? { status: "OUT_FOR_DELIVERY", deliveryAssignedUserId: user.id, deliveryClaimedAt: event.createdAt } : { status: "DELIVERED", deliveredAt: event.createdAt } });
      if (result.count !== 1) throw new ServiceError("ORDER_ALREADY_CLAIMED", 409, "Another worker updated this order. Refresh and try again.");
      await tx.auditLog.create({ data: { actorUserId: user.id, action: claim ? "ORDER_CLAIMED_FOR_DELIVERY" : "ORDER_DELIVERED", entityType: "ORDER", entityId: order.id,
        organizationId: order.organizationId, locationId: order.locationId, hallId: order.hallId, metadata: { publicOrderCode: order.publicOrderCode, fromStatus: input.expectedStatus, toStatus: input.toStatus } } });
      return deliveryOrderDto(await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: deliveryOrderInclude }), actor);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isPrismaError(error, "P2034") || isPrismaError(error, "P2002")) throw new ServiceError("ORDER_ALREADY_CLAIMED", 409, "Another worker updated this order. The queue has refreshed.");
    throw error;
  }
}
