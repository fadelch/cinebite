# Phase 22 — production operations

Implementation branch: `phase-22-production-operations`. Base main commit: `aec3f50fb770fd3a756448aafec768bb7568c52b`, containing merged Phase 21. No merge or production deployment was performed. Phase 23 is not started. **Production launch: NO-GO.**

## Result and scope

CI, guarded environment configuration/migrations, manual staged acceptance, release/migration readiness, cron adapters, local deployment smoke, encrypted synthetic backup/restore, app rollback/redeploy, failure gates, production-marker refusal checks and runbooks are implemented. All feasible local operations were actually exercised, not marked successful from documentation alone.

The only newly created external resource is the free Firebase project `cinebite-staging-20261013` and its registered web app, explicitly approved by the user. CLI/API verification confirmed project access and billing disabled. Its Auth initialization API refused with `BILLING_NOT_ENABLED`; Auth is not operational. Storage was not provisioned. No Neon staging DB or Vercel deployment exists/was verified, and no staging application URL is claimed. Public SDK configuration is local in ignored `ops-private/firebase-staging-web.json`; no Admin key was generated. [Exact remaining setup](STAGING_SETUP.md).

## Architecture and files

```text
src/lib/operations/environment.ts
  ├─ next.config.ts + server env: pinned runtime/build identities
  ├─ migration/preflight CLI: explicit selected environment
  └─ seed/reset/load/test entrypoints: refuse production before fixture writes
src/lib/operations/migrations.json
  ├─ preflight: committed SQL SHA-256 drift check
  └─ migrationReadiness: deployed schema/checksum/unfinished-migration check
GET /api/cron/[job]
  └─ bearer auth → isolation validation → fixed internal POST → existing observed job
GET /api/super-admin/release
  └─ fresh platform authorization → safe built SHA/environment/migration status
.github/workflows/
  ├─ CI: quality + isolated PostgreSQL recovery → fail-closed required check
  └─ manual staging acceptance: trusted main + protected staging → read-only smoke
tests/operations/
  ├─ run.ts: migrate → synthetic data → encrypted dump → separate restore → invariants
  ├─ browser.ts: auth/mobile/payment/jobs → app rollback → redeploy → DB outage
  ├─ failure-gates.mjs: real invalid-tool fixtures block progression
  └─ guards.mjs: fake production marker refuses test writes
```

No production migration, seed, automatic scheduler activation, live PSP adapter or Firestore business write was added. Runtime and direct DB connections are intentionally different endpoints of the **same** environment database, not a fallback between environments.

## Executed local evidence

- Clean `npm ci` regenerated Prisma from the reviewed lockfile; Node 24.x is pinned in `.nvmrc` and package engines.
- Full suite: 654 tests across 75 files; security suite 34 tests; performance regression 11 tests. Final branch quality output is authoritative if counts change.
- Lint, TypeScript, Prisma validation/generation and Next production build passed locally using synthetic settings. Both workflow YAMLs were validated with checksum-verified official actionlint 1.7.12; Actions references were resolved to official tag SHAs.
- Actual intentional failure exits: lint 1, typecheck 2, tests 1, build 1; invalid Prisma schema and copied-migration checksum drift also failed preflight. Subsequent deployment marker never ran.
- Actual seed, reset, load, operations and legacy payment-test entrypoints refused a fake production marker before fixture writes.
- PostgreSQL 17 applied all 21 committed migrations to an empty loopback test DB. Real custom-format dump encrypted with AES-256-GCM, decrypted in memory and restored to a fresh isolated DB. 42 tables' counts and row digests matched; financial and foreign-key rejection tests passed. Failed transactional DDL left no table. Initial clean-drill dump/restore measurements: 478 ms / 1620 ms, 184676 encrypted bytes. Final repeated drill with browser-created synthetic records: 278 ms / 1265 ms, 191937 bytes. These are local samples, not provider RPO/RTO claims.
- Actual four-role emulator staff login and Secure host-only session-cookie checks, authenticated release smoke, role authorization, three authenticated cron jobs, notification delivery/deduplication, normalized image upload in emulator storage, mobile QR → menu → cart → sandbox verified settlement, signed duplicate webhooks, kitchen transitions and delivery completion were exercised. The storage control namespace remained empty.
- The previous actual Phase 21 app was built from the detached base commit, started on the same DB, and passed readiness/admin reads; the new release API was absent. The candidate was redeployed and its release API returned. No DB downgrade occurred. The old worktree used Webpack due to Turbopack's junction boundary; the candidate used Turbopack.
- An unavailable local test DB returned readiness 503; smoke exited nonzero. Health remained liveness-only. Owned server cleanup and occupied-port refusal prevent accidentally probing another app.
- Runtime audit: zero vulnerabilities. Full audit: five existing high-severity dev/tooling findings in the Next ESLint → fast-glob → micromatch → braces chain. No forced dependency downgrade or unrelated framework upgrade was performed. This is not a clean full audit; tooling risk needs owner review before release.
- Git tree/history/browser-asset and staged secret scans are required before push. Eight DPR2 images were visually reviewed; private synthetic account IDs are redacted to a demo alias. No usable QR/cookie/key, backup content, credential URL or real customer data is included.

The local PostgreSQL timezone issue discovered during acceptance was fixed by explicitly requesting UTC adapter sessions. Database defaults and operator test connections also use UTC. Location-specific UI timezones remain unchanged. Initial failed harness fixtures were retained in renamed local test databases, not deleted; later correct runs passed. No production state was involved.

The first actual GitHub run passed isolated database recovery but correctly failed quality on a clean checkout: generated `RouteContext`/`LayoutProps` were absent before type checking. The pipeline now explicitly runs `next typegen` before `tsc`, as documented by the installed Next.js CLI. Generated types are not committed or copied from a developer cache. The required aggregate correctly refused that initial failure; final remote results must be checked on the follow-up commit.

## Mandatory A–AL matrix

PASS means the stated local check actually ran. Hosted-specific tests remain NOT EXECUTABLE even when their local equivalent passed. Remote GitHub job results are separate from local/actionlint validation and should be read on the pushed commit; they are not invented here.

| Test                         | Status                | Evidence / boundary                                                                                                                      |
| ---------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A CI lint                    | PASS locally          | Real invalid lint fixture blocked gate; app lint passed. Remote CI separately reported.                                                  |
| B TypeScript                 | PASS locally          | Real type error exited 2 and blocked progression; app types passed.                                                                      |
| C Required tests             | PASS locally          | Real failing test blocked gate; full app suite passed.                                                                                   |
| D Build                      | PASS locally          | Real syntax-invalid Next app failed build and blocked progression; candidate build passed.                                               |
| E Prisma                     | PASS                  | Schema validation and generation actually executed.                                                                                      |
| F Test DB migration          | PASS                  | 21 migrations on fresh PostgreSQL 17; checksum readiness verified.                                                                       |
| G Staging vs production DB   | NOT EXECUTABLE        | No hosted staging DB/access. Local pin rejection and two-tenant controls passed; production was not queried.                             |
| H Staging payment sandbox    | NOT EXECUTABLE hosted | Local explicit sandbox checkout/settlement passed; no staged app exists.                                                                 |
| I Staging recipients         | NOT EXECUTABLE hosted | Local in-app notifications went only to synthetic emulator/DB identities; no staging deployment to inspect.                              |
| J Preview secrets            | NOT EXECUTABLE hosted | Vercel settings inaccessible. PR CI has no provider/production secrets and readonly permissions.                                         |
| K Staging deployment         | NOT EXECUTABLE        | No Vercel/Neon access or operational Auth/Storage.                                                                                       |
| L Staging health             | NOT EXECUTABLE hosted | Actual local health/readiness passed; no staging origin exists.                                                                          |
| M Staging smoke              | NOT EXECUTABLE hosted | Authenticated local smoke passed; manual staged acceptance is prepared, not run.                                                         |
| N App rollback               | NOT EXECUTABLE hosted | Actual local candidate → previous built app passed against unchanged DB. No Vercel rollback claimed.                                     |
| O Redeploy                   | NOT EXECUTABLE hosted | Actual local candidate redeploy/release check passed.                                                                                    |
| P Provider backup/PITR       | NOT EXECUTABLE        | No Neon project settings/retained recovery points available to verify.                                                                   |
| Q Isolated restore           | PASS locally          | Real encrypted synthetic dump restored into a new DB. No source overwrite.                                                               |
| R Restore integrity          | PASS locally          | 42 table digests/counts, migrations, constraints, financial/FK checks.                                                                   |
| S Reset guard                | PASS                  | Actual reset command refused fake production classification before writes.                                                               |
| T Load guard                 | PASS                  | Actual performance command refused fake production before overrides.                                                                     |
| U Payment-test guard         | PASS                  | Actual legacy payment harness refused; production sandbox activation fails closed.                                                       |
| V Staging QR                 | NOT EXECUTABLE hosted | No staged origin; local QR entry and pinned origin policy tested without publishing credentials.                                         |
| W Staging Storage            | NOT EXECUTABLE hosted | Blaze not approved/provisioned. Normalized emulator image upload and empty control namespace passed.                                     |
| X Cron authentication        | PASS locally          | No bearer → 401; authenticated native adapters executed existing jobs.                                                                   |
| Y Staging cron               | NOT EXECUTABLE hosted | All three local jobs/history passed. Native schedule remains disabled by configuration.                                                  |
| Z Staging webhook isolation  | NOT EXECUTABLE hosted | Local signed duplicate sandbox events settled once; no live PSP/production access.                                                       |
| AA Hosted cookies            | NOT EXECUTABLE hosted | Local actual cookies Secure/HttpOnly/host-only; Firebase project drift refused by policy. Distinct hosted origins absent.                |
| AB Deployed reviewed SHA     | NOT EXECUTABLE hosted | Local synthetic built-label expectation passed; previous app actual base SHA recorded. Hosted reviewed artifact missing.                 |
| AC Secret scan               | PASS locally          | Tree/history/staged/browser assets scanned without printing values.                                                                      |
| AD Client bundle             | PASS locally          | Production-mode synthetic build scanner excludes private env names/material; only public Firebase config and safe release label exposed. |
| AE Runbooks                  | PASS locally          | Documented local install/migration/recovery/smoke commands executed. Hosted steps explicitly await setup/approval.                       |
| AF DB outage release         | PASS locally          | Missing DB → ready 503 → nonzero smoke; no healthy promotion.                                                                            |
| AG Jobs after staging deploy | NOT EXECUTABLE hosted | Actual local post-start job runs succeeded; no hosted deployment/scheduler.                                                              |
| AH Webhooks after deploy     | NOT EXECUTABLE hosted | Actual local signed sandbox processing passed; hosted provider verification unavailable.                                                 |
| AI Outbox after deploy       | NOT EXECUTABLE hosted | Actual local delivery/deduplication passed; hosted deployment unavailable.                                                               |
| AJ Mobile staging read       | NOT EXECUTABLE hosted | 390px DPR2 local browser completed ordering/settlement; real staging/phone acceptance remains.                                           |
| AK Firestore                 | PASS                  | Source search: only the pre-existing one-time migration reads Firestore; business data and new workflows remain PostgreSQL.              |
| AL Images                    | PASS                  | Eight actual local/evidence captures, visually reviewed, safe and labeled with scope.                                                    |

## Detailed walkthrough (the 89 requested topics)

1. **Phase 21:** Measured secured flows with synthetic load, batched menu/cart stock queries, bounded pools/image/job work and reduced unchanged polling without caching authority or financial state. Phase 22 preserves those boundaries.
2. **Objective:** Make releases observable, repeatable and recoverable; not add customer features or declare launch readiness from local tests.
3. **Environment architecture:** An operator-pinned registry binds environment to DB host/name, Firebase project/bucket, origin and hosted web-app/project fingerprints. Classification is separate from Node's build mode.
4. **Development:** Existing local setup remains usable; `npm dev` no longer writes demo data automatically. Explicit classified configuration gets validated; seeds require a confirmed synthetic local target.
5. **Staging:** Separate resources, HTTPS, sandbox/in-app only, test accounts and operator-controlled credentials. The staged Vercel project's Production slot is still classified staging.
6. **Production:** Separate pins/credentials; no emulator settings or sandbox-as-live. Payments remain disabled and launch blocked until a verified real adapter exists.
7. **DB isolation:** The pooled and direct URLs must refer to one pinned environment DB. Staging cannot reuse protected existing resources. No production data was forked into staging.
8. **Firebase isolation:** Public and Admin project IDs, service-account project suffix and buckets agree. Hosted auth domain/app ID/API-key fingerprint are pinned, not copied from development.
9. **Payments:** Only the existing sandbox adapter is installed. It cannot take real card details or perform real charges; production deliberately refuses it as a live provider.
10. **Notifications:** Existing in-app delivery uses scoped PostgreSQL recipients. No external mail/SMS/push adapter or production-recipient import was introduced.
11. **Env policy:** Document names/defaults in `.env.example`; store actual values in ignored local files/provider stores. Public build config freezes at build time; server config is never named `NEXT_PUBLIC_*`.
12. **Secret management:** Separate ownership and least privilege per environment. Backups, env files, keys, session cookies and provider tokens are ignored/restricted, not portfolio artifacts.
13. **Rotation:** Prepare replacement, propagate/redeploy, verify intended environment, then revoke old credentials with owner approval. No unapproved production key was revoked here.
14. **Git:** Main was fast-forwarded only after cleanliness/Phase 21 ancestry checks. Work stays on the Phase 22 branch, with user review/merge; no automatic main push/merge.
15. **CI:** Readonly PR/push checks run lint/types/tests/Prisma/build/scan plus isolated recovery and runtime audit. A required aggregate fails on failed/cancelled prerequisites.
16. **Install:** `npm ci` actually succeeded from the lockfile, including Prisma generation. No dependency version upgrade was needed for Phase 22.
17. **Node:** Supported 24.x is recorded in engines and `.nvmrc`, selected by CI and required for Vercel. Provider-supported patched versions should be kept current through reviewed maintenance.
18. **Caching:** npm download cache only. Avoid reusing environment-specific `.next` bundles, private env or backup artifacts across trust boundaries.
19. **Test DB:** PG17 loopback cluster, fixed synthetic role/source name, newly created recovery target and no real connection strings. CI uses an ephemeral service container.
20. **Firebase CI:** Ordinary tests use mocks; no hosted Firebase credentials. Real Auth/Storage emulator/browser acceptance was run locally, explicitly demo-prefixed; no fake claim it ran as a GitHub browser job.
21. **Payment tests:** Explicit opt-in sandbox and generated test data, verified success webhook/deduplication, stock and fulfillment guards. Production-marked test entrypoints refused.
22. **Security CI:** Existing 34 security tests remain in the full gate. Runtime high/critical audit findings block CI; five inherited dev-chain findings remain disclosed for review.
23. **Secret scan:** Covers tracked source/history plus browser assets; staged review adds new files before push. Scanner reports filenames/categories, never matched credentials.
24. **Migration validation:** Reviewed SQL manifests carry SHA-256 checksums; preflight catches drift. Runtime rejects missing/mismatched/unfinished history without exposing schema details publicly.
25. **Preview safety:** Never supply production secrets or shared write credentials to untrusted PR builds. Actual Vercel preview settings must still be configured/verified; code review alone is not evidence of provider isolation.
26. **Staging deployment:** Prepared Vercel config runs preflight/build, not migration/seed. Actual deployment awaits Vercel/Neon access and operational Firebase services.
27. **Production deployment:** Prepared manual procedure only, distinct build/public config and human approval. No automatic production deploy or live-resource modification exists in this phase.
28. **Approval:** GitHub required reviews/protected environments and provider access settings are owner configuration. The manual staged acceptance runs only trusted main; production is not a workflow target.
29. **Migrate deploy:** Wrapper requires matching environment and pinned resources; production additionally requires explicit SHA approval and backup evidence reference. It never performs reset/dev/db-push.
30. **URLs:** Pooled runtime URL for application concurrency; direct URL for migrations, same canonical host/database identity. Prisma no longer silently discovers `.env.local`.
31. **Ordering:** Apply committed migrations in order on the correct direct connection before starting a schema-dependent app. Build/start do not invoke migrations.
32. **Compatibility:** Expand first, bounded backfill separately, contract later after previous builds stop depending on old fields. Finished additive extra migrations can coexist with an older app's readiness manifest.
33. **Destructive changes:** Review data impact, backups/restore evidence, rollback compatibility and explicit owner approval before any destructive SQL. No destructive migration was added.
34. **Backup strategy:** Verify actual Neon retention plus managed encrypted snapshots where approved. Restricted recoverable key management is necessary for real backups; local ephemeral encryption is rehearsal only.
35. **Verification:** Actual local encrypted dump/restore verified. Provider restore-point existence/retention is NOT EXECUTABLE without access; no advertised plan window is treated as evidence.
36. **Restore:** Restore to a new isolated target, stop on error, never overwrite the source/production. Recovered services remain isolated until approved reconciliation and smoke.
37. **Validation:** Count/digest every public table; verify migration history, FK/tenant/financial constraints and representative money links. Real recovery additionally reconciles external provider/identity/media state.
38. **RPO:** Proposed ≤15 minutes needs approval, plan support and measurement. A quiescent matching local snapshot does not establish production RPO.
39. **RTO:** Proposed ≤60 minutes includes detection, decisions, provisioning, restore, reconciliation and switching. Local 1.62-second restore is not an operational SLA.
40. **App rollback:** Restart a retained known-good app against compatible existing schema, then smoke. Local rollback actually ran; Vercel rollback did not.
41. **DB difference:** An app rollback does not undo data, charges, refunds or media. Rewinding a live DB can lose valid orders and replay irreversible external effects.
42. **Forward fix:** Investigate partial DDL/provider state, then ship a reviewed corrective migration/release. Never mark failed migrations successful merely to obtain green CI.
43. **Failed deploy:** Freeze promotion, identify safe SHA/deployment evidence, revert compatible app if warranted and reconcile dependencies. No automatic fallback to another environment's DB.
44. **Partial deploy:** Leave compatible additive schema in place, verify old/new builds and secrets/jobs. Restore is a separate approved data operation, not a routine deploy toggle.
45. **Jobs:** Existing notification/payment-recovery/monitor POST handlers remain; native Vercel GET adapters reuse them directly. No network proxy or duplicated business implementation.
46. **Cron auth:** Constant-time bearer check, secret length/uniqueness checks, pinned environment and explicit native scheduling mode. No user-agent-as-auth; unauthenticated local calls returned 401.
47. **Monitoring:** Existing bounded `JobRun`, outbox and incident DTOs were verified after actual local invocations. A deployed route alone is not a provisioned scheduler.
48. **Webhooks:** Sandbox signature/auth verification and duplicate event behavior passed locally. Real provider endpoint/secrets/events remain unconfigured; production launch cannot rely on sandbox evidence.
49. **Firebase production:** Future production uses its own Admin/web credentials, authenticated domains and reviewed roles. No existing production settings were changed or copied into staging.
50. **Storage:** Staging requires its own actual bucket and approved billing. Local normalized image and separate empty emulator namespace proved local isolation, not hosted bucket existence.
51. **QR:** Server-generated URLs use pinned environment origin. Active credentials are never in evidence. Local seat entry worked; actual staged QR/phone verification needs a real origin.
52. **HTTPS/domain:** Hosted origin must be exact HTTPS, no credentials/path/trailing slash. Domain is allocated/verified by Vercel; no invented staged URL or DNS change.
53. **Checklist:** Explicit unchecked gates cover resources, migrations, backups, smoke, scheduler, rollback, owners and live-payment readiness. Documentation does not automatically check them off.
54. **Drift:** Wrong DB/Firebase/bucket/app/origin/Vercel/release settings fail safe. Registry edits remain trusted operator configuration, so access/review of the registry matters.
55. **Release ID:** Safe SHA is baked into build and authenticated metadata, matching runtime/Vercel SHA when hosted. Local rehearsal's synthetic label is explicitly not proof of a reviewed hosted commit.
56. **Release notes:** Record commit, migration count, checks, private backup reference, approvals, known gaps and rollback target. Never include credentials or signed access links.
57. **Smoke:** Read-only no-redirect health/ready/login and optional authenticated release metadata. Full local browser suite adds controlled sandbox operations; hosted scripts do not write business fixtures.
58. **Production smoke:** Read-only only under an approved release operator process; no load/reset/real charge/refund or customer-seeding experiments. No production smoke was run here.
59. **Health window:** Staff a defined interval with measured baseline thresholds and incident owner. Suggested 30 minutes is a planning value, not a validated hosted acceptance result.
60. **Triggers:** Wrong release/environment, readiness/5xx/auth failures, financial discrepancy, stale jobs or growing outbox halt promotion and trigger owner investigation.
61. **Runbook:** Production procedures link deployment, recovery and rotation guides, distinguish metadata evidence from secrets and prohibit inventing financial truth.
62. **Checklist flow:** Check preflight, exact CI commit, backup evidence, additive migration, separate build, authenticated smoke and observation before any future approval.
63. **Recovery runbook:** Includes source/target approval, encrypted/PITR restoration, invariants, external reconciliation, timings and private evidence retention.
64. **Rotation runbook:** Covers DB/Admin/job/PSP/rate-limit credentials and staged propagation/revocation. No automatic dual-secret grace window is claimed.
65. **Staging data:** Synthetic accounts/orders/media only; never fork identifiable production customer/staff/payment data into ordinary staging.
66. **Seeds:** Removed implicit dev seed; explicit safe-target and confirmation required. Test fixtures use their own hard-coded local registry and are not a hosted staging seed shortcut.
67. **Guards:** Production markers are checked before test overrides; fixture helpers require local/demo resources, and runtime/build hosted pins fail closed.
68. **Load guard:** Actual performance invocation with fake production marker refused. No hosted or production load test was run.
69. **Reset guard:** Actual Phase 21 reset command refused fake production classification before deletes. Recovery never force-drops a DB or kills unrelated processes.
70. **Sandbox guard:** Production payment config refuses sandbox activation; a real PSP implementation/verification remains an explicit launch prerequisite.
71. **Firebase test guard:** Test classification demands demo project and loopback emulator hosts. Hosted environments reject emulator routing; the real free staging project was not used for local test writes.
72. **GitHub secrets:** PR CI receives none. Protected manual staged acceptance uses staging cookie/protection credentials only; no DB password, Admin key or production secret.
73. **Permissions:** CI contents-read only; staged acceptance additionally checks-read. Immutable official Action SHAs and no persisted checkout credentials limit supply-chain/token exposure.
74. **Integrity:** Exact commit check, lockfile, separate builds and migration checksums reduce drift. Do not confuse a local dirty-worktree test build with an immutable hosted release artifact.
75. **Risky migration backup:** Require privately verified recent recoverable evidence, not just a nonempty acknowledgement variable. Provider evidence is still missing here.
76. **Backfills:** Bounded resumable operator jobs with auditing and staging timings; never unbounded serverless startup work. No unnecessary backfill was introduced.
77. **Banner:** Authenticated Admin/platform pages show STAGING/TEST classification; production shows no test/debug banner. Scope is operational safety, not a new customer feature.
78. **Evidence:** Local reports remain ignored; safe panels display actual counters/results. Real provider backup/restore screenshots do not exist and were not fabricated.
79. **Release drill:** Actual local candidate authentication, release checks, jobs, mobile sandbox payment and fulfillment ran. Actual hosted staged release remains NOT EXECUTABLE.
80. **Rollback drill:** Actual old app startup/reads, candidate redeployment and DB-outage refusal ran with correct owned-process cleanup. No hosted or production rollback is claimed.
81. **Automated:** Full tests, quality tools, actionlint, actual failure gates, production-marker commands, SQL recovery and browser acceptance were executed; results above specify scope.
82. **Manual/integration:** Real local PG17/Auth/Storage/browser workflows and visual image review were completed. Provider-only cases are not replaced with mocked PASS labels.
83. **Unavailable:** Vercel/Neon connection and costs/setup, Firebase Auth/Storage completion, actual staged URL, hosted jobs/webhooks/QR/rollback/restore and verified live payments remain missing.
84. **Firestore:** Only the existing migration-source module reads it. Phase 22 does not move business truth or runtime operations away from PostgreSQL.
85. **Images:** Eight full-page/DPR2 files in the existing `linkedin/phase-22` convention, with a gallery explaining real local scope and unavailable hosted evidence.
86. **Image secrecy:** No real contacts, active QR glyphs/tokens, cookie headers, Admin keys, connection strings, private deployment URLs or dump contents. Synthetic account aliases are redacted; outcomes remain unaltered.
87. **Limits:** Runtime audit clean but tooling findings remain; no real PSP, external notifier, hosted acceptance, measured hosted RPO/RTO or production GO. Registry correctness still depends on reviewed operator inputs.
88. **Phase 23 prerequisites:** Connect/create approved isolated Neon/Vercel, finish Firebase Auth/Storage, populate actual pins/secrets, migrate/deploy reviewed SHA, pass hosted smoke/recovery/rollback/phone checks and verify real payment provider.
89. **Phase 23:** Should perform authorized prelaunch/UAT acceptance and decide GO only from required actual evidence. It was not begun in Phase 22; missing staging/payment gates mean NO-GO.
