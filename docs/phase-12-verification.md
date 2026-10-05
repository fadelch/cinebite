# Phase 12 verification

Verified locally on 2026-10-05 using the production Next.js 16.3.8 build.

| Check | Result |
| --- | --- |
| Full offline Vitest suite | PASS — 45 files, 286 tests |
| ESLint | PASS |
| TypeScript (`tsc --noEmit`) | PASS |
| Production build | PASS |
| Prisma validation/generation | PASS |
| Migration deployment/status | PASS — eight migrations applied; no pending migration |
| Requested integration scenarios A–AH | PASS — 34; FAIL — 0; NOT EXECUTABLE — 0 |
| Screenshot review | Nine actual application-only demo screenshots inspected at original resolution |

Detailed A–AH evidence is recorded in [phase-12-integration-results.json](phase-12-integration-results.json). The explicit scenario runs against isolated demo contexts in the configured Neon database, with real Firebase staff sessions and real customer cookies. It is not included in npm test or CI.

Verified with two distinct staff identities: simultaneous Accept, Preparing and Ready each return one 200 and one 409, with one event for that step. A second kitchen page and a customer page refresh automatically. Stock quantity and consumption movement count remain unchanged during kitchen transitions. Product renaming preserves the item snapshot. Unauthorized location/tenant reads/actions, customer mutation and Delivery Staff mutation are denied. Managers and Cinema Admins successfully perform permitted fallback actions.

The database rejects both event UPDATE and DELETE. Every existing order has its initial PLACED event; the completed demo order has exactly four timeline events and three kitchen audit records. Expired guest sessions and ended/cancelled screenings preserve kitchen orders; cancellation shows a warning and restores no inventory. A script-like note renders as text without execution. Desktop, 1024×768 tablet, and 390×844 phone layouts were exercised; native dialog opening/Escape closing and a phone action were verified.

Earlier evidence-run setup failures were resolved before the final passing run: nested demo membership creation, production Neon bundling, simultaneous fixture checkout contention, and the API client's Secure-cookie loopback filtering. Production Secure-cookie settings and authorization were not weakened. Checkout setup is sequential; kitchen concurrency tests remain simultaneous.

One background API refresh logged an unexpected error during the final screenshot run. The tested kitchen/customer pages subsequently reached the expected states through automatic refresh; no transition assertion failed. The root cause of that individual transient request was not conclusively diagnosed. Polling retains the last successful data and retries non-authorization failures. This is reported rather than implying the environment never experienced an error.

The security review found a critical advisory in the original Next.js 16.3.5 dependency. Next and its lint configuration were patched to 16.3.8, removing that critical finding. npm still reports **16 dependency advisories: 14 high and 2 moderate**. These remain open for a separate dependency compatibility/security review; a blind `npm audit fix --force` would introduce unrelated breaking changes. Passing phase checks does not mean the dependency audit is clean or constitute a complete penetration/accessibility/load test.

Only isolated demo records were created/processed. Demo orders and immutable events remain as evidence; no real order or stock was edited. Temporary example.com staff identities are disabled after the run and their PostgreSQL users are inactive. Secrets, environment files, cookies, tokens and operational QR images are excluded from committed evidence.

This phase ends at READY. Payment, delivery, cancellation, refunds and restocking were not implemented. The phase branch is for user review; it must not be merged automatically.
