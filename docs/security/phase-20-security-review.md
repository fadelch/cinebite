# Phase 20 — Security Hardening

## Scope and architecture

Phase 20 reviews existing CineBite functionality, not new commerce. Phase 19's request/job correlation, safe logs, dependency health, outbox/refund monitoring and read-only platform operations remain intact. PostgreSQL remains business truth; Firebase proves staff identity and stores normalized media. Firestore remains migration-only. No live-money provider, external alert collector, PWA or public security dashboard was introduced.

The [surface matrix](phase-20-surface-matrix.md) inventories all 129 reachable page/API files before changes and records their final controls. Operator bootstrap/migration/seed/capture scripts are not web entry points. No application Server Actions were found.

```text
Browser / QR / external provider
   → per-request nonce + privacy/cache headers
   → bounded input + exact Origin (browser mutations) + shared quotas
   → verified Firebase identity OR hashed anonymous session OR signed provider event
   → current PostgreSQL organization / role / location / ownership
   → transaction locks, explicit DTOs, domain state machine and idempotency
   → safe response + scrubbed request/job correlation
```

URL/body/header identifiers, prices, roles, status fields, uploaded metadata and unsigned webhook content are untrusted. A Firebase token is identity, not permission; an order code is a reference, not authorization. Only current database grants and validated server-derived context confer authority. Environment configuration is an operator trust boundary, never a tenant input.

## Findings and remediation

| ID | Severity | Finding | Remediation / evidence |
| --- | --- | --- | --- |
| S20-01 | HIGH | Installed Sharp included a vulnerable SVG decoder dependency; raster rejection previously followed metadata parsing. | Sharp upgraded to 0.35.5; SVG/PDF loaders blocked, raster signatures checked before metadata. Fake/SVG/extreme/oversize rejection executed. |
| S20-02 | MEDIUM | Origin fallback trusted arbitrary forwarded host/protocol headers. | Exact configured browser origins, cross-site Fetch Metadata denial, no forwarded-host authority. Actual forged-origin request denied; LAN origin must be configured explicitly. |
| S20-03 | MEDIUM | Older JSON/multipart routes had no shared streaming bound. | Every exported API handler's existing wrapper now enforces actual bytes, declared size, compressed-body rejection, query size/duplicate limits and strict upload fields. Actual oversized legacy request returns 413. |
| S20-04 | MEDIUM | Several legacy mutations rechecked only a user ID at commit, including operations delayed by uploads/provider work. | Shared current-role/activity/org/location/version transaction checks; organization/user SHARE locks serialize revocation with commit. Platform provisioning has its own current SUPER_ADMIN check. |
| S20-05 | MEDIUM | Session establishment could use a QR resolution that had been rotated/revoked before session creation. | Lock QR, recheck exact active hash, seat operational state and live bound screening inside Serializable transaction. Stale resolution rejected in actual SQL test. |
| S20-06 | MEDIUM | Concurrent QR rotations generated the same version-based storage filename. | Unique server UUID image paths; existing database version CAS retained. Unique paths executed in regression suite; rotation/revocation tested via actual API. |
| S20-07 | MEDIUM | Abuse protection did not consistently cover QR/start/auth exchange/uploads/invites/customer mutations. | Shared PostgreSQL atomic HMAC-key counters, verified actor/session subjects, explicit trusted ingress policy, 429 retry guidance and bounded expiry pruning. Real quota and next-window recovery executed. |
| S20-08 | LOW | Payment GET polling could perform provider/reconciliation work. | Status GET now reads owned state only. Checkout/retry POST, signed webhooks and authenticated jobs perform recovery/settlement. Forged success URL did not settle. |
| S20-09 | LOW | No production script CSP or explicit clickjacking protection. | Per-request cryptographic script nonces, dynamic HTML, frame/object/base restrictions, no script unsafe-inline/eval in production. Browser hydration and password toggle executed. |
| S20-10 | LOW | Legacy schemas silently stripped some unexpected fields; permissive IDs and offsets increased ambiguity. | Strict legacy DTOs, safe bounded IDs, bounded page offsets, duplicate query/form rejection. Forged tenant/role/price fields rejected. |
| S20-11 | LOW | Cart commit did not recheck expiry/current context after earlier validation. | Transaction rechecks session, operational/live context and local offer; maximum 50 distinct cart products. Expired checkout and bound context tested. |
| S20-12 | LOW | Reset UI could fall back to native GET if JavaScript failed. | Explicit POST action preserves generic Firebase reset flow without placing email in a fallback query string. Login already uses POST and unnamed credential controls. |
| S20-13 | INFORMATIONAL | Upload success unnecessarily required a second Firebase metadata request; deny-by-default emulator rejected that RPC. | Public raster URLs use the server-generated token already saved as object metadata. Real emulator save and generated path verified; branding/QR remain private and never use public image tokens. |
| S20-14 | MEDIUM | Owned customer financial responses inherited staff-authored free-text cancellation/refund notes. | Explicit customer financial projection strips notes, internal refund references and issues; verified balances and public reason/status remain. Actual private-note fixture is absent from the HTTP response. |

No exploitable cross-tenant order/staff/media access, location escape, customer ownership bypass, privilege escalation, price/success forgery, unsigned webhook mutation, over-refund, unsafe HTML renderer or client-bundled server secret was found in executed scope. This is evidence from the described tests, not a guarantee of absence of all vulnerabilities.

Known feasible unremediated application CRITICAL: **0**; HIGH: **0**. Accepted application MEDIUM: **2** (ingress/volumetric infrastructure and credential lifecycle verification below); LOW: **1** (style CSP exception). The development dependency advisory is separately disclosed with its upstream HIGH severity; it is not falsely counted as patched.

## Authorization and ownership review

`getCurrentUser` verifies revocation-aware Firebase session cookies, then current PostgreSQL profile, authorization version, active membership role and organization status. Unknown roles, missing memberships/grants, inactive users and suspended organizations fail closed. Login cannot make a tenant administrator a platform administrator. Platform accounts have no implicit tenant financial/catalog bypass.

Existing domain-specific guards remain the authority: menu/inventory/movie catalog changes require Cinema Admin; location operations accept appropriate Cinema Admin/Location Manager grants; kitchen/delivery have their own allowed roles and state machine; settings/staff mutations remain Cinema Admin-only. Staff listing/detail is also Cinema Admin-only in the current implementation. Financial and notification/analytics paths recheck current role and authorization version inside transactions. Legacy structure/catalog/schedule/stock/QR writes now recheck current authorization at commit rather than relying on a pre-upload snapshot.

Tenant-owned queries were reviewed across Location, Hall, composite-key Seat, category/product/offer, recipe/inventory, movie/screening, order/payment/refund, notifications, staff and reporting. Their organization comes from the verified actor/session or an already authorized relationship; raw path IDs do not establish scope. Order A's customer cannot read B's public-code/internal-ID/payment/financial/notification surfaces. A1-scoped managers cannot use A2 filters to escape inventory, screenings, order queues, analytics or staff actions.

Example: a request may select a product ID, but the lookup combines it with the current actor's organization. A7's checkout never accepts a new hall/seat/location or browser money calculation. A submitted `role` field is checked against an explicit allowed DTO, not spread into a User mutation. Queries with legitimate resource names in a second organization still fail ownership checks.

Transactions retain financial Order→Payment locks, reservation conditional writes, serializable retries, delivery claim CAS and staff last-admin organization serialization. Guard SHARE locks protect current authorization during legacy commits; they are not a process-wide identity cache. Request-local version snapshots use a separate AsyncLocalStorage map and are never logged. Existing role/state/stock concurrency unit suites were rerun; actual competing refunds were executed against PostgreSQL.

## Staff and customer sessions

Staff cookies remain HttpOnly, Secure in production, SameSite=Lax, Path=/ and bounded to 12 hours, with recent-login checks at exchange. A new verified cookie replaces the previous credential; browser-supplied session IDs are never reused. Login inputs remain in Firebase's in-memory persistence, then Firebase client sign-out removes the transient user after HttpOnly exchange. Missing/invalid identities receive generic errors rather than role/account details.

Staff logout clears only the staff cookie; it is not an all-device revocation endpoint. A copied cookie remains subject to expiry, Firebase revocation and current PostgreSQL activity/version. Staff suspension denies subsequent requests even with a previously valid cookie. Customer end-session clears/revokes only its guest session; both behaviors are covered by actual cookie/SQL tests.

Anonymous tokens contain 32 random bytes (43 URL-safe characters), with SHA-256 hashes stored rather than raw credentials. Token shape is checked before lookup; expiry/revocation/live screening and operational seat hierarchy are enforced. Rescan generates a new token and revokes prior active session for that seat/screening. Existing order history survives session end for staff fulfillment. No IP history, fingerprint or behavior profile was added.

QR rotation invalidates the old hash immediately for future session establishment; revocation blocks new sessions. It does **not** automatically cancel an existing customer's paid order or retroactively revoke every previously created customer session. A QR printed PNG necessarily encodes the credential: its private storage/privileged image delivery remains credential material, even though the searchable credential column is a hash. Do not publish actual QR images or allow staff images to be cached publicly. Generation is now bounded to 100 missing images per request; repeat the existing action to continue a large hall.

## Origin, methods, CSP and response headers

Production requires an exact HTTPS `CINEBITE_APP_ORIGIN` and a shared random `SECURITY_RATE_LIMIT_SECRET` of at least 32 characters. Readiness fails closed without them. `CINEBITE_ALLOWED_ORIGINS` optionally lists exact additional browser origins, comma-separated. Real production browser mutations reject HTTP. Only demo-project loopback HTTP is permitted for isolated production-build tests. Development accepts the direct request origin; a LAN origin differing from Next's bind URL must be explicitly configured. Neither Host nor X-Forwarded-Host grants origin authority.

All browser mutations are checked centrally and retain existing route checks. The four machine surfaces—payment webhook, expiry, notification processor and operations monitor—are exempt from cookie CSRF checks only because their handlers independently require HMAC or dedicated constant-time bearer authentication. No wildcard credentialed CORS is enabled. GET QR only resolves; payment success queries/GET reads do not initiate/settle business operations. Expiry/status touches and operational counters are not a new customer authorization grant.

Production HTML is dynamically rendered: a new 24-byte nonce is installed upstream by `src/proxy.ts`, replacing caller-supplied CSP/nonce headers. Next automatically attaches the nonce to runtime and inline framework scripts. No stale prerendered shell or shared HTML cache is allowed. Development alone permits eval/HMR; production does not.

Final CSP directives:

| Directive | Policy |
| --- | --- |
| default-src | self |
| script-src | self, per-request nonce, strict-dynamic; eval only in development |
| style-src | self, unsafe-inline (documented current Motion/Recharts/style-attribute exception) |
| img-src | self, data, blob, Firebase Storage HTTPS |
| font-src | self; Next fonts are self-hosted |
| connect-src | self, Firebase Identity Toolkit/Secure Token HTTPS and narrow official CAPTCHA paths; dev HMR/local Auth only in development |
| frame-src | Configured validated Firebase Auth hostname and official Google/reCAPTCHA paths; no arbitrary frames |
| frame-ancestors / object-src / base-uri / worker-src | none |
| form-action | self |

Also: X-Frame-Options=DENY, nosniff, Referrer-Policy=no-referrer, Permissions-Policy disables camera/microphone/geolocation/payment/USB. HTTPS production Proxy responses emit HSTS max-age=31536000 without preload/includeSubDomains assumptions; local HTTP does not. Configure the TLS ingress to enforce HTTPS/HSTS as well. Sensitive page/API responses are private/no-store; static JS/fonts may still be cached normally. No QR URL is forwarded through browser Referer. No third-party analytics was added. Raw HTML/Markdown execution, arbitrary CSS branding and JavaScript-based URLs were not found.

The style exception does not permit arbitrary inline JavaScript. Future live-provider iframes/SDKs must receive a targeted reviewed allowlist; do not loosen the entire policy. `productionBrowserSourceMaps=false` and powered-by suppression are explicit; server build artifacts are private deployment files, not public assets.

## Input, SQL, media and workload controls

The common API boundary limits streamed non-multipart bodies to 16 KiB and multipart forms to 6 MiB; images themselves remain at most 5 MiB. Declared size is an early check, never the only check. Compressed bodies are rejected. Upload field names/duplicates and JSON-bearing form field sizes are checked before legacy handlers parse. Paths/queries are bounded to 2,048/4,096 characters and at most 32 unique query parameters. Domain Zod schemas independently validate actual DTOs, enums, money decimals, dates, arrays, page size and offsets. Strict sensitive schemas prevent mass assignment. Multipart generation payloads retain their valid form structure.

Images require JPEG/PNG/WebP binary signatures and successful decode, at most 40 million input pixels and 10,000 pixels per dimension; animated/multipage content is rejected. SVG/PDF decoders are blocked before metadata. Sharp auto-orients, bounds output to 1200×1200, strips original metadata through WebP encoding and generates UUID filenames under a server-derived authorized path. A traversal-like original filename never enters the path. Existing image cleanup/compensation is retained. The generated public product/movie download token authorizes an intentionally public raster only; QR/private branding pipelines do not use it.

Raw SQL call sites were reviewed in financial locks/idempotency/rate counters, analytics aggregates, operational probes/pruning, staff settings/identity synchronization and customer QR locking. Dynamic values use tagged Prisma SQL/bind parameters; reporting sort identifiers come from fixed validated allowlists. Two literal `$executeRawUnsafe` timeout calls became tagged statements. No application `$queryRawUnsafe`, eval, new Function or request-controlled shell command was found. CLI test/migration scripts may contain fixed local test SQL; they are not HTTP entry points.

No arbitrary user-URL server fetch exists. Image optimizer remote patterns remain limited to the configured Firebase bucket; tenant website URLs are HTTPS links, not server fetch targets. Login destinations and notification links use internal server-generated allowlists. There is no service worker caching authenticated data. Analytics keeps a 366-day range, bounded pages, statement timeouts and 5,000-row export cap; CSV formulas including whitespace/control-prefixed values are neutralized. Cart and seat/QR bulk work is bounded. Catalogs/venue-owned option lists still scale with stored tenant data rather than an unbounded caller-selected limit; hosting concurrency/resource budgets remain necessary.

Unused browser Firestore/Storage initialization exports were removed after confirming no consumers. The browser only initializes Firebase identity; Admin Storage and migration-only Admin Firestore remain server-side. No working dependency family was removed merely to suppress an audit report.

Firebase email/password now initializes Auth with in-memory persistence directly, avoiding unused default popup/redirect dependencies and proactive mobile helper initialization. Official CAPTCHA hosts remain narrowly allowed because Firebase abuse protection may challenge a future real login. The primary browser login test rewrites identity requests to the local emulator; no real user password or production identity request is used. Real-project CAPTCHA/configuration acceptance still belongs to staging.

## Shared rate limits and privacy

`security_rate_limits` is additive PostgreSQL infrastructure. One parameterized atomic upsert enforces each fixed window across instances. It commits independently of business transactions, so a rejected mutation cannot roll back quota consumption. Keys are HMACs of policy/validated subject/window using a common server-only secret; no raw cookie/credential/IP is stored. Counts saturate at a fixed maximum. Expired counters are removed in bounded 1,000-row batches by the authenticated operations monitor. Schedule it regularly and monitor cleanup under sustained traffic.

| Surface | Subject | Default policy |
| --- | --- | --- |
| Staff session exchange | Trusted ingress network or deployment fallback | 30/minute |
| Customer start/end | Network; separate start/end buckets | 30/minute |
| QR GET resolution | Network | 60/minute |
| Customer cart/cancel/notification mutation | Verified current session | 120/minute |
| Checkout/payment mutation | Verified current session | 12/minute; existing payment limits also remain |
| General staff mutations | Verified UID + current organization | 120/minute |
| Staff invite/setup | Verified UID + organization | 10/10 minutes |
| Raster upload | Verified UID + organization | 20/minute |
| Refund mutation | Verified UID + organization | 12/minute |
| Analytics API/export | Verified UID + organization | 30/minute; export additionally 6/minute |
| Webhook ingress | Network | 600/minute, signature still mandatory |

Without a trusted single-IP header, public network quotas use a deployment-wide bucket at 20× capacity to avoid turning a shared cinema network into a narrow guessed-IP bottleneck. `SECURITY_TRUST_PROXY` defaults false. Enable it only when the ingress overwrites the configured single-IP `x-real-ip` or `x-vercel-forwarded-for` header and blocks direct origin access. Arbitrary forwarded chains are not trusted. A direct localhost test can set that header only because the isolated runner explicitly emulates a trusted ingress; that is not evidence of production proxy correctness.

429 returns safe retry guidance. Ingress timeouts, bandwidth/concurrency limits, provider-specific retry/WAF policy and high-cardinality cleanup capacity still require deployment validation. Fixed windows allow a boundary burst; this is not a bot fingerprint or distributed DDoS service. Password brute force/reset protections remain Firebase's responsibility, including enabling email-enumeration protection in the actual Firebase project. Private setup links remain transient authorized UI material, never logs/audit/screenshots.

## Payment, refunds, notifications and operations

Browser money/status is never authoritative. Checkout derives current offers/currency, snapshots context and reserves stock transactionally. Provider initialization/retry uses durable attempt idempotency. HMAC validates the exact bounded raw body with time tolerance and constant-time digest comparison before strict event parsing. Payment/provider identity, amount, currency, temporal state, eligibility and existing attempts are checked before settlement. Replays cannot repeat stock consumption. Signed mismatches are retained as rejected journal entries—not silently deleted to make a dashboard green.

Refund remaining balance is server-calculated; committed pending exposure counts against the cap. Order/Payment locking and idempotency prevent concurrent over-refunds. Staff role/tenant/location/version checks remain mandatory. Customer cancellation and staff issue/refund workflows preserve current state rules. Customers never mutate inventory directly. Delivery ownership and kitchen transitions remain centralized, with actual end-to-end payment→kitchen→delivery execution and all existing concurrency regression tests rerun.

Notification recipients and internal links remain server-derived, scoped to current grants and session ownership. Scheduled jobs require distinct strong server secrets; replay preserves financial/outbox idempotency. Public health reveals only fixed statuses. Platform operations remain current SUPER_ADMIN-only; the test matrix denied all other roles and anonymous customers.

Phase 19 redaction tests and actual-request secret-marker checks were rerun. Logs accept bounded safe identifiers/codes/counters, not raw messages, stacks, paths, bodies, full URLs, notes or credentials. Log output objects now have no prototype, and control/newline values cannot forge records. Safe production errors include correlation references instead of SQL/framework/provider internals. Infrastructure/SDK/browser tooling has its own logging policies; configure upstream query/header redaction and never capture real auth material in diagnostic screenshots.

## Dependency and secret checks

The initial npm audit reported 18 packages (16 HIGH, 2 MODERATE). Reviewed fixes retain Next 16.3.8 / React 19 and lockfile integrity: Sharp 0.35.5; compatible grpc, brace-expansion, source-map and mysql2 updates; reviewed API-compatible deepmerge-ts 8 and gaxios's CommonJS-compatible UUID 11 overrides. Prisma generate/validate, production build and all regression tests were rerun; no `audit fix --force` was used.

Final production audit: **0 vulnerabilities**. Full audit: **5 HIGH package findings**, all inherited from the development-only braces→micromatch→fast-glob→Next ESLint chain. The [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched braces version. It consumes repository-controlled glob patterns in lint tooling, not customer request patterns. Do not feed untrusted glob expressions to development tooling; re-audit at the next upstream release, keep CI sandboxed and treat the upstream HIGH advisory as open. npm's proposed framework downgrade is not a compatible fix. See [recorded dependency report](phase-20-dependency-audit.json).

Primary reviewed advisories: [Sharp decoder patch](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w), [grpc certificate validation](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j), [recursive deepmerge fix](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx), [UUID buffer fix](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq). Source vulnerabilities are not automatically proof that every feature is exposed; remediation and actual dependency reachability are recorded separately.

`scripts/security-scan.mjs` privately compares local server-secret values against tracked text, unique reachable Git history blobs and production client assets, and scans private-key/provider/Neon credential patterns. Reports filenames/categories/counts only. `.env.local` remains ignored, `.env.example` placeholders only, no live values added to source or README. This scan is useful evidence, not a full forensic history audit or OCR of every historic image. Current screenshots are manually inspected. Previously shared credentials must be reviewed/rotated by the owner; absence from Git cannot prove they were never exposed elsewhere.

## Tests actually executed

Final recorded execution: **587 passed / 72 Vitest files**, including **34 dedicated security tests / 5 files**. Lint, separate TypeScript, production build, Prisma generation/validation and migration drift check passed. All 20 migrations applied to the dedicated Phase 20 database; `prisma migrate diff` reported no difference. Actual integration: **41 PASS, 0 FAIL, 4 NOT EXECUTABLE** (32 required cases plus nine additional scenarios). Final secret scan found no matches; the scan is rerun after staging so newly tracked files are included.

Full Vitest regression and dedicated `src/security` suites run, not just authored. Build/runtime tests use dedicated local PostgreSQL on port 55414, demo Firebase Auth/Storage emulators and a production Next build on loopback 3120. All normal test writes are local; no production Neon/Firebase or merchant transaction was touched. Production-like HTTP is deliberately loopback; production QR generation uses an HTTPS fictional demo origin while the loopback browser origin is explicitly allowed.

[Machine-readable integration results](phase-20-integration-results.json) records each brief test 119–150 as PASS/FAIL/NOT EXECUTABLE. All 32 mandatory cases executed. Additional actual checks cover customer DTO privacy, desktop/mobile primary browser email/password login, Origin spoofing, body limits, session expiry, full payment/kitchen/delivery flow, signed wrong amount/currency/provider binding, cookie logout separation and authenticated recovery/outbox/monitor processing. Browser identity requests are fulfilled only by the demo emulator and all other external requests are blocked; password change revocation is honored before refreshing the fixture cookie. Failures during development (test HTTP method, unauthenticated login-page context, Storage metadata RPC and HTTPS QR fixture mismatch) were investigated, corrected and the complete suite rerun. Final results do not label an unexecuted test PASS.

Production distributed ingress/load behavior, live-money provider behavior, deployed TLS termination/HSTS and a standalone external DAST scanner remain NOT EXECUTABLE in this workspace. The equivalent bounded local quota, sandbox verification, HTTPS Proxy unit behavior and safe source/browser scans were executed. No destructive penetration test, real-account brute force, live payment attack or production active scan was run.

Commands:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run test:security
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run build
node scripts/dependency-audit.mjs
npm.cmd run security:scan
```

For integration, start a **separate** test PostgreSQL cluster at 127.0.0.1:55414 and create `cinebite_phase20_test`; set both DATABASE_URL and DIRECT_URL to that database before `prisma migrate deploy`. Start Auth/Storage only with `scripts/phase-20-emulators.json` and project `demo-cinebite-phase20`. Run `npm.cmd run verify:phase20`; never pass `--env-file=.env.local`. The runner asserts current_database before fixtures, generates credentials in memory, closes its own server/browser and disables demo identities. Stop the separate emulators/test database server afterward; fixture history is retained, not reset.

## Accepted risks and production assumptions

| Severity | Remaining item | Mitigation / follow-up |
| --- | --- | --- |
| MEDIUM | No production multi-instance ingress/WAF/timeout/load/cleanup-capacity proof. | PG limits are shared, fail closed and locally exercised; retain external volume controls, verify trusted headers/direct-origin blocking, scheduling and peak cinema traffic before deployment. |
| MEDIUM | Owner credential rotation/provider email-enumeration configuration cannot be verified from source alone. | Keep credentials private, rotate any previously shared key/password, use deployment secret manager and verify Firebase project settings. No claim that local scanning proves external secrecy. |
| LOW | Inline style CSP exception required by current rendering/motion/charts. | Scripts remain nonce-only; styles are not arbitrary tenant HTML/CSS. Remove exception only after moving style attributes/library styling to a tested compatible approach. |
| INFORMATIONAL (upstream HIGH) | Development-only unpatched braces advisory. | No runtime request use or compatible published patch; isolate CI, do not accept untrusted glob inputs, re-audit on upstream release. |
| INFORMATIONAL | Public menu/option lists scale with stored tenant data; infrastructure logging/caches and real deployment are outside local proof. | Bounded API inputs/exports/bulk work, authenticated ownership and safe response cache headers remain; configure platform resource/log policies. |

Before deploy: review/merge the feature branch yourself; apply the additive Phase 20 migration via the controlled migration workflow; set the shared rate-limit secret and exact HTTPS origin; configure optional origins explicitly; leave proxy trust false until ingress overwrites headers; schedule operations monitoring/counter pruning and existing recovery/outbox jobs; enforce TLS at ingress; recheck development dependency exception. Do not disable security to bypass missing configuration or use database reset/db-push. Local `.env.local` and production infrastructure were not changed by this task.

## LinkedIn evidence and next phase

Eight high-resolution full-browser-page PNGs live in `linkedin/phase-20`. Dashboard/access-denied images are actual demo application pages; headers/rate/upload/redaction/isolation/summary images are explicitly labeled rendered local test-evidence panels, not a newly exposed application dashboard or fabricated production scanner report. The operations dashboard may show deliberately rejected signed-mismatch test events: the journal is not altered to hide valid security evidence. Corrected earlier test setup incidents were explicitly triaged only in the isolated database after successful reruns. No financial history was deleted.

No desktop/taskbar/devtools, production URL, real customer, cookie, Firebase token, QR image/credential, database URL, reset link, payment secret or raw exploit payload appears in published screenshots. See the [gallery README](../../linkedin/phase-20/README.md).

Phase 21 is not started or assumed from an absent brief. A sensible future task is deployment/staging security acceptance: real TLS/ingress header verification, peak-load quotas/cleanup capacity, safe DAST, dependency exception removal and whichever separately specified product work the owner approves.
