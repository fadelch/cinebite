# Seat QR and ticket check-in security

Permanent QR codes identify seats; they are not proof of authorization or physical presence.
QR-only customer-session creation is no longer supported.

## Staff and customer workflow

1. A Cinema Admin or permitted Location Manager opens **Hall → Seat QR management
   → Ticket check-in**. Kitchen/delivery/platform-only roles cannot issue codes.
2. Staff check the actual ticket, seat and live screening, enter a non-personal
   booking reference and confirm the verification checkbox. This is a manual
   workflow, not an integration with a ticket vendor.
3. **Issue one-time code** returns a cryptographically random 12-digit code once.
   Give it only to that customer and hide it after handover. It expires after ten
   minutes or at screening end. Upcoming/ended/inactive resources cannot issue codes.
4. Customers scan the permanent QR, or open **Start my order** on the homepage
   and enter their seat QR link/code. Only a 43-character identifier, local `/s/`
   path or full same-origin QR URL is accepted. Arbitrary redirects are rejected.
5. On movie/seat confirmation, enter the 12-digit ticket code and tap **Start
   ordering**. Groups separated by spaces/hyphens work. Verification consumes the
   code before setting the existing HttpOnly customer cookie. No account is required.

Codes are not put in URLs, browser storage, logs, audit metadata or evidence.
Unnamed customer inputs and POST forms prevent GET query-string fallback.
Issuance responses are no-store. Code/ticket references are persisted only as
peppered HMAC digests. Do not enter personal details in ticket reference fields.

## Transaction and rate-limit design

`SeatCheckIn` binds a grant to QR ID/version, screening, issuer and expiry. States
are ISSUED, CONSUMED, LOCKED or REVOKED. Consumed grants remain session evidence.
Issuing a new code revokes the preceding unused grant, not an existing session.

Verification locks QR then screening and rechecks current operational/live context.
A wrong code commits its counter before returning generic denial; five failures
lock it. Shared PostgreSQL quotas add ten verifications per QR/minute to existing
endpoint/network limits. Failed business transactions cannot roll back quotas.
HMAC comparison is constant-time; randomness is cryptographic, not Math.random.

Consumption, authorized replacement and session creation commit atomically. Partial
unique indexes enforce one issued grant per QR/screening and one ACTIVE session per
hall/seat/screening. Each consumed grant belongs to at most one session.

Normal issuance is rejected for an already checked-in seat. Staff must reverify
the ticket and explicitly authorize replacement. The fresh grant identifies the
exact session it may replace; issuance alone never evicts it. A lost HTTP response
may leave a consumed code without a received cookie: staff must reauthorize.

Sessions store QR ID/version and consumed grant ID. Every validation checks those
bindings and operational resources/live screening. Cart, checkout, payment retry
and customer cancellation writes also recheck inside transactions with QR/session
locks. QR rotation/revocation takes the conflicting QR lock and atomically revokes
affected ACTIVE sessions and unused grants. In-flight authorized writes can finish
before revocation commits; subsequent writes cannot use stale service validation.

## Money, migration and rollout

Revocation never deletes/transfers sessions, carts, orders, payments, refunds,
reservations or stock movements. Paid orders remain available to authorized staff.
Replacement sessions do not inherit another customer's order access. Staff support
is required after session loss. Pending money continues through existing
reconciliation, late-success review/refund policies, not fabricated cancellation.

This branch does not automatically deploy or migrate any hosted resource.

1. Review `20261013200000_seat_check_in` and its manifest checksum. Back up isolated
   staging using the established procedures and review pending payment attempts.
2. Keep `SECURITY_RATE_LIMIT_SECRET` random (≥32 characters), private and identical
   across instances. Domain-separated HMACs reuse it as a pepper. Rotation invalidates
   unused codes but does not invalidate consumed session evidence.
3. In an approved staging maintenance window, pause ordering, apply the migration
   using the guarded procedure and isolated **direct** connection, then deploy the
   matching application. Never use production, `.env.local` or `db push` for testing.
4. The migration revokes legacy ACTIVE QR-only sessions, retaining all rows/history.
   Customers must check in again. Nullable columns retain historical records, not a
   fallback: sessions missing consumed grant evidence always fail authorization.
5. Run updated hosted smoke tests only after separate permission for synthetic
   staging writes. Verify actual Firebase staff auth/roles, a physical phone, code
   handover, ingress limits, paid-order support and payment reconciliation.
6. Never roll back to QR-only authorization. Use a security-compatible rollback
   or forward fix, disabling ordering during an unsafe rollback. Never restore a
   database over settled money to undo this migration.

Neon guidance informed direct migration connections, code-managed schema,
preserving Prisma/drivers and isolated transaction tests. No Neon resources were changed.

## Local tests and residual risks

```powershell
npm run ci:quality
# Local PG17 on 127.0.0.1:55424, role cinebite_test. Never load .env.local:
npm run test:seat-check-in
# After the synthetic build, using Chrome and the same isolated database:
node node_modules/tsx/dist/cli.mjs --conditions=react-server tests/security/seat-check-in-browser.ts --local
```

CI uses disposable PostgreSQL on 55414. The runner pins loopback synthetic/demo
identities and refuses production markers. Reports show case names, not credentials;
test records are retained. Historical scripts that directly create QR-only sessions
are not current acceptance procedures. Use updated operations/staging and new tests.

An old QR photograph alone cannot authorize an order. This does **not** prove
continuous physical presence: someone can share a fresh unused code or retain an
authorized session while leaving during the same screening. Previous-screening
codes/sessions cannot authorize another showing. Staff mistakes/abuse, fresh-code
sharing, stolen cookies and volumetric attacks remain risks. Ticket integration or
additional on-site controls require further work; IP/Wi-Fi/geolocation alone is not
reliable seat authorization. A QR holder can exhaust five attempts and force staff
to reverify/reissue. Rate limits and ~40-bit entropy resist guessing, not denial of service.

Actual hosted deployment, Firebase staff sign-in, external payment-provider sandbox
verification and physical-phone acceptance are NOT EXECUTED by these local tests.
Payments remain CineBite's synthetic sandbox; no live PSP is claimed. Production
remains NO-GO pending staged operational/payment acceptance.
