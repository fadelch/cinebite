"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { usePolling } from "@/lib/hooks/use-polling";
import { useNotifications } from "@/components/ui/notification-provider";
import type {
  NotificationDto,
  NotificationFeed,
  PreferenceDto,
} from "@/types/notification";
import {
  NOTIFICATION_TYPES,
  type Category,
  type NotificationKind,
} from "@/lib/notifications/policy";

export const emptyNotificationFeed: NotificationFeed = {
  items: [],
  unread: 0,
  total: 0,
  page: 1,
  pageSize: 20,
};
export function NotificationItem({
  item,
  read,
  busy = false,
}: {
  item: NotificationDto;
  read?: (id: string) => void;
  busy?: boolean;
}) {
  const critical = item.severity === "CRITICAL",
    reduced = useReducedMotion();
  return (
    <motion.li
      layout={!reduced}
      initial={false}
      className={`rounded-2xl border p-4 ${critical ? "border-rose-400/30 bg-rose-400/5" : item.readAt ? "border-zinc-800 bg-zinc-900/30" : "border-amber-400/25 bg-amber-400/5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-zinc-100">{item.title}</h3>
        <span className="text-[0.65rem] tracking-wide text-zinc-400">
          {item.severity} · {item.readAt ? "READ" : "UNREAD"}
        </span>
      </div>
      <p className="mt-2 break-words text-sm leading-6 text-zinc-300">
        {item.message}
      </p>
      <p className="mt-3 text-xs text-zinc-500">
        <time dateTime={item.createdAt}>
          {new Intl.DateTimeFormat("en-GB", {
            timeZone: "UTC",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(item.createdAt))}{" "}
          UTC
        </time>
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {item.href ? (
          <Link href={item.href} className="cb-button-secondary min-h-11">
            View details
          </Link>
        ) : null}
        {read && !item.readAt ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => read(item.id)}
            className="cb-button-secondary min-h-11"
          >
            Mark read
          </button>
        ) : null}
      </div>
    </motion.li>
  );
}
export function NotificationCenter({
  initial,
  preferences,
  view = "all",
  backHref = "/admin",
  type,
}: {
  initial: NotificationFeed;
  preferences: PreferenceDto[];
  view: "all" | "unread";
  backHref: string;
  type?: NotificationKind;
}) {
  const router = useRouter(),
    typeQuery = type ? `&type=${type}` : "";
  const { data, error, refresh } = usePolling(
    `/api/notifications?view=${view}&page=${initial.page}${typeQuery}`,
    initial,
  );
  const [busy, setBusy] = useState(false),
    [prefs, setPrefs] = useState(preferences);
  const toast = useNotifications();
  async function mutate(input: { id?: string; all?: boolean }) {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not update notifications.");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update notifications.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function preference(category: Category, inAppEnabled: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, inAppEnabled }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not save preferences.");
      setPrefs((p) =>
        p.map((row) =>
          row.category === category ? { ...row, inAppEnabled } : row,
        ),
      );
      toast.success("Notification preference saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save preferences.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#09090b] p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <Link href={backHref} className="text-sm text-amber-300">
          ← Back to workspace
        </Link>
        <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.18em] text-amber-300 uppercase">
              CineBite · Operational updates
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Notification Center</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Persistent updates for your authorized cinema and locations.
            </p>
          </div>
          <p
            aria-live="polite"
            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 font-semibold text-amber-200"
          >
            {data.unread} unread
          </p>
        </header>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/notifications?view=all${typeQuery}`}
            aria-current={view === "all" ? "page" : undefined}
            className={
              view === "all" ? "cb-button-primary" : "cb-button-secondary"
            }
          >
            All
          </Link>
          <Link
            href={`/notifications?view=unread${typeQuery}`}
            aria-current={view === "unread" ? "page" : undefined}
            className={
              view === "unread" ? "cb-button-primary" : "cb-button-secondary"
            }
          >
            Unread
          </Link>
          <button
            type="button"
            disabled={busy || !data.unread}
            onClick={() => mutate({ all: true })}
            className="cb-button-secondary min-h-11"
          >
            Mark all read
          </button>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Type
            <select
              aria-label="Notification type"
              className="cb-input min-h-11 max-w-full"
              value={type ?? ""}
              onChange={(event) =>
                router.push(
                  `/notifications?view=${view}${event.target.value ? `&type=${event.target.value}` : ""}`,
                )
              }
            >
              <option value="">All types</option>
              {NOTIFICATION_TYPES.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p role="status" className="my-4 text-xs text-zinc-500">
          {error ??
            "Updates every 5 seconds while this page is visible. Notifications are not the current business status; open details to check."}
        </p>
        <ul aria-label="Your notifications" className="space-y-3">
          {data.items.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              busy={busy}
              read={(id) => void mutate({ id })}
            />
          ))}
        </ul>
        {!data.items.length ? (
          <section className="cb-panel p-8 text-center">
            <h2 className="font-semibold">No notifications on this page</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Important updates appear here after the notification job processes
              them.
            </p>
          </section>
        ) : null}
        <nav
          aria-label="Notification pagination"
          className="mt-5 flex flex-wrap justify-end gap-3"
        >
          <span className="py-3 text-sm text-zinc-400">
            Page {data.page} · {data.total} notifications
          </span>
          {data.page > 1 ? (
            <Link
              href={`/notifications?view=${view}&page=${data.page - 1}${typeQuery}`}
              className="cb-button-secondary"
            >
              Previous
            </Link>
          ) : null}
          {data.total > data.page * data.pageSize ? (
            <Link
              href={`/notifications?view=${view}&page=${data.page + 1}${typeQuery}`}
              className="cb-button-secondary"
            >
              Next
            </Link>
          ) : null}
        </nav>
        <section
          className="cb-panel mt-8 p-5"
          aria-labelledby="notification-preferences"
        >
          <h2 id="notification-preferences" className="text-xl font-semibold">
            Notification preferences
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Choose optional in-app categories. Out-of-stock, refund failures,
            reported issues and screening cancellations always remain enabled.
            No email, SMS, push or sound is configured.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {prefs.map((p) => (
              <label
                key={p.category}
                className="rounded-xl border border-zinc-800 p-4"
              >
                <span className="flex min-h-11 items-center justify-between gap-4">
                  <span className="font-medium">{p.category}</span>
                  <input
                    type="checkbox"
                    checked={p.inAppEnabled}
                    disabled={busy || p.category === "EXCEPTIONS"}
                    onChange={(event) =>
                      void preference(p.category, event.target.checked)
                    }
                    aria-label={`${p.category} notifications`}
                  />
                </span>
                <span className="mt-2 block text-xs text-zinc-500">
                  {p.mandatoryTypes.length
                    ? `Always enabled: ${p.mandatoryTypes.join(", ")}`
                    : "Optional category; existing work queues remain authoritative."}
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
export function NotificationBell() {
  const { data, error, refresh } = usePolling(
    "/api/notifications?view=unread",
    emptyNotificationFeed,
  );
  return (
    <details className="relative">
      <summary
        onClick={() => void refresh()}
        className="cb-button-secondary min-h-11 cursor-pointer list-none gap-2"
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6" />
        </svg>
        <span>Notifications</span>
        {data.unread > 0 ? (
          <span
            aria-live="polite"
            className="rounded-full bg-amber-400 px-2 text-xs text-zinc-950"
          >
            {data.unread}
          </span>
        ) : null}
      </summary>
      <section
        aria-label="Recent unread notifications"
        className="absolute right-0 z-50 mt-2 max-h-[75dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl"
      >
        <h2 className="font-semibold">Recent notifications</h2>
        <p className="mt-1 text-xs text-zinc-500">
          {error ?? `${data.unread} unread · Operational updates`}
        </p>
        <ul className="mt-3 space-y-3">
          {data.items.slice(0, 3).map((item) => (
            <NotificationItem key={item.id} item={item} />
          ))}
        </ul>
        <Link href="/notifications" className="cb-button-primary mt-4 w-full">
          View all notifications
        </Link>
      </section>
    </details>
  );
}
