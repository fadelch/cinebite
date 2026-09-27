"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";

import { ScreeningStateBadge } from "@/components/admin/screening-state-badge";
import { formatInTimeZone } from "@/lib/screenings/timezone";
import type { ScreeningDto } from "@/types/screening";

export function ScreeningScheduleList({ screenings }: { screenings: ScreeningDto[] }) {
  const reduceMotion = useReducedMotion();
  if (!screenings.length) return <div className="cb-panel mt-6 p-12 text-center"><h2 className="font-semibold text-zinc-100">No screenings found</h2><p className="mt-2 text-sm text-zinc-500">Create a screening or change the date and filters.</p></div>;
  return <div className="mt-6 space-y-3">{screenings.map((screening, index) => <motion.article key={screening.id} initial={reduceMotion ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : index * .025 }} className="cb-panel grid gap-4 p-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:p-5">
    <div className="relative hidden aspect-[2/3] overflow-hidden rounded-lg bg-zinc-950 sm:block">{screening.posterUrl ? <Image src={screening.posterUrl} alt="" fill sizes="64px" className="object-cover" /> : null}</div>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold text-zinc-100">{screening.movieTitle}</h2><ScreeningStateBadge state={screening.temporalState} /></div><p className="mt-2 text-sm text-zinc-300">{formatInTimeZone(screening.startsAt, screening.timezone)} → {new Intl.DateTimeFormat("en-US", { timeZone: screening.timezone, timeStyle: "short" }).format(new Date(screening.endsAt))}</p><p className="mt-1 text-xs text-zinc-500">{screening.locationName} · {screening.hallName} · {screening.timezone}</p></div>
    <Link href={`/admin/screenings/${screening.id}`} className="cb-button-secondary text-center">View details</Link>
  </motion.article>)}</div>;
}
