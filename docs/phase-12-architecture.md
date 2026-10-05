# Phase 12 — Kitchen Operations

## Structure and request flow

```text
src/app/kitchen/                    Protected queue, ticket page, error boundary
src/app/api/kitchen/orders/         Protected queue/detail/transition handlers
src/app/api/customer/orders/[...]/  Owning-session progress handler
src/components/kitchen/             Queue, polling detail, read-only ticket
src/components/customer/           CustomerOrderProgress
src/components/orders/             Shared OrderTimeline
src/lib/hooks/use-polling.ts        Uncached refresh and lifecycle cleanup
src/lib/orders/status.ts           One state-machine definition
src/validation/kitchen.ts           Strict action and bounded filter schemas
src/server/services/kitchen*        Identity, role and operation orchestration
src/server/repositories/kitchen*    Tenant-scoped queries and atomic changes
prisma/schema.prisma               Enum, relations and history model
prisma/migrations/20261005190000.../ Safe schema change and historical backfill
scripts/verify-phase-12.ts          Explicit, real demo browser integration
linkedin/phase-12/                  Reviewed application-only evidence
```

```text
Kitchen button → same-origin API → Firebase staff cookie verification
  → PostgreSQL user/membership/location authority
  → Serializable transaction:
      reload grants → scoped Order → conditional expected-state update
      → append status event → append audit → commit
  → sanitized response → queue/detail/customer refresh
```

The browser requests the next step; it never supplies authoritative role, tenant, prices, stock, or event time. Database identity and business authorization remain separate.

## The requested 59-point explanation

1. **Phase 11:** Established a session-owned cart, server prices, immutable item/context snapshots, idempotent checkout, and atomic recipe consumption. A cart did not reserve stock; successful checkout did. Phase 12 reuses these records.

2. **Purpose:** Turn an existing PLACED order into a kitchen preparation workflow and let customers observe progress. This phase ends at READY.

3. **State machine:** `PLACED → ACCEPTED → PREPARING → READY`. `src/lib/orders/status.ts` defines the next state and labels once. Example: ACCEPTED can only become PREPARING, never READY directly.

4. **Payment separation:** Preparation is not payment. A ready bag of popcorn does not establish that money was received. No paid/payment-success states or payment provider were added.

5. **Migration:** Extends operational/audit enums, creates `order_status_events`, its constraints/foreign keys, and a queue index. It deploys through Prisma migrations, not a database reset or destructive `db push`. Neon adapter dependencies are externalized from Next's server bundler to preserve native Node database behavior.

6. **Event model:** Each event stores its order, nullable prior state, resulting state, CUSTOMER/STAFF/SYSTEM actor kind, optional staff database reference, and creation time. Safe DTOs do not expose those private references.

7. **Initial event:** Successful checkout creates CUSTOMER `null → PLACED` through nested creation inside the existing transaction. Replaying checkout returns the existing order before another create, so no new initial event is written.

8. **Backfill:** Older orders receive SYSTEM `null → PLACED` at their original createdAt instant. Existing Phase 11 timezone-less timestamps are interpreted as UTC. Deterministic backfill IDs and conflict handling avoid duplicate initial history.

9. **Immutability:** No event edit/delete endpoint exists. A database trigger rejects UPDATE and DELETE, foreign keys preserve referenced actors/orders, and `(orderId,toStatus)` uniqueness prevents duplicate lifecycle events. A future correction needs a designed workflow, not timeline erasure.

10. **Timestamps:** PostgreSQL supplies event time using `CURRENT_TIMESTAMP`. Strict request validation rejects invented acceptedAt/readyAt fields. Relative age is computed for display, not continually written to the database.

11. **Service:** `kitchen.service.ts` resolves the existing staff session and validates requests. `transitionKitchenOrderRecord` reloads current PostgreSQL authority inside its transaction and performs the business operation centrally.

12. **Concurrency:** The update includes `id`, organization, location, and `status = expectedStatus`. Only one matching update can win. Serializable transactions keep status/event/audit atomic; database race errors become friendly 409 conflicts.

13. **Double clicks:** Busy controls disable while updating. Server safety does not depend on that UI: a replay cannot match the old state, so it creates no second event. The client refreshes after success or conflict.

14. **Inventory:** Checkout already consumed ingredients. Accepting or preparing that same order must not consume them again. The kitchen repository has no inventory, cart, or order-item mutation path. Integration compares stock and movement counts before/after all steps.

15. **Kitchen Staff:** Active staff with a current organization membership see/process orders only in their authorized locations. PostgreSQL grants—not client claims or query parameters—determine access.

16. **Location Manager:** Can perform the same preparation steps as fallback, but only in granted locations. Direct requests for another location fail even if its public order code is known.

17. **Cinema Admin:** Can see/process locations within their organization. Queries always include their organization; a different cinema remains inaccessible.

18. **Delivery Staff:** Explicitly excluded from kitchen actions in this phase. READY is not an implicit grant to pick up or deliver an order.

19. **Customer:** A valid owning CustomerSession may read order progress. Anonymous guests cannot use staff transition endpoints. Public codes are display/navigation identifiers, not access tokens.

20. **Route:** `/kitchen` upgrades the existing placeholder. It reuses Firebase staff authentication and existing page guards, not a second login system.

21. **Location selector:** One authorized location is selected automatically. Multiple grants produce a selector containing only those locations. The API independently checks a requested location rather than trusting that selector.

22. **Queue:** Separate New/Accepted/Preparing/Ready sections show oldest orders first. Each state has its own bounded page, so a busy New column cannot hide every Preparing order.

23. **Card:** Shows public code, placed time, age, Hall/Seat, movie/location snapshots, item quantities, note, warning, and appropriate action. It omits guest tokens, Firebase IDs and internal order identifiers.

24. **Item snapshots:** Kitchen displays stored productNameSnapshot and price/quantity snapshots. Renaming Large Popcorn to Premium Popcorn cannot silently change the historical ticket.

25. **Context snapshots:** Stored Hall, Seat, Location and movie labels remain the placed context, rather than being replaced by current renamed source records. The linked screening supplies only operational warning information.

26. **Notes:** Rendered as ordinary React text with preserved whitespace and wrapping. A `<script>` note is displayed literally, not injected via `dangerouslySetInnerHTML`.

27. **Accept:** A PLACED card offers Accept order. Success writes ACCEPTED, its STAFF event, and ORDER_ACCEPTED audit in one transaction.

28. **Prepare:** An ACCEPTED card offers Start preparing. Only the expected ACCEPTED state can move to PREPARING, with its corresponding history/audit.

29. **Ready:** PREPARING offers Mark ready. The result is READY and a final preparation event—not a delivered or paid order.

30. **READY behavior:** Ready tickets stay visible without another kitchen button. No background task automatically delivers, cancels, or removes them.

31. **Invalid transitions:** Strict Zod validation rejects skips/backwards actions; the repository also checks the central state machine. A stale but otherwise valid request receives 409 without rewriting history.

32. **Session expiry:** An already placed order remains a business record and kitchen can process it after guest expiry. Customer reads continue obeying Phase 10/11 session validity; this phase does not create permanent anonymous access.

33. **Screening end:** A naturally ended screening does not erase or invalidate an existing kitchen order. Its ticket warns staff; checkout eligibility remains unchanged for new orders.

34. **Screening cancellation:** Preserves order, history and already-consumed stock. Displays a cancelled-screening warning. Refund/cancellation/restock decisions are deliberately not invented here.

35. **Refresh:** Shared short polling calls authorized APIs about every five seconds plus request latency. It fits stateless Next.js/Vercel/PostgreSQL without introducing persistent WebSocket infrastructure or client database access.

36. **New-order feedback:** Queue counts and a restrained insertion fade indicate new work. No flashing, sound requirement or continuous animation is added.

37. **Elapsed time:** Queue fetchedAt supplies a trusted display reference; each card computes age from placed/latest-event timestamps. No growing duration column is stored.

38. **Timezone:** `formatInTimeZone`, `todayInTimeZone`, and `localDateBounds` reuse Phase 9's IANA timezone utilities. Date filters build each location's local day bounds; device timezone does not determine the kitchen date.

39. **Detail:** Native ticket dialog and `/kitchen/orders/[publicCode]` show item/context snapshots, original screening time, note and timeline. Both refresh independently; commercial editing is absent. Customers retain their original prices/total on the progress page; kitchen tickets prioritize preparation rather than billing.

40. **Timeline:** Ordered status events show labeled steps and location-local timestamps. Staff ticket views may show a safe staff display name. Customer DTOs omit names/actor references.

41. **Customer progress:** Existing confirmation now displays received/accepted/preparing/ready with four labeled steps, original items, total and note. It never claims payment, dispatch or delivery.

42. **Customer refresh:** The same poll lifecycle updates without manual reload. Every fetch revalidates the owning guest cookie; another customer's public code does not authorize a read.

43. **Admin Orders:** Adds safe location/status/date/public-code filters and a timeline/detail link. Managers remain location-scoped and admins remain tenant-scoped; order contents remain read-only.

44. **Pagination:** Kitchen caps each state at 25 orders per page, at most 100 across four states. Admin history uses 30 descending records per page. This bounds historical load; it is offset pagination, not an unlimited live query.

45. **Indexes:** `(locationId,status,createdAt)` supports operational columns, existing organization/date indexes support tenant history, and `(orderId,createdAt)` supports timelines. `(orderId,toStatus)` protects single-use steps; actor index supports the actor relation.

46. **Event vs audit:** Event history describes fulfillment and powers customer/kitchen timelines. AuditLog records privileged staff actions for administrative/security review. Both record the deliberate transition without cookies, tokens or unnecessary payloads.

47. **Errors:** APIs return no-store JSON with friendly messages/codes, validation errors as 400, unauthorized access as 401/403, scoped missing orders as 404, and stale actions as 409. Unknown failures expose neither SQL nor stack traces. A page boundary offers retry and return-to-queue.

48. **Responsive design:** Dark cards switch from four desktop columns to two tablet columns and a single phone stack. Filters reflow; full-width state actions remain usable. Actual 1024×768 and 390×844 browser scenarios check overflow and operation.

49. **Motion:** Existing Motion powers restrained insertion/layout/progress changes. Reduced-motion preferences disable unnecessary movement. Native dialog behavior favors dependable focus and Escape handling over an animation-heavy custom modal.

50. **Accessibility:** Meaningful action names, textual states in addition to color, labeled filters, native modal focus handling, keyboard controls, polite progress/count announcements, and existing focus-visible styling. Automated/browser checks do not substitute for a complete assistive-technology audit.

51. **Automated tests:** Offline mocked persistence tests cover all transition pairs, race behavior for each step, revoked/current grants, role/location boundaries, no stock/order-item writes, DTO privacy/snapshots, note escaping, query bounds, and initial-event replay safety. The full suite never mutates configured Neon/Firebase.

52. **Manual/integration:** `scripts/verify-phase-12.ts --demo` uses real production routes, PostgreSQL and Firebase demo sessions, two kitchen pages and a mobile customer page. Actual A–AH outcomes are recorded in `phase-12-integration-results.json`; failures are fixed/rerun rather than called passed. The scenario is explicit and outside npm test/CI.

53. **Firestore:** Kitchen/order history persist through Prisma/PostgreSQL only. Firebase Authentication remains staff identity; existing Firebase Storage/legacy migration code is unrelated to kitchen business persistence.

54. **Screenshots:** Real production browser captures show queue, new ticket, all three transitions, timeline, customer progress and tablet/mobile layouts. Demo fixture labels use Demo Beirut, Hall 1, A7 and Interstellar.

55. **Cropping:** Browser page/element captures contain only the CineBite feature, never desktop background, Windows taskbar, browser controls, editor or terminal. Queue/customer images include application content rather than the surrounding computer screen.

56. **Secrets:** No production QR is captured. Images use isolated demo records and safe display names. Guest/staff tokens exist only in memory/HttpOnly cookies, not screenshots, result JSON or documentation. Original images are inspected before commit.

57. **Limitations:** Polling is near-real-time, not push; network latency affects update time. Offset paging can shift as a queue changes. Guest progress stops when the original session becomes ineligible. Operational warnings do not decide compensation. Existing dependency advisories require separate review; avoid blind major-version audit fixes.

58. **No delivery:** This phase stops at preparation completion. Adding courier access or delivered states would expand authorization, ownership and operational semantics beyond the approved phase.

59. **Phase 13 next:** Design authorized READY-order pickup/assignment, a separate delivery lifecycle, race-safe possession changes, events/audits and customer delivery wording. Extend the existing order safely after user review; do not start that work in this branch.

## Example: one popcorn order

A7 orders two Large Popcorn for USD 10.00. Phase 11 consumes 300 g of kernels once and records PLACED. Kitchen accepts, starts preparation and marks READY. There are four timeline events, three kitchen audit records, and still exactly the original 300 g consumption. A competing Accept receives a conflict. Renaming the catalog product cannot change that ticket. Ending the screening cannot remove it. The customer sees “Your order is ready,” not “Delivered.”
