import { orderStatusLabel } from "@/lib/orders/status";
import { formatInTimeZone } from "@/lib/screenings/timezone";
import type { OrderStatusHistoryEntry } from "@/types/order";

export function OrderTimeline({ history, timezone, showStaff = false }: {
  history: OrderStatusHistoryEntry[]; timezone: string; showStaff?: boolean;
}) {
  return <section aria-label="Order status timeline">
    <h2 className="text-base font-semibold text-zinc-100">Status timeline</h2>
    <ol className="mt-4 space-y-4 border-l border-zinc-700 pl-5">
      {history.map((event) => <li key={event.toStatus} className="relative">
        <span className="absolute top-1.5 -left-[1.6rem] size-2 rounded-full bg-amber-400" aria-hidden="true" />
        <p className="text-sm font-medium text-zinc-100">{orderStatusLabel[event.toStatus]}</p>
        <time dateTime={event.createdAt} className="text-xs text-zinc-500">{formatInTimeZone(event.createdAt, timezone)}</time>
        {showStaff && event.actorDisplayName ? <p className="text-xs text-zinc-500">{event.actorDisplayName}</p> : null}
      </li>)}
    </ol>
    <p className="mt-4 text-[0.65rem] text-zinc-600">Times shown in {timezone}</p>
  </section>;
}
