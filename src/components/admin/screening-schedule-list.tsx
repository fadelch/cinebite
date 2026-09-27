"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ScreeningStateBadge } from "@/components/admin/screening-state-badge";
import { useNotifications } from "@/components/ui/notification-provider";
import { formatInTimeZone } from "@/lib/screenings/timezone";
import type { ScreeningDto } from "@/types/screening";

async function apiMessage(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  return typeof body === "object" && body && "error" in body && typeof body.error === "string"
    ? body.error
    : "The screening could not be removed from the schedule.";
}

export function ScreeningScheduleList({ screenings }: { screenings: ScreeningDto[] }) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const notifications = useNotifications();
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function removeFromSchedule(screening: ScreeningDto) {
    const confirmed = window.confirm(
      `Remove ${screening.movieTitle} from this schedule? The screening will be cancelled and its history preserved.`,
    );
    if (!confirmed) return;

    setRemovingId(screening.id);
    try {
      const response = await fetch(`/api/admin/screenings/${screening.id}/cancel`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await apiMessage(response));
      notifications.success("Screening removed from the active schedule and preserved as cancelled.");
      router.refresh();
    } catch (error) {
      notifications.error(
        error instanceof Error
          ? error.message
          : "The screening could not be removed from the schedule.",
      );
    } finally {
      setRemovingId(null);
    }
  }

  if (!screenings.length) {
    return (
      <div className="cb-panel mt-6 p-12 text-center">
        <h2 className="font-semibold text-zinc-100">No screenings found</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Create a screening or change the date and filters.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {screenings.map((screening, index) => (
        <motion.article
          key={screening.id}
          initial={reduceMotion ? false : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reduceMotion ? 0 : index * 0.025 }}
          className="cb-panel grid gap-4 p-4 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-center sm:p-5 lg:grid-cols-[4rem_minmax(0,1fr)_auto]"
        >
          <Link
            href={`/admin/movies/${screening.movieId}`}
            aria-label={`Open ${screening.movieTitle}`}
            className="relative hidden aspect-[2/3] overflow-hidden rounded-lg bg-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:block"
          >
            {screening.posterUrl ? (
              <Image
                src={screening.posterUrl}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center px-1 text-center text-[0.6rem] text-zinc-700">
                No poster
              </span>
            )}
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-zinc-100">{screening.movieTitle}</h2>
              <ScreeningStateBadge state={screening.temporalState} />
            </div>
            <p className="mt-2 text-sm text-zinc-300">
              {formatInTimeZone(screening.startsAt, screening.timezone)} to{" "}
              {new Intl.DateTimeFormat("en-US", {
                timeZone: screening.timezone,
                timeStyle: "short",
              }).format(new Date(screening.endsAt))}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {screening.locationName} / {screening.hallName} / {screening.timezone}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
            <Link
              href={`/admin/movies/${screening.movieId}`}
              className="cb-button-secondary text-center"
            >
              Movie
            </Link>
            <Link
              href={`/admin/screenings/${screening.id}`}
              className="cb-button-secondary text-center"
            >
              {screening.temporalState === "UPCOMING" ? "Edit time" : "Details"}
            </Link>
            {screening.status === "SCHEDULED" && screening.temporalState !== "ENDED" ? (
              <button
                type="button"
                disabled={removingId === screening.id}
                onClick={() => void removeFromSchedule(screening)}
                className="cb-button-danger"
              >
                {removingId === screening.id ? "Removing..." : "Remove"}
              </button>
            ) : null}
          </div>
        </motion.article>
      ))}
    </div>
  );
}
