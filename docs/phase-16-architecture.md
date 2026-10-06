# Phase 16 — Analytics and Reporting

Phase 16 reads authoritative PostgreSQL history; it does not manufacture financial activity or introduce another business source of truth. Firebase remains the identity provider. The previous sandbox payment/refund limitation remains unchanged.

## Structure and request flow

```text
src/app/admin/analytics/{page,loading}.tsx
  -> src/server/services/analytics.service.ts
     -> verified Firebase session + current PostgreSQL membership/location grants
     -> src/validation/analytics.ts + lib/analytics/policy.ts
     -> repeatable-read transaction
        -> src/server/repositories/analytics.repository.ts
        -> sanitized src/types/analytics.ts DTO
  -> src/components/admin/analytics-dashboard.tsx

GET  /api/admin/analytics         -> same reporting service
POST /api/admin/analytics/export  -> same authorization + bounded CSV + audit
src/lib/analytics/csv.ts          -> spreadsheet-safe rectangular serialization
scripts/verify-phase-16.ts        -> isolated SQL/Auth/browser integration evidence
```

The eleven reports share one filter contract and centralized service rather than eleven almost-identical authorization implementations. SQL belongs in the repository, policy/formulas in small testable functions, and rendering in the dashboard. No browser-side raw-history aggregation is used.

## The 66 requested explanations

### 1. What Phase 15 achieved

Phase 15 supplied concurrency-safe cancellation, cancellation history, separate full/partial refunds, over-refund protection, original-consumption restocking, operational issues and screening reconciliation. An original successful charge remains successful after a refund; refunds and inventory restoration have independent histories. Phase 16 reads these records without rebuilding their state machines. Existing payments remain sandbox-only, not real merchant charges.

### 2. Phase 16 purpose

The new `/admin/analytics` answers concession revenue, order volume, product/location/movie performance, fulfillment timing and inventory consumption questions. It reports facts already recorded by CineBite. It deliberately does not claim profit, tax, ticket sales, forecasts or customer behavior predictions.

### 3. Analytics service architecture

`getAnalytics(input, exportAll)` is the shared service entry point. It validates filters, resolves access and local calendar boundaries, reads consistent database aggregates, serializes decimals, and returns a typed DTO. The repository supplies `analyticsSummary`, `analyticsRows` and `analyticsTrend`. A single report discriminator avoids duplicated permission logic while retaining report-specific SQL and columns.

### 4. Authorization architecture

The verified Firebase cookie identifies the actor; PostgreSQL supplies current permissions. Within the reporting transaction the service rechecks active User, role, OrganizationMembership, active Organization and LocationAccess. A selected location must belong to the server-authorized set. Client-supplied organization overrides are rejected. Authorization is applied before any aggregate, filter option or CSV row can leave the server.

### 5. Date ranges

Today, Yesterday, Last 7 days, Last 30 days, This month, Previous month and Custom are supported. Seven days includes today and the preceding six calendar days. Custom end dates are inclusive in the UI and converted to exclusive next-day boundaries. Ranges span 1–366 days. For October 1–7 the SQL interval starts at October 1 local midnight and excludes October 8 local midnight.

### 6. Timezone behavior

A single-location report always uses that location's configured IANA timezone. Multi-location reports use one explicit report timezone, defaulting to `Asia/Beirut`; they do not silently mix each location's midnight or browser timezone. Temporal converts calendar dates to instants using real zone rules, including DST. The database transaction uses UTC, and existing timezone-naive history columns are interpreted as their stored UTC values.

### 7. Gross Revenue formula

For each currency: `SUM(Payment.amount)` where the canonical Payment is `SUCCEEDED`, the order policy is `ONLINE_REQUIRED`, and `Payment.succeededAt` lies in the report interval. Captures 10 and 20 with a failed 100 produce 30, not 130. Aggregation never joins payment attempts into the financial sum.

### 8. Successful Refund formula

For each currency: `SUM(Refund.amount)` where status is `SUCCEEDED` and `Refund.succeededAt` lies in the interval. A successful 5, failed 7 and processing 2 contribute only 5. Separate pre-aggregation prevents multiple refunds or order items from multiplying captured amounts.

### 9. Net Revenue formula

`net = gross captures during period − successful refunds during period`. Prisma Decimal preserves exact arithmetic; financial DTOs contain fixed two-decimal strings. With gross 30 and refunds 5, net is 25. A refund for an older charge can make a later period's net negative: this is reported honestly rather than clamped to zero.

### 10. Paid Order definition

A paid order has one canonical successful online Payment settling in the selected period. The Phase 14 unique order/payment relationship prevents duplicate attempts from adding paid orders. Unpaid legacy compatibility orders do not become paid merely because they are delivered. A canceled order whose money was captured still contributes its actual charge, with refunds separately subtracting returned money.

### 11. AOV formula

`AOV = gross / successful paid order count`, separately per currency. Gross 30 across two paid orders gives 15.00. A zero paid count produces the safe 0.00 rule, while a completely empty period displays a no-data state. No float arithmetic is used for this calculation.

### 12. Refund Rate

The only displayed definition is **Revenue refund rate**: `successful refunded amount / gross captures × 100`. Five returned against thirty captured yields 16.67%. When gross is zero the rate is unavailable, not Infinity. Period refunds may relate to older captures, so this rate can exceed 100%; it is not an order-count probability.

### 13. Cancellation Rate

`currently canceled orders in the creation-date cohort / all created orders in that cohort × 100`. Two canceled out of ten created gives 20%. The denominator is explicit, includes unpaid orders, and is independent of successful payment count. Empty cohorts have no rate.

### 14. Order volume

Created, canceled, delivered and active/in-flight counts use `Order.createdAt` to choose the cohort and current fulfillment status to classify it. Paid counts use settlement dates, not creation dates. These different counts intentionally need not match. One persisted Order counts once, regardless of idempotent retries.

### 15. Status distribution

The distribution supports PLACED, ACCEPTED, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED and CANCELED. The chart plots observed statuses; absent statuses contribute zero to totals. It describes current states of the selected creation cohort, not historical state at the end of the period; the UI and export explanations make that limitation explicit.

### 16. Product analytics

Successful paid orders contribute immutable OrderItem quantities and `lineTotal` snapshots. Reports show units, gross product sales, distinct containing-order count and average quantity per containing order. Two items priced historically as 2 × 5 and 3 × 6 give five units and 28.00 gross sales. Canonical payments select eligible orders; item joins cannot inflate payment totals.

### 17. Product snapshots

Grouping uses stable Product ID and currency. Display uses the latest matching historical OrderItem name snapshot, not the current Product name. Renaming or inactivating a product does not rewrite its historical quantity or prices. A group spanning different historical names displays one deterministic snapshot label; individual order history still retains every original snapshot.

### 18. Product gross-sales limitation

Refunds are order-level, without item allocations. Therefore product reports display **gross product sales**, not invented product net revenue. A partial refund of a popcorn-and-drink order cannot truthfully be assigned to either product. Paid-then-refunded products remain in gross sales and units; revenue reports account for returned money independently.

### 19. Category analytics

The current Product→MenuCategory relationship groups historical item snapshots because earlier phases did not preserve a category snapshot. The report is explicitly labeled current-category grouping, not historically exact categorization. Moving a product today can change this grouping; product/order financial history remains intact. Adding future category snapshots requires an intentional later schema/domain change, not fabricated backfill.

### 20. Location comparison

Location/currency rows show captured, refunded and net food revenue, paid count, AOV, creation-cohort delivered/canceled counts and valid preparation/delivery means. Cinema Admin can compare their organization's locations; managers see only their grants. Financial ranking is first partitioned by currency, so a large LBP numeric amount never outranks USD as if they were interchangeable.

### 21. Movie performance

Orders retain immutable screening context and movie title snapshots. Movie/currency groups report food captures, returns, paid count, AOV, sold units, observed screenings with attributed orders and paid orders per observed screening. This denominator is **screenings represented by the selected order/settlement cohorts**, not every scheduled screening or attendance. No ticket revenue is inferred.

### 22. Screening performance

Screening groups retain their own movie, location, hall and screening-start snapshots alongside financial and units metrics. Stable screening IDs select their orders; another screening's orders cannot contribute. Screening-start columns are UTC ISO timestamps explicitly labeled as such, while date filtering follows the chosen report timezone.

### 23. Hall performance

Hall/currency groups show paid food orders, food captures/refunds/net, AOV, units and the same explicitly observed-screening denominator. Stable Hall IDs group history and Order hall-name snapshots display it. Inactive halls remain reportable. This does not attempt to normalize by seating capacity or ticket attendance, which would require different authoritative data.

### 24. Preparation time

`READY event time − PREPARING event time`, in minutes, for orders with both nonnegative paired timestamps. Canceled orders and incomplete/corrupt pairs are excluded. A 17:00 preparation start and 17:06 ready event gives six minutes. Missing preparation is not a fabricated zero.

### 25. Acceptance wait time

`ACCEPTED − PLACED` measures kitchen acknowledgement, separately from preparation. Valid equal timestamps can legitimately yield zero, but missing events yield null. It uses the existing append-only status events rather than current status timestamps or generic `updatedAt`.

### 26. Delivery time

`DELIVERED − OUT_FOR_DELIVERY`, in minutes, for currently delivered orders with valid paired events. A 17:07 departure and 17:11 delivery gives four minutes. This does not substitute READY time or a delivery claim timestamp under the same label.

### 27. Total fulfillment time

`DELIVERED − PLACED` for delivered orders with both valid events. The preceding example gives eleven minutes, which includes acknowledgment, preparation and handoff gaps. It is not silently redefined as payment-to-delivery time.

### 28. Percentiles

PostgreSQL `percentile_cont` computes preparation and delivery median/P90 alongside mean and sample count. SQL ignores excluded null durations; no browser downloads raw timelines to compute percentiles. Excluded preparation/delivery counts make missing-history effects visible. The existing unique event constraint makes MAX event selection deterministic for a state.

### 29. Operational target metrics

No contractual SLA or arbitrary ten-minute success badge is implemented. Actual paired durations and sample counts are available. A future operational target requires explicit configured thresholds and its own clearly named denominator; inventing one now would misrepresent a cinema's commitments.

### 30. Inventory consumption

The report reads InventoryMovement, using movement creation time, scoped location/item and unit. ORDER_CONSUMPTION is the positive magnitude of its negative quantity delta. ORDER_CANCELLATION_RESTOCK is a separate restoration column. Current product recipes cannot rewrite historical consumption. Movie/screening/currency filters include only movements linked to matching orders.

### 31. Waste

WASTE and ADJUSTMENT_OUT remain separate from order consumption. The integration example reports 300.000 GRAM order consumption and 50.000 GRAM waste, not 350 grams of sales. Aggregate rows carry the item/location/unit and selected date interval; they are not a replacement for the existing individual movement ledger. Unlinked manual movements are excluded when an order-context filter is applied. No monetary waste cost is invented.

### 32. Low-stock summary

Current available stock is `quantityOnHand − quantityReserved`. Positive availability at or below the configured threshold is low; zero/negative availability is out of stock. Counts are current scoped item-location counts, explicitly independent of the historical report date. GRAM, EACH and MILLILITER are never combined into a quantity total.

### 33. Why revenue is not profit

CineBite has capture/refund facts but no authoritative purchasing cost, labor allocation, merchant fee ledger or tax allocation for these reports. Net revenue is gross minus refunds, not net profit. Phase 16 therefore makes no COGS, margin, VAT or profit claim.

### 34. Overview dashboard

Overview combines creation-cohort KPIs, currency-specific financial cards, revenue/order trends, status distribution and bounded top-five product/location/operations summaries. Detailed datasets belong in their report tabs. This hierarchy gives a quick executive view without sending every historical row to the browser.

### 35. Reporting navigation

Analytics appears in the existing Admin navigation. Eleven tabs are Overview, Revenue, Orders, Products, Categories, Locations, Movies, Screenings, Halls, Operations and Inventory. All retain the same validated scope/date filters and service; there is no duplicated tenant selection API.

### 36. Revenue trend

SQL assigns daily local-calendar buckets using the effective IANA timezone. Capture and refund lines are distinct, with separate charts for each currency. The service fills missing days with zero only for currencies actually present; an empty dataset stays empty. Charts represent cash-like settlement activity, not prices from current catalog metadata.

### 37. Order trend

Daily paid counts use payment settlement dates. Daily canceled and delivered counts are current states bucketed by order creation date. Their different attribution is stated alongside the chart and accessible table. They are not mislabeled as cancellations/deliveries occurring on that date.

### 38. Charts

Recharts supplies responsive React charts, dark styling, legends/tooltips, axes and differentiated series. It was selected because no mature chart library was present and its components fit the existing React rendering; [official getting-started documentation](https://recharts.github.io/en-US/guide/getting-started/) was checked. Only already-aggregated DTO values reach it. Approximate Number conversion is restricted to plotting; exact Decimal strings remain in cards and data tables. Animation is disabled.

### 39. Tables

Server-selected columns display exact amounts, currencies and explicit units. Semantic table captions/headers and local horizontal scrolling preserve dense operational details without widening the page. Operations also has readable summary cards for small screens. Null duration cells say no completed sample instead of zero.

### 40. Pagination

The database limits detailed rows with page/pageSize, computes total rows and uses stable key/currency tie-breaking. Page size defaults to 20 and is capped at 100. The UI's Previous/Next links preserve filters. CSV is separately bounded at 5,000 rows and refuses oversized exports rather than silently truncating them. Offset pagination is appropriate at this stage; very deep historical browsing may later merit cursors.

### 41. Query performance

SQL CTEs aggregate eligible orders, canonical captures, successful refunds and timelines before joining results. Query count is constant per report, not proportional to orders. A repeatable-read snapshot makes cards and rows agree during concurrent webhooks. A 12-second SQL timeout and 20-second transaction limit bound work. Overview runs three additional bounded highlight queries, not a per-order loop.

### 42. Rollup strategy

No warehouse, duplicated revenue table or daily rollup is introduced. The 1,000-order isolated performance check demonstrates the current aggregation approach. This is not a million-row Neon benchmark. If measured production queries later become expensive, rebuildable rollups/materialized views could supplement — never replace — authoritative payments, refunds, orders and movements.

### 43. Caching

No application report cache is implemented; authenticated API/CSV responses use `no-store`. Dynamic server pages derive fresh scope and data. This avoids stale grants and shared tenant cache keys. Any future cache must include organization, authorized locations, timezone, dates, currency and filters, and remain non-authoritative.

### 44. Empty states

A genuinely empty report shows `No data for this period`. Counts can legitimately be zero, but there is no synthetic sales trend or invented growth percentage. Timeline gaps use no-sample labels; zero gross means no refund-rate denominator. Loading skeletons do not display stale financial numbers.

### 45. Previous-period comparison

This optional UI feature is not implemented. No growth badge claims an unqueried comparison. The arithmetic helper has zero-baseline unit tests returning null rather than Infinity, but mandatory conditional integration case AN is correctly marked NOT EXECUTABLE. This distinction prevents a helper test being misreported as an executed dashboard feature.

### 46. Multi-currency behavior

Every financial aggregation groups by currency. USD and LBP appear in separate cards, chart series/groups and table rows. Ranking groups currency before comparing monetary values; an optional currency filter supports focused comparisons. There is no FX rate, conversion or meaningless combined money total.

### 47. Financial date attribution

Gross uses Payment.succeededAt; refunds use Refund.succeededAt; paid count uses successful settlement; created/cohort counts use Order.createdAt; inventory uses movement creation time. For a September charge refunded in October, September has the capture and October has the return. Historical order table `Captured amount (all-time)` is deliberately labeled differently from period cash totals.

### 48. Historical snapshots

Order location/hall/movie/screening context and OrderItem name/prices remain display authority. Stable IDs group renamed entities. The latest matching snapshot provides one group label. Inactivation is not a history filter. Current names appear only in filter options; category grouping and inventory item metadata have their documented current-metadata limitations.

### 49. CSV export

POST export reruns the same service and authorization with all report rows up to the limit. Each rectangular row includes report name, calendar dates, timezone, location scope and the report's columns. UTF-8 BOM, quoted fields and CRLF support spreadsheet import. Filename is server-generated from allowlisted report and resolved dates; no arbitrary client filename is accepted. Export creates a REPORT_EXPORTED audit event, ordinary reads do not.

### 50. CSV security

Same-origin checking, a 4,096-byte request limit, strict filters and fresh server grants protect export. User-controlled strings beginning with optional whitespace and `=`, `+`, `-` or `@` receive an apostrophe prefix; quotes/newlines are correctly escaped and NUL removed. No session token, QR credential, Firebase UID, provider ID, secret or unnecessary staff data is a CSV column. PostgreSQL throttles six successful exports per actor/tenant/fixed minute; the seventh is rejected. Narrow filters rather than bypassing the 5,000-row guard.

### 51. Super Admin analytics

No separate cross-organization platform dashboard was implemented. The normal Cinema Admin report is not a Super Admin bypass. Platform reporting was optional and would need a deliberate dedicated permission/DTO policy; tenants' private financial rows are not accidentally shared with a platform summary.

### 52. Role restrictions

Cinema Admin can report on their active organization; Location Manager can report on established location grants, including the existing allLocations policy. This extends the explicitly requested manager reporting surface without changing membership or grants. Kitchen and Delivery roles cannot open financial reporting APIs/exports. Customers have no analytics route; anonymous requests fail authentication.

### 53. Runtime validation

Zod rejects unknown organization fields, invalid dates, malformed IDs, unsupported report/sort/direction, invalid IANA zones, non-uppercase three-letter currencies, duplicate query values and out-of-range pagination. Temporal rejects impossible dates/reversed/oversized ranges. SQL binds values; the few raw SQL fragments come solely from private server constants, never request strings. Expected errors use safe domain messages, not Prisma/SQL text.

### 54. Database indexes/schema changes

The additive Phase 16 migration adds `(status, succeededAt)` Payment and Refund indexes matching settled-money filters, REPORT_EXPORTED/ANALYTICS audit enum values and a small expiring hashed-key ReportExportLimit counter. Existing organization/location/order/event indexes remain in use. The counter is infrastructure, not duplicate business data. Historical migrations and order/payment/refund state machines are unchanged. Deploy this migration before serving the new code.

### 55. Automated tests

The full Vitest suite has 455 passing tests in 55 files. Phase 16 adds 43 tests for Decimal financial/rate arithmetic, empty/negative cases, date presets, inclusive-end conversion, Beirut DST, malformed/tampered filters, CSV injection/formatting and server zero-fill. SQL aggregation/domain attribution is additionally tested against actual isolated PostgreSQL through the integration runner, not mocked into expected output.

### 56. Manual/integration tests actually executed

The runner uses local PostgreSQL, Firebase Auth emulator sessions, the optimized Next server and native Chromium. It executes A–AV: 47 applicable mandatory cases pass; AN is NOT EXECUTABLE because optional comparison is not enabled. Three extra cases test export throttling, request safeguards and malicious/invalid filters. Each case's exact evidence and final status is recorded in `phase-16-integration-results.json`; no unexecuted test is marked PASS.

### 57. Performance tests

The runner persists an additional 1,000 distinct test Orders, Payments and OrderItems, requests the real product reporting API and checks the aggregate includes them within the query timeout. The JSON records measured HTTP end-to-end milliseconds. This verifies the implemented path and constant-query design locally, not production throughput, Neon latency or future warehouse capacity.

### 58. Firestore status

There are no normal Firestore analytics reads/writes. PostgreSQL remains authoritative. Source inspection in integration case AU checks the new repository and service for Firestore dependencies. The auth emulator supplies identity only; test financial records stay in the isolated PostgreSQL database.

### 59. Mobile UI

Native 390×844 and tablet 820×1180 views were exercised. Cards stack, filters have practical touch heights, navigation and dense tables scroll locally, and the document has no horizontal overflow. The mobile evidence is a full-page native PNG, not a scaled desktop screenshot.

### 60. Accessibility

Labels bind native form fields; tabs expose current state; table captions/headers identify data. Charts have titles, legends and expandable exact-data tables, so color is not the only source of meaning. Empty/error/loading states use actual text. Existing global focus and notification conventions are reused. Automated viewport checks are not a claim of a full screen-reader or WCAG audit.

### 61. Motion

The dashboard uses a short Motion opacity entrance and existing loading skeleton conventions. `prefers-reduced-motion` removes the transition and loading motion is gated by `motion-safe`. Chart animation and spinning financial counters are disabled. Financial values remain fixed strings, not animated floating-point estimates.

### 62. LinkedIn screenshots

Nine PNGs demonstrate overview, revenue, location comparison, products, movies, operations, consumption, screening filters and mobile. They are generated from fictional persisted SQL fixtures by the actual application, not made-up chart arrays or image generation. The LinkedIn README explains each image and the sandbox/demo context.

### 63. Confirmation screenshots are cropped

Native browser page capture includes only the complete CineBite page, not the Windows desktop, taskbar, address bar, tabs, editor or terminal. Full-page images preserve the content instead of cropping off rows. No blur, retouching, mock UI or warning masking is used; problems were fixed in code and images recaptured.

### 64. Confirmation screenshots contain no secrets/private financial data

Fictional cinema, product, movie and financial records are created only in the dedicated local test database. Production credentials, actual staff addresses, customer tokens, QR data and provider secrets are not displayed. Screenshot evidence is reviewed at native resolution; private emulator keys and browser sessions are not committed.

### 65. Known limitations

There is no historical category snapshot, item-level refund allocation, cost/tax ledger, all-scheduled-screenings denominator, historical-as-of status reconstruction, FX, previous-period UI, platform reporting or customer profiling. Filter options are bounded to 200 recent authorized screenings; explicit older ID filters retain their selected value without silently reverting. Inventory names use current item metadata. Charts use approximate plot coordinates with exact table values. Export has intentional row/rate limits. Production migration and production-scale/load benchmarking were not performed. Existing dependency advisories need a separately reviewed upgrade, not an untested forced migration.

### 66. What Phase 17 should implement

Wait for the user's Phase 17 brief after their review/merge. Reasonable candidates are explicitly configured operational targets, forward-only category snapshots, item-level refund attribution or production query optimization backed by measurements. These are suggestions, not a new scope or commitment. No Phase 17 code, external BI, forecasts or real-money integration was started.
