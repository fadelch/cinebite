"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";

import type { MovieDto } from "@/types/screening";

export function MovieGrid({ movies }: { movies: MovieDto[] }) {
  const reduceMotion = useReducedMotion();
  if (movies.length === 0) return <div className="cb-panel mt-6 p-12 text-center"><h2 className="font-semibold text-zinc-100">No movies found</h2><p className="mt-2 text-sm text-zinc-500">Create a movie or change the current filters.</p></div>;
  return <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{movies.map((movie, index) => <motion.article key={movie.id} initial={false} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * .035 }} className="cb-panel overflow-hidden">
    <div className="grid grid-cols-[7rem_1fr]"><div className="relative min-h-44 bg-zinc-950">{movie.posterUrl ? <Image src={movie.posterUrl} alt={`${movie.title} poster`} fill sizes="112px" className="object-cover" /> : <div className="flex h-full items-center justify-center px-3 text-center text-xs text-zinc-700">No poster</div>}</div><div className="flex min-w-0 flex-col p-5"><div className="flex items-start justify-between gap-2"><h2 className="truncate font-semibold text-zinc-100">{movie.title}</h2><span className={`rounded-full border px-2 py-0.5 text-[.6rem] ${movie.status === "ACTIVE" ? "border-emerald-400/25 text-emerald-300" : "border-zinc-700 text-zinc-500"}`}>{movie.status}</span></div><p className="mt-2 text-xs text-zinc-500">{movie.durationMinutes} min{movie.language ? ` · ${movie.language}` : ""}{movie.contentRating ? ` · ${movie.contentRating}` : ""}</p><p className="mt-4 text-sm text-zinc-400">{movie.upcomingScreeningCount} upcoming screening{movie.upcomingScreeningCount === 1 ? "" : "s"}</p><Link href={`/admin/movies/${movie.id}`} className="mt-auto pt-5 text-sm font-medium text-amber-300 hover:text-amber-200">Manage movie →</Link></div></div>
  </motion.article>)}</div>;
}
