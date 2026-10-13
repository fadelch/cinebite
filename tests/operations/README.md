# Isolated operations tests

Prerequisites: Node 24.x, `npm ci`, local PostgreSQL 17 bound to **127.0.0.1:55414**, role `cinebite_test`, matching PG client tools (or set `OPS_PG_BIN`). Do not import `.env.local` or set any real provider credentials. Synthetic `demo-cinebite-phase22` Firebase and local DB identities are hard-coded and validated.

```powershell
npm run test:operations
node tests/operations/failure-gates.mjs
node tests/operations/guards.mjs
```

The DB driver applies the 21 existing migrations, creates a small two-tenant fixture, encrypts a real custom-format dump, restores to a fresh local target, compares all table row digests and tests financial/tenant constraints. It does not delete existing DBs. It refuses unrelated organization data. Both test database defaults and application adapter sessions are UTC; business UI timezone remains location-specific. GitHub CI uses PG17's own dump/restore tools inside its temporary service container.

The deliberate-failure driver runs actual invalid lint/type/test/build fixtures **only under ignored `.phase22-test`**, proving later deployment steps are not reached. These intentional failures are not failures in the app. The guard driver applies a fake production marker to otherwise synthetic configurations and proves seed/load/reset/payment-test entrypoints refuse before writes. No production endpoint is contacted.

## Full browser and release rehearsal

Use Firebase CLI **15.32.1**, Java 21 and Chrome. Configure no active real Firebase project. Start only demo Auth/Storage emulators:

```powershell
firebase emulators:start --only auth,storage --project demo-cinebite-phase22 --config tests/operations/emulators.json
node scripts/operations/ci-environment.mjs node_modules/next/dist/bin/next build
npm run test:operations:browser
node tests/operations/capture-evidence.mjs
```

For the local rollback fixture, first prepare an ignored detached worktree `.phase22-test/previous` at the reviewed known-good Phase 21 commit `aec3f50fb770fd3a756448aafec768bb7568c52b`. Install dependencies/generate Prisma there and build it using the synthetic environment wrapper. The actual local rehearsal used the old application's Webpack build because Turbopack refused a node_modules junction outside that worktree's filesystem root; the candidate was built with Turbopack. This is not a hosted artifact-promotion claim.

The browser driver owns port 3122, refuses an occupied port, starts production-mode test processes and tears down only its own processes. It creates emulator staff accounts, tests Secure host-only cookies and roles, health/readiness/built release, cron auth, job history, outbox deduplication, storage, mobile QR/cart/sandbox settlement, signed webhook deduplication, kitchen and delivery transitions, previous app rollback, candidate redeploy and missing-DB readiness refusal. It never changes live PSP state. Private keys are ephemeral test keys; cookies and QR credentials are excluded from logs and committed evidence.

Reports and synthetic encrypted dumps are ignored. The backup key is intentionally memory-only, so that artifact is not a permanent recoverable backup. Leave data retained for inspection unless an explicitly reviewed synthetic cleanup is requested. Do not use `DROP DATABASE ... FORCE` or kill unrelated apps.

## Hosted tests

Use [staging setup](../../docs/operations/STAGING_SETUP.md) and the [deployment checklist](../../docs/operations/DEPLOYMENT_CHECKLIST.md). Local PostgreSQL, emulator Storage, sandbox transactions and process rollback do not prove Neon PITR, real Firebase Auth/Storage, Vercel deployment/rollback, cron plan limits, physical-phone behavior or live-payment readiness.
