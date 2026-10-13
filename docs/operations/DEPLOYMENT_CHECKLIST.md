# Deployment checklist

All boxes start unchecked. Documentation is not evidence of execution.

- [ ] Exact commit reviewed; no direct main push; required CI passed on that commit.
- [ ] Node 24.x / reviewed lockfile / clean reproducible install; runtime audit and secret scan passed.
- [ ] Dedicated Vercel, Neon and Firebase staging resources verified; no shared credentials or customer data.
- [ ] Actual origin, public SDK fingerprint and server identities pinned; production absent is declared explicitly or actual production pins are protected.
- [ ] Authentication and Storage actually operational; emulator flags absent from hosted configuration.
- [ ] Backup/PITR retention and fresh restore evidence privately verified before risky SQL.
- [ ] Migration manifest and ordered SQL reviewed; additive compatibility with rollback build; backfill owner and restart plan.
- [ ] Guarded `migrate deploy` succeeds on intended direct connection; no `reset`, `db push` or automatic seed.
- [ ] Independent staging build uses staging public Firebase config and expected SHA.
- [ ] Authenticated release, readiness, role pages and mobile QR smoke passed on actual canonical staged origin.
- [ ] Sandbox payment, verified webhook/deduplication, notification outbox and stock constraints passed.
- [ ] One authorized scheduler selected; plan frequency reviewed; unauthorized calls rejected; actual job history fresh.
- [ ] Hosted app rollback/redeploy and isolated provider restore drills passed; evidence IDs saved privately.
- [ ] Health-window owner, monitoring, thresholds and incident contacts assigned.
- [ ] Real PSP adapter/vendor configuration and end-to-end verification approved before future live launch.
- [ ] Production deployment has separate explicit human approval and protected secrets, separate build and read-only smoke policy.

Phase 22 local acceptance does not check off hosted gates. No actual staging app exists yet. Production launch decision: **NO-GO**.
