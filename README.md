# CineBite

CineBite is a multi-tenant cinema food-service application. Neon PostgreSQL and Prisma are the authoritative business-data layer, Firebase Authentication provides identity, and Firebase Storage holds normalized product images.

## Current phase

**Phase 8 - Inventory Management**

This phase adds a tenant-safe inventory catalog, per-location stock and thresholds, atomic stock receipts/adjustments/waste, immutable movement history, product recipes, and reusable projected/effective availability logic on top of the Phase 7 menu system.

Phase 8 does not implement ordering, automatic stock deduction, reservations, transfers, suppliers, payments, movies, screenings, QR ordering, kitchen/delivery workflow, or revenue analytics.

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

Phase 8 now implements inventory as a separate location/product concern without overloading catalog status or manual availability. Its automated tests use mocked persistence and never connect to production Neon. A future Phase 9 may build customer ordering and transaction-safe order consumption/reservation on the centralized stock boundary; that behavior is intentionally not part of this phase.

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

## Vercel preparation

Set `DATABASE_URL`, `DIRECT_URL`, existing Firebase Admin secrets, and client Firebase configuration in the appropriate Vercel environment settings. Do not put database URLs in `vercel.json`. Run `npm run prisma:migrate:deploy` through a controlled deployment workflow before starting application code that requires the new schema. This repository does not deploy or migrate production automatically.

## Known limitations

- Migration is designed for an empty PostgreSQL destination or an exact prior migration match; it deliberately does not merge arbitrary partial datasets.
- Organization, location, and hall legacy IDs are preserved only when globally unique. Phase 4-5 generated opaque IDs satisfy that assumption; an older nested collection containing repeated location/hall IDs is rejected for manual resolution instead of being silently rewritten and breaking URLs.
- Email normalization is lowercase application policy backed by a unique column; direct out-of-band SQL must follow the same normalization rule.
- Invitation delivery remains manual; the setup link is shown once to the authenticated Super Admin.
- There is no staff-management UI beyond initial Cinema Admin onboarding.
- Firestore remains legacy backup data until a separately reviewed retention decision.
- Advanced cinema layouts and all menu/order/payment/operations features are deferred to later phases.
- Phase 7 catalog data has no inventory quantity; inventory and stock movements belong to Phase 8.
