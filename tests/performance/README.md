# Phase 21 isolated performance harness

This is opt-in, not part of `npm test`. Never use production Neon, Firebase or payment credentials. `environment.ts` overrides application configuration with hard-coded loopback PostgreSQL port 55414, dedicated `cinebite_phase21_test` / `cinebite_phase21_baseline` databases, demo Firebase Auth 9144 and Storage 9198, a sandbox provider and ephemeral in-memory secrets. It never loads `.env.local`; Prisma CLI's existing dotenv configuration cannot override the supplied local `DIRECT_URL`.

## Prerequisites and execution

Use a separate PostgreSQL 17 test cluster owned by `cinebite_test` with `shared_preload_libraries=pg_stat_statements` and `pg_stat_statements.track=all`. Bind it to loopback only. Create the two named databases, apply repository migrations with their explicit local direct URL, and enable `CREATE EXTENSION pg_stat_statements`. Do not share this cluster with real data.

Start Firebase emulators with Java 21 and Firebase CLI, never a live project:

```powershell
firebase emulators:start --config tests/performance/emulators.json --project demo-cinebite-phase21 --only auth,storage
npm.cmd run build
npm.cmd run test:performance
```

The harness starts its own production Next server on loopback 3121, launches local Chrome (default Windows installation; override `CHROME_PATH`), executes actual authorized SQL/HTTP/browser workflows and closes the owned server/browser. It disables every created emulator staff account on normal/failure teardown. Auth emulator data is ephemeral. Never publish raw emulator logs or browser profiles.

For a repeat, stop the owned test server and explicitly replace **only** this synthetic database:

```powershell
npx.cmd tsx --conditions=react-server tests/performance/reset-local.ts --local --replace-synthetic-fixtures
npm.cmd run test:performance
npx.cmd tsx --conditions=react-server tests/performance/plans.ts --local
```

Reset validates the exact local database target and all organization slug namespaces. It refuses foreign organizations and never uses `DROP ... FORCE` or kills other clients. It deletes only prior Phase 21 synthetic fixtures, then applies migrations and the statistics extension. Those deleted fixtures are not recoverable, but their shape is regenerated. Preserve the recorded baseline database/artifact; do not pass `--baseline` to reset unless intentionally replacing your own baseline evidence.

## Before/after discipline

The committed baseline was captured from the unoptimized Phase 20 production build at main commit `55a426d`, before implementation, with the same initial fixture shape: 2 organizations, 3 locations/halls, 300 seats/sessions, 603 products, 6000 orders, 19200 status events, 5000 authorized notifications and 160 users. The optimized suite extends this **after** matched measurements with contention workers, 5000 CSV-only historical orders and 50/100/300-seat QR halls. Financial/operational DB guards stay enabled even during fixture generation.

To reproduce a baseline, use a separate checkout/build of that commit, the existing Phase 21 harness and `--local --baseline`. Do not overwrite this branch's production build or baseline evidence inadvertently. The historical baseline artifact predates the harness's intermediate HTTP-status accounting; each initial baseline operation made one HTTP request.

## Measurement semantics

`metrics.ts` measures logical workflow wall-clock P50/P95/P99, finite-cohort throughput, accepted responses, safe business conflicts, unexpected errors, response bytes and runner RSS delta. `httpRequests` and `httpResponseCodes` count every wire attempt, including bounded retries; `responseCodes` count final workflow outcomes. Checkout retries keep the exact idempotency key; webhook retries keep the exact event; kitchen retries remain bounded and retain expected state. Success does **not** imply first-attempt success.

Database call/time differences use local `pg_stat_statements`; sampling SQL is excluded. Fixture preparation is outside timed windows. Concurrent direct jobs/log formatting/image normalization are identified by zero HTTP requests. Outbox metrics report invocation throughput, not events/second; the report separately derives the lower bound for processed fixture events. RSS deltas include response buffering and garbage collection and are **not** server peak memory. There is no hosted CPU/pooler measurement.

Short read cohorts have 8 samples and initial mutations 5: P99 is effectively the maximum, not a reliable population percentile. Load cohorts are finite bursts, not sustained arrival-rate/soak tests. No extrapolated production promises are made.

`browser.ts` uses 390x844 DPR2 Chrome and CDP 150 ms / 1.6 Mbps down / 750 Kbps up, blocks external origins, performs actual QR entry/cart/checkout/signed sandbox settlement/progress, measures loaded decoded JS bytes and exercises the actual polling hook. It records no URLs, cookie/header values, bodies, HAR or QR images. Visibility events and failures are deterministic browser injections, not physical-phone or provider-network tests.

## Evidence and regression

Raw sanitized numeric artifacts are in `docs/performance/`. Final external-check evidence marks AQ only after the full regression succeeds; AS only after all eight PNGs are generated and reviewed. `capture-evidence.ts` renders real numeric results into seven clearly labeled evidence panels, not fake live app screens; image 08 is the real synthetic mobile app. No credentials, production infrastructure or private customer data are published.

```powershell
npm.cmd run test:performance:regression
npm.cmd run test:security
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run security:scan
```

Hosted staging/Neon/Vercel cold-start and sustained capacity, live provider/network outages, physical phones, image-heavy remote-media performance and true server peak memory remain explicitly NOT EXECUTABLE in this local environment. Phase 22 is not started.
