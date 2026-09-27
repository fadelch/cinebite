import Link from "next/link";

import { MovieGrid } from "@/components/admin/movie-grid";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getMovies } from "@/server/services/movie.service";
import { getScheduleContext } from "@/server/services/schedule-access.service";

export const metadata = { title: "Movies" };

export default async function MoviesPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string; page?: string }> }) {
  const query = await searchParams;
  const [result, context] = await Promise.all([getMovies(query), getScheduleContext()]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (page: number) => `?search=${encodeURIComponent(query.search ?? "")}&status=${query.status ?? ""}&page=${page}`;
  return <PageTransition><header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Cinema programming</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Movies</h1><p className="mt-2 text-sm text-zinc-400">Organization-wide movie metadata and upcoming screening context.</p></div><div className="flex gap-3"><Link href="/admin/screenings" className="cb-button-secondary">View schedule</Link>{context.actor.role === "CINEMA_ADMIN" ? <Link href="/admin/movies/new" className="cb-button-primary">Add movie</Link> : null}</div></header>
    <form className="cb-panel mt-7 grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto]"><input name="search" defaultValue={query.search ?? ""} className="cb-field" placeholder="Search title, slug, or language" aria-label="Search movies" /><select name="status" defaultValue={query.status ?? ""} className="cb-field" aria-label="Filter movie status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><button className="cb-button-secondary">Apply filters</button></form>
    <MovieGrid movies={result.movies} />
    {pages > 1 ? <nav aria-label="Movie pagination" className="mt-6 flex items-center justify-center gap-3">{result.page > 1 ? <Link href={href(result.page - 1)} className="cb-button-secondary">Previous</Link> : null}<span className="text-sm text-zinc-500">Page {result.page} of {pages}</span>{result.page < pages ? <Link href={href(result.page + 1)} className="cb-button-secondary">Next</Link> : null}</nav> : null}
  </PageTransition>;
}
