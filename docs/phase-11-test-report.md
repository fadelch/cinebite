# Phase 11 test report

Executed on 2026-10-05 against the CineBite development configuration and safe `cinebite-demo-cinemas` data. Automated Vitest tests use mocks/pure functions and do not write to Neon or Firebase. The explicitly executed integration capture uses only the named demo tenant.

## Executed and passed

- A–C: Add Large Popcorn, change quantity `1 → 2`, add/remove semantics, and server totals exercised through the real customer UI/API.
- F–G and Y–AA: strict checkout schemas rejected injected price, total, Seat, Location, Screening, and Organization authority fields.
- M–N: real order created with two Large Popcorn and one Pepsi; exact `12.50 USD` total, item/context snapshots, aggregate deductions, negative `ORDER_CONSUMPTION` movements, one audit row, and cart clearing verified from PostgreSQL.
- R–S: the same successful idempotency key returned HTTP 200 and the original public order; one Order and one set of deductions remained.
- AH–AI: the flow was exercised at `390 × 844`; screenshots were visually inspected at original resolution and contain only the CineBite application with safe demo content.
- Cart non-reservation: inventory values were compared before adding and before checkout and remained identical.
- Quality: Prisma validate/generate/migrate, TypeScript, Vitest, ESLint, and production build passed.

## Covered by automated/persistence invariants but not destructively exercised

- D, AD–AF: ownership and tenant/location conditions are encoded in CustomerSession-scoped Cart/Order queries and admin organization/location predicates. No cross-tenant demo identities were changed for manual probing.
- H–L, O–Q, U–X, AB–AC: service branches, database checks, snapshot fields, serializable transaction, guarded decrement, and rollback design were reviewed; calculation/strict-validation branches have automated coverage. Destructive permutations of shared demo catalog/screening/session state and a real concurrent last-stock race were not run against the configured remote database.
- AG: repository search verified there are no Phase 11 Firestore writes; PostgreSQL repositories are the only Cart/Order persistence path.

## Not executable in this environment

- A true packet-loss timeout simulation and two-device physical concurrency run were not available. Same-key replay was executed as the deterministic retry equivalent.
- Payment, Kitchen, delivery, discounts, refunds, promotions, and ticketing are intentionally outside Phase 11 and were not tested.
