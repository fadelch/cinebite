"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { StatusBadge } from "@/components/super-admin/status-badge";
import type { toTenantLocationDto } from "@/lib/tenant-admin/dto";

type LocationDto = ReturnType<typeof toTenantLocationDto>;

export function LocationCards({ locations }: { locations: LocationDto[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {locations.map((location, index) => (
        <motion.article
          key={location.id}
          className="cb-panel flex min-h-56 flex-col p-5"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : index * 0.04 }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-zinc-100">{location.name}</h2>
              <p className="mt-1 font-mono text-xs text-zinc-600">{location.slug}</p>
            </div>
            <StatusBadge status={location.status} />
          </div>
          <p className="mt-5 text-sm leading-6 text-zinc-400">
            {location.address.line1}<br />{location.city}, {location.country}
          </p>
          <p className="mt-2 text-xs text-zinc-600">{location.timezone}</p>
          <Link href={`/admin/locations/${location.id}`} className="cb-button-secondary mt-auto self-start">
            View location
          </Link>
        </motion.article>
      ))}
    </div>
  );
}
