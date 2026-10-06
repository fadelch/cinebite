import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// No email/SMS/push adapter is configured or silently substituted. Future
// adapters need separate durable delivery records and stable provider idempotency.
export interface NotificationChannelProvider {
  readonly channel: "IN_APP";
  send(
    tx: Prisma.TransactionClient,
    drafts: Prisma.NotificationCreateManyInput[],
  ): Promise<void>;
}
export const inAppNotificationProvider: NotificationChannelProvider = {
  channel: "IN_APP",
  async send(tx, drafts) {
    if (drafts.length)
      await tx.notification.createMany({ data: drafts, skipDuplicates: true });
  },
};
