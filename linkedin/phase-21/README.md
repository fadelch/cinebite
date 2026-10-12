# Phase 21 — performance evidence

Real, isolated synthetic-test results. Images 01–07 are **performance evidence panels rendered from committed measured JSON**, not newly shipped live app dashboards. Image 08 is the actual complete CineBite mobile customer menu, captured at 390x844 DPR2 after hydration/fonts loaded. No image generation, invented measurements, production data, credential-bearing URLs, browser chrome, QR codes or infrastructure consoles are used.

| Image | Content |
| --- | --- |
| [01-performance-overview.png](01-performance-overview.png) | Before/after performance and correctness overview |
| [02-load-test-summary.png](02-load-test-summary.png) | Real finite menu/cart/checkout/polling and isolation loads |
| [03-checkout-load-results.png](03-checkout-load-results.png) | Logical workflows, actual wire retries and idempotency |
| [04-kitchen-performance.png](04-kitchen-performance.png) | Queue reads, conditional polling and guarded transitions |
| [05-database-query-optimization.png](05-database-query-optimization.png) | Menu N+1 removal at matched fixture scale |
| [06-concurrency-test-results.png](06-concurrency-test-results.png) | Exact last-stock winners, refunds and delivery claims |
| [07-analytics-performance.png](07-analytics-performance.png) | Reporting plus operations and the 5000-row CSV cap |
| [08-mobile-performance.png](08-mobile-performance.png) | Full actual synthetic customer menu; no browser/QR credentials |

These are finite local smoke/load cohorts, not sustained production benchmarks. Short-sample P99 is the maximum; expected 409/429 responses are disclosed separately from unexpected errors, and retries are included in timing/wire counts. Hosted capacity and physical phones remain staging acceptance items. Full methodology, findings, limits and all 85 explanation topics: [Phase 21 report](../../docs/performance/phase-21-performance-report.md).

Regenerate panels with `npx.cmd tsx tests/performance/capture-evidence.ts` after a successful isolated suite. The browser test captures image 08. Only reviewed PNGs and this README are whitelisted here; browser profiles, raw logs and test secrets stay ignored.
