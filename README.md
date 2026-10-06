# CineBite

CineBite is a multi-tenant cinema food-service application. Neon PostgreSQL and Prisma are the authoritative business-data layer, Firebase Authentication provides identity, and Firebase Storage holds normalized product and movie media.

## Current phase

**Phase 15 — Cancellations, Refunds & Exceptions (sandbox only)**

Phases 1–14 provide administration, stock, screenings, seat sessions, immutable order snapshots, payment-gated preparation/delivery, signed webhooks and inventory reservations. Phase 15 adds customer/staff order cancellation, full/partial refunds, original-consumption restoration, operational issues and previewed screening reconciliation. No real-money adapter is installed: the explicit sandbox accepts no card details and cannot charge or refund anyone's actual money.

This phase does not implement real-money merchant onboarding, chargebacks/disputes, loyalty, promotions, subscriptions, accounting exports, fraud scoring, support chat or advanced analytics. Cancelling an order, cancelling an unpaid payment and refunding a captured charge remain separate operations.

## Architecture

```text
browser
  -> Firebase Authentication (credentials and identity)
  -> verified Firebase ID token / HttpOnly session cookie
  -> Next.js server
  -> PostgreSQL User by Firebase UID
  -> active platform role or OrganizationMembership
  -> ACTIVE Organization and LocationAccess checks
  -> Prisma repositories and transactions
  -> Neon PostgreSQL (business source of truth)
```

- Firebase Authentication owns passwords, identity verification, reset/setup links, revocation, and session-cookie verification.
- Firebase Storage remains configured for future media.
- Neon PostgreSQL owns current application and authorization data.
- Prisma provides the schema, generated types, migrations, relational queries, and transactions.
- Firestore is retained unchanged as legacy migration/backup data. Normal application reads and writes no longer use it.
- Firebase custom claims remain a compact coarse signal, but sensitive server operations reload current PostgreSQL authorization state.

## Environment variables

Copy `.env.example` to the ignored `.env.local` and fill values privately. Never commit or print server secrets.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
FIREBASE_STORAGE_BUCKET=

DATABASE_URL=
DIRECT_URL=
```

`DATABASE_URL` is the Neon pooled connection used by the running application through `PrismaNeon`. Pooling is appropriate for concurrent and serverless runtime traffic.

`DIRECT_URL` is the Neon direct connection loaded by `prisma.config.ts` for controlled Prisma CLI and migration operations. It is not prefixed with `NEXT_PUBLIC_` and must not enter browser bundles.

`FIREBASE_STORAGE_BUCKET` is the server-only Firebase Admin bucket name. The public bucket name is also used by the strict Next Image remote pattern; neither value is a credential. Service-account credentials stay server-only.

## Prisma layout

```text
prisma/
  schema.prisma
  migrations/
    migration_lock.toml
    20260922160000_initial_postgresql_cutover/
      migration.sql
    20260924140000_phase_7_menu_management/
      migration.sql
    20260925120000_phase_8_inventory_management/
      migration.sql
    20260927120000_phase_9_movie_screening_system/
      migration.sql
prisma.config.ts
src/
  generated/prisma/                # generated locally, ignored by Git
  lib/db/
    prisma.ts                       # lazy server-only pooled client
    errors.ts                       # safe Prisma error-code helper
  server/database/mappers.ts       # Prisma row -> existing domain types
  server/repositories/             # PostgreSQL business persistence
  server/migration/
    firestore-source.ts            # read-only legacy extractor
    firestore-to-postgres.ts       # validation, mapping, apply, verification
scripts/
  migrate-firestore-postgres.ts    # dry-run/apply CLI
  bootstrap-super-admin.ts          # Firebase identity + PostgreSQL role
docs/
  firestore-to-postgres-migration.md
  phase-8-inventory-manual-test.md
  phase-9-screenings-manual-test.md
```

Prisma Client is generated into `src/generated/prisma` using the current `prisma-client` generator. The directory is ignored because it is reproducible through `npm install`/`npm run prisma:generate`.

## Relational model

### User

Represents application state for a Firebase identity. Its generated `id` is the primary key; `firebaseUid` and normalized lowercase `email` are unique. `platformRole` represents `SUPER_ADMIN` without forcing a tenant membership. It relates to memberships and authored audit logs. It stores no passwords, password hashes, ID tokens, or session cookies.

### Organization

Represents a cinema tenant. Its generated or migration-preserved `id` is the primary key, and `slug` is globally unique. Status is `ACTIVE`, `SUSPENDED`, or `INACTIVE`. It owns memberships, locations, and organization audit relations.

### OrganizationMembership

Joins a user to an organization with `CINEMA_ADMIN`, `LOCATION_MANAGER`, `KITCHEN_STAFF`, or `DELIVERY_STAFF`. `userId` and `organizationId` are foreign keys with cascade cleanup, and their compound uniqueness prevents duplicate tenant memberships. `allLocations` handles organization-wide tenant access; restricted access uses child rows.

### Location

Belongs to one organization through a restrictive foreign key. Address fields are flattened into relational columns while repository mappers preserve the existing nested domain shape. `@@unique([organizationId, slug])` allows different tenants to reuse a slug but prevents duplicates within one tenant. `organizationId` is indexed for tenant listings.

### LocationAccess

Connects one membership to an explicitly permitted location. The compound primary key `[membershipId, locationId]` prevents duplicate grants. Composite foreign keys include `organizationId`, so PostgreSQL itself requires the membership and location to belong to the same organization. This replaces long-term authorization arrays.

### Hall

Belongs to one location through a restrictive foreign key. `[locationId, number]` is unique, so hall numbers are scoped to a location. `locationId` is indexed. Seat counts are derived with a relational count rather than stored as a denormalized authority.

### Seat

Belongs to one hall. Its compound primary key `[hallId, id]` preserves legacy Firestore IDs such as `a1` while allowing that ID in multiple halls. `[hallId, label]` is also unique. This preserves Phase 5 hall-scoped uniqueness, and `hallId` is indexed for seat-grid reads.

### AuditLog

Stores trusted security/business events with action/entity enums, safe JSON metadata, and indexed organization/location/hall timelines. Actor and hierarchy references are nullable with `SET NULL`, so historical records remain readable if a referenced entity is later removed. Secrets are never valid audit metadata.

### MenuCategory

Represents an organization-wide grouping such as Popcorn or Drinks. Its opaque ID is the primary key, `organizationId` is a restrictive foreign key, `[organizationId, slug]` is unique, and `[id, organizationId]` supports tenant-safe product references. `ACTIVE`/`INACTIVE` provides history-safe disabling; `sortOrder` provides accessible deterministic ordering without drag-and-drop.

### Product

Represents the organization-wide identity of a sellable item: name, slug, description, optional normalized SKU, media metadata, status, and ordering. It references Organization and MenuCategory. The composite category relation includes `organizationId`, so PostgreSQL rejects a category from another tenant. Slug and non-null SKU are unique within an organization; PostgreSQL permits multiple null SKUs.

### ProductLocation

Represents one product offer at one physical location. It stores exact `Decimal(12,2)` price, a normalized three-letter currency code, and `isAvailable`. `[productId, locationId]` is unique. Both composite foreign keys include `organizationId`, so product and location must belong to the same tenant. Product status controls the global catalog while availability controls one location; normal workflows preserve rows and toggle availability instead of destroying history.

## Phase 8 inventory architecture

A `Product` is what a customer can buy, while an `InventoryItem` is a canonical resource the cinema stores or consumes. For example, Large Popcorn is a Product whose recipe can consume 150 GRAM of Popcorn Kernels and 1 EACH Large Cup. This separation avoids pretending that a sellable menu entry and a physical stock unit are the same thing.

### InventoryItem

The opaque `id` is the primary key. `organizationId` is a restrictive foreign key and `[organizationId, sku]` is unique, so two tenants may reuse a SKU while one tenant cannot. `[id, organizationId]` supports tenant-safe composite relations. `[organizationId, status, name]` indexes bounded catalog searches. Items use `ACTIVE`/`INACTIVE`; they are not normally deleted. Units are restricted to `EACH`, `GRAM`, and `MILLILITER`, preventing aliases such as G/KG/KILOGRAM from entering authoritative data. A unit may change only before the item has stock or recipe usage; later conversion requires a deliberate future workflow.

### LocationInventory

The opaque `id` is the primary key. It links an organization, location, and item using composite foreign keys that require all three to share a tenant. `[locationId, inventoryItemId]` is unique, `[id, organizationId]` supports tenant-safe movement references, and organization/location plus item indexes support stock pages. `quantityOnHand` and `lowStockThreshold` are `Decimal(14,3)` with database checks preventing negative values. Configuration always starts at `0.000`; initial stock must be a visible movement.

### InventoryMovement

The opaque `id` is the primary key. It references the tenant-safe LocationInventory row and the acting PostgreSQL User. Organization/time, location-inventory/time, and actor indexes support history queries. The row has no `updatedAt`, and the application exposes no edit/delete route. `RECEIVE` and `ADJUSTMENT_IN` store positive deltas; `ADJUSTMENT_OUT` and `WASTE` store negative deltas. Database checks require a nonzero delta with the correct sign. Corrections are new movements so the operational history remains traceable.

### ProductRecipeComponent

The opaque `id` is the primary key. Tenant-safe composite foreign keys connect Product and InventoryItem through the same `organizationId`. `[productId, inventoryItemId]` prevents duplicate components; organization/product and item indexes support recipe and impact queries. `quantityRequired` is `Decimal(14,3)` and must be greater than zero. Only active inventory items can be newly attached.

### Stock changes and concurrency

All quantity mutations enter one stock service. It resolves the actor and organization from the verified server session, validates IDs and decimal-string input with Zod, applies the location permission, then calls one repository transaction. Incoming movements use an atomic database increment. Outgoing movements use one conditional atomic decrement whose predicate requires `quantityOnHand >= requested quantity`; if the affected-row count is not one, the operation fails with “Insufficient stock for this adjustment.” The quantity update, InventoryMovement insert, and AuditLog insert occur inside the same Prisma transaction. This avoids JavaScript read/calculate/write races, lost updates, orphan movement rows, and normal negative stock.

Authoritative quantities cross API and component boundaries as normalized strings with exactly three decimal places. Prisma Decimal handles database changes, and projected availability uses integer thousandths rather than JavaScript floating point. A valid input such as `004.5` becomes `4.500`.

Stock status is computed, never stored: zero is `OUT_OF_STOCK`; a positive quantity at or below the threshold is `LOW_STOCK`; anything higher is `IN_STOCK`. This leaves one authoritative quantity and avoids stale status columns.

### Recipes and availability

Projected sellable units are computed from current location stock. For every recipe component, CineBite calculates `floor(quantityOnHand / quantityRequired)` and uses the smallest result. A product with no recipe is explicitly `NOT_TRACKED`, so introducing Phase 8 does not hide existing menu products.

Effective availability requires an active Product, a manually available ProductLocation, and inventory that is either sufficient or not tracked. Stock code never mutates `ProductLocation.isAvailable`: manual operational choices and physical stock remain independent. Consequently, running out of stock makes effective availability false, while receiving enough stock restores it automatically without requiring a second manual toggle.

### Permissions, isolation, and audit

`CINEMA_ADMIN` can manage item definitions, recipes, and stock throughout its own organization. `LOCATION_MANAGER` can view the shared item catalog and manage stock/thresholds only for `allLocations` or explicit LocationAccess rows; it cannot change global item or recipe definitions. Kitchen and delivery roles have no Phase 8 inventory permission. Every check is server-side. The browser never supplies a trusted organization ID, and repositories scope every query with the authenticated organization.

InventoryMovement is the operational quantity ledger. AuditLog is the administrative/security record. Item lifecycle, location configuration, receipts, adjustments, waste, thresholds, and recipe changes create safe audit events without secrets. Phase 8 writes no inventory data to Firestore; PostgreSQL remains authoritative, Firebase Authentication remains identity, and Firebase Storage retains its existing media role.

The admin routes are `/admin/inventory`, `/admin/inventory/items`, `/admin/inventory/locations/[locationId]`, and `/admin/inventory/movements`; recipes appear on product detail pages. Lists are bounded and filterable, forms remain practical at phone widths, text labels accompany every color status, focus indicators are visible, and Motion respects reduced-motion preferences.

Apply the reviewed Phase 8 migration with `npm run prisma:migrate:deploy`. Never use a destructive reset or production `db push`. See [the Phase 8 manual test guide](docs/phase-8-inventory-manual-test.md) for role, stock, recipe, history, mobile, and audit verification.

## Phase 9 movie and screening architecture

A `Movie` is reusable organization content: title, runtime, synopsis, language, content rating, lifecycle status, and normalized poster. A `Screening` is one scheduled showing that connects a Movie to a Hall for an exact `[startsAt, endsAt)` interval. Hall resolves Location and Organization, so Screening deliberately avoids duplicating organization/location columns.

### Movie

Movie uses an opaque primary key and a restrictive Organization foreign key. `[organizationId, slug]` is unique, `[id, organizationId]` supports tenant-safe lookups, and `[organizationId, status, title]` supports bounded catalog search. Runtime is an integer from 1 through 600 minutes in both Zod and PostgreSQL. Movies use `ACTIVE`/`INACTIVE` rather than deletion. Inactive Movies remain visible to historical Screenings but cannot be newly scheduled.

### Screening and temporal state

Screening uses an opaque primary key with restrictive Movie and Hall foreign keys. PostgreSQL stores `startsAt` and `endsAt` as `TIMESTAMPTZ(3)`, requires `endsAt > startsAt`, and indexes `[hallId, status, startsAt]` plus `[movieId, startsAt]`. Only administrative `SCHEDULED` or `CANCELLED` state is persisted. `UPCOMING`, `LIVE`, and `ENDED` are computed from an injected/current clock: start is inclusive and end is exclusive. Cancellation overrides time and preserves history.

### Location timezone strategy

The selected Location timezone is authoritative. Forms submit local date-time strings, the server loads the trusted Location, and `@js-temporal/polyfill` interprets them using its IANA timezone with DST disambiguation set to `reject`. Nonexistent and ambiguous local times return a friendly validation failure instead of silently shifting. PostgreSQL stores the resulting instant; display converts it back through the Location timezone. Duration suggestions add elapsed minutes to the instant and correctly cross midnight or DST.

### Overlap and concurrency protection

The application performs a friendly overlap query using strict interval comparisons, but PostgreSQL is the final concurrency authority. The Phase 9 migration enables `btree_gist` and adds a partial GiST exclusion constraint combining equal `hallId` with overlapping `tstzrange(startsAt, endsAt, '[)')` values for `SCHEDULED` rows. Concurrent overlapping requests cannot both commit. Exact adjacency, different Halls/Locations, and cancelled rows remain valid. The named constraint is mapped to a safe `409` response.

### Authorization and editing

`CINEMA_ADMIN` manages Movies and Screenings across its active organization. `LOCATION_MANAGER` views the shared Movie catalog and creates/edits/cancels Screenings only for `allLocations` or explicit LocationAccess rows; it cannot mutate global Movie metadata. Kitchen and delivery roles have no schedule administration access. Creation verifies the trusted organization, active Movie, active Hall, active Location, Hall-to-Location relationship, location permission, time order, and overlap. Upcoming Screenings may be fully edited; live core fields and ended history are read-only. Scheduled upcoming/live Screenings may be cancelled, while ended records remain historical.

### Active Hall and Seat resolution

`getActiveScreeningForHall(hallId, now)` returns only a scheduled row satisfying `startsAt <= now < endsAt`; the exclusion constraint guarantees at most one. `resolveActiveScreeningForSeat(hallId, seatId, now)` uses CineBite’s compound Seat identity and returns safe Organization, Location, Hall, Seat, Screening, and Movie context. With no live Screening it returns explicit `NO_ACTIVE_SCREENING`; it never guesses a future or previous showing. These functions are internal preparation for Phase 10 and are not public QR APIs.

### UI, media, audit, and persistence

The admin routes are `/admin/movies`, `/admin/movies/new`, `/admin/movies/[movieId]`, `/admin/screenings`, `/admin/screenings/new`, and `/admin/screenings/[screeningId]`. Server Components fetch trusted data; small Client Components handle forms, Motion, and notifications. Schedules use responsive lists rather than a desktop-only calendar, include textual state labels, and honor reduced motion.

Posters reuse Phase 7 raster validation, Sharp normalization, Firebase Admin upload, stable download URL, server-generated `organizations/{organizationId}/movies/{movieId}/{uuid}.webp` paths, replacement cleanup, and compensation. PostgreSQL remains authoritative for Movie/Screening data; Firestore receives no Phase 9 writes. AuditLog records Movie create/update/enable/disable/poster and Screening create/update/cancel events without secrets.

Apply the reviewed migration with `npm run prisma:migrate:deploy`; never reset or use production `db push`. See [the Phase 9 manual test guide](docs/phase-9-screenings-manual-test.md) and [LinkedIn capture guide](linkedin/phase-9/README.md).

For the repository's safe `cinebite-demo-cinemas` organization, `npm run dev` runs the idempotent `seed:phase9-demo` task before Next.js. It refreshes only Phase 9 demo Movies, Locations, Halls, Seats, Screenings, and safe audit metadata so the current schedule is visible immediately. Use `npm run dev:app` to start Next.js without refreshing demo data. The seed skips safely unless the organization slug is exactly `cinebite-demo-cinemas`.

## Phase 7 menu architecture

The browser sends no trusted organization ID or storage path. A verified Firebase session resolves to the current PostgreSQL membership, the organization must be active, and every query uses that trusted organization scope. `CINEMA_ADMIN` can manage categories, products, all organization location offers, and media. `LOCATION_MANAGER` can view the shared catalog but can update only price, currency, and availability for `allLocations` or explicit PostgreSQL `LocationAccess` rows. Kitchen and delivery roles have no menu-administration access.

Money enters APIs as a validated decimal string, is normalized to two decimal places without JavaScript floating-point arithmetic, and is passed to Prisma/PostgreSQL Decimal. The application and migration enforce `0.00` through `999999.99`. Currency is trimmed, uppercased, and validated as exactly three ASCII letters, allowing USD, LBP, EUR, and other ISO-style codes without hard-coding one currency.

Category and product writes use Zod plus database unique constraints. Friendly conflicts replace raw Prisma errors. Product creation commits Product, ProductLocation assignments, and audit events in one transaction. Product listings are bounded to 24 rows by default and support search/category/status/location filters.

`getMenuForLocation` is a reusable server query for a later customer experience. It requires trusted tenant/location context and returns only active categories and active products assigned to that active location, optionally excluding unavailable offers. It returns exact price strings and currencies. Phase 7 deliberately exposes no public menu or ordering route.

## Product image flow

Images follow: authenticated browser → CineBite API → PostgreSQL authorization → content validation/Sharp normalization → Firebase Admin Storage. JPEG, PNG, and WebP content up to 5 MB is accepted; SVG, HTML, unknown binary data, and oversized files are rejected. Sharp detects decoded format, auto-orients, constrains dimensions to 1200×1200 without upscaling, strips unnecessary metadata by default, and emits quality-82 WebP.

The server creates `organizations/{organizationId}/products/{productId}/{uuid}.webp`; original filenames and browser paths are never trusted. PostgreSQL stores the path and a stable Firebase download-token URL, not a short-lived signed URL. The object token is not an Admin credential. Next Image accepts only the configured Firebase bucket route.

Replacement uploads the new object first, commits new metadata plus an audit event, and then removes the prior managed object. If the database change fails, the new unused upload is deleted as compensation. Removal clears PostgreSQL and records the event before best-effort cleanup. Cleanup validates the exact tenant/product prefix.

Audit events cover category create/update/enable/disable, product create/update/enable/disable, image update/removal, location assignment, price changes, and availability changes. Metadata contains safe IDs and state—not image bytes, download tokens, credentials, cookies, or database URLs.

The Phase 7 migration is `20260924140000_phase_7_menu_management`. It creates the three models, enums, composite keys, indexes, foreign keys, and checks for price, currency, and non-negative ordering. Apply reviewed migrations with `npm run prisma:migrate:deploy`; do not use `prisma db push` for production.

## Phase 7 manual test

1. Deploy the Phase 7 Prisma migration and set `FIREBASE_STORAGE_BUCKET`.
2. Sign in as `CINEMA_ADMIN` and open `/admin/menu/categories`.
3. Create `Popcorn` and `Drinks`; verify duplicate slugs show a friendly conflict.
4. Open `/admin/menu/products/new` and create `Large Popcorn` with a JPEG/PNG/WebP image.
5. Assign Achrafieh at `5.00 USD` and Dbayeh at `5.50 USD`, both available.
6. Confirm the list/detail image, exact prices, category, SKU/status, and assigned count.
7. Set Dbayeh unavailable and confirm the organization product remains `ACTIVE`.
8. Edit the description/order and replace, then remove, the image.
9. Sign in as `LOCATION_MANAGER`; verify product identity/media/category controls are read-only.
10. Change price/availability for an authorized location.
11. Attempt the API operation for an unauthorized location and verify `403`.
12. Verify category/product/location/media audit events contain no secrets.

## Phase 7 test safety and limitations

Unit tests mock current-user, repository, and Firebase Storage behavior; normal tests never connect to production Neon or upload to the production bucket. Image tests process in-memory buffers only. Assignment removal is intentionally absent; setting unavailable preserves history. There is no stock quantity, ordering, payment, analytics, or public customer menu.

Phase 8 implements inventory as a separate location/product concern without overloading catalog status or manual availability. Phase 9 adds time context through Movies and Screenings without starting customer ordering. A future Phase 10 may use the active Seat/Screening resolver for signed QR entry, anonymous customer sessions, and a location/screening-bound menu; none of that behavior is part of Phase 9.

## Constraints and indexes

PostgreSQL enforces unique Firebase UID, normalized email, organization slug, user/organization membership, organization/location slug, location/hall number, hall/seat ID, hall/seat label, and membership/location grant. Foreign keys enforce the relational hierarchy. Indexes support current lookup patterns without speculative indexing: memberships by user/organization, locations by organization, halls and seats by parent, and audit history by parent plus creation time.

## Repository and service cutover

The existing UI-facing domain types and service boundaries remain stable. Domain mappers convert Prisma `Date` values back into the existing timestamp interface, so pages do not depend on persistence details.

Normal repositories now use Prisma for:

- organization creation, status, list, detail, and dashboard counts;
- organization-scoped location reads and creation;
- user profile, memberships, and location-access loading;
- hall reads, creation, and status changes;
- seat reads, generation, and status changes;
- all new audit events.

Mutations scope queries by their parent organization/location/hall. Browser data cannot select an organization. Services derive identity and tenant scope from the verified server session, validate request fields with Zod, re-check current organization status, and fail closed for unauthorized access.

Organization onboarding still creates the Firebase Auth identity first, sets claims, and generates the one-time setup link. Organization, first location, PostgreSQL user, membership, and audit rows are then committed atomically in one Prisma transaction. If any later step fails, the newly created Firebase user is safely deleted as compensation. A pre-existing account is never deleted.

Seat generation uses a serializable transaction. It validates the active organization/location/hall hierarchy, checks existing labels, inserts all seats, and writes the audit event atomically. A concurrent unique-constraint collision rolls back and returns a duplicate-seat conflict.

## Authentication and authorization

Firebase verifies credentials and sessions; PostgreSQL is authoritative for application authorization:

1. verify the Firebase session cookie with revocation checking;
2. load `User` by `firebaseUid`;
3. require the user to be active;
4. resolve `SUPER_ADMIN` or the claimed tenant membership;
5. compare compact Firebase claims with the current server-loaded profile;
6. load the organization and require `ACTIVE` for tenant roles;
7. apply `allLocations` or explicit `LocationAccess` rows;
8. repeat role/tenant/location checks inside sensitive services.

`SUPER_ADMIN` needs no organization membership and can manage suspended tenants. Tenant users are denied when their organization is suspended/inactive. Location Managers and later staff roles cannot cross their explicit location boundary.

## Database health

`GET /api/health` runs a minimal server-side `SELECT 1`. Success returns only service/database status; failure returns `503` with the same safe fields. Logs include only an error name/code, never URLs, hosts, users, or passwords.

## Firestore migration

Read the full operator runbook at [docs/firestore-to-postgres-migration.md](docs/firestore-to-postgres-migration.md).

The initial schema is managed through the committed Prisma migration:

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:deploy
```

The data command is dry-run by default:

```bash
npm run migrate:firestore-postgres
```

It reads Firestore, performs strict schema/reference/uniqueness validation, maps profiles into users/memberships/location access, reports counts, and performs zero PostgreSQL writes.

After reviewing the report, deliberate application requires the exact flag:

```bash
npm run migrate:firestore-postgres -- --apply
```

The apply order follows foreign keys: organizations, locations, halls, seats, users, memberships, location access, then audit logs. The destination must be empty or already match the exact migrated IDs and counts. New writes use one serializable transaction; conflicts stop safely without silent overwrites. Post-write counts must match the validated source plan.

Legacy organization, location, hall, and hall-scoped seat IDs are explicitly inserted. User primary keys use the Firebase UID during migration, while new users may use generated IDs. Historical audit foreign keys that no longer reference an existing migrated entity become null while their original entity identifiers and safe metadata remain.

No migration path deletes or changes Firestore data.

## Remaining Firestore usage

Normal application business reads/writes no longer use Firestore. Remaining references are intentional:

- Firebase Admin exposes Firestore for the migration reader;
- `src/server/migration/firestore-source.ts` reads legacy collections only;
- old Firestore path/mapper helpers and rules/index definitions are retained as explicit legacy documentation/support while backup data remains;
- Firebase Authentication and Firebase Storage are independent Firebase products and remain enabled.

## Initial Super Admin

After deploying the PostgreSQL schema, ensure the identity already exists in Firebase Authentication, then run:

```bash
npm run bootstrap:super-admin -- user@example.com
```

The script accepts an email, never a password. It rejects disabled identities, upserts the PostgreSQL user as `SUPER_ADMIN`, and updates compact Firebase claims. Sign out and sign in again afterward to receive refreshed claims.

## Development and quality checks

```bash
npm install
npm run prisma:validate
npm run prisma:generate
npm test
npm run lint
npm run build
npm run dev
```

Tests mock persistence and never modify a configured Neon database or Firestore project. They cover database invariants, authorization and suspension behavior, tenant/location isolation, onboarding orchestration and Firebase cleanup, repository writes/audits, seat generation/status changes, migration mapping, dry-run no-write behavior, validation, and conflict reporting.

## Phase 11: customer cart and secure order creation

Phase 11 extends the verified Phase 10 `CustomerSession` into a PostgreSQL-backed ordering flow. Each session owns at most one reusable `Cart`; `CartItem` enforces one row per Product and a quantity from 1 through 20. A zero quantity is a remove intent and never persists as an invalid row. Browser state is only a UX cache: every cart read and mutation resolves the HttpOnly guest cookie, revalidates the live Screening and operational Seat/Hall/Location/Organization, and derives the tenant and location on the server.

Cart additions do not reserve inventory. This avoids abandoned carts locking concession stock. The server verifies Product, Category, ProductLocation, manual availability, location price, and Phase 8 effective availability when an item is added, then repeats every check at checkout. Cart responses reload the current `ProductLocation` price and calculate line totals/subtotal with exact integer cents. The stored reviewed-price fields are server-written review markers—not client prices—and let checkout return `PRICE_CHANGED`, refresh those markers, and require a deliberate second submission rather than silently charging a changed amount. Mixed-currency carts are rejected; CineBite performs no foreign-exchange conversion.

Checkout accepts only an idempotency key and optional note. Seat, Screening, Location, Organization, price, currency, subtotal, and total are derived from trusted relations. A unique `(customerSessionId, idempotencyKey)` constraint makes retries return the original Order. Phase 14 supersedes Phase 11's immediate stock consumption: a serializable transaction now creates `PLACED` order snapshots, Payment/Attempt and aggregate reservations, increases `quantityReserved` with a conditional available-stock update, audits and clears the cart. Only verified payment success consumes on-hand stock and creates `ORDER_CONSUMPTION`. Products without a recipe remain `NOT_TRACKED` with no invented movement. Failed transactions roll back their database effects; provider operations are deliberately outside database transactions.

`PLACED` means only that CineBite accepted the order; it does not claim payment or fulfillment. At Phase 11, payments, preparation, delivery and refunds were separate future domains; Phases 12–15 now implement those domains without changing the immutable order snapshots. Customer order confirmation still requires the same owning CustomerSession. Phase 15 adds scoped supervisor financial actions to the original read-only admin views.

Phase 11 evidence and its screenshot guide are in [`linkedin/phase-11`](linkedin/phase-11/README.md). The reproducible capture script uses safe demo data, performs real checkout assertions, and captures the production build without browser chrome, developer indicators, credentials, QR codes, or session tokens.

## Phase 12: kitchen operations

Phase 12 extends the existing order rather than rebuilding checkout:

`PLACED → ACCEPTED → PREPARING → READY`

READY means preparation complete, not paid or delivered. `/kitchen` provides a dark, responsive queue, oldest-first cards, authorized location selection, status/date/hall/code filters, and read-only tickets with an operational timeline. The customer confirmation page now refreshes progress automatically. `/admin/orders` adds scoped history filters and pagination.

Staff Firebase sessions authenticate identity; active PostgreSQL users, memberships, and location grants authorize every read/action. Kitchen Staff and Location Managers operate only their granted locations, while Cinema Admins operate their own organization. Delivery Staff and anonymous customers cannot transition orders. Customer status reads still require the valid owning Phase 10 session; a public order code is never authorization.

Each transition uses one Serializable PostgreSQL transaction: reload current staff grants, conditionally update the expected order state, append one `OrderStatusEvent`, and append one safe `AuditLog`. A racing or repeated request receives a friendly conflict, not duplicate history. Event timestamps come from the database. A unique `(orderId, toStatus)` constraint and an append-only database trigger protect the timeline. New checkout creates its initial CUSTOMER PLACED event in the existing atomic transaction; the migration backfills one SYSTEM PLACED event for each older order using its historical UTC creation time.

Kitchen actions never change stock, consumption movements, items, quantities, prices, or seating. For new online-required orders, Phase 14 consumes inventory at verified payment success, before kitchen eligibility. Legacy orders retain their historical Phase 11 stock consumption. Cleared orders remain independently processable after customer-session expiry or screening end/cancellation; a screening warning is displayed, with no automatic refund, cancellation, or restock. Customer viewing remains subject to its original session eligibility.

Kitchen and customer clients poll protected, uncached APIs approximately every five seconds plus request latency. Polling pauses in hidden tabs, cancels superseded requests, rejects stale responses, and cleans up on unmount. This works with Next.js/Vercel without adding WebSocket infrastructure or exposing Neon to browsers. Queue pages contain at most 25 orders **per status**; admin history contains 30 orders per page. Location dates and timeline times use the existing Phase 9 timezone utilities. Motion is restrained and respects reduced-motion preferences; dialogs use native focus/keyboard behavior.

Deploy the migration before running the new code:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
npm run prisma:validate
npm test
npm run lint
npm run build
```

The explicit manual evidence scenario requires configured Neon/Firebase demo access, a production build, and installed Chrome:

```bash
npx tsx --conditions=react-server --env-file=.env.local scripts/verify-phase-12.ts --demo
```

It creates only isolated `phase12-evidence-*` business fixtures, uses example.com test staff identities, and disables those identities afterward. It is **not** part of automated unit tests or CI. It writes actual integration outcomes to `docs/phase-12-integration-results.json` and captures application-only images in [`linkedin/phase-12`](linkedin/phase-12/README.md). Demo orders/events remain available as evidence; repeated runs create new demonstration orders and consume only their isolated demo stock.

See the [Phase 12 architecture guide](docs/phase-12-architecture.md) for preparation behavior. Phase 13 adds delivery; Phase 14 adds the payment gate below. Refunds, customer order cancellation and restocking remain separate.

## Phase 13: delivery operations

The complete fulfillment lifecycle is `PLACED → ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`. Kitchen APIs accept only the original three preparation transitions. `/delivery` replaces the placeholder with Ready to claim, My deliveries and Recently delivered; supervisors see Active deliveries instead of personal assignments. The admin navigation and six-state order filters expose delivery oversight without a competing authentication or state system.

Delivery Staff can claim unassigned READY orders only within authorized locations, and complete only their own OUT_FOR_DELIVERY orders. Managers are limited to granted locations; Cinema Admins oversee their own organization. Supervisors are **read only for delivery**: no implicit emergency override, stealing or reassignment exists. Kitchen Staff, anonymous customers and public order codes cannot authorize delivery mutations. Each action reloads the current active PostgreSQL user, membership, organization and grants inside its transaction.

Claiming uses a Serializable transaction and a conditional update matching the order, tenant, location, READY state and null assignee. The database-clock status event, assignment to the PostgreSQL User foreign key, claimed timestamp and safe audit commit together. The unique `(orderId, toStatus)` index also prevents duplicate claims; any losing transaction rolls back its entire event/update/audit. Completion matches OUT_FOR_DELIVERY and the assigned worker, retains ownership and records `deliveredAt`. DELIVERED is terminal, not an assertion of payment. Strict request schemas reject browser timestamps, actor IDs, prices, quantities and destination edits.

The additive `20261005210000_phase_13_delivery_operations` migration adds statuses, assignment/timestamps, an assignment consistency check, indexes and User relation. Existing event uniqueness, foreign keys and append-only trigger remain intact. `readyAt` is an indexed cache of the authoritative READY event: old events are backfilled without changing history, and future kitchen READY transitions copy the database event timestamp in the same transaction. This correctly prioritizes preparation completion time instead of checkout age. Indexes support `(locationId,status,readyAt)`, `(deliveryAssignedUserId,status,deliveryClaimedAt)` and `(locationId,status,deliveredAt)` queries.

Delivery cards show immutable location/Hall/Seat/movie/item snapshots and escaped plain-text notes. Phones prioritize the worker's active destination; compact completed cards expand into full snapshot/timeline tickets. Filters fold away to keep the destination near the top. Every section is paginated at 20 orders, with oldest-ready/oldest-claimed/newest-delivered ordering. Hall/code filters apply to all sections; delivered-date and supervisor worker filters support history, with location-timezone date boundaries. Date filters never hide active work. Worker queues/history do not expose other workers' assignments. Supervisor staff options are scoped and capped at 100; forged IDs cannot bypass tenant/location restrictions.

Queue/detail/customer clients reuse the five-second uncached polling hook, hidden-tab pause, abort cleanup and stale-response protection. Stale claim attempts receive a friendly conflict and refresh. Assignment is stored in PostgreSQL, not browser memory, so signing in again restores My deliveries. Customer progress adds “Your order is on the way to your seat.” and “Delivered.” while hiding private staff identity; the valid owning CustomerSession is still required. Large controls, visible focus, native keyboard dialogs, action feedback at bottom right, and restrained reduced-motion-aware Motion support phones and supervisors.

Delivery never changes inventory, consumption movements, order items, prices or totals. Staff can complete existing orders after original session expiry or screening end/cancellation; warnings require checking the destination, not silently cancelling/restocking. Customer reads retain the original session-eligibility policy. No Firestore delivery business writes exist.

### Deployment and verification

After review/merge, deploy the migration **before** starting this code against the configured Neon database:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
npm run prisma:validate
npm test
npm run lint
npm run build
```

Production migration is an operator deployment step, not an integration-test side effect. Phase 13 verification uses an isolated loopback PostgreSQL database and Firebase Auth emulator; it never reads production credentials or changes production Neon/Firebase. Local PostgreSQL uses Prisma's TCP adapter; hosted Neon keeps its existing serverless adapter. Start a separate PostgreSQL instance at `127.0.0.1:55413`, owned by `cinebite_test`, with the database `cinebite_phase13_test`, then run (PowerShell; `npm.cmd` avoids restricted script policies):

```powershell
$env:DIRECT_URL='postgresql://cinebite_test@127.0.0.1:55413/cinebite_phase13_test'
npx.cmd prisma migrate deploy
# In another terminal; no Firebase login or production project is needed:
npx.cmd --yes firebase-tools@15.32.1 emulators:start --only auth --project demo-cinebite-phase13 --config scripts/phase-13-emulators.json
# With a production build and installed Chrome:
node --conditions=react-server --import tsx scripts/verify-phase-13.ts --local
# Clear this terminal-only test override before any later deployment:
Remove-Item Env:DIRECT_URL
```

The integration runner hardcodes only these local test endpoints, generates an ephemeral signing key in memory, creates example.com users only in the Auth emulator, runs actual Next.js HTTP/browser actions and verifies database effects. It is separate from offline `npm test`. Detailed outcomes are in [Phase 13 verification](docs/phase-13-verification.md) and [case results](docs/phase-13-integration-results.json); the [50-part architecture guide](docs/phase-13-architecture.md) explains each design choice. The [eight LinkedIn screenshots](linkedin/phase-13/README.md) contain real application UI with local demo data, without browser chrome, tokens or credentials.

For every future phase, execute the full automated suite and supported isolated manual/integration cases, report each manual case as PASS, FAIL or NOT EXECUTABLE, and investigate/fix/rerun failures before declaring completion. Writing tests alone is not completion. Never run test mutations against production Neon/Firebase resources or merge a phase branch on the user's behalf.

## Vercel preparation

Set `DATABASE_URL`, `DIRECT_URL`, existing Firebase Admin secrets, and client Firebase configuration in the appropriate Vercel environment settings. Do not put database URLs in `vercel.json`. Run `npm run prisma:migrate:deploy` through a controlled deployment workflow before starting application code that requires the new schema. This repository does not deploy or migrate production automatically.

## Known limitations

- Migration is designed for an empty PostgreSQL destination or an exact prior migration match; it deliberately does not merge arbitrary partial datasets.
- Organization, location, and hall legacy IDs are preserved only when globally unique. Phase 4-5 generated opaque IDs satisfy that assumption; an older nested collection containing repeated location/hall IDs is rejected for manual resolution instead of being silently rewritten and breaking URLs.
- Email normalization is lowercase application policy backed by a unique column; direct out-of-band SQL must follow the same normalization rule.
- Invitation delivery remains manual; the setup link is shown once to the authenticated Super Admin.
- There is no staff-management UI beyond initial Cinema Admin onboarding.
- Firestore remains legacy backup data until a separately reviewed retention decision.
- Phases 14–15 add sandbox payment settlement and refunds. Live payment/refund adapters, discounts, promotions, routing and ticketing remain deferred. Delivery semantics still cover physical fulfillment through DELIVERED, not payment mutation. Delivery reassignment/emergency overrides and a staff-management UI remain deliberately absent.
- Phase 7 catalog data has no inventory quantity; inventory and stock movements belong to Phase 8.

## Phase 14: secure payments (sandbox only)

Payment status is independent from the six kitchen/delivery Order statuses. A new checkout creates an online-required Order, a PaymentAttempt and short-lived aggregate inventory reservations. No stock is consumed at payment initiation. Only a verified callback or server-to-server retrieval can settle payment, consume reservations exactly once and make the Order actionable in kitchen. Existing Orders are explicitly `LEGACY_NOT_REQUIRED`, with no fabricated provider payment.

With physical stock 10 and reservations 2, customers can promise only 8. Success changes these to physical 8/reserved 0 with one consumption movement. Failure/cancellation/expiry restores physical 10/reserved 0 without consumption. A late success after expiry or screening closure records financial truth for manual review, never oversells or starts preparation, and does not automatically refund.

### Operator setup after review/merge

The default is **disabled**. No Stripe/other live merchant adapter or real-money credentials are configured. Do not enter card details. Configure the following privately in `.env.local` or deployment secrets for the explicit test-only adapter:

```env
PAYMENT_PROVIDER=sandbox
PAYMENT_SANDBOX_ENABLED=true
PAYMENT_PROVIDER_WEBHOOK_SECRET=<random-server-only-value-at-least-32-characters>
PAYMENT_RESERVATION_MINUTES=12
PAYMENT_EXPIRY_JOB_SECRET=<different-random-server-only-value-at-least-32-characters>
```

These are not `NEXT_PUBLIC_` settings. Copy placeholders only; generate your own private secrets. No card information is submitted to CineBite and no real charges can be made. A real provider must be selected deliberately, implemented behind `PaymentProvider` using its official signature SDK and hosted/tokenized card controls, and verified in its official test environment before live-money enablement. Unsupported provider names fail closed.

Apply reviewed migrations against the intended database, without resetting it, then restart the server:

```powershell
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run prisma:migrate:deploy
```

Production migrations were **not** applied during development. Confirm the selected `DIRECT_URL` privately before deploying. Never use `prisma db push` or a reset to bypass this migration.

Configure a deployment scheduler to POST `/api/payments/expire` every minute with `Authorization: Bearer <PAYMENT_EXPIRY_JOB_SECRET>`. It processes up to 100 due/closed-screening attempts; drain additional batches if the returned count reaches 100. Checkout, retry and payment status reads also perform opportunistic sweeps, but these do not replace scheduling when the site is idle. Payment holds last at most 12 minutes by default and cannot exceed screening/session end. Provider cancellation is outside the SQL transaction, and any late financial success remains reviewable.

Customer checkout is `/customer/payments/[publicCode]`; public code alone never grants access. The dark mobile UI polls trusted status, supports failed/expired same-order retry while still eligible, and never treats a browser return as proof of payment. Admin/manager summaries are scoped by current organization/location grants. Kitchen/delivery receive no added provider payload and cannot mutate payment. Raw webhook bodies are bounded, signature-checked before JSON parsing, and idempotently journaled. See the [65-point architecture walkthrough](docs/phase-14-architecture.md) for design choices, state/race policies, currency precision, database constraints and limits.

### Executed verification and isolated reproduction

See [verification](docs/phase-14-verification.md), [individual A–AT outcomes](docs/phase-14-integration-results.json), and the [eight native application screenshots](linkedin/phase-14/README.md). Real merchant/test-card facilities are **NOT EXECUTABLE** without a selected provider/test configuration; sandbox verification is not a claim of live financial readiness or PCI certification. Refunds, chargebacks, discounts, saved cards, wallets, taxes and reconciliation/review-resolution tools remain out of scope.

The runner deliberately hardcodes only loopback test PostgreSQL/Firebase endpoints and creates example.com demo staff; it never loads `.env.local`. Offline tests use mocked dependencies. To reproduce integration, install PostgreSQL 17 locally, add its `bin` directory to PATH, and use a separate terminal for the emulator:

```powershell
# New local test cluster only. Never point these at a production data directory.
initdb -D .phase14-test/pgdata -U cinebite_test -A trust --no-locale -E UTF8
pg_ctl -D .phase14-test/pgdata -l .phase14-test/postgres.log -o '-h 127.0.0.1 -p 55414' start
createdb -h 127.0.0.1 -p 55414 -U cinebite_test cinebite_phase14_test
$env:DIRECT_URL='postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase14_test'
npx.cmd prisma migrate deploy

# Separate terminal; demo project ONLY, no Firebase login required.
npx.cmd --yes firebase-tools@15.32.1 emulators:start --only auth --project demo-cinebite-phase14 --config scripts/phase-14-emulators.json

# Runner terminal; do not add --env-file=.env.local.
npm.cmd run build
npx.cmd tsx --conditions=react-server scripts/verify-phase-14.ts --local
```

The runner uses port 3114 for its own optimized application server and installed Chrome (or `CHROME_PATH`), generates signing secrets only in memory, and captures real pages without OS/browser chrome. Test cluster/debug data stay ignored. It closes its server/browser and disables demo identities after each run; PostgreSQL and the emulator should be stopped after testing. No production Neon/Firebase/provider writes are performed.

## Phase 15: cancellations, refunds and exceptions

See the [67-point architecture walkthrough](docs/phase-15-architecture.md), [executed verification](docs/phase-15-verification.md), [individual integration results](docs/phase-15-integration-results.json), and [nine native LinkedIn screenshots](linkedin/phase-15/README.md).

### Cancellation and inventory policy

Customers with their own valid trusted seat session may cancel only `PLACED` orders, before Kitchen acceptance. The server returns `TOO_LATE_TO_CANCEL` after acceptance, regardless of browser button visibility. Cinema administrators act only within their organization; location managers need current location grants. Kitchen and delivery staff can report issues but cannot cancel financially or refund. Later staff cancellation requires a reason, explicit exceptional mode and confirmation. `CANCELED` is terminal and cannot appear in actionable queues; `DELIVERED` cannot be rewound to canceled.

| Situation | Order outcome | Financial outcome | Inventory outcome |
| --- | --- | --- | --- |
| Unpaid PENDING/PROCESSING, placed | CANCELED | Durable provider cancellation requested; no refund unless charge actually succeeds | Hold remains until verified final provider result, then release once |
| FAILED/provider-CANCELED, placed | CANCELED | No refund | Release any remaining hold once |
| Paid, placed before acceptance | CANCELED | Refund remaining available captured funds | Restore original ORDER_CONSUMPTION once |
| Accepted/preparing/ready/active delivery | Exceptional staff CANCELED | Refund remaining captured funds | NO_AUTO_RESTOCK |
| Delivered refund | Remains DELIVERED | Full remaining or authorized partial refund | Unchanged |
| Standalone partial/full financial refund | Fulfillment unchanged | Separate Refund records | Unchanged |

An immutable `OrderCancellation` records origin state, CUSTOMER/STAFF/SYSTEM identity, structured reason, safe note, inventory disposition and server timestamp. Cancellation also appends `OrderStatusEvent` and audit records. Original consumption—not the current recipe—is restored using `ORDER_CANCELLATION_RESTOCK`. For example, changing a recipe from 300g/2 cups to 900g/3 cups after purchase still restores only 300g/2 cups. Refund success never runs inventory-restock logic again.

### Refund domain, provider and concurrency

`Refund` records the captured Payment and original Order, Decimal amount/currency, provider binding, status, initiating actor, reason, stable idempotency key and timestamps. Retries create a new record linked through `retryOfId`; failure history is retained. Payment remains historically SUCCEEDED after a refund. The safe balance is:

```text
remaining refundable = captured payment - SUCCEEDED refunds - PENDING/PROCESSING refunds
```

For 12.50 USD, a successful 2.50 refund leaves 10.00; another 5.00 leaves 5.00. Full refund means that remaining balance, not another 12.50. Unknown provider/network outcomes stay PENDING and keep their exposure reserved. Only confirmed terminal failure/cancellation frees it. Decimal and the Phase 14 exact minor-unit conversion are authoritative; browser provider IDs/currency/maximum balances are not accepted.

Serializable transactions lock Order then Payment. Cancellation and Kitchen/Delivery use conditional transitions, so concurrent operations cannot both win. Refund creation locks the captured payment and the database trigger additionally checks matching payment/order/currency and total committed exposure. Two 8.00 refunds against 10.00 cannot both proceed. Unique database/provider keys prevent duplicate double-click effects.

The existing `PaymentProvider` gains `createRefund`/`retrieveRefund`. SQL intent is committed first; provider work occurs outside the transaction; binding/retrieval recovers a create/bind crash using the same refund ID. The existing raw-body signed webhook endpoint handles refund events, verifies provider-refund/payment relationships, exact money and currency, journals events idempotently, and only then updates Refund. Frontend return URLs are never authority. The current implementation is still sandbox only; real merchant/provider testing is NOT EXECUTABLE without a configured adapter and test credentials.

### Operational exceptions and screening reconciliation

`OrderIssue` is OPEN/RESOLVED, with reporter, type, escaped note, resolution, resolver and trusted timestamps. Assigned delivery staff may report CUSTOMER_UNAVAILABLE etc. Kitchen may report ITEM_MISSING, ORDER_DAMAGED or OTHER. Reporting does not cancel/refund/restock; a supervisor resolves the issue with an explicit recorded decision and uses separate financial actions if needed. No silent status rewind or destructive order deletion occurs.

Canceled screenings now have an explicit admin reconciliation preview. The UI submits only the reviewed batch IDs, at most 100; every affected order is reauthorized/reclassified under transaction locks. Unpaid placed orders cancel safely; paid placed orders cancel/refund/restore; started orders receive a deduplicated supervisor issue; delivered orders stay unchanged. Repeat reviewed batches safely, without duplicate effects or hidden unreviewed mass financial operations. Screening cancellation itself remains a separate step; reconciliation is never an implicit bulk refund button.

### Deployment and recovery

After user review/merge, apply the four additive Phase 15 migrations to the intended database using your normal controlled migration process. This development task did not migrate or write production Neon/Firebase. Previous migrations were not rewritten; there is no reset/db-push shortcut.

Reuse the server-only Phase 14 sandbox opt-in/configuration. No new merchant secrets or public financial secrets are required. Keep `PAYMENT_PROVIDER=disabled` until a reviewed deployment is ready; never claim the sandbox is a live provider. The existing authenticated `POST /api/payments/expire` job now also drains pending refund work in bounded batches. Configure a reliable scheduler with the existing private job bearer secret. Immediate cancellation/refund requests attempt their own recovery, but a scheduled worker is still necessary after crashes or outages. Refund rows rotate by last update to avoid backlog starvation. During an unresolved provider cancellation, stock stays protected rather than silently released; a supervisor should investigate prolonged holds.

Customer/mobile and admin panels show paid, processing, returned and remaining amounts from safe server DTOs. Confirmation dialogs are keyboard/focus-safe, use 44–48px controls, announce updates and honor reduced motion. Error/success notifications use the existing bottom-right notification system. Provider IDs, secrets, raw webhook bodies and card data are excluded.

### Isolated reproduction

Start a separate loopback PostgreSQL test cluster on port 55414, owned by `cinebite_test`, and create a **new** `cinebite_phase15_test` database without resetting any existing database. The tests refuse cloud resources by hardcoding the separate local database/demo project. Use:

```powershell
$env:DIRECT_URL='postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase15_test'
npx.cmd prisma migrate deploy

# Separate terminal; demo project only, no production Firebase login needed.
npx.cmd --yes firebase-tools@15.32.1 emulators:start --only auth --project demo-cinebite-phase15 --config scripts/phase-14-emulators.json

# Runner terminal; never add --env-file=.env.local.
npm.cmd run build
npx.cmd tsx --conditions=react-server scripts/verify-phase-15.ts --local
```

The runner starts its own production-mode Next.js server at loopback port 3115, uses installed Chrome/`CHROME_PATH`, generates signing keys only in memory, executes actual PostgreSQL/HTTP/browser workflows, captures application-only PNGs, closes its server/browser and disables demo staff afterward. Local database/emulator services should also be stopped after verification. Fixture business history is retained; test/browser/debug artifacts are ignored. No production Neon, Firebase or merchant transactions are involved.
