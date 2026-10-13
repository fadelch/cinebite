# CineBite staging activation

Branch: `ops/staging-activation`, based on merged Phase 22 (`2b28fd4`). Phase 23 is deferred until staging is reviewed. No production resource was modified, billing enabled, paid service provisioned or real payment processed.

**Verified staging URL: [https://cinebite-staging.vercel.app](https://cinebite-staging.vercel.app).** Vercel deployment `dpl_EvQz7LdJutUgrX52VvF3FKghpCKZ` reached READY and passed the hosted smoke suite. Its full built/reported release SHA is `2e57bcf47828b7c909c36e267e56bc4235a484ca`; later documentation-only commits on this branch are not a different deployed release. Deployment protection remains enabled: unauthenticated health access returned 302, while privately authorized health/readiness returned 200. Sign into the owning Vercel account to access the protected app, then use a synthetic Firebase staff account from the local private fixture. Do not distribute an automation bypass token in a URL.

## Actual resource inventory — 13 October 2026

| Service | Verified resource | State |
| --- | --- | --- |
| Firebase | `cinebite-staging-20261013`, existing CineBite Staging web app | Standard Email/Password enabled; real synthetic sign-in passed; billing disabled |
| Firebase server identity | Dedicated `cinebite-staging-app` service account in that project | Auth Admin only; no Storage, Firestore, Owner or billing role granted |
| Neon | `shiny-queen-04445605`, **CineBite Staging**, AWS Frankfurt, PostgreSQL 17 | Separate new project in the verified Free organization; empty before migrations; no production copy |
| PostgreSQL | `cinebite_staging`, dedicated staging role | All 21 reviewed migrations applied; 42 public tables; synthetic fixtures only |
| Vercel | `prj_UNivm0DqkOeXBTrm53ZFaxivRkwK`, **cinebite-staging** | New separate project in the verified Hobby account; Next.js, Node 24.x, deployment protection enabled |
| Vercel domain | `cinebite-staging.vercel.app` | Actual deployed app; protected health/readiness and full hosted smoke PASS |
| Firebase Storage | No staging bucket provisioned | Intentionally disabled; no Blaze upgrade or Storage permission granted |

The provider requires a lowercase project slug rather than the human-readable “CineBite Staging”; the Vercel slug is `cinebite-staging`. The application environment is `staging` even though this separate Vercel project uses its platform Production slot. This does not deploy or alter the real CineBite production environment.

## Tool installation and access verification

- Neon CLI **8.4.2** and Vercel CLI **63.1.2** were already installed and authenticated; neither was reinstalled. Native CLI metadata/read calls verified Neon Free and Vercel Hobby before creation.
- Official Neon skill was fetched completely from the user-supplied `.well-known` URL, then `neon` and `neon-postgres` were installed globally for Codex using the official Neon CLI. Existing Prisma/Firebase authentication were preserved; no Neon Auth, Object Storage, Functions, Data API, Gateway or `neon.ts` was added.
- Official Vercel instructions were fetched from [get-started.md](https://vercel.com/get-started.md). The official Vercel plugin **0.21.0** was installed for Codex at user scope. Its bundled CLI/API/env guidance was reviewed; no duplicate standalone skill pack was installed.
- Both native MCP entries have verified OAuth and per-server **human approval prompts**. Neon remains `readonly=true&category=projects`; no token/API key is embedded in MCP configuration.
- Actual read-only Neon MCP `list_projects` returned five projects, including the new staging project. Existing projects were listed, not modified.
- Actual read-only Vercel MCP default-scope `list_projects` returned `cinebite-staging`. `list_teams` returned an empty list. An additional explicit-team project query returned **403**; default project access works, but broader team-scoped MCP access is not claimed. The official CLI can access the staging account/project and was used for the authorized staging mutations.
- Verification used the installed Codex app-server's native MCP client with stored OAuth, an ephemeral tool-only context and **no model turn/delegated agent**. Only read tools were called. Private sanitized evidence: `ops-private/mcp-verification.json`.

Actual Neon MCP project listing:

| Project name | Project ID |
| --- | --- |
| CineBite Staging | `shiny-queen-04445605` |
| cinebite | `old-mode-47430788` |
| orange-boat-24181258 | `orange-boat-24181258` |
| steep-cloud-50527908 | `steep-cloud-50527908` |
| dawn-leaf-76533140 | `dawn-leaf-76533140` |

Vercel MCP default-scope project listing: `cinebite-staging` / `prj_UNivm0DqkOeXBTrm53ZFaxivRkwK`. Only this newly created staging project was changed.

### Safest future Neon write access

No MCP write access was needed: the explicitly authorized fresh staging project and guarded migrations used the official CLI/direct staging connection. Keep the existing `Neon` entry read-only. If future staging writes genuinely need MCP, request approval first and add a **separate** `NeonStaging` entry pinned to the observed staging project ID, limited to needed tool categories, with OAuth and human mutation approval. Do not edit the account-wide read-only entry, copy production data or embed a personal API key. A URL project pin is not a substitute for reviewing OAuth/IAM scope and every destructive SQL operation. [Official MCP setup/security](https://neon.com/docs/ai/connect-mcp-clients-to-neon).

## Secure configuration

There are 36 independently prepared staging variables in the separate project's Production slot, including the documented Vercel Node ESM runtime option. Browser Firebase config uses the existing staging web app; server/database/sandbox/job/security values are sensitive variables. No staging credentials were copied from development. Six secrets were independently generated. Scheduler is disabled; no minute cron was activated. The separately generated project-scoped protection-bypass credential is kept privately in the local staging env file for operator tests; it is not a browser variable or a query-string credential.

The protected resource registry pins actual development and staging database, Firebase, bucket-name and origin identities. `CINEBITE_PRODUCTION_CONFIGURED=false` reflects the user's confirmed development-only starting point; no production URL was invented. The declared staging bucket name is SDK metadata, **not evidence a bucket exists**. `CINEBITE_STORAGE_ENABLED=false` prevents every Admin Storage call before Firebase initialization and cannot fall back to a different bucket.

Local private configuration is `.env.staging.local`; the dedicated Admin credential is `ops-private/firebase-staging-admin.json`. Both were restricted to the current Windows user. Synthetic staff credentials and the private local QR fixture are in ignored `ops-private/staging-fixture.json` and `ops-private/staging-demo-seat-a7.png`; keep these private and restrict/rotate after testing. No secret value is recorded here. Do not use `vercel env pull` or `neon env pull` into development `.env.local`.

`.vercelignore` excludes env files, operator credentials, test databases, browser profiles, QR fixtures, dumps and portfolio artifacts from source uploads. The existing `.gitignore` already excludes private env/operator files. No Prisma schema, migration SQL, dependency version or existing database connection was changed.

## Executed checks and remaining work

| Check | Actual result |
| --- | --- |
| Standard Firebase provider configuration | PASS; no Identity Platform billing upgrade |
| Real Firebase Email/Password sign-in | PASS; temporary synthetic identity was removed |
| Dedicated Firebase Admin credential | PASS; real staging Admin user listing and synthetic staff creation/claims |
| Neon empty-target verification and migrations | PASS; 21 finished migrations, 42 tables |
| Staging resource-isolation preflight | PASS |
| Secure Vercel variable upload | PASS; 36 keys, staging project only |
| Synthetic fixtures | PASS; 2 organizations, 3 locations, 9 seats, 2 tracked products, live screening and 4 staff roles; no captured-money fixtures |
| Offline safety regressions | PASS; 6 new activation safeguards plus 3 deployment-ID regressions |
| Full local quality | PASS; 663 tests/77 files, lint, generated route types, TypeScript, Prisma validation and production build |
| Secret scan | PASS; reviewed tracked/staged files, history and browser assets; env/operator files excluded |
| GitHub CI for deployed commit | PASS; [actual run for `2e57bcf`](https://github.com/fadelch/cinebite/actions/runs/38414728492) |
| Dependency audit | Runtime: 0 vulnerabilities. Full tree: 5 HIGH findings in development lint dependencies; not a clean full audit |
| GitHub repository link | BLOCKED; Vercel rejected the requested repository connection; no connection claimed |
| Hosted deployment, protection, health/readiness | PASS; actual READY deployment; unauthorized access protected; authorized health/readiness 200 |
| Real browser staff sign-in | PASS; SUPER_ADMIN, CINEMA_ADMIN, KITCHEN_STAFF and DELIVERY_STAFF; Secure, HttpOnly, SameSite=Lax cookies; no auth-user localStorage or credential URL |
| Authenticated built release/migration check | PASS; full SHA matched; migrations ready |
| Admin QR generation/read | PASS; PostgreSQL PNG fallback; no Storage path; authenticated PNG read 200 |
| Customer QR/cart | PASS; passive QR GET, explicit session start, 2 popcorn + 1 Pepsi, server subtotal USD 12.00 |
| Sandbox settlement/inventory | PASS; sandbox SUCCEEDED, fulfillment eligibility, screening/seat binding and exactly 2 inventory consumption movements |
| Kitchen/delivery/customer progress | PASS; PLACED → ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED |
| Notifications/analytics/operations | PASS; manually authenticated outbox job, scoped reads and empty control-tenant orders |
| Mobile layout | PASS; 390×844 emulated browser viewport, no horizontal overflow. Physical-device acceptance NOT EXECUTABLE in this session |
| Firebase-backed media | NOT EXECUTABLE; Storage intentionally disabled pending billing approval |
| Real PSP/live payments | NOT EXECUTABLE; no approved real provider integration or merchant configuration |
| Hosted backup/PITR, restore and Vercel rollback | NOT EXECUTABLE in this activation report; no result inferred from a plan or runbook |

The hosted suite's nine check groups actually passed and its sanitized local result is `ops-private/staging-smoke-result.json`. The one synthetic completed order and its history are retained intentionally. No real money was charged; this does not prove a real payment provider's sandbox integration. The local test PostgreSQL cluster and Firebase emulators started for this work were stopped afterward; their data files were retained.

The npm deprecation notices for `node-domexception`, `glob` and ESLint are not the fatal deployment-ID error. Their installed dependency paths and current audit were checked without suppressing warnings or upgrading the authentication stack. Development lint-chain findings require a separately verified dependency update before release acceptance.

The first fixture attempt stopped at nested LocationAccess creation. Only its owned synthetic partial records were retained; a separately reviewed resume completed grants/claims without deleting data. Initial JSON env-file quoting and CLI top-level-array upload failures were fixed; resource isolation then passed and all 35 variables were uploaded individually. A TypeScript gate caught missing typed error codes in the new storage guard; those were fixed and the full local suite reran successfully. None of these failures were concealed as successful runs.

The first authorized manual staging deployment, `dpl_5G8qJ4UaFpJo5vKynBHTamd9x5dw`, failed with `INVALID_DEPLOYMENT_ID`: Vercel accepts a cache/skew deployment identifier of at most 32 characters, while the prior configuration used the full 40-character SHA. The cache identifier was shortened to 32 hex characters; authenticated release evidence retains the complete SHA. Two regression tests cover this distinction and malformed release metadata. This did not change any database or production deployment. [Vercel deployment identifier requirements](https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id).

The next build reached READY but its hosted health check failed: Vercel disables Node's `require(esm)` feature by default, and Firebase Admin's JWKS dependency requires it. Only the staging project received the documented `NODE_OPTIONS=--experimental-require-module` setting; dependencies were not downgraded. [Vercel runtime configuration](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration).

A same-SHA configuration redeploy then exposed Vercel's custom-ID uniqueness restriction. Hosted builds now let Vercel assign its own unique deployment identifier; self-hosted builds retain a bounded SHA-based cache identifier. A third regression test proves that hosted deployment IDs are not overridden and the complete release SHA stays separate. Failed builds and the failed health test are not counted as successful hosted acceptance.

### GitHub connection and deployment hold

The staging project's ignored-build command is `exit 0` and Preview deployments are disabled. This prevents automatic app builds while setup is reviewed. No repository-wide deployment-disable flag was committed, so another project's behavior is not changed.

Authorize GitHub in the intended Vercel account and the [Vercel GitHub app](https://github.com/apps/vercel/installations/new) for `fadelch/cinebite` only. Then retry the official `vercel git connect` with the **explicit staging project ID**. The initial attempt was rejected, not bypassed. Do not change another project's link or install account-wide repository access unnecessarily.

After the exact commit's CI passed, a manual CLI source deployment to this separate staging project was executed without Git linking. The upload dry run verified private files were excluded; actual hosted release, health/readiness and complete smoke then passed. Keep the Git build hold until Git authorization and an intentional deployment policy are reviewed. Git linking and automatic deployment are still not claimed.

The opt-in hosted suite is [tests/staging](../../tests/staging/README.md). It uses real staging Auth and supported APIs/browser flows plus authoritative SQL checks. It never falls back to emulators or production. `npm run test:staging` requires the private staging configuration and synthetic fixture. Protection-bypass credentials must be injected privately and sent only to the exact staging origin. Repeats deliberately create another synthetic order; refresh the synthetic screening through the staging admin UI once it ends, rather than weakening expiry checks. Rotate/revoke private operator credentials and the protection bypass when testing is complete.

## Storage limitations

Firebase-backed product images, movie posters and branding-logo upload/replacement/read/removal remain blocked. [Firebase's official billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) require the separately approved Blaze setup for Cloud Storage. Nothing enabled billing here.

Existing QR code paths support a **PostgreSQL PNG fallback** when Storage is unavailable. This was inspected, not replaced with a new implementation. Actual hosted Admin generation and authenticated PNG reads passed using this fallback. The private A7 fixture also completed customer ordering. This does not imply a Firebase bucket was created.

## Real payment provider prerequisites

CineBite currently uses its own explicitly labeled sandbox adapter; this is **not an integration with a real provider's sandbox**. No merchant account or live payment was created, selected or activated.

The owner must supply: legal merchant country and entity, acquiring/payout bank country, currencies/payment methods, who is merchant of record for each cinema, approved provider, sandbox developer access provided locally, callback/webhook domains, capture/refund/cancellation policy, compliance ownership and accepted fees. Do not infer merchant eligibility from a demo location's country. Check actual eligibility with the selected provider; [Stripe country availability](https://stripe.com/global) is an example verification source, not a recommendation or selection.

Future integration must implement the existing provider contract without weakening server-calculated amounts, signed raw-body events, currency/amount/attempt binding, durable idempotency, reconciliation, reservations, refund caps and tenant authorization. Test supported failures, duplicate/out-of-order/late events, full/partial refunds and provider recovery in the provider's **real sandbox**, using separate credentials. [Provider webhook requirements](https://docs.stripe.com/webhooks) and [sandbox/test guidance](https://docs.stripe.com/testing) illustrate the evidence needed after provider selection. Live keys, merchant activation, fees, payouts and a production change require separate owner approval.

## Files changed outside the repository

- `C:\Users\FADEL\.codex\config.toml`: appended `Neon` and `vercel` OAuth MCP URLs, per-server `prompt` approval policy, and the enabled official Vercel plugin. Existing model/settings/project entries and OpenAI Docs MCP remained present; no token was embedded.
- `C:\Users\FADEL\.agents\skills\neon\**` and `neon-postgres\**`: new official skill/reference files.
- `C:\Users\FADEL\.agents\.skill-lock.json`: official skill installation metadata.
- `C:\Users\FADEL\.codex\plugins\cache\openai-curated\vercel\82fd64bc\**`: installed official plugin/guidance. Native OAuth credential persistence is handled by Codex, not by repository files; no credential was copied into source.

Reload Codex if newly installed guidance/native MCP tools are not visible. Skill guidance caused targeted installation and preservation of existing Firebase/Prisma rather than a backend migration. Global installation/auth settings are not part of the Git commit.

Production launch remains **NO-GO**. Staging activation and a few smoke checks do not replace complete Phase 23 security/UAT, provider backup/recovery evidence, a verified real payment adapter or owner sign-off.
