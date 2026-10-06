# Phase 16 verification

Executed October 6, 2026 on `phase-16-analytics-reporting`, based on merged main `1f2116c`. The Phase 15 commit `f82c432` is an ancestor. No phase merge or main push is part of this work.

## Final results

| Check | Executed result |
| --- | --- |
| ESLint | PASS — no errors/warnings |
| TypeScript `tsc --noEmit` | PASS |
| Optimized Next.js 16.3.8 build | PASS |
| Full offline Vitest suite | PASS — 455 tests in 55 files |
| Phase 16 offline tests | PASS — 43 meaningful cases |
| Prisma validate/generate | PASS — Prisma 7.10.0 |
| Fresh isolated migration deployment | PASS — 16 migrations |
| Isolated migration status/schema diff | PASS — up to date, no difference |
| Required integration A–AV | 47 PASS, 0 FAIL, 1 NOT EXECUTABLE |
| Additional integration cases | 3 PASS, 0 FAIL |
| All recorded integration cases | 50 PASS, 0 FAIL, 1 NOT EXECUTABLE |
| Native application captures | Nine full-page PNGs; reviewed at original resolution |
| Dependency audit | 17 inherited advisories: 15 high, 2 moderate; no Recharts advisory |

Case AN is conditional on an optional previous-period comparison UI. That UI was not implemented, so it is NOT EXECUTABLE, not falsely PASS. Its zero-baseline arithmetic is independently unit-tested. Detailed executed evidence for **every** A–AV case and the extras is in [phase-16-integration-results.json](phase-16-integration-results.json). Formulas, architecture, alternatives and limitations cover all 66 requested topics in [phase-16-architecture.md](phase-16-architecture.md).

## Isolation and actual execution

`scripts/verify-phase-16.ts --local` requires an explicit local flag and overwrites database/Auth settings with dedicated test resources. It does not load `.env.local` into its process. Test resources are PostgreSQL 17 on loopback 55414/database `cinebite_phase16_test`, Firebase Auth emulator 9144/project `demo-cinebite-phase16`, optimized Next on 3116 and native Chromium. Private emulator signing material is generated in memory. Auth sessions exercise real application routes and freshly loaded PostgreSQL permissions. All fictional staff use example.com; the runner disables its identities on exit. It retains only its local fixture business records for evidence, and closes its owned Next/Chromium processes.

No production Neon/Firebase database, real payment provider, actual charge/refund, existing customer session or actual private financial dataset is modified. The Next build can read normal local build settings, but integration runtime authority is overridden to the isolated resources. Production was **not migrated**. Local database snapshots/cookies/private material are ignored, not committed.

## Verified domain behavior

Actual SQL records demonstrate captures 10+20=30, successful refund5, net25 and AOV15; failed100/pending100/failed7/processing2 are excluded. Duplicate failed payment attempts do not inflate money or counts. Historical item snapshots 2×5+3×6 yield five popcorn units and exact gross28. USD and LBP never combine. Movie, screening and location attribution remains distinct after current entity renames/inactivation.

The fulfilled test order has six-minute preparation, four-minute delivery and eleven-minute total fulfillment. Missing/negative timelines are excluded with sample counts. Inventory reports distinguish consumption300GRAM, waste50GRAM and reserved-aware current low stock. Unpaid cancellation has no captured revenue; a captured/refunded cancellation reports gross10/refunds10/net0. A successful refund does not turn a delivered order into canceled.

Real records immediately before, at and after Beirut midnight verify half-open, nonoverlapping adjacent periods. Deterministic date tests also execute Beirut's 25-hour October 24 and 23-hour March 29 calendar days. Incorrect dates, reversed/overlong ranges, invalid timezone, SQL-looking sort and repeated query filters return safe400 responses.

Manager location and foreign organization tampering fail; all eleven reports stay within the manager's grant. Kitchen/Delivery return403 and anonymous401. CSV uses the same scope, matches exact data/filename and neutralizes an actually persisted `=2+2` name. Foreign-Origin requests return403, oversized body413, invalid JSON400 and anonymous export401. The sixth export succeeds and seventh is429 in the tested fixed-minute window. Exporting records no ordinary dashboard-read audit noise.

## Performance and pagination

The final runner created an extra 1,000 persisted Orders, Payments and OrderItems, then queried the actual HTTP product report in **39.0 ms** end-to-end locally. Its assertion verified the aggregate contains those records and stayed under the 12-second query bound. Query count is constant per report, verified by repository structure; no per-order lookup loop exists. Server pagination returned all selected public order codes once, without missing or duplicate page records.

This is a local, warm, modest-size regression check — not a production Neon benchmark or a load/concurrency SLA. Existing scope/event/item indexes plus the two settled-money indexes support report predicates. Production cardinality, pooling and latency must be measured before adding rollups, deeper cursors or a warehouse.

## Failures found, corrected and rerun

Early runs exposed a reserved SQL alias (`day`), which is now quoted; a test cluster's inherited non-UTC timezone, corrected specifically for the isolated database; and inconsistent decimal strings, normalized to exact two/three-decimal DTO values. Test fixture relation setup was corrected to create User, Membership and LocationAccess according to Prisma's actual relation contract. The throttle fixture now starts its own fixed-minute counter and executes six successful requests before checking the seventh.

Original screenshot review exposed an undefined input styling class and overly dense operational presentation. Existing `cb-field` styles now provide readable 44-pixel controls, operations has summary cards, and server-derived trends include empty calendar days without invented activity. All native screenshots were regenerated after these changes. Final integration has no feasible failing case; errors were fixed in code, not hidden with image edits.

## Visual/security review

[Nine LinkedIn images](../linkedin/phase-16/README.md) show complete native app pages at 1440-pixel desktop width and actual 390×844 mobile. Tablet820×1180 and mobile have no horizontal document overflow; dense tables scroll inside their containers. At original resolution the captures are sharp, include real rows, and contain no runtime error/warning banners. Long full-page screenshots intentionally retain content; there is no desktop, address bar, DevTools, editor, terminal, OS notification, masking, stretching, AI generation or retouching.

All visible monetary data are fictional local SQL fixtures. No actual customer/staff data, database connection string, Firebase private key, provider token, guest/QR credential or cookie appears. Existing-phase images are unchanged. Application exports whitelist report columns, bind filters as SQL parameters, enforce fresh membership/location scope and keep currencies independent. Errors expose domain messages, never database traces. Firestore is absent from the reporting service/repository.

`npm audit` identifies 17 vulnerable package entries already present in the merged Phase 15 lockfile (including Firebase/Firestore, grpc, Prisma/tooling and Next lint dependencies). Recharts is not named. Several suggested fixes are major-version downgrades; no forced `audit fix` was applied to break the existing stack. This is a disclosed pre-existing dependency-review task, not a claim of a vulnerability-free deployment.

## Reproducing the isolated run

Prerequisites: PostgreSQL17 tools, Node/npm, installed dependencies, native Chrome (or set `CHROME_PATH`), and available loopback ports 55414/9144/3116/4444/4544. Use a **dedicated** disposable/test cluster and test-only Auth emulator, never a production Neon connection or Firebase project. The example assumes PostgreSQL tools are on PATH; it is for a new test cluster, not an instruction to reset an existing database.

```powershell
# New dedicated local cluster only; loopback trust is for test fixtures, not production.
initdb -D .phase16-test/pgdata -U cinebite_test --auth=trust --encoding=UTF8
pg_ctl -D .phase16-test/pgdata -l .phase16-test/postgres.log -o "-h 127.0.0.1 -p 55414" start
createdb -h 127.0.0.1 -p 55414 -U cinebite_test cinebite_phase16_test
psql -h 127.0.0.1 -p 55414 -U cinebite_test -d postgres -c "ALTER DATABASE cinebite_phase16_test SET timezone='UTC'"

# Explicit override prevents Prisma config from selecting a real direct connection.
$env:DIRECT_URL = 'postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase16_test'
npm.cmd run prisma:generate
npx.cmd prisma migrate deploy
npm.cmd run build

# Separate terminal: start only demo Auth, not Firestore/payment providers.
npx.cmd firebase-tools@15.32.1 emulators:start --only auth --project demo-cinebite-phase16 --config scripts/phase-14-emulators.json

# Application runner creates fictional records, executes HTTP/browser checks and captures PNGs.
npx.cmd tsx --conditions=react-server scripts/verify-phase-16.ts --local
```

Do not add `--env-file=.env.local` to the runner. Do not point this fixture tool at hosted resources. If fixtures/services cannot be started, report the unexecuted cases accurately rather than inferring PASS. Stop only the test services you started when finished; no production database reset, branch deletion or main merge belongs to this procedure.

## Deployment and Git boundaries

After user review/merge, deploy `20261006160000_phase_16_analytics_reporting` through the reviewed direct database connection before running the updated application. Otherwise export can fail because its audit enum/counter table is missing. Production analytics will reflect actual existing orders/payments/refunds — test fixtures are not installed into production. The existing sandbox-only financial policy remains unchanged.

The staged file list and added text are scanned against actual local server secrets without printing them. Environment files, generated Prisma files, test clusters, browser profiles and debug artifacts remain ignored. The only permitted Phase 16 LinkedIn artifacts are the nine PNGs and their README. Commit and branch push are separate from merging; the user retains PR review/merge authority. No Phase 17 implementation is included.
