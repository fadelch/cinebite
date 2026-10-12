# Phase 19 verification

Current implementation was verified using isolated resources only. Main baseline `460bfa9` includes merged Phase 18 `976031b`. No production Neon/Firebase/Storage/provider connection or live email/monitoring delivery was used.

## Quality outcome

- Full automated suite: **553 tests passed, 67 files passed**.
- ESLint and TypeScript `--noEmit`: passed.
- Prisma validation and client generation: passed.
- All **19** migrations deployed successfully to a fresh local PostgreSQL database; final repeat deployment found no pending migrations and schema comparison found no drift.
- Production Next build: passed after correcting the customer outage presentation and preserving Next's request-time cookie control flow.
- Required A–AP matrix: **41 PASS, 0 FAIL, 1 NOT EXECUTABLE** (AI, optional tenant operational view not implemented).
- Additional actual reliability group: PASS.
- External production monitoring ingestion/delivery: NOT EXECUTABLE, no vendor installed/configured.
- Overall evidence: **42 PASS, 0 FAIL, 2 NOT EXECUTABLE**.
- Eight real app-only full-page DPR2 screenshots captured; native visual/privacy review performed before commit.

The current [machine-readable result](phase-19-integration-results.json) records the exact latest-run timestamp. These are executed assertions, not planned acceptance criteria.

## Individual executed results

| Case | Result | Actual evidence |
| --- | --- | --- |
| A | PASS | Actual HTTP response and structured server log share a server-generated request reference; untrusted upstream ID ignored. |
| B | PASS | Eight independent actual requests receive distinct cryptographic request IDs. |
| C | PASS | Actual logger serialization redacts all specified secret keys, including nested data. |
| D | PASS | Real customer API denial with a cookie present emits no raw session token. |
| E | PASS | Invalid real QR/session-start request is rejected without logging its credential. |
| F | PASS | Actual successful/invalid/failed webhook logs contain no provider/webhook secret. |
| G | PASS | Environment/database error fixture remains classified without logging database URLs or credentials. |
| H | PASS | Actual liveness returns minimal no-store status only, with no database/provider topology or expensive dependency work. |
| I | PASS | Actual isolated database shutdown leaves liveness responsive, readiness/API safely unavailable and production UI in a friendly recovery boundary without stack or false success. |
| J | PASS | Actual liveness returns minimal no-store status only, with no database/provider topology or expensive dependency work. |
| K | PASS | Authorized operational API measures real database probe latency without hostname or SQL. |
| L | PASS | Valid signed sandbox webhook is received, verified and processed, reflected in the authoritative event journal and scrubbed stage logs. |
| M | PASS | Invalid actual webhook signature is rejected and classified as a warning without raw payload or authentication material. |
| N | PASS | Actual duplicate webhook is classified as idempotent replay, with one journal row and no duplicate settlement. |
| O | PASS | Actual SQL-injected webhook failure rolls back settlement/journal changes and is visible as a safe operational incident; replay succeeds after fixture removal. |
| P | PASS | Actual sandbox refund failure persists FAILED, reuses cinema-scoped notifications/issues and is visible in the restricted operational queue. |
| Q | PASS | Actual aged pending outbox event increases pending count and degrades notification health at the configured threshold. |
| R | PASS | Actual aged pending outbox event increases pending count and degrades notification health at the configured threshold. |
| S | PASS | Actual failing notification adapter preserves the committed order, retains retry state and records a PARTIAL job with safe failure count. |
| T | PASS | Real authorized scheduled processor recovers the event and records correlated start/success/duration/processed counts; backlog becomes healthy. |
| U | PASS | Real authorized scheduled processor recovers the event and records correlated start/success/duration/processed counts; backlog becomes healthy. |
| V | PASS | Actual failing notification adapter preserves the committed order, retains retry state and records a PARTIAL job with safe failure count. |
| W | PASS | Concurrent actual processor runs use existing row locks/SKIP LOCKED and retain one notification per dedupe key. |
| X | PASS | Controlled actual checkout validation failure correlates response, request and checkout stage with safe code, without cookie/cart data. |
| Y | PASS | Actual last-stock concurrent checkout has one reservation winner; insufficient stock is a normal conflict warning, not catastrophic failure. |
| Z | PASS | Actual double kitchen acceptance has one winner and one ordinary 409 warning, not a critical platform exception. |
| AA | PASS | Two real delivery workers compete for one order; one succeeds and the other is a safe business conflict. |
| AB | PASS | Cross-location denial is safe and logged by code, without unauthorized tenant/entity details. |
| AC | PASS | Actual isolated database shutdown leaves liveness responsive, readiness/API safely unavailable and production UI in a friendly recovery boundary without stack or false success. |
| AD | PASS | Actual isolated database shutdown leaves liveness responsive, readiness/API safely unavailable and production UI in a friendly recovery boundary without stack or false success. |
| AE | PASS | Actual sandbox provider-create failure returns safe retryable 503 with durable pending order/reservation; same-key recovery reuses the order rather than charging twice. |
| AF | PASS | Actual failing notification adapter preserves the committed order, retains retry state and records a PARTIAL job with safe failure count. |
| AG | PASS | Both cinema admins are denied platform operations; verified Super Admin obtains the safe platform snapshot. |
| AH | PASS | Both cinema admins are denied platform operations; verified Super Admin obtains the safe platform snapshot. |
| AI | NOT EXECUTABLE | No optional Cinema Admin operational endpoint is implemented. Both tenants are denied the platform API/page; existing tenant financial views remain separately authorized. |
| AJ | PASS | Actual serialized logger rejects multiline event/operation injection and drops note content. |
| AK | PASS | Long malicious demo customer note is stored only as business data and absent from standard operational logs. |
| AL | PASS | Actual server telemetry includes explicit test environment and safe release label. |
| AM | PASS | Actual server telemetry includes explicit test environment and safe release label. |
| AN | PASS | Real 390x844 operations page has readable loaded cards and no horizontal overflow. |
| AO | PASS | Operational jobs/incidents persist in actual PostgreSQL; Phase 19 server modules contain no Firestore dependency/writes. |
| AP | PASS | Eight real high-density app-only full-page PNGs captured with synthetic operational records; application logs scanned against ephemeral credentials. |
| EXTRA_RELIABILITY | PASS | Actual incident deduplication/recovery and bounded telemetry retention passed without deleting orders; injected external tracking adapter receives only a scrubbed envelope and failure is isolated. |
| EXTERNAL_MONITORING | NOT EXECUTABLE | No external error/alert provider or production credentials are configured; only local JSON logs and an injected scrubbed-adapter failure were tested. No live ingestion/delivery claimed. |

Expected 400/401/403/409 and controlled 500/503 responses are assertions of correct rejection/degradation, not unresolved feasible failures. The tests restored isolated dependencies and removed their controlled triggers in finally blocks.

## Isolation and reproduction

The runner refuses to run without `--local`. Before client initialization it overrides database/provider environment with loopback test resources and a `demo-` project; it also verifies `current_database()` before creating fixtures. Keys, tokens, session cookies and job/provider secrets are generated ephemerally, never read from production config or printed.

Prerequisites: PostgreSQL 17 with local test role/database on dedicated port 55414; official Firebase Auth/Storage emulators; Java 21; installed dependencies; Chrome at its Windows standard path or supplied through `CHROME_PATH`.

Create the **test-only** database `cinebite_phase19_test` in your dedicated local instance, then:

```powershell
npm.cmd ci
$env:DATABASE_URL = "postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase19_test"
$env:DIRECT_URL = $env:DATABASE_URL
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run prisma:migrate:deploy
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run build
```

Start emulators separately:

```powershell
firebase.cmd emulators:start --only auth,storage --project demo-cinebite-phase19 --config scripts/phase-19-emulators.json
```

Then:

```powershell
npx.cmd tsx --conditions=react-server scripts/verify-phase-19.ts --local
```

Never add `--env-file=.env.local` to this runner. Never repurpose its guards for a hosted/production database. Build must finish successfully before verification because it uses the production `.next` output.

The actual runner starts Next at loopback port 3119, creates randomized fictional staff/cinema/seat/cart fixtures, obtains real emulator-backed Firebase staff cookies, performs actual signed sandbox payment/refund requests, and captures native browser pages. Secure-cookie API assertions explicitly send only legitimately issued test cookies; pages use the browser cookie jar.

Database-outage testing is intentionally Windows/workspace-specific: it validates the dedicated local cluster path before stopping/restarting it on port 55414. Use a disposable test cluster, not a shared production instance. The first startup attempt selected the default port, which could not bind; the dedicated test-port startup succeeded. No system database configuration was rewritten.

## Failure injection actually executed

- Webhook journal INSERT trigger raised a controlled SQL error in the isolated database. Settlement stayed consistent, transaction rollback left no false journal success, and safe incident/operation data was visible. Removing the trigger permitted the authenticated same-event retry.
- Sandbox provider creation INSERT trigger failed after a durable pending order/reservation. API returned retryable 503, not success; original checkout-key recovery reused that order/attempt.
- Actual concurrent last-stock checkouts produced one successful reservation and one ordinary conflict. Actual kitchen double Accept and two delivery workers produced one winner and one 409 each.
- A failing in-app notification adapter retained a due-retry outbox event and PARTIAL JobRun without reversing the paid order. Supported processing recovered it, and concurrent jobs retained unique recipient dedupe.
- The isolated PostgreSQL cluster was really stopped. Liveness stayed 200; readiness/customer API returned safe 503; production browser recovery showed no raw SQL/Prisma/local path. Restart restored readiness.
- Incident deduplication/recovery and 30-day terminal telemetry pruning were checked against real PG records; order counts were unchanged.
- An injected tracking adapter received only scrubbed data and its failure was isolated. It is not a configured production provider.

An initial harness helper passed relative request URLs to an API client without a base URL; this was corrected. Its incident fixture was also made unique per run so retained test history could not affect the dedupe assertion. Outage testing found broad customer catches that falsely presented database failure as session expiry; those were fixed and covered by regression tests. Next request-time cookie access remains outside that optional-data catch so framework prerender control flow is not swallowed. Feasible failures were corrected and the complete suite rerun.

## Privacy and native images

Only fictional `example.test` accounts, safe order/refund/request/job references and demo operational conditions appear. No real email/phone, raw log text, stack, database host, credential, provider payload or QR is displayed. Full-page native captures exclude taskbar/browser tabs/DevTools/editor/terminal. Desktop viewport is 1440 CSS pixels and mobile 390×844; DPR2 yields 2880px/780px original widths without post-capture upscaling.

The suite scans the application's collected output against ephemeral private keys, Auth/custom/session tokens, guest/QR credentials, provider/job secrets and customer notes. It writes only sanitized event summaries to ignored `.phase19-test` diagnostics and the safe case report to docs. Final staged review passed for 161 files: no private environment/test/browser artifacts, private key material, live database URLs or matching local server secrets were staged. The staged whitespace check passed. Hosting/framework/SDK/PostgreSQL logs require separate operator collection/privacy policy; no global log archive is claimed.

## Deployment boundary

The feature branch is committed/pushed only; the user merges. Deploy the additive migration through the reviewed direct-connection workflow before operations/jobs telemetry usage. Configure environment/release labels, thresholds and dedicated scheduler secrets server-side. Retain existing notification/payment recovery schedules and add the diagnostic-monitor schedule deliberately; no scheduler is automatically provisioned.

Public health probes are read-only with respect to audit/notification/incidents. PG is critical; external provider status is UNKNOWN without separate measurements. Non-critical telemetry/provider failures cannot overwrite financial truth. The monitoring job prunes only old terminal operational records, never business history.

No tenant infrastructure dashboard, external error SDK/DSN/pager delivery, full load testing, infrastructure scaling, new commerce/order/payment states, CI/CD, final penetration hardening or Phase 20 is implemented. See [architecture](phase-19-architecture.md), [runbook](operations/README.md) and [native gallery](../linkedin/phase-19/README.md).
