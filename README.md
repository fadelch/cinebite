# CineBite

CineBite is a multi-tenant cinema food-service application. Phase 6 replaces Firestore as the authoritative business-data store with Neon PostgreSQL and Prisma while retaining Firebase Authentication.

## Current phase

**Phase 6 - Neon PostgreSQL + Prisma**

This phase establishes the relational foundation for users, organizations, memberships, locations, location access, halls, seats, and audit logs. It includes a safe Firestore-to-PostgreSQL migration and cuts all normal Phase 1-5 business repositories over to Prisma.

Phase 6 does not implement movies, screenings, QR ordering, menus, products, inventory, customer ordering, orders, payments, kitchen/delivery workflow, or analytics.

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

DATABASE_URL=
DIRECT_URL=
```

`DATABASE_URL` is the Neon pooled connection used by the running application through `PrismaNeon`. Pooling is appropriate for concurrent and serverless runtime traffic.

`DIRECT_URL` is the Neon direct connection loaded by `prisma.config.ts` for controlled Prisma CLI and migration operations. It is not prefixed with `NEXT_PUBLIC_` and must not enter browser bundles.

## Prisma layout

```text
prisma/
  schema.prisma
  migrations/
    migration_lock.toml
    20260922160000_initial_postgresql_cutover/
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

User UIDs must resolve to Firebase Authentication identities. Because Firebase remains the identity provider, migration uses the Auth identity's normalized email and disabled state and warns when a legacy Firestore profile is stale. A legacy identity with no Auth email is preserved as an inactive archival user with a deterministic non-routable `example.invalid` address. Firestore is never modified.

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
