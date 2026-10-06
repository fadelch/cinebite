import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  CATEGORIES,
  NOTIFICATION_TYPES,
  categoryFor,
  mandatory,
  recipientsFor,
} from "@/lib/notifications/policy";
import { getCurrentUser } from "@/server/auth/current-user";
import { validateCustomerSession } from "./customer-session.service";
import { ServiceError } from "./service-error";
import {
  notificationQuerySchema,
  readNotificationSchema,
  preferenceSchema,
} from "@/validation/notification";
import { orderCodeSchema } from "@/validation/order";
import type { AuthenticatedUser } from "@/types/auth";
import type {
  NotificationDto,
  NotificationFeed,
  PreferenceDto,
} from "@/types/notification";

async function actor() {
  const value = await getCurrentUser();
  if (!value)
    throw new ServiceError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Sign in to see your notifications.",
    );
  if (
    !value.organizationId ||
    ![
      "CINEMA_ADMIN",
      "LOCATION_MANAGER",
      "KITCHEN_STAFF",
      "DELIVERY_STAFF",
    ].includes(value.role)
  )
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "These notifications require a cinema staff account.",
    );
  return value;
}
async function staffScope(
  tx: Prisma.TransactionClient,
  value: AuthenticatedUser,
) {
  const user = await tx.user.findUnique({
    where: { firebaseUid: value.uid },
    include: {
      memberships: {
        where: { organizationId: value.organizationId! },
        include: { locationAccess: true, organization: true },
      },
    },
  });
  const membership = user?.memberships[0];
  if (
    !user?.active ||
    !membership ||
    membership.role !== value.role ||
    membership.organization.status !== "ACTIVE"
  )
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Your notification access is unavailable.",
    );
  const permitted =
    membership.role === "CINEMA_ADMIN" || membership.allLocations
      ? undefined
      : membership.locationAccess.map((l) => l.locationId);
  const where: Prisma.NotificationWhereInput = {
    recipientUserId: user.id,
    organizationId: membership.organizationId,
    ...(permitted ? { locationId: { in: permitted } } : {}),
    location: { organizationId: membership.organizationId, status: "ACTIVE" },
    type: {
      in: NOTIFICATION_TYPES.filter((type) =>
        recipientsFor(type).includes(membership.role),
      ),
    },
    expiresAt: { gt: new Date() },
  };
  return { user, membership, where };
}
type NotificationRow = Prisma.NotificationGetPayload<{
  include: { outbox: true };
}>;
function dto(
  row: NotificationRow,
  role: string,
  customerCode?: string,
): NotificationDto {
  const payload = row.outbox.payload as Record<string, string>;
  let href: string | null = null;
  if (customerCode)
    href = `/customer/orders/${encodeURIComponent(customerCode)}`;
  else if (row.entityType === "ORDER") {
    if (role === "CINEMA_ADMIN" || role === "LOCATION_MANAGER")
      href = `/admin/orders/${encodeURIComponent(row.entityId)}`;
    else if (role === "KITCHEN_STAFF" && payload.code)
      href = `/kitchen/orders/${encodeURIComponent(payload.code)}`;
    else if (role === "DELIVERY_STAFF") href = "/delivery";
  } else if (
    row.entityType === "INVENTORY" &&
    ["CINEMA_ADMIN", "LOCATION_MANAGER"].includes(role)
  )
    href = `/admin/inventory/locations/${encodeURIComponent(row.locationId)}`;
  else if (row.entityType === "SCREENING")
    href = ["CINEMA_ADMIN", "LOCATION_MANAGER"].includes(role)
      ? `/admin/screenings/${encodeURIComponent(row.entityId)}`
      : role === "KITCHEN_STAFF"
        ? "/kitchen"
        : "/delivery";
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    href,
  };
}
export async function getStaffNotifications(
  input: unknown = {},
): Promise<NotificationFeed> {
  const value = await actor(),
    query = notificationQuerySchema.parse(input),
    pageSize = 20;
  return prisma.$transaction(
    async (tx) => {
      const scope = await staffScope(tx, value);
      const where = {
        ...scope.where,
        ...(query.view === "unread" ? { readAt: null } : {}),
        ...(query.type ? { AND: [{ type: query.type }] } : {}),
      };
      const items = await tx.notification.findMany({
        where,
        include: { outbox: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      });
      const total = await tx.notification.count({ where });
      const unread = await tx.notification.count({
        where: { ...scope.where, readAt: null },
      });
      return {
        items: items.map((row) => dto(row, value.role)),
        total,
        unread,
        page: query.page,
        pageSize,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function markStaffNotificationsRead(input: unknown) {
  const value = await actor(),
    query = readNotificationSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const scope = await staffScope(tx, value);
    const where = { ...scope.where, ...(!query.all ? { id: query.id } : {}) };
    if (
      !query.all &&
      !(await tx.notification.findFirst({ where, select: { id: true } }))
    )
      throw new ServiceError(
        "NOTIFICATION_NOT_FOUND",
        404,
        "Notification not found.",
      );
    const result = await tx.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  });
}
export async function getNotificationPreferences(): Promise<PreferenceDto[]> {
  const value = await actor();
  return prisma.$transaction(async (tx) => {
    const scope = await staffScope(tx, value);
    const preferences = await tx.notificationPreference.findMany({
      where: { userId: scope.user.id },
    });
    return CATEGORIES.map((category) => ({
      category,
      inAppEnabled:
        preferences.find((p) => p.category === category)?.inAppEnabled ?? true,
      mandatoryTypes: NOTIFICATION_TYPES.filter(
        (t) => categoryFor(t) === category && mandatory(t),
      ),
    }));
  });
}
export async function saveNotificationPreference(input: unknown) {
  const value = await actor(),
    query = preferenceSchema.parse(input);
  if (query.category === "EXCEPTIONS" && !query.inAppEnabled)
    throw new ServiceError(
      "NOTIFICATION_PREFERENCE_REQUIRED",
      400,
      "Exception alerts are required and cannot be disabled.",
    );
  return prisma.$transaction(async (tx) => {
    const scope = await staffScope(tx, value);
    const result = await tx.notificationPreference.upsert({
      where: {
        userId_category: { userId: scope.user.id, category: query.category },
      },
      create: { userId: scope.user.id, ...query },
      update: { inAppEnabled: query.inAppEnabled },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: scope.user.id,
        action: "NOTIFICATION_PREFERENCES_CHANGED",
        entityType: "USER",
        entityId: scope.user.id,
        organizationId: scope.membership.organizationId,
        metadata: query,
      },
    });
    return { category: result.category, inAppEnabled: result.inAppEnabled };
  });
}
export async function getCustomerNotifications(
  token: string | undefined,
  codeInput: string,
): Promise<NotificationFeed> {
  const code = orderCodeSchema.parse(codeInput),
    session = await validateCustomerSession(token);
  const order = await prisma.order.findFirst({
    where: { customerSessionId: session.id, publicOrderCode: code },
    select: { id: true, organizationId: true, locationId: true },
  });
  if (!order)
    throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
  const where = {
    customerSessionId: session.id,
    entityType: "ORDER",
    entityId: order.id,
    organizationId: order.organizationId,
    locationId: order.locationId,
    expiresAt: { gt: new Date() },
  };
  const items = await prisma.notification.findMany({
    where,
    include: { outbox: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
  });
  return {
    items: items.map((row) => dto(row, "CUSTOMER", code)),
    unread: items.filter((n) => !n.readAt).length,
    total: items.length,
    page: 1,
    pageSize: 20,
  };
}
