# Phase 9 Movies & Screenings manual test guide

Use a reviewed development/staging database. Apply committed migrations with `npm run prisma:migrate:deploy`; never reset production or use `prisma db push`. Keep `.env.local`, Neon URLs, Firebase Admin credentials, cookies, and tokens private.

## Setup

Prepare Organization A with active locations `Demo Beirut` (`Asia/Beirut`) and `Demo Dbayeh`, two active Halls at Beirut, an active Hall at Dbayeh, a Cinema Admin, a Beirut-only Location Manager, and Kitchen/Delivery users. Keep Organization B with its own Movie/Hall for tenant-isolation attempts.

## Movie catalog

1. As Cinema Admin, open `/admin/movies` and create `Interstellar`, slug `interstellar`, runtime `169`, language `English`, rating `PG-13`, and a safe JPEG/PNG/WebP poster.
2. Confirm poster normalization/delivery, searchable title/slug/language, status filter, runtime, and upcoming count.
3. Attempt the same slug in Organization A and expect `This movie slug is already in use.`
4. Verify the same slug can exist in Organization B.
5. Edit metadata, replace/remove the poster, disable and re-enable the Movie, and inspect corresponding AuditLog events.
6. As Location Manager, confirm Movie metadata/poster controls are read-only and direct mutations return `403`.
7. Reject runtime `0`, a decimal runtime, and values above `600`.

## Screening creation and timezone

1. Open `/admin/screenings/new`, select Demo Beirut → Hall 1 → Interstellar.
2. Enter local start `2026-10-05 20:30`; confirm the suggested end is `23:19` and the UI labels `Asia/Beirut`.
3. Create it, then verify schedule display converts the stored instant back to `20:30` Beirut time even from a browser configured to another timezone.
4. Create an overnight Screening and confirm the next-day end is explicit.
5. Try end equal to/before start and expect a friendly validation failure with no Screening/AuditLog.
6. In a DST-observing test Location, submit a nonexistent/ambiguous local time and expect rejection rather than silent shifting.

## Resource and tenant rules

1. Disable a Movie and confirm it cannot be selected/scheduled while historical Screenings remain readable.
2. Disable a Hall and Location in turn; direct creation requests must be rejected.
3. Submit Organization B Movie with Organization A Hall and vice versa; expect not found/denied with no relationship created.
4. As Beirut-only Location Manager, create/edit a Beirut Screening successfully and verify Dbayeh routes/API return `403`.
5. Verify Kitchen and Delivery users cannot access schedule administration.

## Overlap and concurrency

1. Create Hall 1 Screening A at `20:00–22:00`.
2. Try `21:00–23:00`, `19:00–21:00`, and `19:00–23:00` in Hall 1; each must return the friendly overlap conflict.
3. Create Hall 1 Screening B at exactly `22:00`; adjacency must succeed because intervals are `[start, end)`.
4. Create an overlapping time in Hall 2 and at Dbayeh; both must succeed.
5. Cancel Screening A, then schedule its old interval; the cancelled row must not block it.
6. Submit the same overlapping slot concurrently from two sessions; at most one commits because PostgreSQL enforces the exclusion constraint.

## Temporal state and editing

1. For a future Screening verify `Upcoming` and full editing.
2. At exactly `startsAt`, verify `Live now`; Movie/Hall/start/end fields must be locked while cancellation remains available.
3. Immediately before `endsAt`, state remains Live. At exactly `endsAt`, verify `Ended` and historical read-only behavior.
4. Cancel an upcoming/live Screening; verify `Cancelled`, preserved details, released slot, and audit event.
5. Verify cancelled Screenings never appear active and ended Screenings cannot be retroactively cancelled.

## Schedule and resolvers

1. On `/admin/screenings`, filter by date, Location, Hall, Movie, and state; verify bounded pagination.
2. Confirm Live Now, Upcoming Today, and Cancelled Today are real selected-location counts.
3. Exercise `getActiveScreeningForHall` in automated/internal testing at before/start/during/end boundaries.
4. Resolve Seat A7 using Hall + Seat compound identity during a live Screening; confirm safe Organization/Location/Hall/Seat/Screening/Movie context.
5. Test the same Seat with no live Screening, only a future Screening, and only a cancelled Screening; require `NO_ACTIVE_SCREENING` without guessing.

## Responsive, accessibility, and evidence

1. Test Movie cards, forms, schedule filters/rows, and Screening detail at desktop/tablet/phone widths.
2. Navigate with keyboard, verify labels/focus-visible styling, textual state labels, readable notifications, and reduced-motion behavior.
3. Capture only demo-data application screenshots using `linkedin/phase-9/README.md`; inspect every image for emails, IDs, cookies, URLs, credentials, terminals, or developer tools before staging.

## Audit and safety

Confirm `MOVIE_CREATED/UPDATED/ENABLED/DISABLED`, poster events, and `SCREENING_CREATED/UPDATED/CANCELLED` include safe IDs/times only. Verify no Movie/Screening Firestore writes exist. Run Prisma validation/generation, TypeScript, all tests, lint, and production build. Confirm `.env.local` and credentials are unstaged.

## Intentional limits

Phase 9 includes no QR generation/signing/verification, anonymous customer sessions, customer menu, cart, checkout, orders, inventory reservation/deduction, payments/refunds, kitchen/delivery queues, or ticket booking/sales/reservation.
