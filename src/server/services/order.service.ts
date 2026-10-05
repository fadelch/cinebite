import "server-only";

import { getCurrentUser } from "@/server/auth/current-user";
import { getAdminOrderRecord, getCustomerOrderRecord, listAdminOrdersRecord, placeOrderRecord } from "@/server/repositories/order.repository";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import { requireScheduleActor, schedulePermittedLocationIds } from "@/server/services/schedule-access.service";
import { ServiceError } from "@/server/services/service-error";
import { checkoutSchema, orderCodeSchema } from "@/validation/order";
import { documentIdSchema } from "@/validation/shared";

export async function placeCustomerOrder(rawToken: string | undefined, input: unknown, now = new Date()) {
  const parsed = checkoutSchema.parse(input);
  const session = await validateCustomerSession(rawToken, now);
  return placeOrderRecord({ customerSessionId: session.id, idempotencyKey: parsed.idempotencyKey, customerNote: parsed.customerNote || null, now });
}

export async function getCustomerOrder(rawToken: string | undefined, publicCodeInput: string, now = new Date()) {
  const publicCode = orderCodeSchema.parse(publicCodeInput);
  const session = await validateCustomerSession(rawToken, now);
  const order = await getCustomerOrderRecord(session.id, publicCode);
  if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
  return order;
}

export async function listAdminOrders() {
  const actor = requireScheduleActor(await getCurrentUser());
  return listAdminOrdersRecord(actor.organizationId, schedulePermittedLocationIds(actor));
}

export async function getAdminOrder(orderIdInput: string) {
  const orderId = documentIdSchema.parse(orderIdInput);
  const actor = requireScheduleActor(await getCurrentUser());
  const order = await getAdminOrderRecord(actor.organizationId, orderId, schedulePermittedLocationIds(actor));
  if (!order) throw new ServiceError("ORDER_NOT_FOUND", 404, "Order not found.");
  return order;
}
