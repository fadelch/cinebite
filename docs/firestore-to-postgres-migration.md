# Firestore to Neon PostgreSQL migration runbook

This is a one-way application cutover, not a destructive cleanup. Firebase Authentication remains active, and the original Firestore documents remain untouched as legacy backup data.

## Safety rules

- Store `DATABASE_URL`, `DIRECT_URL`, and Firebase Admin credentials only in `.env.local` locally or encrypted deployment settings.
- Never paste credentials into source files, Git, tickets, logs, or chat.
- Use a Neon pooled URL for `DATABASE_URL` and a Neon direct URL for `DIRECT_URL`.
- Back up the Neon branch before production changes.
- Do not run a reset, `prisma db push`, or any Firestore deletion command.
- The migration only accepts no argument (dry run) or the exact `--apply` flag.
- Automated tests use mocks and do not connect to Neon or mutate Firestore.

## 1. Prepare the environment

Create local secret values without committing them:

```env
DATABASE_URL=<Neon pooled runtime URL>
DIRECT_URL=<Neon direct CLI URL>
```

Keep all existing Firebase client and Admin variables. Confirm `.env.local` is ignored:

```bash
git check-ignore .env.local
```

## 2. Validate and generate Prisma Client

```bash
npm install
npm run prisma:validate
npm run prisma:generate
```

`prisma.config.ts` loads the direct URL for CLI schema operations. The application client in `src/lib/db/prisma.ts` separately uses the pooled runtime URL.

## 3. Apply the committed relational schema

Review `prisma/migrations/20260922160000_initial_postgresql_cutover/migration.sql`, then apply it to the intended empty Neon database:

```bash
npm run prisma:migrate:deploy
```

This uses committed Prisma Migrate history. Do not substitute `prisma db push`.

## 4. Run the mandatory dry run

```bash
npm run migrate:firestore-postgres
```

The default mode reads Firestore, validates every document and reference, builds the relational plan, and reports source counts. It performs zero PostgreSQL writes. Fix every validation error before continuing.

Firebase Authentication remains the identity authority. During extraction, every Firestore user UID must exist in Firebase Auth. The migration uses the Auth identity's normalized email and disabled state, and reports a warning when legacy Firestore profile values differ. A legacy Firebase identity with no email is preserved as inactive using a deterministic non-routable `example.invalid` address so historical relations and counts remain intact. The migration never edits the Firestore profile.

Validate especially:

- organization, location, hall, and seat hierarchy;
- unique organization slugs and organization-scoped location slugs;
- unique hall numbers and hall-scoped seat IDs/labels;
- globally unique legacy organization/location/hall IDs (hall-scoped seat IDs may repeat);
- normalized unique user emails and Firebase UIDs;
- tenant memberships and location access staying inside one organization;
- Super Admin profiles having no tenant membership.

## 5. Apply deliberately

Only after reviewing the dry-run report:

```bash
npm run migrate:firestore-postgres -- --apply
```

The tool validates again, requires the destination to be empty or an exact prior migration match, and inserts records in this order:

1. organizations;
2. locations;
3. halls;
4. seats;
5. users;
6. organization memberships;
7. location access rows;
8. audit logs.

New writes run in one serializable PostgreSQL transaction. A unique or foreign-key conflict rolls back the transaction. A nonempty destination that is not an exact ID/count match is rejected without writes. An exact prior match is reported as already applied and is not duplicated.

## 6. Verify the report

Every applied entity row must show `MATCH` between Firestore and PostgreSQL. The command fails if post-write counts differ. The report covers:

- organizations;
- locations;
- halls;
- seats;
- users;
- memberships;
- location access;
- audit logs.

Do not declare cutover complete if any count or relationship differs. Investigate in a separate Neon branch rather than changing production data manually.

## 7. Run application checks

```bash
npm test
npm run lint
npm run build
npm run dev
```

Then verify `/api/health` returns only safe service/database status and never connection details.

## 8. Verify identities and roles

For the initial platform administrator, run this only after schema deployment and migration:

```bash
npm run bootstrap:super-admin -- user@example.com
```

The command looks up an existing Firebase Auth identity, upserts its PostgreSQL platform role, and updates compact Firebase custom claims. It never receives a password. Sign out and sign in again afterward.

Manual role checks:

1. Sign in as `SUPER_ADMIN`; verify `/super-admin`, organization lists, status changes, and onboarding.
2. Sign in as `CINEMA_ADMIN`; verify `/admin` shows only its organization and all of its locations.
3. Sign in as `LOCATION_MANAGER`; verify only explicitly allowed locations appear and another tenant/location ID is denied.
4. Suspend a test organization; verify tenant staff are denied while Super Admin can inspect/reactivate it.

## 9. Verify structure operations

Using a test tenant:

1. create a location with a unique slug inside its organization;
2. create a hall with a unique number inside that location;
3. generate a small seat range and refresh to confirm persistence;
4. attempt the same range and confirm the entire duplicate operation is rejected;
5. disable and re-enable one seat;
6. verify corresponding PostgreSQL audit rows contain safe metadata only.

## 10. Deploy to Vercel

Configure these server-only variables in every relevant Vercel environment:

- `DATABASE_URL`: Neon pooled runtime connection;
- `DIRECT_URL`: Neon direct connection available to the controlled migration workflow;
- existing Firebase Admin variables;
- existing `NEXT_PUBLIC_FIREBASE_*` client configuration.

Run `npm run prisma:migrate:deploy` as an explicit controlled deployment step before starting application traffic that expects the schema. Do not place URLs in `vercel.json`. Do not expose either database variable with a `NEXT_PUBLIC_` prefix.

## 11. Firestore after cutover

Normal business repositories no longer use Firestore. The remaining Firestore access is intentionally limited to:

- `src/lib/firebase/admin.ts`, which exposes the Admin Firestore handle needed by migration tooling;
- `src/server/migration/firestore-source.ts`, which performs legacy read-only extraction;
- `src/server/firestore/mappers.ts` and `src/server/firestore/paths.ts`, retained as explicit legacy reference helpers during the temporary backup period;
- Firestore rules/index files, retained because the legacy database is not deleted.

Do not delete Firestore data after verification. Keep it read-only for normal business workflows until a separately reviewed retention decision is made.
