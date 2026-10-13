# Production operations (prepared, not executed)

No automatic production deployment exists in Phase 22. No production settings/data were changed. Production payments intentionally fail closed because there is no verified live PSP adapter. **Launch is NO-GO.**

## Release structure

Review branch → readonly CI → approved isolated staging migrations → separate staging build/deploy → full smoke/health window → explicit human production approval → approved production migrations → independently built production artifact → read-only production smoke → health window. Never rebuild an artifact silently during rollback or treat a failed job as success.

Use Node 24.x and `npm ci` from the reviewed lockfile. `.github/workflows/ci.yml` pins Actions to verified upstream commit SHAs, grants only `contents: read`, cancels superseded CI and requires successful quality **and** isolated database-recovery jobs. No deployment keys, app env files, real Firebase credentials or hosted DB URLs are passed into PR CI. npm caching stores package downloads only, not `.next`, env files or dumps. The optional local browser/emulator drill is not falsely represented as a GitHub run.

Configure GitHub rulesets to require `CineBite required checks`, review and no direct main pushes. For future release automation, use protected GitHub environments with approval and scoped secrets on trusted main only; do not use `pull_request_target` to execute PR code with secrets. Do not add an automatic live deploy merely because a branch passes tests.

## Before a future production migration

Confirm exact reviewed SHA, isolated registry, pooled/direct identities, role permissions, environment-specific secrets, compatible previous build, current backup/PITR evidence and restore validation. Production metadata is not a secret; credentials and customer data are. Keep private evidence links/IDs with access restrictions.

The guarded command is:

```powershell
node --env-file=.env.production.local node_modules/tsx/dist/cli.mjs scripts/operations/migrate.ts --environment=production --approve-production=<reviewed-40-character-sha>
```

An operator also supplies `CINEBITE_BACKUP_EVIDENCE_ID` through the private environment. It is an acknowledgement pointing to evidence, **not** automatic backup verification. Do not use this command now. Review actual backup/restore evidence before approving it; destructive SQL needs additional data-owner approval. Run additive migrations first. Use bounded resumable backfills outside build/start. Contract/drop old fields only after all running and rollback versions no longer use them. Never rewrite old migration checksums.

## Release identity and health

Vercel's commit SHA and an explicit `OBSERVABILITY_RELEASE`, if supplied, must agree. The build bakes only a safe SHA via `CINEBITE_BUILD_RELEASE` and sets `deploymentId`. Private authenticated `/api/super-admin/release` reports environment, built release, expected migration count/readiness and scheduler mode; public health endpoints reveal only status. Public browser Firebase config is frozen separately into each environment's build.

A registry drift, failed/unfinished migration, missing required migration or checksum mismatch blocks readiness. Extra already-finished additive migrations are allowed so a previous compatible application can still run. Configuration errors never echo hosts, URLs or keys. Local unclassified development remains compatible; Vercel and explicitly classified runtimes must pass the guard.

Agree a staffed observation interval (suggested initial 30 minutes, not a measured SLA), acceptable error/latency baselines and incident ownership. Stop promotion on failed readiness, cross-environment config, unexplained payment/refund discrepancy, growing outbox, missing processors or authorization failures. Financial truth comes from verified provider state plus committed PostgreSQL transactions, not a dashboard number.

## Failed or partial deployment

Freeze promotion; identify affected immutable deployment and SHA; retain safe logs. If app rollout failed after an additive migration, leave schema in place and roll back the app. Disable new checkout through the approved operator configuration if consistency is uncertain, without rewriting financial rows. Do not claim a global maintenance-mode feature exists. Pause a broken scheduler through that project's authorized configuration, record the resulting backlog and reconcile before resuming. Do not blanket replay webhooks/refunds/notifications.

If migrations failed, inspect `_prisma_migrations` and provider logs privately, investigate whether SQL was transactional, and reconcile the actual schema. A forward corrective migration is generally safer than data-rewinding. `migrate resolve` is operator-only after evidence proves the state; never mark a failed migration applied simply to make deployment green.

## Dependency/secret policy

Runtime high/critical vulnerabilities block CI (`npm audit --omit=dev --audit-level=high`). Dev/tooling vulnerabilities still require a separately recorded assessment; omission from runtime audit is not a clean full audit. Secret scanning covers tracked tree/history and browser build assets; additionally review staged additions and images before push. Public Firebase API keys are not Admin secrets, but keep actual staging SDK exports in ignored operator files.

Retain previous immutable app deployments, build/source SHA, approved migration list, Node/lockfile version, smoke results, backup evidence reference and reviewer/release owner. Do not expose deployment protection bypasses or signed staff/QR links in release notes. [Deployment checklist](DEPLOYMENT_CHECKLIST.md), [DB recovery](DATABASE_RECOVERY.md), [secret rotation](SECRET_ROTATION.md), [staging setup](STAGING_SETUP.md).
