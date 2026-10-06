"use client";
import { usePolling } from "@/lib/hooks/use-polling";
import { NotificationItem, emptyNotificationFeed } from "./notification-center";
export function CustomerNotifications({ code }: { code: string }) {
  const { data, error } = usePolling(
    `/api/customer/orders/${encodeURIComponent(code)}/notifications`,
    emptyNotificationFeed,
  );
  return (
    <section
      className="cb-panel mx-auto my-6 max-w-2xl p-5"
      aria-labelledby="customer-order-updates"
    >
      <h2 id="customer-order-updates" className="text-xl font-semibold">
        Order notifications
      </h2>
      <p role="status" className="mt-2 text-xs text-zinc-500">
        {error ??
          "Private updates for this seat session. Current order and refund status remain authoritative."}
      </p>
      <ul className="mt-4 space-y-3">
        {data.items.map((item) => (
          <NotificationItem key={item.id} item={item} />
        ))}
      </ul>
      {!data.items.length ? (
        <p className="mt-3 text-sm text-zinc-500">
          No notification updates available yet.
        </p>
      ) : null}
    </section>
  );
}
