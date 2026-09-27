import type { ScreeningTemporalState } from "@/lib/screenings/temporal-state";

export type MovieStatus = "ACTIVE" | "INACTIVE";
export type ScreeningStatus = "SCHEDULED" | "CANCELLED";

export interface MovieDto {
  id: string;
  title: string;
  slug: string;
  synopsis: string | null;
  durationMinutes: number;
  language: string | null;
  contentRating: string | null;
  status: MovieStatus;
  posterUrl: string | null;
  upcomingScreeningCount: number;
  updatedAt: string;
}

export interface ScheduleLocationDto {
  id: string;
  name: string;
  timezone: string;
  status: "ACTIVE" | "INACTIVE";
  halls: Array<{ id: string; name: string; number: number; status: "ACTIVE" | "INACTIVE" }>;
}

export interface ScreeningDto {
  id: string;
  movieId: string;
  movieTitle: string;
  movieDurationMinutes: number;
  posterUrl: string | null;
  hallId: string;
  hallName: string;
  hallNumber: number;
  locationId: string;
  locationName: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  startsAtLocal: string;
  endsAtLocal: string;
  status: ScreeningStatus;
  temporalState: ScreeningTemporalState;
}

export type ActiveScreeningResolution =
  | { state: "NO_ACTIVE_SCREENING" }
  | {
      state: "ACTIVE_SCREENING";
      organization: { id: string; name: string };
      location: { id: string; name: string; timezone: string };
      hall: { id: string; name: string; number: number };
      seat?: { id: string; label: string; row: string; number: number };
      screening: { id: string; startsAt: string; endsAt: string; temporalState: "LIVE" };
      movie: { id: string; title: string; durationMinutes: number; posterUrl: string | null };
    };
