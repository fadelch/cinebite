import { redirect } from "next/navigation";

import { MovieForm } from "@/components/admin/movie-form";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getScheduleContext } from "@/server/services/schedule-access.service";

export const metadata = { title: "Add movie" };

export default async function NewMoviePage() {
  const { actor } = await getScheduleContext();
  if (actor.role !== "CINEMA_ADMIN") redirect("/admin/movies");
  return <PageTransition><header><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Movie catalog</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Add movie</h1><p className="mt-2 text-sm text-zinc-400">Create reusable movie metadata before scheduling it into a hall.</p></header><MovieForm /></PageTransition>;
}
