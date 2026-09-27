import Link from "next/link";

import { ScreeningScheduleList } from "@/components/admin/screening-schedule-list";
import { PageTransition } from "@/components/super-admin/page-transition";
import { StatCard } from "@/components/super-admin/stat-card";
import { getSchedule, getScreeningWorkspace } from "@/server/services/screening.service";

export const metadata = { title: "Screening schedule" };

type Query = { date?: string; locationId?: string; hallId?: string; movieId?: string; state?: string; page?: string };

function pageHref(query: Query, page: number) { const params = new URLSearchParams(); for (const key of ["date", "locationId", "hallId", "movieId", "state"] as const) if (query[key]) params.set(key, query[key]); params.set("page", String(page)); return `?${params}`; }

export default async function ScreeningsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const [schedule, workspace] = await Promise.all([getSchedule(query), getScreeningWorkspace()]);
  const selected = schedule.locations.find((location) => location.id === schedule.selectedLocationId);
  const pages = Math.max(1, Math.ceil(schedule.total / schedule.pageSize));
  return <PageTransition><header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Cinema schedule</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Screenings</h1><p className="mt-2 text-sm text-zinc-400">Timezone-safe programming with concurrency-safe hall scheduling.</p></div><div className="flex flex-wrap gap-3"><Link href="/admin/movies" className="cb-button-secondary">Movie catalog</Link><Link href={schedule.showManageableAcrossDates ? "/admin/screenings" : "/admin/screenings?state=MANAGEABLE"} className="cb-button-secondary">{schedule.showManageableAcrossDates ? "Daily schedule" : "Manage upcoming & live"}</Link><Link href="/admin/screenings/new" className="cb-button-primary">Create screening</Link></div></header>
    <form className="cb-panel mt-7 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6"><input type="date" name="date" defaultValue={schedule.date} disabled={schedule.showManageableAcrossDates} className="cb-field disabled:cursor-not-allowed disabled:opacity-50" aria-label="Schedule date" /><select name="locationId" defaultValue={schedule.selectedLocationId ?? ""} className="cb-field" aria-label="Location"><option value="">Select location</option>{schedule.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><select name="hallId" defaultValue={query.hallId ?? ""} className="cb-field" aria-label="Hall"><option value="">All halls</option>{selected?.halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}</select><select name="movieId" defaultValue={query.movieId ?? ""} className="cb-field" aria-label="Movie"><option value="">All active movies</option>{workspace.movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select><select name="state" defaultValue={query.state ?? ""} className="cb-field" aria-label="Screening state"><option value="">All states</option><option value="MANAGEABLE">Upcoming & live (all dates)</option><option value="LIVE">Live</option><option value="UPCOMING">Upcoming</option><option value="ENDED">Ended</option><option value="CANCELLED">Cancelled</option></select><button className="cb-button-secondary">Apply filters</button></form>
    {schedule.showManageableAcrossDates ? <section className="cb-panel mt-6 border-amber-400/20 p-5"><h2 className="font-semibold text-zinc-100">Manage upcoming and live movies</h2><p className="mt-2 text-sm text-zinc-400">Showing every current or future screening at this location across all dates. Upcoming screenings can be edited; live screenings remain schedule-locked but may be viewed or removed safely.</p></section> : <section className="mt-6 grid gap-4 sm:grid-cols-3"><StatCard label="Live now" value={"liveNow" in schedule ? schedule.liveNow : 0} detail="At selected location" index={0} /><StatCard label="Upcoming today" value={"upcomingToday" in schedule ? schedule.upcomingToday : 0} detail={schedule.date || "Selected date"} index={1} /><StatCard label="Cancelled today" value={"cancelledToday" in schedule ? schedule.cancelledToday : 0} detail="Preserved history" tone="danger" index={2} /></section>}
    <ScreeningScheduleList screenings={schedule.screenings} />
    {pages > 1 ? <nav aria-label="Screening pagination" className="mt-6 flex items-center justify-center gap-3">{schedule.page > 1 ? <Link href={pageHref(query, schedule.page - 1)} className="cb-button-secondary">Previous</Link> : null}<span className="text-sm text-zinc-500">Page {schedule.page} of {pages}</span>{schedule.page < pages ? <Link href={pageHref(query, schedule.page + 1)} className="cb-button-secondary">Next</Link> : null}</nav> : null}
  </PageTransition>;
}
