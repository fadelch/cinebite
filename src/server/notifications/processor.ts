import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type NotificationOutbox } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  categoryFor,
  customerKinds,
  optionalEnabled,
  recipientsFor,
  retryPolicy,
  severityFor,
} from "@/lib/notifications/policy";
import { isOrderEligibleForFulfillment } from "@/lib/payments/policy";
import {
  inAppNotificationProvider,
  type NotificationChannelProvider,
} from "./provider";

export async function resolveRecipients(
  tx: Prisma.TransactionClient,
  event: NotificationOutbox,
) {
  if (
    !(await tx.location.findFirst({
      where: {
        id: event.locationId,
        organizationId: event.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    }))
  )
    return [];
  return tx.organizationMembership.findMany({
    where: {
      organizationId: event.organizationId,
      organization: { status: "ACTIVE" },
      user: { active: true },
      role: {
        in: recipientsFor(event.type) as Array<
          | "CINEMA_ADMIN"
          | "LOCATION_MANAGER"
          | "KITCHEN_STAFF"
          | "DELIVERY_STAFF"
        >,
      },
      OR: [
        { role: "CINEMA_ADMIN" },
        { allLocations: true },
        {
          locationAccess: {
            some: {
              locationId: event.locationId,
              organizationId: event.organizationId,
            },
          },
        },
      ],
    },
    select: {
      userId: true,
      user: { select: { notificationPreferences: true } },
    },
  });
}
export function eventText(
  event: Pick<NotificationOutbox, "type" | "payload">,
  customer = false,
) {
  const p = event.payload as Record<string, string>;
  const titles: Record<NotificationOutbox["type"], string> = {
    NEW_ORDER: "New kitchen order",
    ORDER_ACCEPTED: "Order accepted",
    ORDER_PREPARING: "Order preparing",
    ORDER_READY: "Order ready",
    ORDER_OUT_FOR_DELIVERY: "On the way",
    ORDER_DELIVERED: "Order delivered",
    ORDER_CANCELED: "Order canceled",
    PAYMENT_FAILED: "Payment requires attention",
    REFUND_FAILED: "Refund requires attention",
    REFUND_SUCCEEDED: "Refund completed",
    LOW_STOCK: "Low stock",
    OUT_OF_STOCK: "Out of stock",
    STOCK_RECOVERED: "Stock recovered",
    ORDER_ISSUE_REPORTED: "Order issue reported",
    SCREENING_CANCELED: "Screening canceled",
  };
  const messages: Record<NotificationOutbox["type"], string> = {
    NEW_ORDER: `${p.code ?? "Order"} · ${p.hall ?? "Hall"} · Seat ${p.seat ?? ""}. An eligible order entered the kitchen.`,
    ORDER_ACCEPTED: "Your order was accepted by the kitchen.",
    ORDER_PREPARING: "Your order is being prepared.",
    ORDER_READY: customer
      ? "Your order is ready."
      : `${p.code ?? "Order"} · ${p.hall ?? "Hall"} · Seat ${p.seat ?? ""}. Ready for delivery.`,
    ORDER_OUT_FOR_DELIVERY: "Your order is on the way to your seat.",
    ORDER_DELIVERED: "Your order was delivered.",
    ORDER_CANCELED:
      "Your order was canceled. Check the order's refund status; cancellation does not confirm a completed refund.",
    PAYMENT_FAILED:
      "A payment attempt failed. Check payment status before trying again.",
    REFUND_FAILED: customer
      ? "Your refund requires attention. It is not confirmed completed."
      : `${p.code ?? "Order"}: a refund failed and requires review.`,
    REFUND_SUCCEEDED: `Your refund of ${p.amount ?? ""} ${p.currency ?? ""} has been completed.`,
    LOW_STOCK: `${p.item ?? "Inventory item"}: available stock crossed the low-stock threshold.`,
    OUT_OF_STOCK: `${p.item ?? "Inventory item"}: no available stock remains.`,
    STOCK_RECOVERED: `${p.item ?? "Inventory item"}: available stock recovered above the low-stock threshold.`,
    ORDER_ISSUE_REPORTED: `${p.code ?? "Order"}: ${p.issueType ?? "operational issue"}. Supervisor review required.`,
    SCREENING_CANCELED:
      "A screening with existing orders was canceled. Review affected orders and their current fulfillment/refund status.",
  };
  return {
    title: titles[event.type],
    message: messages[event.type].slice(0, 600),
  };
}
async function deliverEvent(
  tx: Prisma.TransactionClient,
  event: NotificationOutbox,
  provider: NotificationChannelProvider,
  now: Date,
) {
  const drafts: Prisma.NotificationCreateManyInput[] = [];
  const base = {
    outboxId: event.id,
    organizationId: event.organizationId,
    locationId: event.locationId,
    type: event.type,
    severity: severityFor(event.type),
    entityType: event.entityType,
    entityId: event.entityId,
    createdAt: event.createdAt,
    expiresAt: new Date(event.createdAt.getTime() + 30 * 86400000),
  };
  if (base.expiresAt <= now) return;
  const order =
    event.entityType === "ORDER"
      ? await tx.order.findFirst({
          where: {
            id: event.entityId,
            organizationId: event.organizationId,
            locationId: event.locationId,
          },
        })
      : null;
  if (
    event.type === "NEW_ORDER" &&
    (!order || !isOrderEligibleForFulfillment(order))
  )
    return;
  const recipients = await resolveRecipients(tx, event);
  for (const r of recipients) {
    const enabled = r.user.notificationPreferences.find(
      (p) => p.category === categoryFor(event.type),
    )?.inAppEnabled;
    if (optionalEnabled(event.type, enabled))
      drafts.push({
        ...base,
        id: randomUUID(),
        dedupeKey: `${event.id}:staff:${r.userId}`,
        recipientUserId: r.userId,
        ...eventText(event),
      });
  }
  if (order && customerKinds.has(event.type)) {
    const text = eventText(event, true);
    if (event.type === "ORDER_CANCELED") {
      const pendingRefund = await tx.refund.findFirst({
        where: { orderId: order.id, status: { in: ["PENDING", "PROCESSING"] } },
        select: { id: true },
      });
      if (pendingRefund)
        text.message =
          "Your order was canceled. Your refund is being processed; completion is not yet confirmed.";
    }
    drafts.push({
      ...base,
      id: randomUUID(),
      dedupeKey: `${event.id}:customer:${order.customerSessionId}`,
      customerSessionId: order.customerSessionId,
      ...text,
    });
  }
  if (event.type === "SCREENING_CANCELED") {
    const orders = await tx.order.findMany({
      where: {
        screeningId: event.entityId,
        organizationId: event.organizationId,
        locationId: event.locationId,
      },
      select: { id: true, customerSessionId: true },
    });
    for (const affected of orders)
      drafts.push({
        ...base,
        id: randomUUID(),
        entityType: "ORDER",
        entityId: affected.id,
        dedupeKey: `${event.id}:customer:${affected.customerSessionId}:${affected.id}`,
        customerSessionId: affected.customerSessionId,
        ...eventText(event, true),
      });
  }
  await provider.send(tx, drafts);
}

/** Each event is locked/processed atomically. SKIP LOCKED permits concurrent jobs
 * without leases or unbounded workers. A savepoint preserves retry state after
 * delivery errors without rolling back the already-committed business event. */
export async function processNotificationOutbox({
  limit = 25,
  provider = inAppNotificationProvider,
  now = new Date(),
  organizationId,
}: {
  limit?: number;
  provider?: NotificationChannelProvider;
  now?: Date;
  organizationId?: string;
} = {}) {
  const summary = { processed: 0, retry: 0, failed: 0 };
  // Stop taking new work after 20s; one already-started DB transaction is bounded
  // to 15s. Schedule repeat invocations rather than relying on an immortal worker.
  const deadline = Date.now() + 20000;
  for (let i = 0; i < Math.min(Math.max(limit, 1), 100); i++) {
    if (Date.now() >= deadline) break;
    const outcome = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<NotificationOutbox[]>(
          Prisma.sql`SELECT * FROM notification_outbox WHERE status='PENDING' AND "nextAttemptAt"<=${now} ${organizationId ? Prisma.sql`AND "organizationId"=${organizationId}` : Prisma.empty} ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1`,
        );
        const event = rows[0];
        if (!event) return null;
        const attempt = event.attemptCount + 1;
        await tx.$executeRaw`SAVEPOINT notification_delivery`;
        try {
          await deliverEvent(tx, event, provider, now);
          await tx.notificationOutbox.update({
            where: { id: event.id },
            data: {
              status: "PROCESSED",
              attemptCount: attempt,
              processedAt: now,
              lastErrorCode: null,
            },
          });
          await tx.$executeRaw`RELEASE SAVEPOINT notification_delivery`;
          return "processed" as const;
        } catch {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT notification_delivery`;
          const policy = retryPolicy(attempt, now);
          await tx.notificationOutbox.update({
            where: { id: event.id },
            data: {
              ...policy,
              attemptCount: attempt,
              lastErrorCode: "DELIVERY_FAILED",
            },
          });
          return policy.status === "FAILED"
            ? ("failed" as const)
            : ("retry" as const);
        }
      },
      { timeout: 15000 },
    );
    if (!outcome) break;
    summary[outcome]++;
  }
  return summary;
}

/** Presentation retention only; domain/audit histories are never deleted. */
export async function pruneNotifications(now = new Date()) {
  const expired = await prisma.notification.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 1000,
    orderBy: { expiresAt: "asc" },
  });
  const notifications = await prisma.notification.deleteMany({
    where: {
      id: { in: expired.map((row) => row.id) },
      expiresAt: { lte: now },
    },
  });
  const retired = await prisma.notificationOutbox.findMany({
    where: {
      status: { in: ["PROCESSED", "FAILED"] },
      createdAt: { lt: new Date(now.getTime() - 90 * 86400000) },
      notifications: { none: {} },
    },
    select: { id: true },
    take: 1000,
    orderBy: { createdAt: "asc" },
  });
  const outbox = await prisma.notificationOutbox.deleteMany({
    where: {
      id: { in: retired.map((row) => row.id) },
      status: { in: ["PROCESSED", "FAILED"] },
      createdAt: { lt: new Date(now.getTime() - 90 * 86400000) },
      notifications: { none: {} },
    },
  });
  return {
    expiredNotifications: notifications.count,
    retiredOutbox: outbox.count,
  };
}
