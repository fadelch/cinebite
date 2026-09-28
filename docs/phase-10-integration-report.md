# Phase 10 manual and integration verification report

Execution date: 2026-09-29
Target: demo organization `cinebite-demo-cinemas`

The browser/integration harness used demo records, never printed credentials, and captured only application viewports. Automated tests use mocks rather than production writes. `PASS` below means the behavior was actually exercised by the browser/integration harness, an automated test, or direct source/database inspection. Tests not performed end-to-end are explicitly marked `NOT EXECUTABLE`.

| Test | Result | Evidence / notes |
| --- | --- | --- |
| A-C Generate, uniqueness, hash-only persistence | PASS | Real A7/A8 records and PNGs were generated; credentials differed and no raw credential appeared in the stored record. |
| D No active screening | PASS | A demo Hall 2 seat returned `NO_ACTIVE_SCREENING`; no session was issued. |
| E-F Live scan and passive GET | PASS | A7 resolved to the live Interstellar context; repository count/mutation tests prove GET performs no session write. |
| G-I Session, cookie, location-derived menu | PASS | A real session was created and menu fetched; response cookie was HttpOnly/SameSite=Lax with production Secure policy, and location came from the session graph. |
| J Server price | PASS | Automated menu tests select only the session location's PostgreSQL offer/price. The captured Beirut menu displayed its database price. |
| K Manual unavailable | NOT EXECUTABLE | Filtering is covered automatically, but the shared demo offer was not toggled during this run. |
| L Out of stock | PASS | The real mobile menu showed `OUT OF STOCK`; tests verify the availability calculation does not mutate `ProductLocation.isAvailable`. |
| M Restock | NOT EXECUTABLE | Automatic recomputation is covered at service level, but real inventory was not modified/restored during this run. |
| N NOT_TRACKED | PASS | Automated customer-menu tests exercise the reused Phase 8 `NOT_TRACKED` behavior. |
| O-P Invalid/random/raw-seat credential | PASS | Scan-service tests and integration lookup return a generic invalid state and never establish a session. |
| Q-S Rotate, revoke, regenerate | PASS | Real A7 rotation invalidated the old credential, revocation invalidated the rotated credential, and deliberate regeneration produced a working new version; audit behavior is tested. |
| T-U Seat/screening manipulation | PASS | Service tests verify customer-supplied identifiers cannot change the persisted session binding. |
| V Expiration | PASS | Deterministic tests reject expired sessions. |
| W Cancelled screening | PASS | Deterministic validation tests reject cancelled screening context. |
| X Rescan | PASS | Real same-seat/screening rescan revoked the old session and kept the fresh session valid. |
| Y Logout | PASS | The real guest session was revoked after exit; cookie-clearing and staff-cookie separation are implemented independently. |
| Z Location Manager | PASS | Authorization tests allow the assigned location and reject another location. |
| AA Cross tenant | PASS | Repository/access tests reject organization/seat scope mismatches. |
| AB Kitchen/Delivery | PASS | Role tests deny both roles QR administration. |
| AC Audit log | PASS | Automated assertions and database inspection cover generated/rotated/revoked events without raw credentials. |
| AD Firestore | PASS | Source inspection confirms PostgreSQL repositories and no Phase 10 Firestore business writes. |
| AE Mobile | PASS | Real 390 x 844 scan and customer-menu pages were captured after API session creation; layout, price, out-of-stock state, and exit control were visually inspected. |
| AF LinkedIn evidence | PASS | Images were visually inspected: application UI only, no browser chrome/desktop/dev overlay, QR graphics blurred, and no raw credential/session/secret visible. |

## Totals

- PASS: 30 grouped/individual checks
- FAIL: 0
- NOT EXECUTABLE: 2

## Quality gates

- Vitest: 36 files, 225 tests passed.
- ESLint: passed.
- TypeScript: passed.
- Production Next.js build: passed.
- Prisma schema validation and client generation: passed.
- Both Phase 10 migrations: deployed successfully.

## LinkedIn evidence

The root `linkedin` folder contains full application-page captures for earlier portfolio views plus Phase 8 inventory, Phase 9 screenings, and Phase 10 QR/session/menu functionality. Files 04 and 05 replace the earlier cropped versions with full-page captures. The QR management image deliberately blurs QR patterns so the visual cannot be used as an operational credential.
