# Phase 13 architecture — delivery operations

## Structure

```text
src/app/delivery/page.tsx                   server-rendered authorized queue
src/app/api/delivery/orders/                uncached authenticated HTTP boundary
src/components/delivery/                    mobile queue, cards, detail dialog
src/validation/delivery.ts                  strict transition/filter contracts
src/server/services/delivery-access.ts      shared role/location policy
src/server/services/delivery.service.ts     verified identity + request orchestration
src/server/repositories/delivery.repository.ts scoped SQL + atomic transactions
src/lib/orders/status.ts                    one shared lifecycle, distinct kitchen permissions
prisma/schema.prisma                       User assignment + lifecycle data
prisma/migrations/20261005210000_.../        additive delivery migration
scripts/verify-phase-13.ts                  isolated real PostgreSQL/emulator/browser verification
linkedin/phase-13/                          reviewed real application evidence
```

## 1. What Phase 12 achieved

Phase 12 introduced the preparation queue and strict PLACED→ACCEPTED→PREPARING→READY workflow, immutable lifecycle events and concurrency-safe staff actions. Checkout and inventory consumption remained Phase 11 responsibilities. Phase 13 extends that same Order rather than creating a second fulfillment object.

## 2. Phase 13 purpose

Preparation is not delivery. This phase identifies who takes possession of a ready order, directs that worker to the original seat, records completion and informs the owning customer. Example: two Large Popcorn for Hall 1, A7 move from the kitchen to one named worker's personal queue.

## 3. Order status extension

The single shared enum now has six states. Only READY→OUT_FOR_DELIVERY and OUT_FOR_DELIVERY→DELIVERED are added. Global lifecycle helpers describe ordering; `KITCHEN_STATUSES` and `isValidKitchenTransition` keep kitchen permissions separate so extending the lifecycle cannot accidentally authorize a kitchen worker to claim.

## 4. Assignment model

`Order.deliveryAssignedUserId` references the existing PostgreSQL User primary key with RESTRICT deletion. `deliveryClaimedAt` and `deliveredAt` are nullable TIMESTAMPTZ values, not browser fields. Assignment is neither a display-name lookup nor a Firebase UID foreign key. A database check requires coherent assignment/timestamps for delivery states.

## 5. Claim behavior

Claim is one transition and one assignment, not separate requests. A READY order with no assignee becomes OUT_FOR_DELIVERY with the current verified worker's database User ID. The status event's database timestamp also becomes the claim timestamp, making the operational record consistent.

## 6. Concurrency-safe claim

The repository reloads current authorization and uses a Serializable transaction. The conditional update matches order ID, organization, location, expected READY state and null assignee. The unique order/target-state event is another database barrier. A losing insert, conditional update or serialization failure rolls the entire transaction back, so there is exactly one persisted event/assignment/audit. JavaScript reads and UI buttons are not the concurrency guarantee.

## 7. Ownership

Only the assigned delivery worker may normally complete the order. Worker B cannot silently replace Worker A, even with the public code or a stale card. Staff detail reads also hide other workers' assigned active/completed orders; supervisors retain only scoped visibility.

## 8. Mark Delivered

Completion conditionally matches OUT_FOR_DELIVERY and the current assigned User, preserves that assignment and sets `deliveredAt` from the database-clock event. The terminal result remains in bounded history with its timeline. For example, Worker A taps Mark delivered after reaching A7, not while the order is still merely ready.

## 9. Invalid transitions

Strict schemas and repository checks reject skips, backward steps, same-state updates and extra fields. READY→DELIVERED is rejected because it would erase possession/accountability; DELIVERED→OUT_FOR_DELIVERY is rejected because delivered is terminal. No generic client-driven status patch exists.

## 10. Server timestamps

OrderStatusEvent defaults to PostgreSQL CURRENT_TIMESTAMP. Claim, completion and the indexed READY timestamp copy the relevant event instant within the same transaction. Clients supply no timestamps. Elapsed durations are derived, never continually written back to the database.

## 11. Delivery Staff authorization

Firebase verifies the staff session; PostgreSQL supplies active status, organization membership and location grants. Each mutation rechecks these records transactionally. A worker can read unclaimed READY work, their own active work and their own paginated completed work, but cannot modify items, pricing, inventory, destinations or screenings.

## 12. Kitchen restrictions

The original kitchen action schema still accepts only the three preparation transitions. Kitchen queues retain the four preparation sections, while existing scoped tickets may show later lifecycle history read-only. A DELIVERY_STAFF identity cannot use kitchen mutation endpoints, and a KITCHEN_STAFF identity cannot use delivery mutation endpoints.

## 13. Location Manager behavior

Managers view delivery operations only within granted locations (or their existing explicit allLocations membership policy). They see assigned worker names and can filter history, but delivery mutations are read-only. An emergency override is deliberately not invented: it needs a separate audited operational policy before implementation.

## 14. Cinema Admin behavior

Cinema Admins oversee all locations in their own organization, never another tenant. They can view broader active/history queues and select locations/workers. Like managers, they cannot implicitly steal, claim or complete another worker's delivery.

## 15. Customer restrictions

Customer reads require the valid owning opaque CustomerSession cookie plus the order's session ownership. A public order code is a reference, not a credential. Customers cannot claim, complete or assign deliveries; staff identity does not enter customer DTOs.

## 16. Delivery route

`/delivery` replaces the protected placeholder using existing staff page guards, session verification and LogoutButton. The server obtains authorized context and the initial queue; the client handles polling and actions. Next.js route handlers keep secrets and database access on the server.

## 17. Location selector

A single authorized location is selected automatically. Multi-location accounts receive only granted location options, with an all-authorized option. The repository independently validates explicit location filters; editing a query string does not broaden access.

## 18. READY queue

Unassigned READY orders are sorted by `readyAt`, then ID for stable pagination. `readyAt` caches the authoritative READY event and is backfilled from old history; checkout creation time is not a proxy for preparation completion. Each page contains at most 20 READY orders, so a busy location cannot force an unlimited response.

## 19. My Deliveries

Personal active queries always filter `deliveryAssignedUserId` to the current database User. On worker views with active orders this section moves first, including in DOM order, to put the next destination near the top. Supervisor views explicitly use Active deliveries and do not offer worker actions.

## 20. Destination display

Hall and Seat have large, high-contrast text at the top of each actionable card. Location and movie identify the screening context without internal IDs. Example: Hall 1 / Seat A7 is visible before the item list and customer note, not buried in a table.

## 21. Snapshots

Location, Hall, Seat, movie and item names come from immutable checkout snapshots. Renaming the current Product or Seat does not redirect an existing order. The integration test actually renames both and verifies the original A9 / Large Popcorn values remain.

## 22. Customer notes

React renders notes as escaped plain text with preserved line breaks and wrapping. No dangerouslySetInnerHTML or HTML parsing is used. A browser test displayed a literal script-like note and verified no injected window property was created.

## 23. OrderStatusEvent

Delivery appends STAFF READY→OUT_FOR_DELIVERY and OUT_FOR_DELIVERY→DELIVERED events with User foreign keys. Existing uniqueness, actor checks and the append-only trigger remain. The transition CHECK is extended, not removed; existing history is neither rewritten nor deleted.

## 24. AuditLog

`ORDER_CLAIMED_FOR_DELIVERY` and `ORDER_DELIVERED` separately record safe actor/entity/tenant/location references and public-code/from/to metadata. Lifecycle events answer what happened operationally; audits answer who performed a sensitive action. They commit together but retain distinct responsibilities.

## 25. Inventory unchanged

Phase 11 already consumed the aggregate recipe stock during checkout. Delivery repositories do not call LocationInventory, InventoryMovement, Cart or OrderItem writes. Repeating consumption would deduct the same food twice. Integration compares actual stock and movement counts before/after all delivery scenarios.

## 26. Customer progress

The existing customer component gains On the way and Delivered states and a responsive six-step indicator. The owning customer's open page automatically changes from ready to “Your order is on the way to your seat.” to “Delivered.” It shows no private worker identity and makes no claim about payment.

## 27. Refresh strategy

The existing `usePolling` hook performs uncached requests approximately every five seconds plus request latency. Hidden tabs pause; resume triggers refresh; abort/sequence handling prevents stale responses winning. Reuse avoids unnecessary WebSocket infrastructure and keeps PostgreSQL authoritative.

## 28. Stale queues

After one claim, other workers' READY cards disappear on their next refresh. Before then a stale click still goes through the same database protections and gets a friendly conflict. The integration harness deliberately holds one client's queue response stale, clicks its real button and verifies denial/removal.

## 29. Timings

Ready age comes from READY time; claimed age comes from the claim event; completed history uses delivery time. Durations are calculated against a server-returned queue timestamp. Just-now labels avoid misleading negative ages, and no duration counter is persisted.

## 30. Timezone

The existing Phase 9 Temporal/date utilities format each order in its location timezone. Delivered-date filters build local-day UTC bounds per location, rather than treating all cinemas as one UTC day. Snapshot destination remains historical, while current location timezone supplies presentation.

## 31. History

Recently delivered is newest-first, 20 per page, with compact cards and full snapshot/timeline details on expansion. Hall/code filters apply to all sections; delivered-date filters affect history only; supervisor worker filters affect assigned queues. Staff cannot request another worker's history filter. Staff-option lists are scoped and capped at 100.

## 32. Reconnect

Assignment lives in PostgreSQL, so page closure, browser refresh and a new verified login do not lose responsibility. The real integration scenario closes the original page, creates a fresh staff session and finds the same order in My deliveries. Browser memory is only presentation state.

## 33. Screening ended

Staff fulfillment is authorized by staff membership and Order scope, not whether the source Screening is still live. A warning advises checking the destination, but the order remains deliverable. The actual test ends the screening after claim and successfully completes delivery.

## 34. CustomerSession expiry

Expired guest eligibility blocks new guest actions/read access according to the existing policy, not staff fulfillment. The original Order remains independent of that window. The integration test expires its session and then claims/completes the order with staff authority.

## 35. Screening cancelled

Cancellation after placement preserves the Order and displays an operational warning. It neither deletes fulfillment history nor restores stock automatically. Refund/cancellation policy belongs elsewhere; the test verifies preserved delivery and unchanged stock.

## 36. Payment separation

DELIVERED means physically delivered, not PAID or SETTLED. No payment fields, providers, refunds or reconciliation are invented. Keeping these domains separate lets a later payment phase relate financial records to an already traceable fulfillment lifecycle.

## 37. Prisma migration

One new migration adds enum values, assignment/timestamps, a restrictive User FK, consistency CHECK, extended event transition CHECK and indexes. Prior migrations are unchanged; no reset, db push, table drop or history rewrite occurs. All nine migrations were deployed and verified on isolated local PostgreSQL; production deployment is explicitly separate after review.

## 38. Indexes

The READY index follows location/status/readyAt oldest-first access. The assigned-user/status/claimedAt index supports personal active work; location/status/deliveredAt supports scoped newest-first completion history. Existing tenant/creation indexes remain for admin history. Indexes follow actual repository predicates instead of speculative analytics needs.

## 39. Error UX

Expected conflicts/denials use friendly ServiceErrors such as ORDER_ALREADY_CLAIMED, ORDER_NOT_READY, NOT_ASSIGNED_TO_YOU, UNAUTHORIZED_LOCATION and ORDER_ALREADY_DELIVERED. Invalid contracts get safe validation responses. Unknown exceptions use the existing generic API response and sanitized diagnostic name/code, not raw SQL or credential logging.

## 40. Mobile UI

The 390×844 browser flow uses large Hall/Seat text, minimum-height buttons, collapsed filters, active-first personal work and compact completed history. Successful action focus moves to the relevant section; feedback uses the existing bottom-right notification provider. Full-content captures include the whole application rather than clipping a viewport or showing a desktop.

## 41. Accessibility

Native buttons/inputs, descriptive action labels, heading structure, live status/count text, visible focus and native dialog/Escape behavior support keyboard and screen-reader use. Busy guards prevent repeated UI submission while server guards protect every request. Status text—not color alone—communicates readiness and completion.

## 42. Motion

AnimatePresence and restrained opacity/layout transitions show queue removal and personal insertion. Existing customer heading motion is reused. Reduced-motion preferences disable movement/duration; there are no flashing indicators or animated decorative distractions.

## 43. Automated tests

Offline Vitest tests cover the full transition matrix, strict request fields, role/location policy, verified service identity, assignment/CAS contract, simulated competing workers, safe race errors, scope/privacy, history filters/pagination, snapshots, escaped rendering and additive migration invariants. Existing checkout, customer authorization and inventory suites remain active. Automated tests never connect to production resources.

## 44. Tests actually executed

All mandatory manual/integration cases A–AD were executed through real Next.js HTTP/browser requests and local PostgreSQL, with Firebase session APIs provided by the official Auth emulator. The report records 30 PASS / 0 FAIL / 0 NOT EXECUTABLE, not inferred outcomes. It was rerun after layout changes; lint, types, production build and full offline suite were also rerun.

## 45. Firestore

Firestore remains legacy migration/backup support only. Delivery reads/writes use Prisma/PostgreSQL; source inspection and the executed persistence path confirm no Firestore delivery business writes. Authentication and Storage are separate Firebase products and retain their established roles.

## 46. LinkedIn screenshots

Eight named images document ready work, an actionable card, actual claim, personal assignment, seat destination, successful completion, customer progress and phone layout. Every image is a real browser screenshot with isolated demo data, not an AI-generated mockup or an edited error/warning overlay.

## 47. Cropping

Full application content is captured without browser or desktop chrome. Card/section/destination images use native element captures; full-content images end at application pagination or page content. There is no taskbar, address bar, terminal, editor, extension UI or unrelated application.

## 48. No secrets

The captures omit QR credentials, tokens, cookies, internal User/session IDs, connection strings, passwords and private emails. Integration uses an in-memory ephemeral key and local example.com identities. Ignored environment/cluster/debug files are excluded from staging; screenshots are visually reviewed before commit.

## 49. Known limitations

No reassignment or emergency completion override exists; supervisors oversee read-only. Polling is near-real-time, not push. Customer visibility still requires eligible owning sessions, even though staff orders survive expiry. Tests use a real local PostgreSQL server and emulated Firebase, not production or physical-device/load/network testing. Production migration is not applied by the test runner; existing dependency advisories are not erased by passing functional tests.

## 50. Suggested Phase 14

After the user reviews/merges Phase 13, a separately specified payment/reconciliation phase could distinguish fulfillment from financial settlement, with idempotent provider/webhook handling and audited policies. Provider, currency, collection and refund choices require explicit requirements. No Phase 14 code or payment behavior is implemented here.
