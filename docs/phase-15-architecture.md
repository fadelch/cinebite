# Phase 15 — Cancellation, refunds and exceptions

This is the detailed handoff for all 67 requested architecture topics. Implementation stays on `phase-15-cancellations-refunds`; only the user reviews/merges it. PostgreSQL owns business truth. All executed financial evidence uses the explicitly enabled sandbox; there is no live refund adapter or real-money claim.

## Structure and transaction boundaries

```text
customer/staff browser
  -> same-origin, bounded JSON route
  -> trusted CustomerSession / verified staff cookie
  -> cancellation.service (parse, authenticate, scope)
  -> cancellation.repository / refund.repository (fresh SQL grants + locks)
     -> immutable cancellation/status/audit/stock history
     -> durable PENDING Refund / provider-cancellation outbox
  -> existing PaymentProvider (outside SQL transaction)
  -> authenticated provider event or server retrieval
  -> existing payment_webhook_events journal + exact settlement
  -> safe financial DTO -> polling/confirmation UI
```

The four domains intentionally do not share one status field:

| Domain | Example truth | What it must not imply |
| --- | --- | --- |
| Order | CANCELED or DELIVERED | Money has already returned |
| Payment | SUCCEEDED | No refund exists |
| Refund | PROCESSING or SUCCEEDED | Food/ingredients can be restocked |
| Inventory | Restored, released, or retained | Provider bank settlement |

`src/validation/cancellation.ts` defines strict public inputs. `src/lib/payments/refund-policy.ts` owns pure money/state rules. `refund-domain.ts` stages refunds and deduplicated system issues inside an existing transaction, without provider calls or dependency cycles. `cancellation.repository.ts` handles authorization, cancellation and original stock restoration. `refund.repository.ts` owns provider dispatch, recovery, verified events and safe projections. `cancellation.service.ts` orchestrates trusted identities/actions; `financial-route.ts` shares bounded request/CSRF handling. The UI uses the existing notification and polling infrastructure, not a competing payment/order system.

## 1. What Phase 14 achieved

Phase 14 separated payment from fulfillment, calculated captured amounts from immutable server Order totals, introduced durable PaymentAttempt/provider idempotency, signed event processing and short-lived inventory reservations. Available stock became on-hand minus reserved; verified capture consumed once and gated the kitchen. Phase 15 extends these existing records and adapter. Replacing them would split financial truth and risk double consumption; preserving them also preserves historical legacy orders.

## 2. Phase 15 purpose

This phase handles legitimate interruption and money return without deleting business history. A customer may stop an unaccepted order; supervisors may authorize exceptional stops or financial adjustments. Structured cancellation, separate Refund and lightweight OrderIssue make accountability explicit. For example, refunding a damaged delivered snack changes financial records, not the fact that delivery occurred.

## 3. CANCELED Order status

`CANCELED` is a terminal operational state, not a Payment or Refund status. Database guards prohibit rewinding canceled orders or changing delivered orders into canceled ones. Central fulfillment queries additionally exclude canceled orders, including explicit legacy ones. The customer page checks this state before the online-payment gate so a canceled unpaid order cannot misleadingly say “confirm payment to continue.”

## 4. Customer cancellation policy

Only the owner identified by a valid trusted CustomerSession may self-cancel a `PLACED` order. Both service and transaction check ownership, and the transaction checks session activity/expiry. Hiding the button is convenience, never authorization. If Kitchen accepted first, the server returns `TOO_LATE_TO_CANCEL` with a friendly message; the customer cannot submit `exceptional=true`, a provider ID or another session ID.

## 5. Staff cancellation policy

Cinema administrators operate inside their own organization; location managers need current active grants for the actual Order location. After PLACED, the request must explicitly enable exceptional cancellation, provide a structured reason and confirm. Every write rereads PostgreSQL User/membership/organization/access in the transaction. Kitchen/delivery roles are refused even if they know the order ID or fabricate a browser form.

## 6. OrderCancellation model

One unique immutable record per Order stores origin status, initiating CUSTOMER/STAFF/SYSTEM type, optional PostgreSQL staff identity, reason/note, inventory disposition and server timestamp. A database trigger disallows updating/deleting it. Refunds relate to the same Order/Payment rather than a mutable single `refundId` on cancellation: a cancellation may span failed/retried refund records, or previously issued partial refunds. This preserves financial history instead of replacing a pointer when retrying.

## 7. Cancellation reasons

Reasons are CUSTOMER_REQUEST, SCREENING_CANCELED, ITEM_UNAVAILABLE, OPERATIONAL_ISSUE, DELIVERY_ISSUE, DUPLICATE_ORDER and OTHER. Optional notes are trimmed and capped at 300 characters in Zod and SQL. React displays notes as escaped plain text, not HTML. Structured codes support reliable audit classification; unrestricted paragraphs alone would make automated reconciliation ambiguous. Do not enter credentials/card details into notes.

## 8. Cancellation concurrency

Financial transactions use serializable isolation, lock Order before Payment, and retry known serialization/deadlock conflicts. Cancellation performs a status compare-and-set plus stock/refund/history writes in the same transaction. Uniqueness on cancellation, terminal event and restock effects supplies additional defense. A failed transaction rolls all of these back, rather than leaving money work committed while operational cancellation loses its race.

## 9. Customer cancel/Kitchen Accept race

Both actions require the current PLACED state. If cancellation commits first, the kitchen CAS/payment eligibility checks fail. If acceptance wins, the cancellation retry rereads ACCEPTED and returns TOO_LATE_TO_CANCEL. The executed simultaneous test observed exactly one HTTP success and one conflict. The adapter can expose raw PostgreSQL serialization errors differently from Prisma P2034, so Kitchen/Delivery now reuse the known SQLSTATE retry/conflict classifier instead of returning an accidental 500.

## 10. Manager cancel/Delivery race

Exceptional cancellation and marking DELIVERED compete over OUT_FOR_DELIVERY. Exactly one terminal state wins; failed event inserts/financial side effects roll back. Claimed delivery identity/timestamps are retained on a canceled delivery, not erased to satisfy an old constraint. If delivery wins, staff may refund separately afterward but cannot relabel delivery as cancellation. The genuine concurrent integration case exercises this boundary.

## 11. Unpaid cancellation

The Order stops immediately. Failed/provider-canceled attempts release any residual active hold idempotently, without a Refund. Pending attempts create a durable provider-cancellation request; physical stock is untouched. After provider terminal cancellation/failure is verified, active reservations release once. The database cancellation record describes the policy applied at initiation; live financial/reservation state records subsequent completion.

## 12. PROCESSING payment cancellation

Processing is not falsely reported as financially canceled. The immutable disposition is HOLD_UNTIL_PROVIDER_FINAL; fulfillment stops while stock stays promised. The sandbox can safely return CANCELED or an already captured SUCCEEDED. A provider outage leaves durable work and protected stock for the recovery job. A capture arriving during cancellation records historical payment success, releases the unused hold, starts a remaining refund, and never consumes/sends a canceled order to Kitchen. A real adapter must document and authenticate its own terminal guarantees before being enabled.

## 13. Paid PLACED cancellation

Within one locked transaction, stop the Order, stage a remaining full refund, restore eligible original consumption and append cancellation/status/audit records. Provider refund work happens afterward and may remain PROCESSING. For example, 12.50 captured with no prior refund stages 12.50; with 2.50 already returned it stages only 10.00. Inventory restoration is safe because Kitchen has not accepted the order, regardless of bank settlement timing.

## 14. Inventory restoration

For PLACED, read original ORDER_CONSUMPTION movements in deterministic stock order. Add each exact negated delta back to the same LocationInventory and append matching ORDER_CANCELLATION_RESTOCK. The unique terminal cancellation serializes repeat requests; a partial unique index additionally prevents repeated restock per order/stock. Products that never consumed tracked inventory produce no fabricated movement or restoration.

## 15. Why original ORDER_CONSUMPTION is used

Recipes are editable; historical consumption is financial/physical evidence. The test captures an order consuming 300g and two cups, changes its recipe to 900g/three cups, then cancels it. Only 300g/two cups return. Recalculating today's recipe would manufacture stock. Original order stock movements are now append-only at the database boundary to protect this restoration source.

## 16. Restock movement type

ORDER_CANCELLATION_RESTOCK clearly distinguishes system cancellation return from manual RECEIVE, adjustments and waste. It references the original Order and stock record, with a positive delta. SQL requires its delta to match the original consumption and the Order still to be PLACED when it is inserted. Staff cannot select this type in the ordinary manual-stock-write endpoint; inventory history/filter labels recognize it.

## 17. Why post-Kitchen cancellation does not auto-restock

Once accepted, ingredients might be opened, prepared or wasted. Exceptional cancellation records NO_AUTO_RESTOCK and refunds available captured funds without physical mutation. Staff can use the existing explicit stock-adjustment workflow if independently justified. Automatically adding prepared food's ingredients back would make inventory wrong even if the financial refund was correct.

## 18. Refund model

Refund holds Payment/Order references, provider/name/binding, independent status, exact Decimal amount/currency, reason/note, initiating actor, unique payment-scoped idempotency key and timestamps. `retryOfId` links a new attempt to its failed predecessor and allows at most one direct successor. Restrictive foreign keys and deletion guards preserve captured-payment and adjustment history. Public summaries omit provider bindings; customer summaries also omit internal refund IDs and operational notes.

## 19. Refund state machine

PENDING is durable local intent, PROCESSING means authenticated provider acceptance, SUCCEEDED means verified returned funds, FAILED means confirmed terminal failure, and CANCELED is terminal provider cancellation. Pending/processing can advance forward; terminal records cannot be rewound. Retry is a new linked Refund, not a status reset. Exact transition guards exist in pure policy, webhook processing and SQL terminal-history protection.

## 20. Why Payment remains historically SUCCEEDED

A charge occurred even when later refunded. Leaving Payment SUCCEEDED preserves that financial fact; separate Refund sums explain the returned money. “Fully refunded” is derived from successful refund amounts, not Payment.status=CANCELED. This avoids confusing an unpaid authorization cancellation with an actual captured-and-returned charge.

## 21. Full Refund

Full means server-computed remaining available captured funds, after successful and in-flight refunds. The browser supplies FULL intent, reason and idempotency key—not authoritative currency/total. If all funds are committed or returned, no second refund is allowed. Automatic cancellation may legitimately stage no additional refund when existing financial adjustments already account for the whole capture.

## 22. Partial Refund

Authorized supervisors request a positive amount, capped by the freshly computed captured balance. Currency comes from Payment. Customer partial-refund self-service is not added. For example, a manager can return 2.50 of a 12.50 charge for a missing item without deleting OrderItem or changing quantity/total. Strict input schema rejects provider IDs, alternate currency and excess decimal precision.

## 23. Remaining refundable calculation

`refundableBalance` uses captured amount minus SUCCEEDED minus PENDING/PROCESSING sums. A provider/network error is not terminal failure and does not free exposure. Confirmed FAILED/CANCELED records stop reserving funds, but remain historical. Example: after successful 2.50 and processing 8.00 on 12.50, returned=2.50, processing=8.00, available=2.00. This is safer than subtracting only completed refunds while concurrent requests are underway.

## 24. Decimal handling

Prisma Decimal and Phase 14 BigInt/string minor-unit conversion are authoritative; no JavaScript floating-point business sums. `04.00` represents exactly four units of currency. Order/refund storage remains Decimal(12,2), with the existing bounded currency policy; unsupported fractional amounts such as fractional JPY fail with a controlled error. Browser `Number` use is presentation/visibility only and cannot override the locked server calculation.

## 25. Refund provider abstraction

The existing PaymentProvider gains createRefund/retrieveRefund. The sandbox uses a durable separate ledger, validates capture/currency and its own exposure under a provider-side lock, and returns deterministic idempotent intent bindings. Business services do not scatter provider-specific SDK calls. Real adapters must implement official verification/capabilities and suitable failure semantics separately; none is claimed implemented here.

## 26. Refund idempotency

One `(paymentId,idempotencyKey)` identifies a financial intent; one provider refund ID binds it. The stable internal Refund ID is also the provider creation key. A double click or network replay finds the existing row/intent. Changed partial amounts on a reused key conflict. SQL intent is never deleted after an uncertain result, so recovery can safely retrieve/recreate using the same key instead of inventing another refund.

## 27. Refund concurrency

All creators serialize on Order/Payment and subtract in-flight exposure before inserting. A database trigger also locks Payment, verifies captured relationship/currency/provider and caps aggregate live exposure. Two supervisors requesting 8.00 against 10.00 produce one success and one controlled rejection. Provider ledger protection is an independent second boundary, not a substitute for business transaction protection.

## 28. Refund webhook

Use the same bounded raw-body `/api/payments/webhook` endpoint and `x-cinebite-sandbox-signature` contract as Phase 14. Signature/timestamp verification precedes JSON parsing. Refund-shaped events validate kind, event/refund/provider-payment identifiers, exact minor units and currency; then locked processing journals and applies the legal transition. Raw payloads/authorization secrets are not stored in event/audit logs.

## 29. Duplicate refund webhook

The provider/event unique journal prevents repeated effects for the same event ID. Different event IDs reporting the same terminal result are also ignored by the state machine. Five duplicate success callbacks produced one successful transition/audit and no extra stock mutation or cancellation. Event replay cannot independently restock; refund processing deliberately has no restoration function.

## 30. Refund failure

Only verified failure changes Refund to FAILED and records failedAt. A deduplicated PAYMENT_REFUND_FAILED issue alerts a supervisor, while the canceled Order remains canceled. Customer UI says “Refund requires attention,” not “Refunded.” Unknown creation/binding/network failure instead remains PENDING/committed because a provider might have accepted the money operation before the connection failed.

## 31. Refund retry

An authorized supervisor explicitly retries a confirmed failed record. Lock the original payment, recalculate available balance, create a new linked Refund with its own stable provider key, and preserve the failed predecessor. Duplicate retry requests return the same direct successor. If that successor also fails, retry it explicitly to preserve a chain. The UI distinguishes a failed attempt recovered by a successful retry from an unresolved failure.

## 32. Delivered refund behavior

Both full and partial delivered refunds leave DELIVERED, assigned delivery staff, all operational timestamps and status events unchanged. They do not create OrderCancellation or restock. Actual tests returned 2.50 then the remaining 10.00 while asserting the original delivery history IDs and inventory balances were identical.

## 33. Why refund != inventory restoration

A financial remedy is not proof that physical ingredients returned. Inventory restoration belongs solely to the eligible cancellation transaction. This separation prevents duplicate refund webhooks, partial refunds or charge adjustments from manufacturing stock. Financial actions can be independently authorized without silently stopping an already progressing order.

## 34. Customer cancellation UI

Owner-only financial panels accompany both payment and progress pages. The cancellation button appears only for server-derived PLACED; a native accessible dialog explains stops, refund initiation and non-instant bank settlement. A guarded in-flight request prevents double-clicks. After success, both financial and order/payment polling refresh immediately so an old “order received” header cannot contradict cancellation.

## 35. Customer refund status

Safe DTOs show paid, refunded and processing amounts plus truthful refund history. PROCESSING never becomes completed merely because a redirect occurred. Failure/retry status is explicit. Customer access still follows the existing seat-session lifecycle; expired/revoked sessions do not acquire permanent financial access, while staff manage retained business records independently.

## 36. Admin refund UI

Order detail adds safe financial balance/history, cancellation/disposition, issues, separate full/partial refund forms and explicit failed-refund retry. Reason and optional safe note accompany actions; confirmation shows exact requested amount/currency and rechecks it on the server. TEST success/failure controls are explicitly labeled sandbox and require authenticated supervisor access plus same-origin validation; they cannot refund real money.

## 37. Location Manager scope

The actual Order organization/location must match an active PostgreSQL membership and either allLocations or current LocationAccess. Scope is checked on read, cancellation, creation, retry, simulation, issue resolution and each bulk write. Changing order/refund IDs does not bypass it. The executed Beirut manager test allowed Beirut reads but denied Dbayeh cancellation/refund with safe 404 responses.

## 38. Cinema Admin scope

Cinema administrators may operate across their own organization's locations only. The trusted actor organization must match the Order organization before current membership is accepted. No implicit platform-wide financial privilege or cross-tenant ID lookup is granted. Cross-tenant tests exercised both directions and returned no financial details.

## 39. Kitchen/Delivery restrictions

Those staff roles can act on their existing operational workflows, not payments/refunds/cancellations. Server financial endpoints require Cinema Admin or Location Manager before work starts and revalidate grants inside the transaction. Their issue endpoints return only issue ID/status, not provider or financial data. Actual kitchen/delivery attempts at financial endpoints were denied.

## 40. OrderIssue model

The lightweight record contains order, type, OPEN/RESOLVED state, reporter, safe note, created timestamp and optional resolution/resolver/time. A unique optional deduplication key supports automatic screening/refund-failure issues; normal reports can represent distinct legitimate problems. This is intentionally not a chat/ticket/escalation platform.

## 41. Delivery issues

Only the assigned delivery worker on OUT_FOR_DELIVERY may report customer/destination/damage/missing-item problems. Example: customer is unavailable at A13. Reporting creates an OPEN issue/audit and leaves assignment, fulfillment, payment/refund and inventory untouched. Another worker cannot use reporting to manipulate an unassigned order.

## 42. Kitchen issues

Kitchen staff may report ITEM_MISSING, ORDER_DAMAGED or OTHER during kitchen states. The UI is a separate collapsible report form below ticket controls. Notes are escaped; they never become a financial action. This lets operators identify trouble without extending their privileges to refund captured charges.

## 43. Issue resolution

Authorized supervisors confirm a nonempty safe resolution, retaining reporter/type/time and recording resolver/time. Resolution does not implicitly refund, restock, cancel or rewind. A decision such as “confirmed corrected seat; continue assigned delivery” is auditable. If the decision requires cancellation/refund, the supervisor deliberately uses that separate guarded workflow.

## 44. Screening cancellation reconciliation

Screening cancellation and bulk financial effects are separate steps. The canceled-screening page previews a bounded actionable batch and preserved delivered/canceled counts. The browser confirms that exact reviewed list of IDs; server scope and live states are rechecked. A newly discovered unreviewed order is not silently added to the submitted batch.

## 45. Pending-payment screening cancellation

Reviewed PLACED unpaid orders become CANCELED under a SYSTEM policy, but current requesting staff grants are checked in the same transaction. Provider cancellation is durable; active stock stays protected until terminal confirmation. No refund exists unless a real verified capture races the stop. Sandbox provider cancellation confirms immediately, so test holds release safely.

## 46. Paid PLACED screening cancellation

Use exactly the ordinary cancellation/refund/restoration domain, not a new bulk implementation. Full remaining refundable funds are staged and original consumed stock restored once. Distinct SCREENING_CANCELED reason and reconciliation audit explain the system policy and approved supervisor. Repeating the reviewed batch does not create new money or physical effects.

## 47. Preparing/Ready/Delivery screening cancellation

Started orders remain in their genuine operational state and receive one SCREENING_CANCELED supervisor issue. There is no automatic restock or refund. A supervisor can choose exceptional cancellation using the normal financial guard, or continue fulfillment. If Kitchen wins a race against PLACED reconciliation, the transaction rereads and reclassifies rather than treating prepared ingredients as unused.

## 48. Delivered screening cancellation

Already delivered orders stay delivered and do not automatically refund or restock merely because the Screening changed later. Delivered/canceled records are counted for preview but excluded from actionable reconciliation. This preserves independent delivery truth rather than making current screening status erase historical service.

## 49. Bulk reconciliation

The preview identifies at most 100 actionable orders; confirmed submitted IDs are bounded, unique and screening-filtered. Financial/auth checks are repeated per Order. Provider calls stay outside those transactions and use durable recovery. After execution, the next preview shows the remaining batch. There is no blind “refund all historical orders” query or long transaction holding every cinema row during external I/O.

## 50. Reconciliation idempotency

Cancellation has unique order history; refunds use `cancel:orderId`; restocks have unique order/stock effects; system issues use screening/order deduplication keys. Delivered/canceled rows never starve later actionable batches. Executing the same reviewed IDs twice was tested with unchanged cancellation/refund/restock counts and reserved balances.

## 51. Payment success/cancellation race

Both operations lock the same Order/Payment in the same order. If capture wins first, normal consumption occurs and eligible cancellation restores that original stock and stages refund. If cancellation wins, stock stays held until financial result; capture then releases the unused hold and stages refund without consumption/fulfillment. The tested simultaneous webhook/customer request ended CANCELED + Payment SUCCEEDED + one Refund, with no active holds or kitchen eligibility.

## 52. AuditLog

Meaningful audits include ORDER_CANCELED, REFUND_CREATED/SUCCEEDED/FAILED, ORDER_ISSUE_REPORTED/RESOLVED, INVENTORY_RESTORED_FOR_CANCELLATION and SCREENING_ORDER_RECONCILED. References use database identities, not email as authority. Money/status/reason/classification are safe metadata; raw provider payloads, bearer/signing/session/QR credentials and cards are not logged. Idempotent replays do not duplicate actual transition audits.

## 53. Prisma migration

Four additive migrations introduce enums/models, refund/terminal guards, extensions to Phase 12/13 fulfillment constraints, and original-stock-history guards. Separate enum addition commits before constraints reference new enum values. Earlier migrations are untouched; all 15 migrations applied to a fresh isolated local database. Production Neon was not reset, pushed or migrated during this task.

## 54. Constraints

Checks require positive refund amounts, matching capture relationship/currency/provider, bounded aggregate exposure, correct terminal timestamps/actors, eligible cancellation origins, valid issue resolution and stock movement signs. Unique cancellation/restock effects protect repetition. Order/cancellation/status/inventory history guards protect terminal and original consumption truth. Existing actor, stock-reservation and delivery-assignment rules are extended, not removed wholesale.

## 55. Indexes

Unique payment/idempotency and provider refund binding indexes support recovery and duplicate prevention. Refund order/created and status/updated indexes support histories/rotating bounded recovery; the idempotency compound index also starts with paymentId. OrderIssue order/status/created and unique system deduplication support unresolved classification. Existing screening/order indexes cover affected orders, while cancellation order uniqueness and partial restock uniqueness bound terminal effects.

## 56. Automated tests

The full offline suite includes new pure refund/cancellation/money/input/state checks and a terminal canceled rendering regression. Existing order rendering tests now use the notification provider and a mocked router because their SSR harness previously lacked real app context, not because authorization was weakened. Actual PostgreSQL/browser integration separately tests financial, tenant, race, immutability and XSS boundaries without mocking them.

## 57. Manual/integration tests actually executed

`scripts/verify-phase-15.ts --local` executes all requested A–AV cases against optimized Next.js/actual HTTP/real PostgreSQL and Auth emulator. It also tests failed/canceled unpaid cleanup, provider create/bind recovery, authenticated callback mismatches, terminal refund regression, canceled queue removal and CSRF/history database guards. Read individual final PASS/FAIL/NOT EXECUTABLE records and the verification report; scenarios are not reported passed just because they were written.

## 58. Provider Refund tests actually executed or NOT EXECUTABLE

Sandbox create/retrieve/success/failure/retry, signed callbacks, idempotency, caps and capture/cancel races were actually executed. A real merchant SDK/test-card/refund account is NOT EXECUTABLE because no real provider/credentials are selected. Sandbox proof does not establish banking, PCI compliance, official provider retry semantics or production financial readiness.

## 59. Firestore status

No new cancellation/refund/issue/inventory business writes use Firestore. Identity uses the isolated Firebase Auth emulator; business writes use PostgreSQL. Source inspection confirms the new layers contain no Firestore calls. This retains the established cutover architecture rather than duplicating business state in two databases.

## 60. Mobile behavior

The real 390×844 browser executed cancel, confirmation, processing and completed refund. No horizontal overflow occurred. Native dialog has corrected responsive width and explicit focus wrapping, including Shift+Tab. Full-page native mobile evidence preserves the entire relevant application without a blurred enlargement or desktop screenshot crop.

## 61. Accessibility

Dialog title/description association, native background inertness, focus wrapping, initial safe focus, Escape behavior, semantic labels, announced state changes and non-color-only status labels support keyboard/screen-reader use. Buttons have practical touch heights and visible styles. Destructive action requires separate confirmation; repeated clicks are disabled while in flight. Validation/network errors use the existing announced bottom-right notifications.

## 62. Motion

Subtle opacity/position transitions and layout updates keep status/confirmation panels readable. `useReducedMotion` disables nonessential transitions. Refunds have no flashy celebration: financial outcomes need clear state and amount, not animation presented as evidence of payment authority.

## 63. LinkedIn screenshots

Nine real native application PNGs cover customer cancel, confirmation, processing, completion, admin balances, partial refunds, operational exception, screening preview and mobile completion. They are captured from actual sandbox workflows/SQL data, not generated mock images. Their README states policy, idempotency and limitations; old phase evidence is unchanged.

## 64. Confirmation screenshots are cropped

Captures exclude Windows/taskbar/browser tabs/address/bookmarks/extensions/DevTools/editor/terminal. Application-only fullPage capture preserves relevant content. For an open modal, the native viewport is enlarged to cover the application height so the real backdrop covers the complete screenshot; no raster editing or fake overlays are used.

## 65. Confirmation screenshots expose no financial secrets

Only fictional cinema/order/seat data and example.com demo identities appear. DTOs/screens omit provider binding IDs, card fields, raw callbacks, session/QR credentials, connection strings, signing keys and Firebase private keys. Every PNG is reviewed at native resolution and staged source is scanned separately before commit. Sandbox controls explicitly disclose that no real money is involved.

## 66. Known limitations

No real merchant adapter, bank settlement timing guarantees, official test cards, chargeback/dispute workflow or permanent customer account history is implemented. Customer view remains subject to existing seat-session validity. Recovery depends on the configured authenticated scheduled job; an unavailable provider can keep stock/refund exposure protected until recovery, requiring supervisor investigation. The existing Phase 14 review flag remains visible for anomalous captures; this phase does not silently resolve all historical multiple-settlement anomalies. Bulk work is bounded and requires repeated reviewed batches. Sandbox tests cannot prove real merchant behavior.

## 67. What Phase 16 should implement

Wait for the user's Phase 16 specification and merge decision. A sensible next boundary to consider is official real-provider onboarding, verified provider capabilities, operational reconciliation/alerts and approved recovery policies, with isolated merchant test credentials before any money flow. Do not assume chargebacks, accounting, loyalty or unrelated products are now authorized. No Phase 16 code or merge is included here.
