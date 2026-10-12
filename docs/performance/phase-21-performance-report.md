# Phase 21 performance and scalability report

Phase 21 implementation and locally executable verification are complete on `phase-21-performance-scalability`. No production load, data reset, real-money payment, business-feature expansion, merge to main or Phase 22 implementation was performed.

## Results and evidence

The 500-product menu changed from **2529 to 34 SQL calls/request**, with local warm P95 **1038.61 → 74.42 ms**. All 57 final timed cohorts passed with zero unexpected errors. Exact last-stock winners, idempotent checkout, single-effect settlement, refund exposure, unique delivery claims and tenant/location/customer isolation were asserted against real local SQL/API state.

Evidence: [baseline](phase-21-baseline.json), [optimized run](phase-21-optimized.json), [browser checks](phase-21-browser.json), [before plans](phase-21-plans-baseline.json), [after plans](phase-21-plans-optimized.json), [final A–AS results and verification](phase-21-test-results.json), [repeatable harness](../../tests/performance/README.md), [eight reviewed images](../../linkedin/phase-21/README.md).

Baseline was captured **before optimization**, from main commit `55a426d` (merged Phase 20), using a production Next 16.3.8 build, local PostgreSQL 17 and demo Firebase Auth/Storage. Fixtures use relative timestamps and fictional identities, not production copies. Baseline and optimized initial shapes match; clocks/identifiers and machine activity differ. Eight warm read samples/five initial writes mean P99 is effectively the maximum, not a reliable population estimate. Finite concurrency bursts do not establish sustained production capacity. Unchanged-query latency differences below are observational, not proven optimization effects.

| Initial fixture | Count |
| --- | ---: |
| Organizations / locations / halls | 2 / 3 / 3 |
| Seats / customer sessions | 300 / 300 |
| Products | 603, with 20/100/500 offered for menu measurements |
| Orders / immutable status events | 6000 / 19200 |
| Authorized notifications / users | 5000 / 160 |

After matched measurements, contention workflows and the exact CSV-cap fixture extended the database to 11074 orders, 19355 status events, 5900 notifications, 166 users, 6 halls, 750 seats and 302 sessions. The extra 5000 historical CSV orders deliberately remain payment-gated and non-eligible; paid reporting does not require bypassing fulfillment guards. QR halls contain 50/100/300 seats. Historical settled fixtures are constructed in valid financial order with DB constraints/triggers enabled.

### Matched before/after measurements

P95 milliseconds; SQL calls are measured `pg_stat_statements` deltas/request, including authorization, excluding sampling queries. Payload bytes are complete decoded response bodies, not compressed wire size. Full numeric P50/P95/P99, throughput, bytes, memory deltas and counts remain in JSON.

| Cohort | Before P95 | After P95 | Before SQL/request | After SQL/request |
| --- | ---: | ---: | ---: | ---: |
| menu-20 | 82.55 | 40.67 | 129 | 34 |
| menu-100 | 265.54 | 53.26 | 529 | 34 |
| menu-500 | 1038.61 | 74.42 | 2529 | 34 |
| cart-read | 26.05 | 11.11 | 17 | 17 |
| cart-write | 101.23 | 65.03 | 60 | 60 |
| checkout | 174.04 | 124.20 | 98 | 98 |
| webhook | 68.66 | 57.67 | 45 | 45 |
| kitchen-queue | 92.50 | 45.66 | 33 | 33 |
| kitchen-transition | 62.51 | 27.71 | 38 | 38 |
| delivery-queue | 59.16 | 37.09 | 33 | 33 |
| delivery-claim | 40.32 | 22.97 | 41 | 41 |
| customer-status | 30.31 | 14.67 | 12 | 12 |
| admin-orders | 101.47 | 49.19 | 22 | 22 |
| analytics-7d | 166.37 | 109.55 | 31 | 31 |
| analytics-30d | 160.89 | 128.12 | 31 | 31 |
| staff-list | 29.54 | 26.36 | 18 | 18 |
| notifications | 85.59 | 35.93 | 15 | 15 |

### Load and correctness

57 timed cohorts contain 2566 logical iterations, including 1000 log-formatting operations, direct processor calls and image work. They contain **1651 measured HTTP attempts**, including **117 intermediate 409 retry responses**. Wire statuses: 1122×200, 76×201, 100×304, 60×400, 253×409, 40×429. Final safe business conflicts and image admission denials total 142; rate-limit test rejections are separately accepted assertions, not successful sign-ins. These totals exclude untimed setup/ownership assertions/browser traffic and deliberately injected 503/401/SQL timeout checks. Zero unexpected errors applies to these final timed cohorts, not a claim that deliberate fault tests never produced failures.

| Load | Actual outcome | P95 ms |
| --- | --- | ---: |
| 100 simultaneous menu readers | 100 scoped successful pages | 1880.53 |
| 100 carts, 20 in flight | 100 isolated successful reads | 94.91 |
| 20 checkouts, 10 in flight | 20 orders; 40 wire requests, same-key retries | 880.69 |
| 10 identical checkout requests | One order, one attempt, one reservation/component | 111.00 |
| 100 buyers / 10 portions | Exactly 10 orders, 90 safe conflicts | 1139.84 |
| 50 mixed one/two-unit buyers | 27 winners; reservation sum ≤40, no oversell | 1840.83 |
| 20 unique settlement events | 20 effects after 3 same-event wire retries | 535.42 |
| 100 duplicate webhooks | One journal/effect per component | 80.63 |
| 10 competing partial refunds | Six accepted; four conflicts; exposure ≤12.50 USD | 373.59 |
| 20 competing delivery claims | One committed assignment/history | 94.07 |
| 200 owned status polls, 100 in flight | 200 authorized reads | 343.78 |
| 50 kitchen / 50 delivery conditional polls | 100 freshly authorized 304s; zero body bytes | 106.79 / 68.17 |
| 24 mixed operations/reporting, 6 in flight | 8 checkouts + 8 queues + 8 reports succeed | 354.07 |
| Actual 5000-row CSV export | 5001 lines; 830219 bytes | 264.28 |

Initial notification feed is about 6081 bytes/read; the closed badge returns only 62 bytes/read. Initial 500-product HTML is about 891872 bytes/read: query work improved, **payload did not**. Kitchen initial queue is about 89755 bytes/read, reflecting existing bounded queues/history. Conditional suppression saves unchanged transfer/rendering, not authorization/query work.

The representative recipient-history plan changed from Sort + Seq Scan of 5000 rows (1.563 ms) to the additive recipient/createdAt/id index scanning 20 rows (0.075 ms). These are representative access-pattern SQL plans, not the entire joined authorization feed query. Kitchen/delivery already use their location/status/time indexes and were retained. No other speculative index or prior migration was removed.

### Proposed local regression budgets, not production promises

| Path / condition | Review budget | Observed |
| --- | --- | --- |
| Warm menu 500 products, serial | P95 <300 ms; ≤50 SQL calls/request | 74.42 ms; 34 |
| Menu 100-product burst, 100 readers | P95 <3 s | 1.88 s |
| Successful checkout, 10 in flight, bounded retries | P95 <2 s | 0.88 s |
| Queue/isolation reads, 20 in flight | P95 <1 s | <0.32 s |
| Owned status polls, 100 in flight | P95 <1 s | 0.34 s |
| Max-range analytics, serial | P95 <1 s | 0.23 s |
| Mixed reporting/operations, 6 in flight | P95 <1 s | 0.35 s |
| CSV cap, 5000 rows | <3 s; <1 MiB response | 0.26 s; 830219 bytes |
| QR 100-seat invocation / 300-seat total | <10 s / <30 s locally | 4.01 s / 13.39 s |
| Emulated critical mobile workflow | Useful menu <5 s; cart-to-paid progress <5 s | 3.13 s / 3.28 s |

Do not turn these post-analysis review targets into SLOs without repeated staging arrival-rate/soak measurements and a declared hardware/service plan.

## Findings and corrective work

| Severity | Finding | Resolution / remaining limit |
| --- | --- | --- |
| Critical | No demonstrated stock, payment, refund, claim or isolation corruption | Guarded concurrency assertions passed; not a production audit guarantee |
| High | Menu stock N+1: 2529 SQL calls at 500 products | Fresh scoped batch read; 34 calls/request |
| High | Direct Prisma adapter COMMIT conflicts surfaced as 500 | Recognize genuine adapter errors with SQLSTATE 40001/40P01; bounded rollback retries and three regression tests; real webhook rerun passed |
| Medium | Poll synchronization, repeated payloads and duplicate timer possibility | ±10% jitter, bounded backoff, one in-flight/timer chain, hidden pause and post-authorization ETags |
| Medium | Badge loads full feed; history requires sorting scan | Count-only closed badge; retain unread index and add measured history index |
| Medium | Unbounded per-isolate image admission / implicit pool sizing | Two decoders, eight queued, 2 s wait, six safe denials under 16-work burst; explicit pool/timeout bounds |
| Medium | Large menu HTML and customer-JS journey footprint | Remain known limits; no silent pagination feature or fabricated compressed-size claim |
| Medium | Hosted pooler, cold starts, storage delays and peak memory unverified | Staging acceptance required; local client limits are not global serverless connection limits |
| Low | Short samples and machine noise can overstate speedups | Raw metrics, sample limitations and unchanged-query counts disclosed |
| Carried security risk | Five HIGH development-only dependency advisories | Unchanged braces/ESLint chain; current production dependency audit is zero; no forced framework downgrade |

Failed exploratory runs were not hidden as passes. They found the real adapter conflict bug; harness corrections included valid session state, existing POST methods/action DTOs, bounded same-key/event retries, realistic separate kitchen workers, expected invalid-input 400s, Next's title announcer versus errors, and scoped queue query-string interception. Synthetic-only fixtures were explicitly regenerated for clean reruns; failed diagnostic artifacts remain ignored, outside final benchmark evidence.

## Detailed architecture and all 85 requested topics

1. **Phase 20 achieved:** Fresh PostgreSQL authorization, streamed request limits, exact origins, shared quotas, private dynamic pages/CSP, safe uploads and financial guards. These checks remain on every tested request; performance work did not remove them.

2. **Phase 21 objective:** Measure the secured system, remove demonstrated waste and establish honest limits. It adds no order states, merchant adapter, BI platform, distributed real-time service or new commerce feature.

3. **Baseline methodology:** Capture before modifying product source, warm each read scenario, then time actual authorized HTTP workflows. Compare the initial fixture shape and disclose clock/machine variance instead of attributing every faster unchanged query to code.

4. **Test environment:** Local-only PostgreSQL 17, pg_stat_statements, demo Auth/Storage emulators, production Next build and headless Chrome. Random test secrets live in memory; the harness overrides server config and never loads live credentials.

5. **Dataset size:** The initial counts above match before/after. Extra contention identities, CSV history and QR halls are added afterward, with final counts captured separately so a larger export fixture cannot silently improve the baseline comparison.

6. **Load-testing tool:** The opt-in TypeScript finite-worker harness uses actual Node HTTP, SQL statistics and Playwright/CDP. It fits the app's signed webhook/seat-cookie workflows without sending third-party load infrastructure production credentials.

7. **Customer menu baseline:** SQL rose 129→529→2529 calls for 20→100→500 products. Batching keeps all three at 34; a fast cache was rejected because live stock and authorization must remain fresh.

8. **Cart performance:** Initial one-item read/write P95 is 11.11/65.03 ms; 100 concurrent-cohort reads have 94.91 ms P95. Cart DTO stock is batched, while write validation keeps the existing fresh singular/transaction checks.

9. **Checkout performance:** Twenty independent workflows complete at ten in flight with P95 880.69 ms including bounded same-key retries. This measures durable order, reservation and sandbox intent initialization—not browser return-page success.

10. **Idempotency under contention:** Ten identical-key requests yield one order/attempt and one reservation per ingredient. Retrying the original key is essential; inventing a new key after uncertainty can create a second purchase.

11. **Last-stock test:** One hundred buyers contend for ten portions, producing exactly ten committed orders and ninety safe conflicts. Physical stock stays ten while reserved stock reaches ten; a reservation is not premature consumption.

12. **Shared ingredients:** One/two-unit products share a forty-unit inventory record. The committed reservation sum equals winner requirements and never exceeds on-hand stock; conflicts and possible underfill are not relabeled as oversell or infrastructure failure.

13. **Webhook throughput:** Twenty unique signed settlements execute at ten in flight, with P95 535.42 ms after three bounded event replays. Each original recipe component has one consumption movement; late failure events cannot undo paid success.

14. **Duplicate webhook load:** One hundred replays return successfully while retaining one event journal and one effect/component. Signature verification and event identity remain required even on the fast duplicate path.

15. **Refund contention:** Ten 2.00 USD requests against a 12.50 USD capture allow six and reject four. Pending/processing/succeeded exposure remains within capture; financial reconciliation stays outside the original reserve transaction.

16. **Kitchen queue:** The serial P95 is 45.66 ms and existing relation reads are bounded at 33 SQL calls/request. Operational ordering remains oldest-first; no faster but unfair newest-first queue is substituted.

17. **Kitchen transitions:** Four actual scoped test kitchen workers execute sixty independent accept/preparing/ready transitions, with bounded jittered client retries and one READY event/order. Stale expected states fail safely rather than overwriting another worker.

18. **Delivery queue:** Serial P95 is 37.09 ms with 33 calls/request. Ready, assigned and history scopes remain constrained by current staff access and existing queue bounds.

19. **Delivery claims:** Twenty competing requests from two actual delivery identities produce one winner and one immutable claim event. Conflict latency is recorded separately from successful throughput; it is not twenty successful deliveries.

20. **Customer status polling:** Two hundred owned reads at one hundred in flight have P95 343.78 ms. Public order codes do not authorize access, and a customer in the other tenant gets 404 for a foreign code.

21. **Kitchen polling:** Fifty unchanged conditional reads return freshly authorized 304 responses with zero body bytes. Browser checks exercise hidden pause, resume, unmount cleanup, backoff and terminal rejection against the actual hook.

22. **Delivery polling:** Fifty unchanged reads also return 304; P95 is 68.17 ms. Permission checks and queue SQL still run, because a stored ETag must not outlive a role or location-access change.

23. **Notification polling:** Closed bells request only authorized unread count, about 62 bytes instead of the 6081-byte first feed page. Opening the center switches to its existing paginated full feed, preserving notification details and controls.

24. **Backoff/jitter:** Healthy polls are 5 s ±10%, failures exponentially back off to a 30 s base ±10%, and bounded Retry-After guidance can wait longer. Hidden documents stop requests; one active request/timer chain prevents duplicated loops.

25. **Real-time decision:** Keep conditional polling for v1 rather than add WebSockets/SSE/Firebase business replication. It is compatible with current serverless deployment and gives simpler fresh authorization; continuous connection ownership would need separate operations/capacity work.

26. **Prisma lifecycle:** One lazy global client is reused per warm isolate, not constructed/disconnected for each request. Test runners disconnect only in teardown; this avoids multiplying pools during normal traffic.

27. **Neon pooling:** Runtime uses pooled DATABASE_URL; CLI uses direct DIRECT_URL. A private read-only config check confirmed pooled/direct/distinct booleans without publishing hosts or secrets; no Neon request was made. Per-isolate pools still multiply across functions. See [Neon pooling](https://neon.com/docs/connect/connection-pooling).

28. **Connection result:** Sampled local peak is twenty clients, including the application's ten-slot pool and the fixture/sampler ten-slot pool. This is not twenty hosted backend sessions nor proof of distributed Neon pooler capacity.

29. **Transaction length:** Keep existing serializable financial writes, fifteen-second financial deadlines and bounded retries. Aggregate database execution time across a cohort is not transaction lock duration; hosted lock-duration/CPU telemetry remains unmeasured.

30. **Provider boundary:** The durable attempt/reservation transaction commits before provider initialization. A 300 ms/12 s synthetic ledger block leaves queue reads responsive; timeout returns safe 503, and same-key recovery retains one intent/order. Timeout never proves a remote side effect did not happen.

31. **Transaction retries:** Retry only rolled-back known serialization/deadlock states, including direct adapter COMMIT errors. Checkout retains three server attempts, financial paths five; backoff is 10–100 ms plus up to 20 ms jitter. Whole-suite logs record 329 checkout retry messages, not 329 duplicate orders.

32. **High-frequency queries:** Menu availability, cart DTOs, queue relations, unread counts and auth scopes were measured. Many remaining calls are deliberately fresh authorization/context checks; deleting them for a lower count is not an optimization.

33. **N+1 fix:** Menu/cart services call one stock batch repository, returning a Map by product ID. The repository scopes organization/location/known product IDs and selects recipe/stock inputs; even an absent stock row is safely unavailable.

34. **DTO/select choices:** Select only status, availability, quantities and required recipe relations for the new batch. Existing safe menu/order DTOs stay stable, avoiding a business/API rewrite and preserving decimal/BigInt availability calculations.

35. **Index review:** Add only recipientUserId/createdAt/id based on a real history sort/scan. Keep the readAt index for unread traffic and existing financial/operational indexes; extra speculative indexes would increase every write's cost.

36. **Query plans:** The representative notification access plan now reads twenty indexed rows rather than scanning/sorting five thousand. Kitchen and delivery plans already use relevant indexes; their roughly 0.17/0.53 ms local plans did not justify replacement.

37. **Analytics performance:** Seven-day, thirty-day, ninety-day and maximum 366-day windows plus revenue/products/movies/operations/inventory reports execute. Financial attribution remains successful captures/refunds, separate currencies and current tenant filters—not unpaid order totals.

38. **Analytics plus operations:** Eight reports, eight queue reads and eight checkouts share six in-flight slots and finish successfully at 354.07 ms P95. This modest finite mix does not justify unrestricted concurrent cinema-wide exports.

39. **Caching decisions:** No server cache of stock, payments, scopes or financial analytics was introduced. Immutable versioned normalized images retain existing public media cache policy; QR/private business data stay private/no-store.

40. **Cache safety:** ETag is calculated only after fresh service authorization/read; private/no-store and Vary: Cookie remain. A suspended manager presenting the old tag receives denial, not 304 or cached data.

41. **CSV performance:** Actual 5000-row authorized export returns 5001 lines/830219 bytes in 264.28 ms. It remains capped/formula-safe and currently buffered; substantially larger exports would require a separately designed streaming/async workflow.

42. **Memory behavior:** Runner RSS deltas include response buffers and garbage collection and can be negative; they are not server peak RSS. Menu500 adds about 34.46 MiB to the runner during its cohort; CSV delta is 2.44 MiB. No memory-leak or hosted peak claim is made.

43. **Bulk QR:** Fifty seats take 2.27 s, one hundred 4.01 s, three hundred 13.39 s across three ≤100-seat requests, with actual emulator object saves and guarded QR records. No credential-bearing PNG is committed.

44. **Image concurrency:** Two active decodes, eight waiting slots and a 2 s queue wait bound memory/CPU admission. Six of sixteen simultaneous direct normalization jobs receive safe 429; ten finish as bounded WebP. Shared upload quotas and signature/pixel defenses remain independent.

45. **Pagination:** Staff, notification history and admin orders retain bounded distinct pages over large fixtures. The customer menu still returns all offered products: changing that UX to lazy categories or search is not silently included in performance maintenance.

46. **Payload sizes:** Menu500 is about 0.89 MB decoded HTML, kitchen about 90 KB/read, CSV about 0.83 MB. Batching reduces round trips, not these bytes; conditional polls remove only unchanged bodies, not changed/full payloads.

47. **Customer images:** Existing Next Image sizes/normalized WebP and lazy behavior are retained. Synthetic menus intentionally contain no remote product/poster media; image-heavy CDN/download/cache-hit performance is NOT EXECUTABLE here, not guessed from placeholders.

48. **Mobile network:** CDP emulates 150 ms latency, 1.6 Mbps down and 750 Kbps up. Seat-entry-to-useful-menu is 3133 ms; cart-to-paid-progress is 3284 ms. This is browser network emulation, not a real cellular radio or regional latency test.

49. **Customer JS:** Actual customer-journey scripts total 1287557 decoded bytes across twenty script responses. This includes QR/menu/cart/payment/progress, not a precise menu-only compressed transfer estimate; no chart/Firebase-auth markers appear in fetched scripts.

50. **Route splitting:** Existing route-local client imports keep staff/report components separate from the customer path. No new global chart import, Firebase business client or eager admin dashboard bundle was introduced.

51. **Chart bundle:** Recharts remains in analytics components; the customer browser does not observe its markers. A minified-marker check is corroborative, not a complete module-graph or tree-shaking proof; no fabricated chunk attribution is reported.

52. **Outbox throughput:** Two overlapping bounded processors drain at least two hundred explicit new events during a 740 ms timed window, a lower bound about 270 fixture events/s, also processing related workflow backlog. Invocation RPS is not event throughput.

53. **Outbox batching:** Default batch is configurable 1–100, fallback 25. Per-event transactions and unique recipient dedupe keys remain; a single huge transaction would increase lock duration and make recovery more costly.

54. **Expiry processor:** Concurrent authenticated sweeps release genuinely expired isolated reservations once and drive required provider cancellation safely. Fixture time advancement happens only in the test DB; GET status remains read-only.

55. **Job batching:** Expiry takes at most one hundred candidates and a cooperative twenty-second budget; checkout only opportunistically examines five candidates with a 200 ms budget. Scheduled jobs remain responsible for draining larger backlog, not a foreground checkout loop.

56. **Serverless limits:** Expiry/refund scheduling advertises maxDuration 60 and stops starting new units after the shared twenty-second budget. An in-progress transaction/provider call may finish later; this is not an unsafe hard abort or a tested Vercel-plan guarantee.

57. **Concurrent workers:** Four overlapping notification workers use SKIP LOCKED and recipient dedupe; concurrent expiry sweeps preserve one release. No in-process mutex replaces SQL coordination across functions.

58. **Rate limiter:** One hundred invalid auth-exchange requests across two trusted local test ingress buckets produce sixty validation 400s and forty quota 429s, P95 35.91 ms. The production shared PostgreSQL/HMAC limiter stays enabled; local ingress simulation is not proxy/WAF deployment proof.

59. **Observability overhead:** Production-config app logs stay enabled during all benchmarks. One thousand formatter iterations verify redaction/bounded size; a disabled-logging comparison was intentionally not performed, so no precise percentage overhead claim is made.

60. **Cold start:** Local process readiness is 1706 ms after build, versus 1610 ms before. That excludes hosted scheduling, Neon wakeup, remote Auth and CDN effects; it is not Vercel cold-start evidence.

61. **Capacity assumptions:** Tested two tenants/three locations and finite one-hundred-reader bursts, with ten simultaneous successful checkout workflows plus retry pressure. A thousand continuously polling phones or many warm instances is outside this evidence.

62. **Budgets:** The review budgets above reflect measured lab behavior plus headroom. They are proposals for regression/staging checks, not predeclared production promises or permission to ignore safe business conflicts.

63. **Error rates:** Final timed unexpected error rate is zero, while 253 wire 409s, forty quota 429s and six image admission denials remain disclosed. Controlled dependency/SQL/browser failures are separate successful fault assertions.

64. **Tenant isolation:** One hundred mixed A/B queue reads return only the current tenant's locations. Unauthenticated/foreign objects are not cached into a shared response even under high concurrency.

65. **Location isolation:** One hundred mixed Beirut/Dbayeh staff reads remain isolated, and an explicit unauthorized delivery location filter is 403. Filters cannot grant permission beyond PostgreSQL LocationAccess.

66. **Customer isolation:** One hundred mixed cart reads retain own session products; a foreign public code returns 404. Seat/session credentials are required and are never stored in the numeric artifacts/screenshots.

67. **Dependency slowdown:** Actual local statement timeout cancels an isolated pg_sleep; sandbox provider-ledger locks demonstrate timeout and recovery without holding checkout stock locks around provider work. No live provider network outage was induced.

68. **Timeout strategy:** Driver acquisition is 2.5 s, query timeout default 10 s (bounded configuration), with existing transaction deadlines. Provider uncertainty recovers through durable same-key state; non-idempotent new purchases are never blindly retried. See [node-postgres pool](https://node-postgres.com/apis/pool) and [client timeout options](https://node-postgres.com/apis/client).

69. **Monitoring additions:** Safe per-cohort latency/SQL/wire-code/bytes/retry and pool samples make the problem repeatable. Existing request IDs, operation logs, job records and incident capture remain the production telemetry; no public private-infrastructure dashboard was added.

70. **Before/after:** The strongest causal result is eliminating product-scaled SQL work, not unchanged paths' noisy latency differences. All seventeen matched cohorts are published rather than selecting only the best measurements.

71. **Severity findings:** The table distinguishes corrected High issues, remaining Medium payload/hosted-evidence limits, Low sampling limitations and carried development advisories. No demonstrated Critical corruption emerged; this does not certify production risk-free.

72. **Optimizations:** Scoped stock batches, narrower inputs, post-authorization ETags, count-only badge, single polling loop/jitter/backoff, explicit pools/timeouts, bounded image admission, bounded jobs/retry jitter and one evidence-backed index. No security, recipe, payment or audit guard was removed.

73. **Remaining bottlenecks:** Full large-menu HTML, customer-journey JS, auth/queue relation work, serializable write contention, buffered CSV and external storage/provider latency. Prefer staging evidence and approved UX/service changes over hidden correctness shortcuts.

74. **Automated execution:** Full suite: 601 tests/73 files; security subset: 34/5; new performance subset: 11/1. Three extra direct-adapter error tests belong to the full DB-helper suite, so test totals must not be double-counted.

75. **Load execution:** All fifty-seven timed cohorts plus untimed foreign-scope/suspension/fault assertions run on real local APIs/SQL; mobile performs actual sandbox settlement. The final artifact is from a fresh synthetic database, not mixed failed-run data.

76. **NOT EXECUTABLE:** Hosted staging/Vercel/Neon pooler, sustained arrival-rate/soak/region tests, live provider network timeouts, physical phones, remote image-heavy traffic and server peak CPU/RSS are unavailable in this authorized local environment. No production alternative was used to fill those gaps.

77. **Full regression:** All 601 tests pass and final lint/typecheck/build/Prisma checks are recorded in the verification artifact. AQ is finalized from those external checks; the load runner itself honestly leaves it not performed by that invocation.

78. **Security regression:** All 34 dedicated tests pass, load isolation/revocation checks pass and repository/history/client scan is clean. Current audit has zero production vulnerabilities but five unchanged HIGH dev-only findings; hosted IAM/WAF/secret rotation checks remain owner tasks.

79. **Firestore:** Business reads/writes remain PostgreSQL. The only server Firestore use found is the existing one-time migration source, not menu/cart/order/queue replication; Firebase remains identity/media infrastructure.

80. **LinkedIn screenshots:** Eight actual PNGs are reviewed; seven render committed numeric evidence and one shows the full real synthetic mobile menu. They are explicitly labeled so nobody mistakes evidence panels for a new app feature or production monitoring console.

81. **No fabrication:** Values come from measured before/after JSON, real API statuses, SQL assertions and CDP browser checks. Exploratory failures, client retries, synthetic fault responses and unavailable deployment tests are disclosed.

82. **No private evidence:** No env contents, database hosts/credentials, account passwords, cookies, provider signatures, customer records, QR images or infrastructure screenshots are published. Public image capture excludes browser chrome and credential URLs.

83. **Known limits:** Short cohorts, local hardware variance, no server peak measurement, decoded—not compressed—bytes, customer-journey—not exact per-route—JS attribution, representative plans and emulator—not deployed—external services. Results support review, not a blanket scalability guarantee.

84. **v1 recommendations:** Begin staging acceptance near the tested hundred-reader burst and ten-in-flight checkout cohort, with narrow pools and bounded scheduled jobs. Measure arrival-rate/soak, cold compute, reservation backlog, query waits, payload and external media before promising cinema-wide concurrency; keep same-key retry UX and ingress defenses.

85. **Phase 22:** Await the user's brief and manual review/merge. Recommended next planning topics are deployment/staging acceptance, real hosted telemetry and evidence-backed UX/payload improvements; no Phase 22 work has started or been inferred as authorized.

## Deployment handoff

After review/merge, use the existing direct migration workflow to apply only the additive index. Do not reset Neon or rewrite prior migrations. Keep pooled runtime credentials, bounded per-isolate pool settings, all Phase 20 secrets/origins/CSP/quotas and authenticated schedules. Monitor queue freshness, reservation expiry backlog, retry/429 rates and DB waits; back out performance code through a reviewed revert if necessary, without deleting financial/audit data. The retained index is additive and does not change business schema fields.

Branch is pushed only after final checks, never merged by the agent. Phase 22 is not started.
