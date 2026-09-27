# Phase 9 — Movies & Screenings

Phase 9 adds an organization Movie catalog, secure poster handling, location-timezone-aware Screening scheduling, PostgreSQL-enforced Hall overlap protection, computed upcoming/live/ended state, cancellation history, location authorization, and internal active Hall/Seat resolution for a later secure QR-ordering phase.

Actual application screenshots could not be captured automatically during implementation because the local database had not yet received the Phase 9 migration and no authenticated, non-sensitive demo browser session was available. Do not fabricate screenshots. After deploying the migration to a safe development/staging database, capture the following real UI with demo-only data.

## Suggested demo data

- Organization: `CineBite Demo`
- Location: `Demo Beirut`
- Timezone: `Asia/Beirut`
- Halls: `Hall 1`, `Hall 2`
- Movies: `Interstellar` (169 minutes), `Dune: Part Two` (166 minutes)
- Use generated/demo administrator accounts only. Do not show real email addresses.

## Required captures

1. `01-movies-dashboard.png` — `/admin/movies`; show poster cards, runtime, language, status, and upcoming-screening count.
2. `02-create-movie.png` — `/admin/movies/new`; show the complete metadata and optional poster form.
3. `03-screenings-schedule.png` — `/admin/screenings`; show location/date filters, Live/Upcoming/Cancelled statistics, and real schedule rows.
4. `04-create-screening.png` — `/admin/screenings/new`; show Location → Hall selection, Movie, timezone label, and suggested end time.
5. `05-overlap-validation.png` — submit an overlapping same-Hall interval and capture the friendly bottom-right conflict notification without opening developer tools.
6. `06-live-screening.png` — `/admin/screenings/[screeningId]`; show the textual `Live now` state and locked core schedule fields.
7. `07-mobile-screening-view.png` — `/admin/screenings` at a phone viewport; show practical filters and readable schedule rows.

## Safety checklist

- Capture only the application, not `.env.local`, source code, terminal output, Network panels, cookies, or browser storage.
- Hide real emails, Firebase identifiers, session cookies, database URLs, and service-account data.
- Confirm notifications contain only friendly errors.
- Crop browser chrome if it includes private profile information.
- Optimize PNG/WebP files before committing them.
