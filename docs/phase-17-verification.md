# Phase 17 — Executed verification and deployment

## Final executed result

Executed at 2026-10-06T13:44:05.463Z. All feasible requested A–AN checks: **38 PASS, 0 FAIL, 2 NOT EXECUTABLE**. Seven extra integration groups also passed (**45 PASS overall**, 2 NOT EXECUTABLE overall). No known feasible failing check remains.

| Check | Result |
| --- | --- |
| ESLint | PASS |
| TypeScript noEmit | PASS |
| Production Next.js build | PASS |
| Full Vitest suite | PASS — 461 tests / 56 files |
| Prisma validate / generate | PASS |
| New empty local DB: all 17 migrations | PASS |
| Repeat migrate deploy | PASS — no pending migrations |
| Local datasource-to-schema migration diff | PASS — no difference |
| Actual A–AN HTTP/domain/browser integration | 38 PASS / 0 FAIL / 2 NOT EXECUTABLE |
| Native full-page demo captures | 8 PNGs; mobile corrected and visually reviewed |
| Real external provider | NOT CONFIGURED |
| Production migration / production tests | NOT RUN; deliberately excluded |

Source evidence: [raw individual results](phase-17-integration-results.json), [executable local runner](../scripts/verify-phase-17.ts), [policy/validation tests](../src/lib/notifications/policy.test.ts), [62-topic architecture](phase-17-architecture.md).

## Every requested case

| Case | Final result | Actually executed evidence / reason |
| --- | --- | --- |
| A | PASS | Unpaid order emits no kitchen alert; verified signed sandbox payment makes it eligible and creates exactly one location-A kitchen notification. |
| B | PASS | Kitchen staff restricted to location B see no location-A new-order alert. |
| C | PASS | Duplicate signed payment webhooks and repeated processor calls do not duplicate NEW_ORDER. |
| D | PASS | Owning customer session receives one ACCEPTED update, including repeated processing. |
| E | PASS | Committed PREPARING transition produces customer preparation notification. |
| F | PASS | Committed READY transition produces customer's ready update. |
| G | PASS | Authorized location-A delivery staff receive one READY alert. |
| H | PASS | Location-B delivery staff see no location-A READY alert. |
| I | PASS | Actual atomic delivery claim emits customer's on-the-way message without staff personal data. |
| J | PASS | Assigned delivery completion emits delivered notification, without settlement claims. |
| K | PASS | Customer cancellation retains committed CANCELED state and emits private cancellation update. |
| L | PASS | Pending refund cancellation says processing, never falsely claims completion. |
| M | PASS | Verified sandbox refund success emits safe exact amount/currency customer notification. |
| N | PASS | FAILED refund alerts cinema admin and authorized manager; customer sees attention wording, not refunded or raw provider error. |
| O | PASS | Actual inventory transition IN_STOCK to LOW_STOCK creates one authorized manager alert. |
| P | PASS | Repeated real inventory/dashboard reads create no events or repeated low-stock alerts. |
| Q | PASS | Available zero stock produces stronger mandatory CRITICAL out-of-stock warning. |
| R | PASS | Restock above threshold creates one documented STOCK_RECOVERED informational-success alert. |
| S | PASS | Assigned worker issue alerts supervisors and leaves order/refund/inventory authority untouched. |
| T | PASS | Other cinema sees no tenant-A data; caller-supplied organizationId rejected by strict query validation. |
| U | PASS | Another user's notification cannot be marked read, even by a different cinema admin. |
| V | PASS | Read marking updates only readAt, decrements count once and is idempotent. |
| W | PASS | Mark-all affects only the authenticated user's authorized inbox. |
| X | PASS | Disabled PG user receives no actionable new alert and cannot retrieve their inbox. |
| Y | PASS | Valid session cannot retrieve another customer's order notifications. |
| Z | PASS | Public code without owning secure session is insufficient. |
| AA | PASS | Injected provider failure leaves verified payment/eligibility committed and persists safe bounded retry state. |
| AB | PASS | Due retry succeeds and subsequent processing produces exactly one alert. |
| AC | PASS | Four concurrent processors execute SKIP LOCKED claim/delivery with one committed notification. |
| AD | NOT EXECUTABLE | No approved external provider is configured. Real external-delivery failure test intentionally not executed. IN_APP failure injection exercised in AA. |
| AE | NOT EXECUTABLE | No external provider adapter/account configured; live external retries cannot be claimed. Bounded IN_APP fault retries independently executed below. |
| AF | PASS | Optional ORDERS disabled for kitchen is honored for the next eligible order, without hiding the work queue. |
| AG | PASS | Exception preference cannot be disabled; mandatory OUT_OF_STOCK bypasses disabled optional INVENTORY. |
| AH | PASS | Exactly three unread become exactly two when one is read. |
| AI | PASS | Stable createdAt/id pagination produces two bounded nonoverlapping pages, including timestamp ties. |
| AJ | PASS | Actual malicious inventory label is rendered as literal React-escaped text; script sentinel never executes. |
| AK | PASS | Deep link resolves to permission-checked existing order page; foreign tenant sees no order code. Arbitrary inbox target query rejected. |
| AL | PASS | 390px mobile inbox, admin bell panel and owning-customer progress load without horizontal page overflow; reduced motion used. |
| AM | PASS | New business data persisted in PostgreSQL; notification implementation contains no Firestore writes. |
| AN | PASS | Eight full-page native Chromium PNGs captured from real application UI with fictional isolated demo data, no browser or desktop chrome. |

## Additional executed groups

| Group | Final result | Evidence |
| --- | --- | --- |
| BOUNDED_IN_APP_RETRY | PASS | Five injected failures persist terminal FAILED; subsequent jobs do not retry; paid order unchanged. |
| EXTRA_SECURITY_ATOMICITY | PASS | Executed authenticated job/401, CSRF/403, strict read/preference injection/400, fresh location revoke, rollback no-outbox, expired customer session/401 and committed screening cancellation alerts without weakening canceled-screening session rules. |
| SAFE_AUDIT | PASS | Preference changes audited with category/boolean only; read operations do not flood audit; terminal delivered order unchanged. |
| PARTIAL_INSERT_RETRY | PASS | Provider throws after actual DB insertion; savepoint removes partial drafts, retry commits exactly one kitchen alert. |
| EXTRA_DATABASE_RECOVERY | PASS | An actual PostgreSQL division-by-zero abort within the provider is recovered by savepoint; durable retry persists and then sends once. |
| EXTRA_LEGACY_PAYMENT_FAILURE | PASS | Explicit historical legacy fixture becomes eligible without online payment; actual failed signed sandbox attempt privately alerts customer but never kitchen. |
| EXTRA_RETENTION | PASS | Bounded cleanup removes an actually expired notification and old processed outbox; all business order/status-event history is retained. |

AD/AE are specifically real **external** delivery checks. No configured approved vendor exists, so neither is mislabeled PASS. This is distinct from actually executed injected IN_APP failure/retry tests, including an adapter failure after real inserts and an actual PostgreSQL statement error. Those tests prove in-app transaction/retry behavior, not production vendor availability.

## Test isolation

Only local database `cinebite_phase17_test` at loopback port 55414 was created/migrated/written. The Firebase project is `demo-cinebite-phase17` with Auth emulator at 9144. Staff identities and demo sessions are synthetic. Sandbox payment/refund outcomes were verified through existing signature/provider paths; no card details, live money, real contacts or production provider account were used.

The runner requires `--local` and overwrites resource configuration with these isolated values before client initialization. Ephemeral RSA/job/webhook secrets are generated in memory. Never invoke it with `--env-file=.env.local`; never retarget it to Neon/cloud Firebase. Tests do not reset/delete any production data or rewrite prior migrations. Demo staff are disabled at teardown. Screenshots are native application page captures, not generated/mock UI.

## Reproduce safely

Use PostgreSQL 17 and a **separate local test cluster** on 127.0.0.1:55414, owned by `cinebite_test`. On a fresh machine, initialize a new ignored test data directory using initdb; do not reuse production paths. Local trust authentication is acceptable only for this isolated loopback cluster, never a deployed database. Stop unrelated listeners before binding the test ports.

In a test-only PowerShell terminal:

```powershell
# Assumes the separate local cluster is already running.
& 'C:\\Program Files\\PostgreSQL\\17\\bin\\createdb.exe' -h 127.0.0.1 -p 55414 -U cinebite_test cinebite_phase17_test
& 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe' -h 127.0.0.1 -p 55414 -U cinebite_test -d postgres -c "ALTER DATABASE cinebite_phase17_test SET timezone='UTC';"
$env:DATABASE_URL='postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase17_test'
$env:DIRECT_URL=$env:DATABASE_URL
npx.cmd prisma migrate deploy
npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

In a second terminal, start the emulator:

```powershell
npx.cmd firebase-tools@15.32.1 emulators:start --only auth --project demo-cinebite-phase17 --config scripts/phase-14-emulators.json
```

After the production build finishes (do not rebuild concurrently with the runner):

```powershell
npm.cmd run lint
npm.cmd test
npx.cmd tsc --noEmit
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run build
npx.cmd tsx --conditions=react-server scripts/verify-phase-17.ts --local
```

The runner starts its own Next production server on 3117, launches headless installed Chrome (override CHROME_PATH if needed), issues genuine emulator-backed staff cookies and secure synthetic customer-session cookies, exercises APIs, and shuts its app/browser down. It writes only the phase result JSON and eight full-page screenshots. Repeated runs add uniquely named isolated demo organizations; do not interpret test fixtures as production history. PNG files are overwritten with the latest real run. Visually inspect original files before publishing; the runner explicitly waits for loaded notification cards in the mobile capture.

## Harness issues found and fixed

An initial read test used a POST-only inventory endpoint as GET; it now reads the real protected inventory page. A mobile selector initially matched the hidden desktop bell; it now selects the visible bell. Visual review found the mobile image captured the loading skeleton; it now waits for actual center/cards. A run overlapped an in-progress build and the app failed to start; the final successful run followed completed build output. Final evidence supersedes incomplete attempts; these were not concealed as passing runs.

## Production deployment, after user review/merge

1. Apply the additive migration using the reviewed direct connection: `npm run prisma:migrate:deploy`. Never reset Neon or use destructive db push. Runtime should use the existing trusted owner role, or explicitly reviewed privileges on the new tables and event-emitter function if a separate runtime role is configured. The migration revokes PUBLIC execution of that emitter; no client/anonymous SQL role should receive it. The local test cluster uses its isolated owner role.
2. Configure `NOTIFICATION_JOB_SECRET` as a server-only random secret, 32–512 non-whitespace characters. Missing/invalid config disables processing only, not login or business operations.
3. Configure a trusted HTTPS scheduler to **POST** `/api/notifications/process` with an Authorization Bearer header. Do not put the secret into a URL, browser bundle, public variable or checked-in schedule. No production scheduler has been provisioned by this change.
4. Invoke regularly, initially every minute; measure volume and latency. Each call takes at most 25 due events and stops taking new work after 20 seconds; in-flight DB work is transaction-bounded to 15 seconds. The route advertises maxDuration=60 for platforms that honor it. No long-lived worker is required.
5. Monitor PENDING backlog/oldest due age, FAILED counts and authenticated job outcomes using operator PostgreSQL/hosting access. Terminal failure requires operator investigation; there is no automatic infinite replay or newly added remediation UI.
6. Retention cleanup is bounded to 1,000 expired messages and 1,000 old processed/failed unreferenced events per invocation. Domain/audit history remains untouched.
7. Run separate production smoke checks only with explicit user-approved test identities and scope; this local verification does not claim production deployment/migration has happened.

Polling alone does not deliver pending outbox events. Without the schedule, publication is durable but the inbox does not receive new rows. A one-minute processing cadence plus five-second visible-tab refresh is near-real-time polling, not instant push. Configure a shorter cadence only where the approved hosting scheduler supports it and measurements justify it.

## Security review

No notification-creation endpoint accepts a client event. Staff role/tenant/location/active-user scope is freshly resolved at publication and retrieval. Role-restricted historical alerts are hidden after role changes, and active location/current grants constrain reads/marking. Customer notification endpoints require valid current anonymous session plus exact order ownership. Known order code alone returns no private updates. Same-origin checks and 2KB body caps protect state-changing inbox/preference APIs. Strict schemas reject target/tenant injection. Job authentication is timing-safe and fails closed.

React text rendering escaped an actual malicious inventory label during Chrome verification; no script sentinel executed. Deep links use allowlisted internal destinations and the destination's existing authorization. DTOs omit raw payload, recipient/session identity and provider metadata. Safe error codes replace raw provider failures. Preference changes are audited; notification reads are not. Outbox publication rollback was verified inside an intentionally aborted business transaction. Cleanup preserved actual order/status-event history.

No external messaging, customer contacts, unsolicited notification permission, audio, marketing or Phase 18 changes are included.
