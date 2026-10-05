# Phase 14 — Secure Payments

## Structure

```text
prisma/schema.prisma + migrations/20261006010000_phase_14_secure_payments/
src/lib/payments/
  config.ts                  server-only, explicit sandbox opt-in
  policy.ts                  exact minor units, legal transitions, fulfillment predicate
  provider.ts                PaymentProvider + durable, signed TEST adapter
src/server/repositories/
  order.repository.ts        trusted snapshots + aggregate stock reservation
  payment-inventory.ts       conditional reserve; atomic consume/release
  payment.repository.ts      attempt lifecycle, verified settlement, expiry, DB limits
src/server/services/payment.service.ts
src/validation/payment.ts
src/app/api/customer/payments/[publicCode]/[sandbox]/route.ts
src/app/api/payments/{webhook,expire}/route.ts
src/app/customer/payments/[publicCode]/page.tsx
src/components/customer/payment-client.tsx
scripts/verify-phase-14.ts    isolated real PostgreSQL/API/browser integration runner
linkedin/phase-14/           eight native application screenshots, no credentials
```

Square-bracket route segments are framework parameters, not client authorization. Every customer lookup adds the owning CustomerSession; every admin lookup adds current organization and permitted location constraints. Kitchen/delivery never receive provider identifiers, secrets or payment attempt details.

## The two boundaries

```text
Cart (no stock hold)
  -> database transaction: trusted Order + PaymentAttempt + stock reservations
  -> OUTSIDE transaction: idempotent provider create/retrieve
  -> database transaction: bind provider identifier
  -> signed callback OR trusted provider retrieval
  -> database transaction: settlement + consumption + eligibility + audit + journal
  -> existing kitchen / delivery states
```

PostgreSQL and a remote provider cannot share an ACID transaction. Persisting the attempt before calling the adapter supplies its stable provider idempotency key. If creation succeeds and binding fails, a retry reuses that attempt and the adapter returns the same intent. Status reads recover binding/retrieve terminal provider state too. If a valid callback arrives before binding, it is rejected rather than guessed; subsequent recovery retrieves the authoritative provider result. The sandbox ledger is durable in its own table but is called outside settlement transactions, deliberately modeling this boundary instead of pretending a future HTTP operation can roll back with SQL.

## Requested design walkthrough (1–65)

1. **Baseline:** local main was fast-forwarded to `b9a0a57`, which contains Phase 13 commit `9e0c3bd`. Work is on `phase-14-payments`, never merged here.
2. **Purpose:** keep financial truth separate from physical preparation/delivery. Payment failure is not a fictitious kitchen status.
3. **Provider abstraction:** create, retrieve, cancel and verifyWebhook form one server-only interface. Business services do not scatter provider SDK calls.
4. **Selection:** no merchant/provider configuration existed. Only `sandbox` with explicit opt-in is implemented. Unknown/live provider names fail closed. No real-money capability is installed or implied.
5. **Payment:** one row per Order stores amount/currency, current attempt number, verified state/timestamps and a safe review flag/reason. No card field exists.
6. **Attempts:** retries append numbered attempts with unique order-payment/key pairs. A failed attempt remains auditable; the original Order is reused.
7. **States:** PENDING can advance to PROCESSING/SUCCEEDED/FAILED/CANCELED; PROCESSING can advance to the three terminal states. Ordinary terminal states cannot go backwards. New retries have new attempts.
8. **Cards:** CineBite never collects PAN, CVV, PIN, bank credentials or provider authentication tokens. A future real adapter must use official hosted/tokenized controls.
9. **Amount authority:** checkout's strict schema accepts only key/note. Two popcorn at 5.00 plus Pepsi at 2.50 produces trusted 12.50, even if a browser attempts 0.01.
10. **Currency:** provider event, Payment and immutable Order currency must match exactly. No implicit currency conversion.
11. **Exact conversion:** string parsing and BigInt produce 1250 for 12.50 USD, 12 for 12.00 JPY, and 12500 for 12.50 KWD. JPY fractions and unsupported currencies are rejected. The bounded sandbox policy is USD/EUR/GBP/LBP/CAD/AUD/CHF/AED/SAR (two digits), JPY (zero), KWD/BHD (three). Current Order amounts have at most two decimals; three-digit currencies accept only amounts representable by that existing schema. A real adapter must supply its own supported currency rules.
12. **Reservations:** online initiation increases reserved stock, not permanent consumption. Reservation rows belong to both Order and attempt, preserving retry history.
13. **Physical stock:** quantityOnHand remains the physical balance. Payment initiation, failure and cancellation do not reduce it.
14. **Reserved stock:** quantityReserved represents active payment holds. PostgreSQL checks require `0 <= reserved <= onHand`.
15. **Available to promise:** customer projection uses `onHand - reserved`; admin overview shows all three values. Outbound staff adjustments cannot take stock promised to pending customers.
16. **Aggregation:** shared recipe ingredients are combined before holding stock, sorted for consistent lock order. Two products do not independently compete with their own order.
17. **Concurrency:** a parameterized conditional UPDATE reserves only when sufficient unreserved stock remains. Serializable transaction retries handle Prisma P2034 and adapter P2010 SQLSTATE 40001/40P01. Unknown raw SQL errors are not blindly retried.
18. **Expiry:** default hold is 12 minutes, configurable from 1–15 and capped by screening/session end. Database-driven sweeps process at most 100 candidates per call, not an in-memory timer. Closed screenings are candidates even before the timeout. Deployment must run the authenticated job every minute and repeat batches when needed; checkout/retry/status also sweep opportunistically. Idle stock is released by this job, so operating the schedule is required.
19. **Cart versus payment:** adding to Cart does not hold anything; Continue to payment creates the trusted checkout/hold. This prevents abandoned carts reserving stock.
20. **Remote boundary:** provider creation/cancellation/retrieval are outside SQL transactions. A durable attempt and provider idempotency key recover partial completion. Expiry/supersession atomically queues a cancellation request in the journal's distinct `sandbox-internal` namespace. The scheduler retries CANCEL_PENDING requests until provider cancellation/retrieval and any late-financial-truth processing complete; failures remain durable and return a backlog count. A callback attempts only its own related compensation, never an unrelated full queue. Cancellation after expiry does not invent a refund.
21. **Creation:** session, live screening, seat/hall/location/organization, active products, location offers, prices, currencies and recipes are checked before a new order/hold. Provider receives only server amount/currency.
22. **Idempotency:** original checkout uniqueness prevents duplicate Orders; attempt uniqueness prevents duplicate retries; stable attempt ID prevents duplicate provider intents. Client in-flight guards are additional UX only.
23. **Redirect security:** a `success=true` URL cannot change state. Payment page always fetches server state.
24. **Webhook:** dedicated Node route accepts no customer cookie requirement, bounds streamed body size to 16 KiB, verifies raw-body signature before parsing, and performs only relevant settlement work.
25. **Signature:** this is the explicitly documented sandbox protocol: HMAC-SHA256 over `timestamp.rawBody`, constant-time equal-length comparison, five-minute timestamp tolerance. It is NOT a fake implementation of a real provider protocol. Adding a real adapter requires that provider's official SDK verification.
26. **Event idempotency:** unique `(provider, providerEventId)` journal rows store only event type, receipt/processing times, status and a safe rejection code. Journal and financial effects commit together. A failed transaction leaves no fake processed receipt, allowing retry.
27. **Success:** compare provider ID/attempt/amount/currency, ensure a current viable attempt/live context, then atomically mark success, consume ACTIVE holds, decrement on-hand/reserved, insert immutable consumption movements, grant Order eligibility, audit and journal. No ACCEPTED order event is fabricated.
28. **Failure:** verified failure marks attempt/payment FAILED and releases ACTIVE holds exactly once. No physical-stock decrement or consumption movement.
29. **Cancellation:** sandbox owner cancellation produces a verified provider CANCELED result. Hold release is idempotent; Order operational status remains PLACED. It is not an Order cancellation/refund feature.
30. **Processing:** keep the hold within its deadline; never enter kitchen while processing. Expiry can cancel/release an abandoned processing hold.
31. **Late success:** never re-reserve or blindly consume after expiry, failure, superseded attempt, closed screening or invalid context. Record actual SUCCEEDED financial truth with `reviewRequired` and a safe reason, keep fulfillment ineligible, release remaining holds. No automatic refund. An additional settlement after an existing successful payment is journaled as a second-settlement review anomaly, not a second consumption.
32. **Duplicates:** exact repeated events are no-ops; distinct repeats of terminal outcomes are journaled IGNORED. Unique movement and successful-attempt indexes reinforce exactly-one business settlement.
33. **Races:** payment-parent row locking plus serializable transactions serialize webhook/retry/expiry competitors. Definitive success cannot be downgraded by stale failure. Failed/canceled attempts receiving real late success enter review, not ordinary fulfillment.
34. **Consumption:** on-hand 10/reserved 2 becomes on-hand 8/reserved 0 at success, reservation becomes CONSUMED, one movement records -2. Kitchen/delivery never consume again.
35. **Release:** on-hand 10/reserved 2 becomes on-hand 10/reserved 0 on failure/cancel/expiry, with RELEASED/EXPIRED timestamp. Conditional ACTIVE updates prevent double release.
36. **NOT_TRACKED:** products without recipes still support payment, but create no invented holds or movements.
37. **Kitchen gate:** centralized fulfillment predicate/SQL filter permits explicit legacy orders or verified online eligibility. It gates queue/detail queries and transactional kitchen/delivery actions. A database trigger also requires a non-review successful Payment before online Order eligibility.
38. **Legacy:** migration backfills existing Orders as LEGACY_NOT_REQUIRED/eligible without creating Payments or pretending cash was collected. Defaults are then changed so all new Orders require online settlement. Organization paymentMode is deliberately limited to ONLINE_REQUIRED for new checkout; no new legacy bypass is offered.
39. **Customer UX:** dark mobile-first summary shows movie, Hall/Seat, trusted items/total, clearly labeled test-only controls, pending/processing/confirmed/failed/ended/review states and same-order retry.
40. **Return-first:** show Confirming your payment and poll the server rather than trusting navigation/query data.
41. **Webhook-first:** the return page immediately reads confirmed server state. Closing the page does not prevent server settlement.
42. **Retry:** revalidate screening/session/resources, active product/offer/recipe, snapshot price/currency and stock. Changed price fails closed with a new-cart instruction. Duplicate retry keys reuse the same attempt; different keys cannot create concurrent active attempts.
43. **Ownership:** guest opaque HttpOnly cookie is hashed and revalidated; every payment query includes its owning CustomerSession. Public order code alone is not access.
44. **Admin:** current PostgreSQL organization grants scope the safe payment summary: state, provider (test only), amount/currency, attempt count, timestamps and review reason. No provider IDs, secrets or raw events are rendered.
45. **Manager:** identical financial summary only for current authorized locations. Foreign-location/tenant rows are never returned. Next streamed errors/redirects can produce HTTP 200 without granting access; tests inspect final route/content, not status alone.
46. **Kitchen/delivery:** operational DTOs contain no added provider/attempt payload. Delivery cannot run customer payment mutations with a staff session; no staff payment mutation endpoint exists.
47. **Audit:** Payment created/succeeded/failed/canceled/review and inventory reserved/released events use safe amounts, reason codes and counts, never credentials. Payment history does not replace immutable fulfillment history.
48. **Logging:** API failure logging remains limited to error name/code; no request headers, raw provider body, session cookies or credentials.
49. **Rate limits:** shared PostgreSQL fixed windows: initiation/retry/sandbox controls 12 per guest-session minute, payment status 90 per minute. Expired rows are cleaned by sweeps. Webhooks are signature/idempotency-protected without breaking legitimate retries. Add infrastructure-level unauthenticated abuse protection for a future public live deployment.
50. **CSRF:** customer POST controls/retries/checkout require existing same-Origin checks. Webhook uses signature, not guest CSRF. Expiry job requires a server-only bearer secret of at least 32 characters.
51. **Screening end:** pending attempts expire and holds release. A subsequent successful callback records review but cannot begin fulfillment. Already cleared Orders stay operational; customer reads retain the existing live-session eligibility rule.
52. **Screening cancel:** same policy. Monetary truth is preserved, with manual review for late capture, not a fictitious refund.
53. **Migration:** additive Phase 14 domain and outbox-index migrations only; all earlier migration files are unchanged. No reset/db push/production migration was executed. All eleven migrations were applied to an isolated local test database.
54. **Constraints:** one Payment per Order, unique attempt number/key and provider identifiers, one successful attempt per Payment, one ACTIVE hold per Order/stock, positive quantities/amount, reservation timestamp/state consistency, stock bounds, one consumption per Order/stock and verified online eligibility.
55. **Indexes:** existing stock location/item unique index serves conditional reserve. Payment status/update, attempt status/expiry, reservation order/status/expiry, bounded internal provider/status/receipt-time sweeps and unique event/intent keys support lifecycle queries without redundant indexing.
56. **Automated tests:** offline unit/schema/security tests run with mocked dependencies; the separate explicit integration runner executes actual PostgreSQL, HTTP APIs and Chromium. See verification report for final counts rather than treating written tests as executed.
57. **Manual/integration:** each requested A–AT outcome and evidence is recorded in phase-14-integration-results.json. Failed runs were investigated and rerun; the final report replaces preliminary runs, with no claim that unexecuted tests passed.
58. **Real provider:** NOT EXECUTABLE because none is selected/configured. No real charge, merchant dashboard, official real-provider test-card or hosted-card verification is claimed.
59. **Firestore:** payment/order/availability data remain PostgreSQL; existing Firestore is untouched legacy migration/backup data.
60. **Screenshots:** eight real app PNGs in linkedin/phase-14, captured from the optimized app with demo data and an isolated auth emulator.
61. **Cropping:** native browser page screenshots contain only CineBite, including the full relevant app content; no OS/taskbar/tabs/editor/DevTools and no resize/AI reconstruction.
62. **Privacy:** no real customer identity, card input, provider dashboard, QR credential, guest token, database URL, private key or secret in screenshots. Runtime test keys remain memory-only; ignored local cluster/debug artifacts are not staged.
63. **Limits:** sandbox only; required production scheduler/operator setup; no live merchant adapter, automatic review resolution, refunds, saved cards, wallets, fees/taxes/discounts, subscriptions or fraud tooling. Original Order Decimal precision is retained deliberately.
64. **Refund boundary:** refunds need their own state, authorization, provider idempotency/reconciliation and stock policy. A late payment review flag is not a refund implementation.
65. **Next phase suggestion:** user-reviewed provider onboarding and reconciliation/refund design could follow. Nothing from Phase 15 is implemented; this branch is left for GitHub review/merge.

## References consulted

The installed Next.js 16.3.8 guides were read before route/client code changes. Serializable transaction guidance follows [Prisma transaction documentation](https://www.prisma.io/docs/orm/fundamentals/transactions). The sandbox uses [Node crypto primitives](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b); constant-time comparison alone does not remove the need for strict signature parsing, raw-body verification and protected secrets.
