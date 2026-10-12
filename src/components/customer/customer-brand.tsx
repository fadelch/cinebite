"use client";
import { useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import type { PublicBranding } from "@/types/settings";
const accents = {
  AMBER: "border-amber-400/25 text-amber-300",
  TEAL: "border-teal-400/25 text-teal-300",
  VIOLET: "border-violet-400/25 text-violet-300",
};
export function CustomerBrand({ branding }: { branding: PublicBranding }) {
  const [broken, setBroken] = useState(false),
    reduced = useReducedMotion();
  return (
    <motion.div
      initial={false}
      layout={!reduced}
      className={`mx-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl border bg-zinc-950 p-4 ${accents[branding.accent]}`}
    >
      {branding.logoUrl && !broken ? (
        <Image
          src={branding.logoUrl}
          alt={`${branding.name} logo`}
          onError={() => setBroken(true)}
          className="size-12 shrink-0 rounded-xl object-contain"
          width={48}
          height={48}
          unoptimized
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-xl font-bold"
        >
          {branding.name.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0">
        <p className="break-words text-lg font-semibold">{branding.name}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Seat ordering · Powered by CineBite
        </p>
      </div>
    </motion.div>
  );
}
export function CustomerSupport({ branding }: { branding: PublicBranding }) {
  if (!branding.supportEmail && !branding.supportPhone && !branding.website)
    return null;
  return (
    <section
      aria-label="Cinema support"
      className="mx-auto max-w-3xl px-4 py-6 text-sm text-zinc-400"
    >
      <h2 className="font-semibold text-zinc-200">Cinema support</h2>
      <p className="mt-1 text-xs">
        Public cinema contact details, not your seat-session credentials.
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        {branding.supportEmail ? (
          <a
            className="break-all text-amber-300"
            href={`mailto:${branding.supportEmail}`}
          >
            {branding.supportEmail}
          </a>
        ) : null}
        {branding.supportPhone ? <span>{branding.supportPhone}</span> : null}
        {branding.website ? (
          <a
            className="text-amber-300"
            href={branding.website}
            rel="noopener noreferrer"
            target="_blank"
          >
            Cinema website
          </a>
        ) : null}
      </div>
    </section>
  );
}
