# Seat check-in verification — 2026-10-13

Branch: `security/seat-check-in`, based on the current `ops/staging-activation` work.
No hosted deployment, Neon migration, production write or billing action was performed.

## Executed locally

| Check | Result |
| --- | --- |
| Full Vitest suite | PASS — 746 tests, 83 files; final rerun with one worker |
| Full ESLint and TypeScript | PASS |
| Prisma schema validation | PASS |
| Synthetic-environment Next.js production build | PASS |
| Repository/history/client-asset secret scan | PASS; repeated after staging files |
| Fresh PG17 migration | PASS — 22 migrations, loopback-only synthetic DB |
| Real PostgreSQL security scenarios | PASS — 13 scenarios |
| Mobile Chrome browser and synthetic sandbox checkout | PASS — 6 scenarios |

SQL scenarios: QR alone cannot create/evict a session; wrong/cross-seat codes;
one winner under concurrent redemption; explicit fresh replacement authorization;
five persisted failures; expiry and old screening; QR revocation; rotation racing
redemption; in-flight authorization versus revocation; cross-tenant/suspended staff;
shared verification quotas; unchanged paid orders/payment/refund/inventory digests.

Browser scenarios: ordering-button open/focus/clear/close; external URL refusal;
passive QR confirmation; empty/wrong/fresh code verification and homepage resume;
real local cart/4.00 USD synthetic sandbox settlement; revoked access with unchanged
settled order/payment. No external browser request was allowed. This is Chrome
mobile emulation, not a physical-phone or real provider test.

Initial regressions required updating obsolete QR-only test fixtures. A harness
inventory table name and a Playwright toast selector were corrected; the final
scenarios passed. Under overlapping workload, two existing five-second unit tests
timed out; a full quality run passed with two workers and the final full suite
passed with one worker. No assertion or timeout was relaxed. An existing PG driver
query-concurrency deprecation warning appeared during SQL tests; it was not a
security-test failure. Code-managed migrations and financial schemas were preserved.

The owned local database instance was stopped after verification; synthetic data
is retained privately under ignored `ops-private` for inspection. No real account,
ticket, customer or financial data was copied.

## Not executed / remaining acceptance

- Hosted Vercel deployment and hosted Neon migration: intentionally not authorized.
- Hosted Firebase staff sign-in and ticket handover: require staged rollout and UAT.
- External payment-provider sandbox: no real PSP adapter is configured; no claim made.
- Physical-phone tests and proof of continuous on-site presence: not established.
- Provider backups/PITR, hosted restore/rollback and historical phase load harnesses:
  not run for this change. Updated CI retains isolated recovery checks; older
  QR-only fixture scripts are not current acceptance drivers.

Read [design, migration and remaining risks](SEAT_CHECK_IN.md) before staged rollout.
An old QR image alone no longer authorizes orders, but fresh-code sharing, stolen
cookies, staff mistakes and deliberate code lockout remain risks. Production NO-GO
is unchanged. Do not deploy this branch without the matching reviewed migration.
