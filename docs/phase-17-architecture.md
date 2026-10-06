# Phase 17 — Notification architecture, step by step

Phase 16 is merged on main at the Phase 17 branch baseline. Phase 17 alone adds operational communications; orders, payment/refund settlement, kitchen/delivery transitions and stock accounting keep their established authority.

## Structure

```text
prisma/schema.prisma
prisma/migrations/20261006170000_phase_17_notifications_alerts/
src/lib/notifications/             # types/category/recipient policy, retries, job config
src/validation/notification.ts     # strict query, read-target and preference schemas
src/server/notifications/          # recipient resolution, adapter, bounded processor, retention
src/server/services/notification.service.ts
src/server/http/notification-request.ts
src/app/api/notifications/         # scoped inbox/read/preferences; authenticated job
src/app/api/customer/orders/[publicCode]/notifications/
src/app/notifications/             # protected server page, loading and safe error UI
src/components/notifications/      # staff center/bell and private customer updates
src/types/notification.ts          # safe presentation DTOs, not database payloads
scripts/verify-phase-17.ts          # local-only executable evidence runner
docs/phase-17-integration-results.json
linkedin/phase-17/                 # eight actual full-page demo screenshots
```

## Event-to-screen relationship

```text
Existing verified business mutation
  -> PostgreSQL transaction
       -> business row/event changes
       -> AFTER trigger inserts unique safe outbox event
  -> commit (no notification provider/network call here)
Authenticated scheduled POST /api/notifications/process
  -> claim due outbox row with FOR UPDATE SKIP LOCKED
  -> current tenant, role, active user and location resolution
  -> savepoint -> unique recipient notification rows
       success: PROCESSED
       failure: rollback drafts; persist bounded retry/FAILED
Scoped inbox API or valid customer-session order API
  -> no-store safe DTO -> 5-second visible-tab polling -> dark UI
```

For example, a verified 12.50 USD payment makes an online order eligible. One kitchen event is durably published. Replaying that webhook cannot duplicate the event; running four job calls concurrently cannot duplicate the recipient inbox row. Reading that alert does not accept the order: the existing kitchen action must do that, and its committed status event then publishes the customer's accepted update.

## The requested 62 topics

### 1. What Phase 16 achieved

Phase 16 supplies tenant/location-safe reporting from PostgreSQL: successful payment revenue, successful refunds, separate currencies, order/product/location/screening performance, preparation/delivery times, inventory consumption and safe CSV exports. Those reports are not rebuilt here. Notifications communicate events around that business model; they do not substitute for financial reporting or change its calculations.

### 2. Phase 17 purpose

Operational staff and anonymous customers need durable, relevant updates without depending on an open tab at the instant of a change. This phase supplies an inbox, bell and private order updates. Marketing, account signup for customers, promotional tracking, paid messaging and forced browser prompts are deliberately outside the scope.

### 3. Notification model

Notification records contain tenant/location, exactly one audience (staff User or CustomerSession), controlled type/severity, bounded title/message, source outbox, safe entity reference, creation/expiry and optional read time. PostgreSQL checks the exclusive audience and unique dedupe key. Location is required here because every implemented event belongs to a real cinema location; unused platform-wide notifications are not invented.

### 4. Staff vs customer notifications

Staff notifications target PostgreSQL User.id after Firebase session verification and current membership resolution. Customers have no Firebase staff identity: their secure opaque seat-session cookie resolves a CustomerSession and owned order. These audiences are stored separately and never joined through caller-supplied recipient identities.

### 5. Notification types

The fifteen controlled types cover eligible new orders, six fulfillment/cancellation updates, payment/refund outcomes, stock warnings/recovery, issues and screening cancellation. Zod and database enums reject arbitrary identifiers. An inventory name or issue note is display text, not executable HTML, a notification type or a URL.

### 6. Notification severity

INFO describes ordinary progress, SUCCESS marks delivery/refund completion and stock recovery, WARNING flags low stock/payment failure/cancellation, and CRITICAL marks mandatory operational exceptions. Severity words are rendered beside colors; color alone is not the meaning. No strobe, flashing screen or sound is required.

### 7. Read/unread state

readAt=null means unread; a server timestamp means read. An explicit status column would duplicate that truth and risk inconsistent updates, so it is not added. Delivery, payment and refund statuses remain separate business fields. Reading a refund-failure message never repairs or completes the refund.

### 8. Trusted event generation

Database AFTER triggers respond to committed authoritative record changes, including existing verified webhook paths and operational status events. There is no browser API to invent NEW_ORDER or READY. Safe snapshots include only a public order code, hall/seat label, amount/currency, item name or issue type, never session credentials or raw operational notes.

### 9. Outbox architecture

Triggers publish in the same transaction as the business change. This closes the crash gap between business commit and application notification publication. A post-commit callback or memory emitter would lose work if the process died. The separate processor performs communication work; no email, Firebase or external provider call runs inside a business trigger.

### 10. Outbox persistence

NotificationOutbox persists event identity, tenant/location, source entity, safe JSON, status, attempt count, due time, creation/processing time and safe error code. Pending events survive app restarts and failed schedules. PROCESSED means presentation delivery or intentional policy suppression completed, not that an order was delivered. Database outage can still prevent an atomic business commit; communication provider outage cannot undo a previously committed business transaction.

### 11. Deduplication

Business-event keys distinguish eligible order IDs, order status-event IDs, financial attempt/refund identities, issue IDs, screenings and genuine stock crossings. Event keys are unique; each notification uses event-plus-recipient identity (plus affected order for screening/customer fan-out). skipDuplicates is only a convenience on top of these database constraints, not the sole defense.

### 12. Retry strategy

An event is locked and processed in a bounded transaction. A savepoint surrounds recipient drafts so an adapter failure—even an actual SQL error—can roll back partial writes and persist attempt metadata. Failures schedule 30, 60, 120 and 240 seconds before attempts two through five. The fifth failure is terminal FAILED; jobs do not retry forever. An unavailable database cannot persist its own failure, so infrastructure failures require monitoring and later scheduler invocation.

### 13. Failure isolation

Notification processing occurs after the domain transaction has committed. Injected delivery failures do not undo verified payments, fulfillment eligibility or operational progress. If the processor crashes before its transaction commits, its row lock releases and the durable event stays pending. There is no fabricated success, raw provider error persistence or cross-system rollback claim.

### 14. Kitchen NEW_ORDER

Online orders notify kitchen only when verified payment changes fulfillmentEligible to true. Unpaid and failed-payment orders do not generate actionable kitchen alerts. Legacy payment-not-required orders use the existing centralized eligibility policy at delivery time. A canceled order encountered before processing is suppressed rather than advertised as available kitchen work.

### 15. Customer ACCEPTED

The existing PLACED-to-ACCEPTED action inserts its immutable status event, which triggers one outbox entry. The processor creates only the owning session's accepted update. It does not infer acceptance from a viewed kitchen message, and repeat processing cannot create another notification for the same event/audience.

### 16. PREPARING

An authoritative ACCEPTED-to-PREPARING event creates the preparation update. Existing inventory consumption/reservation policy is unchanged. The user sees that preparation occurred; the existing order progress panel remains the place to see current status if later events have superseded it.

### 17. READY customer notification

PREPARING-to-READY creates a customer-ready message. It is private to the order's seat session. The notification does not claim the order is delivered, paid again or currently ready forever; its timestamp is the historical event time and the detail link checks current order truth.

### 18. READY delivery alert

The same ready event separately targets active DELIVERY_STAFF authorized for that location. Hall and seat snapshots help operational routing. Another location's delivery users receive no row. The alert does not claim the order: the existing atomic claim API still enforces readiness and assignment.

### 19. OUT_FOR_DELIVERY

The actual READY-to-OUT_FOR_DELIVERY claim event creates the customer's on-the-way message. It includes no delivery worker email, UID or phone. Assignment rules are not duplicated in the notification code, and alerts cannot reassign or rewind an order.

### 20. DELIVERED

A committed assigned-worker delivery completion publishes the delivered update. It describes fulfillment only, not merchant payout or financial settlement. Payment and refund amounts are still read from the existing financial panel and analytics, never calculated from notification content.

### 21. Cancellation notifications

A canceled order produces a private canceled message. Processing checks current refund rows: pending/processing refunds produce explicitly incomplete processing wording; otherwise the message directs the customer to authoritative refund status without asserting completion. No notification initiates cancellation, restocking or refund dispatch.

### 22. Refund notifications

Verified SUCCEEDED refunds produce safe exact amount/currency completion text for the owning customer. FAILED refunds notify authorized Cinema Admin/Location Manager and give the customer safe attention wording. A retry with a new refund identity can legitimately create a new outcome event; repeating the same webhook or polling cannot spam the same failure.

### 23. Payment failure notification

A verified failed payment attempt creates one customer-facing attention message. It contains no provider internals or identifiers and does not automatically retry or charge again. A failed payment never emits NEW_ORDER. A later event cannot downgrade a settled payment because the existing payment domain rejects that change.

### 24. Low-stock alerts

The trigger compares available quantity, on-hand minus reserved, to the configured threshold. A genuine IN_STOCK-to-LOW_STOCK transition alerts location-authorized supervisors. Threshold changes and reservation changes use the same comparison. Reads never publish events, and initial inventory creation is not treated as a synthetic transition.

### 25. Out-of-stock alerts

Available quantity at zero (or below, if historical data contains that condition) produces CRITICAL OUT_OF_STOCK on a state crossing. It is mandatory even when optional inventory messages are disabled. Moving from OUT to LOW produces LOW_STOCK; recovery above the threshold produces STOCK_RECOVERED. This avoids calling still-low stock fully recovered.

### 26. Alert deduplication

One real status/threshold change creates one event, and one event creates at most one notification per target. A new, later stock crossing is a distinct event and may legitimately alert again. Deduplication removes repeated processing, not genuine repeated business changes; dashboard refresh does not fabricate new crossings.

### 27. OrderIssue notifications

A real OrderIssue insert emits the public order code and allowlisted issue type to authorized supervisors. Sensitive note text is excluded. Reporting CUSTOMER_UNAVAILABLE leaves the order's existing OUT_FOR_DELIVERY state untouched; notification creation does not initiate a refund, restock or resolution.

### 28. Screening cancellation notifications

Changing a screening to CANCELLED emits an event only if affected orders exist. Authorized operational staff receive the screening alert; customer drafts reference only their existing affected orders. Existing reconciliation remains authoritative. Canceled-screening session rules still invalidate customer access; storing an alert is not permission to extend or resurrect an anonymous session.

### 29. Staff Notification Center

Admin, Kitchen and Delivery include a native accessible bell disclosure with unread count and a bounded recent list. The dedicated protected /notifications server page shows All/Unread, optional type filter, pagination and preferences. Loading and generic error states do not expose database stack traces or secret context.

### 30. Read/unread actions

Same-origin POST supports one owned notification ID or all currently authorized messages, never both. The service rechecks current scope and only changes unread readAt values; repeating a read does not decrement twice. Unknown/foreign IDs return a generic not-found result without revealing existence. Read actions do not flood AuditLog.

### 31. Deep links

The service constructs allowlisted internal destinations from entity kind and role. Kitchen links use public order code; supervisors use the existing permission-checked order detail; delivery uses its operational queue; inventory uses the scoped location page. No arbitrary external URL is stored or trusted. Destination pages independently authorize access.

### 32. Customer notification UI

Order progress and payment pages embed a private update panel. The panel uses the same safe notification card presentation and bounded latest twenty records, while the existing financial/status panels remain authoritative. There is no public customer-wide inbox, unsolicited contact collection or cross-order notification feed.

### 33. Customer authorization

The existing validateCustomerSession checks hashed opaque cookie, ACTIVE status, expiry, operational seat/hall/location/organization and currently valid screening. The queried public order code must then belong to that exact session and tenant/location. A missing cookie returns 401; another valid session's order returns generic 404. No endpoint extends expiry merely to show notifications.

### 34. Staff preferences

Preferences are keyed by user and category: ORDERS, INVENTORY, FINANCIAL, EXCEPTIONS. Important categories default enabled. Only the current authenticated user can update them; unknown target/tenant fields are rejected. Successful preference changes are audited with category/boolean metadata only. Changes affect future deliveries, not deletion of existing history.

### 35. Mandatory alerts

OUT_OF_STOCK, REFUND_FAILED, ORDER_ISSUE_REPORTED and SCREENING_CANCELED bypass optional category suppression. EXCEPTIONS cannot be disabled because all its types are mandatory. An INVENTORY toggle can suppress LOW_STOCK/recovery but not OUT_OF_STOCK. UI explains the difference; enforcement is in server policy, not merely a disabled checkbox.

### 36. Customer anonymity

Customers still order using secure anonymous seat sessions. No email, phone, new account or identity link is required. The safe DTO excludes session IDs and recipient IDs. This keeps operational communication within the existing anonymous order experience rather than inventing marketing consent or personal-contact requirements.

### 37. External provider abstraction

NotificationChannelProvider isolates in-app drafting from the processor and supports failure-injected adapters in verification. The current contract is deliberately in-app/database transactional only. An approved future external channel must use a separate durable delivery boundary; it must not perform vendor networking inside this database transaction or couple business services to a vendor SDK.

### 38. Production-provider status

Only in-app delivery is implemented. No email/SMS/push/WhatsApp vendor, credentials, real contacts or production external delivery is configured. Sandbox payment/refund tests and injected in-app failures are explicitly distinguished from actual merchant/provider communication. Real external-delivery cases AD/AE are NOT EXECUTABLE.

### 39. Role targeting

recipientsFor centralizes which staff roles receive each event, and resolveRecipients performs the fresh membership query once per event. Kitchen receives NEW_ORDER; delivery receives READY; supervisors receive inventory/refund-failure/issues; affected screening alerts reach operational roles. Retrieval intersects current role eligibility too, so a role change cannot expose formerly privileged alert types.

### 40. Location targeting

Recipient scope requires current explicit LocationAccess, allLocations permission or Cinema Admin's existing tenant-wide role. The event's location must currently be active and belong to its organization. Inbox/read queries independently recheck current active location and grants. A revoked location immediately removes those records from future responses and counts.

### 41. Disabled users

Inactive PostgreSQL staff are excluded from new recipients. Firebase session verification checks revocation/disabled identities and the current PostgreSQL profile is checked again on reads/actions. Thus Firebase-only identity disable denies access even if old presentation rows remain. No browser role assertion restores notification access.

### 42. Tenant isolation

Outbox and notifications retain organization/location references. All staff queries require the authenticated tenant plus recipient identity; customer queries require the owned session/order context. Callers cannot submit organizationId or userId to broaden scope. Super Admin is deliberately not included in every cinema inbox or provided a cross-tenant bypass.

### 43. Near-real-time refresh

The established usePolling hook refreshes every five seconds while visible, pauses hidden tabs, aborts stale requests and guards against older responses. Notifications still depend on the scheduled processor cadence: a one-minute schedule adds up to approximately one minute before the next UI poll. This is short polling, not push or a guaranteed instant-delivery SLA.

### 44. Optional audio

No audio or browser notification permission is implemented. Theater users are not subjected to unexpected sound or permission prompts. A later sound feature would require explicit user action, browser-compatible playback and a separate preference, without becoming the only evidence of a critical event.

### 45. Toast vs persistent notification

Existing bottom-right toasts report mutation errors/preference saves for convenience. Important domain alerts persist as notification rows, independent of toast visibility or browser tab lifetime. Toasts contain sanitized messages, not recipient emails, opaque credentials, raw payloads or private provider identifiers.

### 46. Flood prevention

Triggers fire on actual event inserts or changed status/class, not on inbox or dashboard polling. Unchanged payment/refund updates return without publication. Unique keys protect webhook/job replay; bounded job batches protect execution. Genuine repeated stock fluctuations can still create alerts and should be investigated operationally rather than silently merged.

### 47. Retention

Notification expiresAt is thirty days after original event creation, not retry completion. Expired rows are excluded immediately from queries. Authenticated jobs delete at most 1,000 expired messages and 1,000 processed/failed outbox records older than ninety days with no remaining notification references. Pending work and business/audit histories are not deleted by presentation cleanup.

### 48. NotificationDelivery if implemented

No external NotificationDelivery table is added because no external channel is implemented. Future durable external records should distinguish message delivery from order delivery, store safe provider receipt/error codes, count bounded attempts and use a stable provider idempotency identity. A database transaction cannot provide exactly-once delivery across an external network by itself.

### 49. Prisma migration

The additive Phase 17 migration creates three presentation/communication tables, enums, the preference audit action, checks, indexes and transaction-local trigger functions. Previous migrations are untouched. All seventeen migrations applied to a new isolated PostgreSQL database; reapplication has no pending work and schema diff reports no drift. Production was not migrated or reset.

### 50. Indexes

Recipient/read/time supports staff unread and ordered inbox queries; customer-session/time supports private updates; tenant/location/type/time supports scoped type filtering; expiry supports cleanup; outbox status/due/creation supports bounded work selection. Unique event and notification keys enforce replay safety. Stable id tie-breakers order timestamp ties; production index tuning should follow measured plans/volume.

### 51. Automated tests

The executed suite has 461 tests in 56 files, including Phase 17 category/type, role routing, mandatory preference policy, severity, available-stock classification, bounded retries and strict target/query validation. TypeScript, ESLint, production build, Prisma validation/generation and migration drift checks were actually run, not inferred from code inspection.

### 52. Manual/integration tests actually executed

The local runner executes real HTTP APIs against the production Next build, isolated PostgreSQL and Firebase Auth emulator, with verified sandbox payment/refund outcomes and native Chrome. Cases A–AN produce individual recorded results: 38 PASS, 0 FAIL, 2 NOT EXECUTABLE. Seven additional check groups cover terminal retries, security/atomicity, audit, partial-insert rollback, real SQL-error recovery, legacy/payment failure and retention.

### 53. External provider tests

AD/AE specifically require an implemented external adapter and therefore are NOT EXECUTABLE. In-app provider-failure injection, due retry, concurrent processing, five-failure terminal status, partial-write rollback and actual database-error rollback all passed separately. This evidence does not claim production email, SMS, push or real-money processing works.

### 54. Firestore status

Normal notification/outbox/preferences and source business records are PostgreSQL-authoritative. No Firestore calls were introduced. Firebase continues to supply staff identity and existing media infrastructure, not notification ownership or business status.

### 55. Mobile UX

The 390px tests exercised the notification page, visible admin bell disclosure and secure customer progress. No horizontal page overflow was found. Cards wrap content, controls remain touch-sized and preferences stack to one column. The corrected mobile screenshot waits for actual headings/cards, avoiding an empty loading-placeholder picture.

### 56. Accessibility

Native details/summary, button, select and checkbox semantics support keyboard interaction. Headings, pagination labels, explicit read/severity text, time elements, readable dark contrast and live unread/status announcements complement visual styling. Disabled required preferences explain why. This is implemented/accessibility-reviewed behavior, not a claim of a completed third-party WCAG certification.

### 57. Motion

Notification cards use subtle Motion layout transitions and initial=false to avoid a loading flash. Reduced-motion preference disables layout movement, and screenshots use reduced motion/disabled animations. The dark cinema design remains calm; no continuous disruptive animation is required to understand events.

### 58. LinkedIn screenshots

Eight real application screenshots cover the center, eligible kitchen order, ready delivery, customer order history, low stock, refund failure, preferences and mobile. All use fictional local demo records and authentic verified sandbox workflows. No screen is reconstructed with an image generator or composited to imply unavailable features.

### 59. Cropping confirmation

Native browser page capture excludes desktop, taskbar, tabs, extensions, bookmarks and developer tools. fullPage captures the complete app body, including below-the-fold preferences and customer financial/status panels. Files are not artificially rescaled; viewers may resize their preview, but original PNGs retain native dimensions.

### 60. Secret/contact confirmation

Captured pages show fictional cinema/seat/product labels and public demo order codes only. No actual email/phone, raw session or QR credential, Firebase token, provider private ID, database URI or job/webhook secret is shown. The runner's ephemeral secrets stay in memory and ignored environment/test files are excluded from staging.

### 61. Known limitations

Operators must apply the reviewed migration and configure the authenticated HTTPS schedule; code does not provision a production cron automatically. Five-second UI polling is not instant push. No external channels, audio, user-configurable retention, platform inbox or historical-event backfill exists. Large tenant fan-out needs production profiling and may require partitioned delivery. Page-offset pagination is stable for an unchanged dataset, but new arriving events can shift later pages. Canceled/expired sessions cannot access retained customer alerts. Terminal failures are visible in durable operator records; automatic remediation/dashboard is not added.

### 62. What Phase 18 should implement

No Phase 18 specification is supplied or implemented. A reasonable next brief could prioritize deployment scheduling/observability, measured outbox backlog/fan-out handling and operator failure review; actual external channels require explicit provider approval, privacy/consent policy and isolated provider tests. The user determines Phase 18 scope after reviewing/merging this branch. This is a recommendation, not authorization to begin work.
