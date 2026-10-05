# Phase 14 verification

Executed 2026-10-05 with Next.js 16.3.8, Prisma 7.10.0, PostgreSQL 17, Firebase Auth emulator 15.32.1 and installed Chrome/Playwright. The runner uses the optimized application build and actual PostgreSQL/HTTP/browser operations, not mocked screenshot renderers.

## Final results

- Offline Vitest suite: **391 tests in 53 files — PASS**.
- ESLint, TypeScript `--noEmit`, optimized production build — **PASS**.
- Prisma format/validate/generate — **PASS**.
- Eleven migrations applied to isolated local PostgreSQL; migration status up to date; schema diff with `--exit-code` reports **no difference — PASS**.
- Requested integration cases **A–AT: 46 PASS, 0 FAIL, 0 NOT EXECUTABLE**.
- Additional cancellation-recovery, create/bind-recovery, superseded-success and full paid-order kitchen/delivery regression: **4 PASS**.
- Real merchant adapter/official merchant test-card facilities: **NOT EXECUTABLE** (none configured). No real charge or live financial readiness is claimed.

Individual executed outcomes/evidence are in [phase-14-integration-results.json](phase-14-integration-results.json). Written scenarios were actually executed; failed preliminary runs were fixed and rerun. In particular, a genuine last-stock race exposed adapter raw-SQL serialization errors as P2010/SQLSTATE 40001 instead of P2034. Recognizing these specific retry states fixed the intermittent 500; final simultaneous checkout returns one success and one 409. Test locators/authorization assertions were also corrected for the actual link labels and Next.js streamed-error/redirect behavior, without weakening application authorization.

## Critical evidence

Trusted total/currency reject browser tampering; adding to cart does not reserve. A shared recipe aggregates one reservation. On-hand 10/reserved 2 projects eight units. Signed success consumes once; failed/canceled/expired attempts release without consumption. Ten exact signed success callbacks produce one settlement, movement and audit. Invalid signatures and validly signed amount/currency/provider-ID mismatches have no business effect. Success-query navigation cannot mark paid; return-first and webhook-first browser races behave correctly. Browser closure does not stop settlement.

Concurrent same-key checkout and retry create one intent/active hold per attempt. Expiration repeated twice does not release twice. Late payment truth is flagged for review with no oversell or fulfillment. A missing sandbox provider record during cancellation leaves a durable cancellation request; the next job completes it after recovery. Losing an intent binding recovers the same provider intent. An older attempt's late success releases/cancels its replacement, without stock consumption.

Guest ownership, anonymous-code access, tenant scope, manager location grants, kitchen provider-data exclusion and delivery mutation denial were exercised. Existing explicit legacy orders remain actionable without fabricated payments. Actual screening end and actual admin screening cancellation close pending fulfillment; already paid orders still complete kitchen and delivery with six immutable operational events and no second stock deduction. A real 390×844 browser completes cart → checkout → failure → same-order retry → processing → signed success → progress.

## Isolation

Only `127.0.0.1:55414/cinebite_phase14_test`, Auth emulator `127.0.0.1:9144`, demo project `demo-cinebite-phase14`, and the runner's application at port 3114 are used. The script never loads `.env.local`; signing/provider/job secrets are generated in memory. Its staff identities use example.com addresses only and are disabled after each run. Local fixture business data are retained as reproducible evidence in the ignored test cluster. Production Neon/Firebase and real payment providers are never written.

The Phase 13 regression runner now explicitly settles sandbox payment before testing operational transitions, so it remains compatible with the new required-payment policy. Its previous evidence images were not replaced. The original Phase 13 harness itself was not rerun this phase; the Phase 14 suite separately exercised actual paid kitchen/delivery transitions.

## Screenshots and staged security review

Eight native PNG application captures are in [linkedin/phase-14](../linkedin/phase-14/README.md). All eight were visually inspected at native resolution: readable text, complete relevant application content, no blur, OS/taskbar/browser chrome, DevTools, notifications or unrelated apps. The amber sandbox notice is intentional disclosure, not a runtime error. Images contain only fictional cinema/customer data and example.com test staff, no card information, provider tokens/secrets, private emails, QR credentials, session cookies, database URLs or Firebase private keys.

The runner checks its source diff against actual ephemeral private/provider/job/guest secrets. Before commit, the staged file list and diff are scanned separately: `.env.local`, local cluster/browser/debug artifacts and generated Prisma output remain ignored; no private key material, cloud connection URL or credential assignments are staged. No production migration is included as an executed action; operator review/merge, controlled migration, private sandbox configuration and a scheduled expiry job are required before enabling this flow in a deployment.

No refunds, chargebacks, saved cards, discounts, taxes or live-provider onboarding were added. See the [65-point architecture walkthrough](phase-14-architecture.md) for constraints, recovery policies, currency precision and future boundaries.
