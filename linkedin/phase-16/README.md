# Phase 16 — Analytics & Reporting

These are native, full-page screenshots of the actual CineBite application. The reporting code reads persisted PostgreSQL records; these captures use fictional records in an isolated local database and Firebase Auth emulator. Amounts are demo/sandbox evidence, not actual merchant financial information.

The phase demonstrates gross captures, successful refunds and net revenue; order counts and cancellation rates; historical product sales; location comparison; movie/screening concession performance; paired kitchen/delivery timings; consumption/restock/waste separation; timezone-aware filters; authorized CSV export; and tenant/location isolation. USD and LBP stay separate. Revenue is not profit, and order-level refunds are not fabricated into product net sales.

| Image | Demonstrates |
| --- | --- |
| [01-analytics-overview.png](01-analytics-overview.png) | Full overview: exact currency-specific KPIs, trends, status distribution and bounded product/location/operations summaries. |
| [02-revenue-dashboard.png](02-revenue-dashboard.png) | Successfully collected and returned money, net cash-like revenue, AOV and separate currency groups. |
| [03-location-comparison.png](03-location-comparison.png) | Authorized Beirut/Dbayeh comparison with historical snapshots and currency separation. |
| [04-product-performance.png](04-product-performance.png) | Historical units and gross sales; current product rename/inactivation does not replace order-item snapshots. |
| [05-movie-performance.png](05-movie-performance.png) | Movie-attributed concession activity, not ticket revenue. |
| [06-kitchen-delivery-performance.png](06-kitchen-delivery-performance.png) | Paired preparation/delivery/fulfillment timings, sample counts, exclusions and percentile detail. |
| [07-inventory-consumption.png](07-inventory-consumption.png) | Order consumption, cancellation restoration, waste and manual adjustments with explicit units. |
| [08-report-filters.png](08-report-filters.png) | Native date, timezone, location, currency, movie/screening and ranking filters on the screening report. |
| [09-mobile-analytics.png](09-mobile-analytics.png) | Actual 390-pixel mobile page with stacked cards, usable filters and locally scrolling tables. |

Captures contain only the application: no desktop, address bar, editor, terminal or browser profile. Full-page content is retained at native resolution, without AI generation, stretching, blur, retouching or masking. Sessions, private keys, production records and local test artifacts are excluded from Git. Earlier phases' images are unchanged.

Generation and verification: [scripts/verify-phase-16.ts](../../scripts/verify-phase-16.ts), [executed case evidence](../../docs/phase-16-integration-results.json), [architecture and formulas](../../docs/phase-16-architecture.md).
