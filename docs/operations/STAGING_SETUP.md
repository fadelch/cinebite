# Make CineBite staging operational

Phase 22. No production changes or deployment are authorized by this guide. Values in angle brackets are inputs to obtain from your actual provider accounts, not existing resources or URLs.

## Actual state

The Phase 22 inventory below is historical. See [Staging activation](STAGING_ACTIVATION.md) for the follow-up resource inventory and verification. Do not mistake an allocated Vercel domain for a verified deployed application.

### Phase 22 handoff, 13 October 2026

Firebase CLI account access was verified. The **new free project `cinebite-staging-20261013` and its web app were created and verified**. Billing was independently queried and is disabled. Public web SDK configuration is saved locally in ignored `ops-private/firebase-staging-web.json`. No Admin key was generated or committed. [Open that project's console](https://console.firebase.google.com/project/cinebite-staging-20261013/overview).

Authentication is **not initialized**: the initialization API returned `BILLING_NOT_ENABLED` for its Identity Platform feature. No billing upgrade was attempted. Open Firebase Authentication → Get started → Email/Password and enable ordinary Firebase email/password authentication if the console permits this on Spark. Do not upgrade Identity Platform or enable billing without approval. Verify the enabled provider and a synthetic staff login afterward; creation of the web app does not prove Auth works.

Storage was **not created**. [Firebase's Storage billing policy](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) requires Blaze. An approved billing account, budget alerts and cost ownership are prerequisites. Budgets are alerts, not hard spending caps.

No Vercel or Neon connection/API credentials are available in this session. No staging database, deployment or application URL exists or has been verified. Install and connect the Vercel and Neon integrations with access to the intended team/account, or use the manual steps below. Credentials belong in provider secret stores or ignored local env files, never chat. The existing Firebase CLI login is sufficient for verified project access; project creation does not grant Vercel/Neon access.

## 1. Inventory and isolate resources

Record the existing development database identity, Firebase project ID and bucket from `.env.local` privately. Do not copy its credentials into staging. If a production environment exists, record its identities separately, read-only. This user currently confirms only local development, so do not invent a production deployment or domain.

Use a **separate Neon project**, **separate Firebase project**, **separate Vercel project**, different credentials and distinct HTTPS origins for staging. A separate project is easier to audit than shared-schema isolation. Never branch from a database containing customer data or reuse its owner password. A Neon data branch can inherit source data; use a fresh empty project here. [Neon branching behavior](https://neon.com/blog/practical-guide-to-database-branching).

## 2. Neon

1. Select your intended account and inspect free-plan limits before creating anything. Obtain explicit approval for a paid plan or extra paid resources.
2. Create a new project named CineBite Staging, select the intended region, PostgreSQL 17 and an empty database. Do **not** fork production data. Keep only synthetic test data.
3. Create/use a dedicated staging role; keep its password in a secret manager. Its credentials must have no production access. For stronger separation use distinct runtime/migration roles and review the privileges needed by financial functions/triggers.
4. Copy the actual **pooled** connection into staging `DATABASE_URL`, and that same project's **direct** connection into `DIRECT_URL`. Preserve provider-required TLS parameters. Both must name the same database. The registry stores the direct/canonical hostname (remove only Neon's `-pooler` suffix), and database name, never passwords or full connection strings.
   Database sessions must use UTC (the application adapters explicitly request it); verify default/operator connections also use UTC. Location display timezones are unrelated and remain unchanged. This prevents session timezone from shifting due-job eligibility or financial timestamps.
5. Inspect the project's actual restore window/plan and configure the approved backup policy. Save dated private evidence. Do not claim a recovery window based only on plan advertising.
6. Set up a **second empty recovery database/project** for drills before a release. Do not restore over the staging source or production.

## 3. Firebase

1. Use the already-created staging project above, not `cinebite-481f4`. Resolve the Auth initialization step described above and verify Email/Password login. No public application registration UI is added.
2. Review service-account permissions in this new project only. Generate a staging Admin credential only when needed; store `client_email` and `private_key` in the staging Vercel server environment. Do not reuse the key previously shared in chat; revoke/rotate exposed keys through an approved separate incident procedure. Never commit JSON key files.
3. After billing approval, create Storage **in the staging project**, record the actual bucket name and apply the repository's deny-by-default client rules to this project explicitly. Admin SDK uploads use server-side role/tenant checks; do not make the bucket publicly writable. No Firestore business database is needed.
4. Obtain the six web SDK values from the staging web app, or the ignored public configuration file. `NEXT_PUBLIC_*` values are build-time browser configuration, not Admin secrets. Server and browser project/bucket identities must agree.
5. Add the actual Vercel staging hostname to Authentication → Settings → Authorized domains once Vercel allocates it. Do not guess a domain. Use only operator-owned test accounts; do not import production staff or users.
6. Verify a staged image upload, read and removal after storage is provisioned. A placeholder bucket in the SDK config is not evidence a bucket exists.

## 4. Vercel

1. Create a **new** Vercel project for this repository, named CineBite Staging if available. Inspect plan limits/costs first. Do not edit an existing production project's settings, DNS, secrets or integrations.
2. Select Next.js, Node **24.x**, install `npm ci`, and the checked-in `vercel.json`. Its build command performs preflight and build only—never migrations/seeding. Disable automatic deployments initially. Keep deployment protection enabled and choose test-team access.
   Enable automatic exposure of [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) and verify `VERCEL_PROJECT_ID` and `VERCEL_GIT_COMMIT_SHA` are available to build/runtime. Do not override those identifiers to make a mismatched project pass validation.
3. Record the project's actual ID and allocated HTTPS application domain from Vercel. A domain allocation/failed initial build does not mean the app is deployed. Choose that exact origin, without a trailing slash, for `CINEBITE_APP_ORIGIN`.
4. In the new project's Environment Variables, add staging values for the slot used by staging. A **separate staging project's Production slot is still staging**, so `CINEBITE_ENVIRONMENT=staging`, `OBSERVABILITY_ENVIRONMENT=staging`, `NODE_ENV=production` are correct together. Never set `NODE_ENV=staging`.
5. Disable or explicitly ignore untrusted PR/preview deployments until their isolated variables and protections are reviewed. Do not grant fork PRs shared staging write credentials. Preview builds must not fall back to production values. CI uses synthetic values and no provider secrets.
6. Build a reviewed exact commit on this staging project, after guarded migrations and backup review. Build separately for production later: [Next public env variables freeze at build time](https://nextjs.org/docs/app/guides/environment-variables), so a staging bundle must not be promoted unchanged into a different Firebase project.

## 5. Environment variables and registry

Use `.env.example` as a **list of variable names**, not a working credential file. Put operator configuration locally in `.env.staging.local` (ignored), or directly in the new project's secret store. Leave development `.env.local` unchanged.

| Group          | Staging settings                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | Six `NEXT_PUBLIC_FIREBASE_*` from the staging web app; staging `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`; matching `FIREBASE_STORAGE_BUCKET` |
| Database       | Staging-only pooled `DATABASE_URL`; direct `DIRECT_URL`                                                                                                                                     |
| Classification | `CINEBITE_ENVIRONMENT=staging`, `OBSERVABILITY_ENVIRONMENT=staging`                                                                                                                         |
| Origin         | Actual HTTPS `CINEBITE_APP_ORIGIN`; `CINEBITE_ALLOWED_ORIGINS` empty or exact staged browser origin only                                                                                    |
| Release        | `OBSERVABILITY_RELEASE` = exact reviewed 40-character Git SHA, or omit it and let Vercel provide `VERCEL_GIT_COMMIT_SHA`                                                                    |
| Security       | New random `SECURITY_RATE_LIMIT_SECRET` (at least 32 characters). Use trusted-IP options only after verifying ingress overwrites that header                                                |
| Sandbox        | `PAYMENT_PROVIDER=sandbox`, `PAYMENT_SANDBOX_ENABLED=true`, fresh `PAYMENT_PROVIDER_WEBHOOK_SECRET` (at least 32 characters); no live-money adapter exists                                  |
| Jobs           | Initially `CINEBITE_SCHEDULER=disabled`; new distinct `PAYMENT_EXPIRY_JOB_SECRET`, `NOTIFICATION_JOB_SECRET`, `OBSERVABILITY_JOB_SECRET`, `CRON_SECRET`, each at least 32 characters        |
| Tuning         | Start with `.env.example` bounded pool/timeouts/batch defaults; tune only against measured staging evidence                                                                                 |
| Emulator flags | **Unset** every Auth/Storage emulator variable on hosted staging                                                                                                                            |

`CINEBITE_RESOURCE_REGISTRY` is server-only JSON: keys are environment names; each entry has `databaseHost`, `databaseName`, `firebaseProjectId`, `storageBucket`, `origin`; hosted entries additionally have actual `vercelProjectId`, `authDomain`, `firebaseAppId`, `firebaseApiKeyHash`.

The API key hash is SHA-256 of the **public staging web API key**, not the Admin private key. Generate privately with a local Node script or secret-manager utility; do not print other env values. Pin the web app and auth domain as well as the Admin project so a mismatched public configuration fails preflight. Protect registry editing like any deployment configuration; it is an operator-controlled allowlist, not independent attestation.

After you have saved the real staging public SDK values in the ignored env file, this command prints only the public-key fingerprint:

```powershell
node --env-file=.env.staging.local -e "console.log(require('node:crypto').createHash('sha256').update(process.env.NEXT_PUBLIC_FIREBASE_API_KEY).digest('hex'))"
```

For the confirmed development-only starting point, the registry shape is below. **Every angle-bracket value must be replaced with an observed resource identity; this is not runnable configuration or a claim those URLs exist.** Select the actual development resources from your current env file without copying its passwords. Paste the completed JSON as one server-only environment-variable value (or a properly quoted single-line env-file value).

```json
{
  "development": {
    "databaseHost": "<actual-canonical-development-db-host>",
    "databaseName": "<actual-development-db-name>",
    "firebaseProjectId": "<actual-development-firebase-id>",
    "storageBucket": "<actual-development-bucket>",
    "origin": "<actual-development-origin>"
  },
  "staging": {
    "databaseHost": "<actual-canonical-staging-db-host>",
    "databaseName": "<actual-staging-db-name>",
    "firebaseProjectId": "cinebite-staging-20261013",
    "storageBucket": "<actual-approved-and-created-staging-bucket>",
    "origin": "<actual-Vercel-allocated-HTTPS-staging-origin>",
    "vercelProjectId": "<actual-staging-Vercel-project-id>",
    "authDomain": "<actual-staging-web-SDK-auth-domain>",
    "firebaseAppId": "<actual-staging-web-app-id>",
    "firebaseApiKeyHash": "<SHA-256-fingerprint-from-command-above>"
  }
}
```

If production exists, registry entries for **both staging and production** must be present and isolated. If production truly does not exist, set `CINEBITE_PRODUCTION_CONFIGURED=false`, omit the production entry, and provide **actual development and staging entries**; staging must be different from those protected development resources. This does not permit production startup: production always requires its own full entry and a staged entry. No invented production origins are needed.

Changing a public Firebase value requires a new build. Changing Admin credentials requires replacing secret-store values and redeploying/restarting all instances. Record safe SHA/environment/expected migration count, never key values, in release evidence.

## 6. Apply migrations to staging

On an authorized operator machine, from this repository, use a deliberately selected ignored env file:

```powershell
npm ci
node --env-file=.env.staging.local node_modules/tsx/dist/cli.mjs scripts/operations/preflight.ts
node --env-file=.env.staging.local node_modules/tsx/dist/cli.mjs scripts/operations/migrate.ts --environment=staging
```

The wrapper validates pinned identities and SQL checksums **before opening Prisma's migration connection**. Prisma configuration no longer silently loads `.env.local`. `DIRECT_URL` is for migration; runtime uses `DATABASE_URL`. `migrate deploy` runs committed migration history in order; it is not `db push`, `migrate dev`, `reset` or a seed. Never run those destructive/developer operations on hosted resources. This phase adds no schema migration; it validates the existing 21 migrations.

Review SQL, backup evidence and compatibility first. Use expand/backfill/contract releases; do not drop columns used by the rollback build. Large backfills should be resumable, bounded and separately approved, not part of serverless request startup. Do not edit applied migration files; update the manifest only for reviewed new migrations.

Migration checksums are canonical LF hashes. The existing 21 migrations also pin their exact legacy Windows CRLF hashes so already-applied history is not rejected merely for line endings. `.gitattributes` fixes future SQL checkouts to LF; no SQL contents or existing migration records were rewritten. Arbitrary checksum drift still fails.

Create an operator-controlled test staff identity in the **staging** Firebase console, then run the existing bootstrap explicitly with the staging env file and `--conditions=react-server`. Inspect that script's arguments before invocation. Do not use the legacy npm alias that loads development `.env.local` when operating staging. Auth identity and PostgreSQL role/membership are separate; a Firebase user alone is not an authorized cinema administrator.

## 7. Deploy and smoke-test

1. Require the GitHub `CineBite required checks` status and review the exact commit. Configure that required check in GitHub branch protection/rulesets yourself; the repository cannot enforce account settings automatically.
2. Manually deploy this reviewed commit to the **staging project only**. Do not deploy to the live project or merge this branch automatically. Record actual Vercel deployment ID/URL and Git SHA after successful build.
3. Verify `/api/health` (process) and `/api/ready` (configuration, database and migration checksums). Readiness must return 503 when DB/migrations are unavailable; health alone is not an acceptance gate.
4. Run read-only smoke with the actual staged env file:

```powershell
node --env-file=.env.staging.local node_modules/tsx/dist/cli.mjs scripts/operations/smoke.ts
```

5. A privileged smoke session cookie can be injected through `CINEBITE_SMOKE_COOKIE` in a private ephemeral operator process, never command-line arguments/logs. This enables the authenticated `/api/super-admin/release` check of environment, built SHA and migration readiness. Without it, the script explicitly reports `releaseVerified=false`; do not count that as full release verification. Deployment-protection access must be obtained securely; never disable protection just to make smoke pass. Redirects and TLS verification bypass are prohibited.
   Alternatively configure a protected GitHub environment named `staging` with required reviewers: environment variables `CINEBITE_STAGING_ORIGIN` and `CINEBITE_RESOURCE_REGISTRY` must hold the actual verified origin and pinned non-secret identities, secret `CINEBITE_SMOKE_COOKIE` an authorized short-lived staging-only session, and optional secret `CINEBITE_VERCEL_PROTECTION_BYPASS` the scoped staging protection credential. The manual staging-acceptance workflow runs only from main, verifies the exact commit's required CI and that the target is the staged, not protected development/production origin, then performs authenticated read-only smoke. It never deploys. No DB URLs, Firebase Admin keys or production secrets are needed in that workflow. Refresh/revoke the smoke session appropriately; do not persist it in git.
6. Sign in with staging-only Admin/Kitchen/Delivery test accounts. Exercise isolated QR entry → menu → cart → sandbox success → payment-gated queue → ready/claim/delivered, cancellation/refund invariants and analytics. Never enter real card details. Check mobile width and a physical device. Check storage and notifications after their providers are configured. Local emulator tests are not proof hosted Firebase or payment services work.

## 8. Jobs, webhooks and observation

The existing authenticated **POST** job routes remain valid for an external scheduler. Vercel Cron sends **GET** only, so new `/api/cron/notifications`, `/api/cron/payments`, `/api/cron/monitor` adapters authenticate `CRON_SECRET`, validate resources, require `CINEBITE_SCHEDULER=vercel`, and invoke existing jobs directly (no loopback HTTP proxy).

`vercel.json` intentionally has `crons: []`. After explicit plan/cost approval and staging acceptance, review `vercel-crons.example.json` and incorporate its minute schedules. Confirm your plan supports that frequency. Use **one** scheduling mode, not both. [Vercel Cron behavior/authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs) includes overlapping/duplicate invocations and no automatic failed-job retries; application idempotency and job history remain essential. Cron targets the Production deployment **of the separate staging project**, not an arbitrary preview.

Use only sandbox-signed webhook tests on staging. No real PSP adapter is installed, so external payment-provider verification and production launch are **blocked**. Watch readiness, error rate, job freshness, outbox backlog and verified payment/refund outcomes through a release health window. Agree thresholds and owner availability before any future production change.

## 9. Remaining acceptance gates

Vercel/Neon access, cost approval where applicable, operational Auth and Storage, actual staged deployment/origin, hosted smoke/QR/storage/webhooks/jobs, provider backup/PITR evidence and a hosted restore/rollback drill are **NOT EXECUTABLE** until configured and authorized. Production launch remains **NO-GO**. Phase 23 must validate these and a reviewed real payment adapter before launch; this work does not start Phase 23.
