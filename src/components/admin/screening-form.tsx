"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { ScreeningStateBadge } from "@/components/admin/screening-state-badge";
import { useNotifications } from "@/components/ui/notification-provider";
import { suggestEndLocal } from "@/lib/screenings/timezone";
import type { MovieDto, ScheduleLocationDto, ScreeningDto } from "@/types/screening";

async function apiMessage(response: Response, fallback: string) { const body: unknown = await response.json().catch(() => null); return typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : fallback; }

export function ScreeningForm({ locations, movies, screening }: { locations: ScheduleLocationDto[]; movies: MovieDto[]; screening?: ScreeningDto }) {
  const router = useRouter(); const notifications = useNotifications();
  const initialLocation = screening?.locationId ?? locations.find((item) => item.status === "ACTIVE")?.id ?? "";
  const [locationId, setLocationId] = useState(initialLocation);
  const [hallId, setHallId] = useState(screening?.hallId ?? "");
  const [movieId, setMovieId] = useState(screening?.movieId ?? movies[0]?.id ?? "");
  const [startsAtLocal, setStartsAtLocal] = useState(screening?.startsAtLocal ?? "");
  const [endsAtLocal, setEndsAtLocal] = useState(screening?.endsAtLocal ?? "");
  const [endTouched, setEndTouched] = useState(Boolean(screening)); const [busy, setBusy] = useState(false);
  const location = locations.find((item) => item.id === locationId);
  const halls = useMemo(() => location?.halls.filter((hall) => hall.status === "ACTIVE") ?? [], [location]);
  const editable = !screening || screening.temporalState === "UPCOMING";

  function suggest(start: string, selectedMovieId = movieId, selectedLocation = location) {
    if (endTouched || !start || !selectedMovieId || !selectedLocation) return;
    const movie = movies.find((item) => item.id === selectedMovieId);
    if (!movie) return;
    try { setEndsAtLocal(suggestEndLocal(start, movie.durationMinutes, selectedLocation.timezone)); } catch { /* Server validation provides the authoritative error. */ }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch(screening ? `/api/admin/screenings/${screening.id}` : "/api/admin/screenings", {
        method: screening ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, hallId, movieId, startsAtLocal, endsAtLocal }),
      });
      if (!response.ok) throw new Error(await apiMessage(response, "The screening could not be saved."));
      notifications.success(screening ? "Screening saved successfully." : "Screening created successfully."); router.push("/admin");
    } catch (error) { notifications.error(error instanceof Error ? error.message : "The screening could not be saved."); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!screening) return; setBusy(true);
    try { const response = await fetch(`/api/admin/screenings/${screening.id}/cancel`, { method: "POST" }); if (!response.ok) throw new Error(await apiMessage(response, "The screening could not be cancelled.")); notifications.success("Screening cancelled."); router.push("/admin"); }
    catch (error) { notifications.error(error instanceof Error ? error.message : "The screening could not be cancelled."); }
    finally { setBusy(false); }
  }

  return <div className="mt-7 space-y-5">{screening ? <div className="flex items-center gap-3"><ScreeningStateBadge state={screening.temporalState} /><span className="text-sm text-zinc-500">Administrative status: {screening.status}</span></div> : null}
    {!editable ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">{screening?.temporalState === "LIVE" ? "This screening is live. Movie, hall, and schedule are locked." : "This screening is historical and read-only."}</div> : null}
    <form onSubmit={submit} className="cb-panel grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
      <label className="text-sm text-zinc-300">Location<select value={locationId} onChange={(event) => { const next = locations.find((item) => item.id === event.target.value); setLocationId(event.target.value); setHallId(next?.halls.find((hall) => hall.status === "ACTIVE")?.id ?? ""); suggest(startsAtLocal, movieId, next); }} disabled={!editable || busy} className="cb-field mt-2" required>{locations.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm text-zinc-300">Hall<select value={hallId} onChange={(event) => setHallId(event.target.value)} disabled={!editable || busy} className="cb-field mt-2" required><option value="">Select a hall</option>{halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name} · Hall {hall.number}</option>)}</select></label>
      <label className="text-sm text-zinc-300 sm:col-span-2">Movie<select value={movieId} onChange={(event) => { setMovieId(event.target.value); suggest(startsAtLocal, event.target.value); }} disabled={!editable || busy} className="cb-field mt-2" required>{screening && !movies.some((movie) => movie.id === screening.movieId) ? <option value={screening.movieId} disabled>{screening.movieTitle} · currently inactive</option> : null}{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title} · {movie.durationMinutes} min</option>)}</select></label>
      <label className="text-sm text-zinc-300">Starts at <span className="text-xs text-zinc-600">({location?.timezone ?? "location time"})</span><input type="datetime-local" value={startsAtLocal} onChange={(event) => { setStartsAtLocal(event.target.value); suggest(event.target.value); }} disabled={!editable || busy} className="cb-field mt-2" required /></label>
      <label className="text-sm text-zinc-300">Ends at <span className="text-xs text-zinc-600">({location?.timezone ?? "location time"})</span><input type="datetime-local" value={endsAtLocal} onChange={(event) => { setEndTouched(true); setEndsAtLocal(event.target.value); }} disabled={!editable || busy} className="cb-field mt-2" required /></label>
      <p className="text-xs text-zinc-500 sm:col-span-2">Times are interpreted using the selected location timezone, not the browser timezone. The suggested end uses the movie runtime and may be adjusted for trailers or operational buffer.</p>
      {editable ? <button disabled={busy || !locations.length || !movies.length} className="cb-button-primary sm:col-start-2">{screening ? "Save screening" : "Create screening"}</button> : null}
    </form>
    {screening?.status === "SCHEDULED" && screening.temporalState !== "ENDED" ? <div className="cb-panel flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="font-medium text-zinc-100">Cancel screening</h2><p className="mt-1 text-sm text-zinc-500">Cancellation preserves history and releases the hall time slot.</p></div><button type="button" disabled={busy} onClick={() => void cancel()} className="cb-button-danger">Cancel screening</button></div> : null}
  </div>;
}
