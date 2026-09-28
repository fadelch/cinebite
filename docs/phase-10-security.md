# Phase 10 secure seat QR and customer-session architecture

Phase 10 turns a physical cinema seat into a short-lived, read-only customer context. It does not create carts, orders, payments, stock reservations, or tickets.

## Trust flow

```text
opaque seat QR -> hash lookup -> active seat/hall/location
               -> Phase 9 live-screening resolver
               -> explicit customer confirmation (POST)
               -> short-lived HttpOnly guest cookie
               -> session-derived Phase 7/8 customer menu
```

The browser never chooses the organization, location, hall, seat, screening, price, or inventory result. Those values are derived on the server from persisted relationships.

## QR credentials

- A credential is 32 cryptographically random bytes encoded as base64url (256 bits of entropy).
- PostgreSQL stores only its SHA-256 hash, a version, status, timestamps, and generated-image metadata.
- One current `SeatQrCode` exists per seat. The token hash is globally unique.
- The QR contains `CINEBITE_PUBLIC_ORIGIN/s/<credential>`; the origin is server configuration, not browser input.
- Generate-missing never rotates an existing code. Rotation prepares a new token/image and replaces the database record atomically, then attempts compensating cleanup of the old image.
- Revocation invalidates the credential and records a safe audit event. Regeneration deliberately issues a fresh version.

Firebase Storage is preferred for QR PNG assets at a server-generated organization/location/hall/seat/version path. If the configured bucket is unavailable, the PNG is stored in the protected PostgreSQL fallback column and is served only through the authorized admin image route. The raw credential is not added to a database column, log, audit event, screenshot, or repository file.

The QR is a physically visible discovery credential, not customer or staff authentication. It can identify only its own active seat, and it grants no admin access or permanent identity.

## Scan and session policy

`GET /s/[credential]` performs a passive validation and displays safe cinema context. It never creates or revokes a session, which prevents previews, crawlers, or prefetching from changing state. An explicit same-origin POST creates the session.

`CustomerSession` stores only a hash of another 256-bit token and is bound to exactly one seat and one screening. The raw token exists only in a dedicated HttpOnly cookie. The cookie is `Secure` in production, `SameSite=Lax`, path-scoped to the app, and has an explicit expiry.

Expiry is the earliest of the screening end plus a 15-minute grace period and a six-hour absolute maximum. Every protected request checks the hash, active status, expiry, seat/hall/location state, screening relationship, scheduled status, and screening time. Cancelled or ended screenings invalidate the context.

Rescanning the same seat during the same screening transactionally revokes prior active sessions and creates one fresh session. This limits abandoned credentials while ensuring that a failed creation cannot leave the old session revoked on its own. Ending the guest session revokes only that session and clears only its cookie; Firebase staff authentication is unaffected.

## Customer menu authority

The menu location comes from `CustomerSession -> Seat -> Hall -> Location`. Phase 7 supplies the active category/product/location offer and PostgreSQL price. Phase 8 supplies effective recipe/inventory availability. Manually unavailable offers are omitted, tracked insufficient products are labeled out of stock, and `NOT_TRACKED` products follow the established Phase 8 policy. No inventory quantities, thresholds, movement history, internal IDs, audit data, or staff data are exposed.

## Authorization and request defenses

- Cinema Admins can manage QR codes only inside their organization.
- Location Managers can manage only their assigned locations.
- Kitchen and Delivery staff cannot administer QR codes.
- Mutation input is validated with Zod and authorization is repeated server-side.
- Session creation and logout enforce a same-origin policy.
- Invalid, revoked, unknown, and predictable/raw-seat credentials return generic customer-safe states.
- High token entropy and generic responses make enumeration impractical. A shared/distributed rate limiter is not yet present; it should be added at the deployment edge before broad public exposure.

## PostgreSQL and audit behavior

The two Phase 10 migrations add `SeatQrCode`, `CustomerSession`, their enums, constraints/indexes, audit action values, and the protected image fallback. PostgreSQL is authoritative for QR/session business state. Phase 10 performs no Firestore business writes.

Safe audit events cover generation, rotation, and revocation. Metadata contains scoped entity/version information but never raw QR or customer-session credentials.

## Accessibility and motion

Customer pages use semantic headings, labelled controls, visible focus states, readable status text, sufficient touch targets, and a responsive 390 x 844 layout. Administrative motion now starts from the server-rendered state, avoiding hydration mismatch warnings and respecting the established reduced-motion behavior.

## Known limits and Phase 11 boundary

The configured Firebase Storage bucket was unavailable during verification, so the protected PostgreSQL PNG fallback was exercised. Distributed rate limiting is still a deployment concern. Phase 11 should build server-authoritative carts and orders on this session context, rechecking price and availability and adding stock reservation/deduction, without moving authority into the browser.
