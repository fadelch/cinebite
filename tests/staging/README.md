# Hosted staging smoke (operator-only)

Never run this suite against production or development. It validates the Phase 22 resource registry, requires `CINEBITE_ENVIRONMENT=staging`, the approved Firebase staging project, sandbox payments and disabled Firebase Storage. It does not load `.env.local`, migrate, reset, create paid services or run load attacks.

Prerequisites: a reviewed deployed staging release, the separate migrated staging database, real staging Firebase Auth, Chrome, privately prepared synthetic cinema/staff/QR fixtures in ignored `ops-private/staging-fixture.json`, and a restricted `.env.staging.local`. Refresh the synthetic live screening deliberately if it has ended; do not disable expiry checks. Fixture passwords and QR tokens are private, not documentation material.

```powershell
node --env-file=.env.staging.local node_modules/tsx/dist/cli.mjs --conditions=react-server tests/staging/smoke.ts --confirm-staging-smoke
```

For a protected deployment, privately inject its staging-only `CINEBITE_VERCEL_PROTECTION_BYPASS`. The suite adds this header only to the exact pinned app origin, never Firebase identity requests or other hosts. It does not disable deployment protection or put a bypass token in a URL. No TLS verification bypass is used.

The suite performs four actual browser Email/Password logins, secure-cookie checks, built SHA/schema verification, Admin QR generation through the existing PostgreSQL image fallback, passive QR GET then explicit session creation, 390×844 customer ordering (2 popcorn + 1 Pepsi), USD 12.00 server-calculated checkout, verified sandbox settlement, SQL inventory checks, Kitchen/Delivery transitions, customer progress, manual outbox processing, analytics/operations reads and a control-tenant check. These are bounded synthetic writes, not read-only smoke or proof of complete Phase 23 acceptance.

The updated suite also checks QR guidance and sandbox labeling on the anonymous homepage, validated customer-session resume, login Clear (including hiding the password and no submission), dark native select styles, actual kitchen drag-and-drop and a keyboard action. It rejects a skipped-step drag and separately injects one **simulated HTTP 409** to test client conflict feedback; that injected response is not evidence of a real backend race. All successful transitions still use the actual authenticated staging API and are checked against SQL. An anonymous mobile homepage screenshot is saved privately; no password, QR credential or session cookie is captured.

It retains the synthetic order/history and writes a sanitized report to ignored `ops-private/staging-smoke-result.json`. Repeats create another synthetic order intentionally. Firebase-backed product/poster/logo media remains unavailable until separately approved billing, bucket creation and appropriate staging-only IAM. PostgreSQL QR fallback does not imply Firebase Storage was provisioned.

Executed result on 13 October 2026: the original nine check groups passed on `2e57bcf47828b7c909c36e267e56bc4235a484ca`; the expanded 15 check groups passed on actual protected Vercel staging deployment `dpl_CMf6axSUFKAXjeVQ26K36EVae6Rk`, release `f54a8050e0a6d598a62818c0c70d57c764e8226f`. An early enhanced run stopped at an assertion in the customer-session/cart group. The runner now explicitly waits for completed cart PUT responses; the subsequent run passed without changing expected amounts. See the [activation report](../../docs/operations/STAGING_ACTIVATION.md) for actual evidence and remaining acceptance blockers. Mobile coverage is an emulated viewport, not a physical-phone test.
