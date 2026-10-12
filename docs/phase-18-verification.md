# Phase 18 verification

Executed against isolated local resources on 2026-10-12T12:57:57.604Z. No production Neon/Firebase/Storage data or real email delivery was used. Phase 17 was merged before this branch: main baseline `fa2dfa3`.

## Outcome

- 490 automated tests passed across 61 files.
- ESLint, TypeScript `--noEmit`, Prisma validation/client generation and the production Next build passed.
- All 18 repository migrations deployed successfully to the isolated PostgreSQL database; repeat deployment found no pending migration and schema comparison found no drift.
- Requested integration cases A–AL: **38 PASS, 0 FAIL, 0 NOT EXECUTABLE**.
- Two additional concurrency/lifecycle groups passed: **40 executed groups passed in total**.
- Real invitation email delivery: **NOT EXECUTABLE**, because no approved application email provider is configured. This is separate from the 38 required cases. Actual Firebase setup-link generation, password setup and password-backed sign-in ran successfully on the official Auth emulator.
- Eight high-density native full-page screenshots are in [the gallery](../linkedin/phase-18/README.md). They contain synthetic demo data only. Desktop originals are 2880 pixels wide; mobile originals are 780 pixels wide, using browser device-pixel ratio 2 rather than image upscaling.

## Actual integration evidence

These results are assertions executed against the running production Next server, real local PostgreSQL and official Firebase Auth/Storage emulators, with browser rendering where relevant—not a list of planned tests. [Machine-readable results](phase-18-integration-results.json) retain the exact latest-run timestamp and evidence.

| Case | Result | Executed evidence |
| --- | --- | --- |
| A | PASS | Cinema Admin saves separate customer display name and public demo support contact in PostgreSQL; customer application verified in F/AH. |
| B | PASS | Organization is derived from actor; forged foreign organizationId is rejected and foreign settings remain unchanged. |
| C | PASS | Location Manager cannot mutate organization-wide profile or branding. |
| D | PASS | Valid PNG decoded/normalized to WebP and saved in actual local Storage emulator under a server-generated branding path; PG reference and public logo route verified. |
| E | PASS | Fake content, unsupported MIME, SVG and oversized logo rejected before publishing or replacing branding. |
| F | PASS | Real seat QR resolution and session-start flow show configured public name/logo on scan and customer menu with safe CineBite identity. |
| G | PASS | Removing logo commits null reference then removes previous object; fallback header/menu/cart stay functional. |
| H | PASS | HTML/script/CSS/unsafe URL mutation rejected; direct legacy malicious text also renders escaped in real customer browser without execution. |
| I | PASS | Invited kitchen user: actual Auth identity/reset link/password setup/password login, PG User/membership/location grants and READY onboarding after verified sign-in; real kitchen acceptance succeeds. |
| J | PASS | Delivery invitation/password setup grants only selected Beirut operational queue; Dbayeh request denied. |
| K | PASS | Invited manager's fresh password-backed session can read Beirut but not Dbayeh. |
| L | PASS | Second Cinema Admin invitation explicitly grants tenant-wide access, no redundant location rows, and becomes eligible admin only after successful sign-in. |
| M | PASS | Manually forged SUPER_ADMIN invitation and role-change requests are rejected server-side. |
| N | PASS | Duplicate invitation creates no duplicate Firebase identity, PG User, membership or location access. |
| O | PASS | Existing unclaimed Firebase identity is safely rejected, not blindly duplicated or automatically linked. |
| P | PASS | Identity already belonging to another organization cannot be reassigned/attached through tenant invitations. |
| Q | PASS | Kitchen-to-manager role change atomically updates PG, increments security version, synchronizes claims/revokes refresh tokens; old session fails, fresh password session uses new permissions. |
| R | PASS | Location grants added/removed take effect on the very next protected requests with the same unchanged-role session, using fresh PG grants. |
| S | PASS | Foreign-organization location ID rejected; existing member/grants unchanged. |
| T | PASS | Location Manager cannot promote self or mutate staff roles/access. |
| U | PASS | Active kitchen staff suspended without deleting User, membership or historical order actor event. |
| V | PASS | Already-open kitchen identity is denied on next read/write immediately, without waiting for token expiration; order state unchanged. |
| W | PASS | Reactivation restores only configured kitchen/Beirut grants; old pre-suspension cookie remains invalid, fresh password login succeeds. |
| X | PASS | Single active Cinema Admin cannot be suspended or demoted; self-role policy also conservative. |
| Y | PASS | Actual concurrent mutual-admin suspension requests serialize under organization lock; exactly one succeeds and at least one active ready admin remains. |
| Z | PASS | No staff hard-delete route or UI action; DELETE is 405. |
| AA | PASS | Role audit records actor/target and safe previous/new role values. |
| AB | PASS | Actual add/remove location changes have scoped audit records, not duplicated identity data. |
| AC | PASS | Suspension records verified actor/target/status; all tenant audit metadata inspected for raw setup URLs/passwords/tokens—none present. |
| AD | PASS | Staff list/detail strictly tenant scoped; foreign member hidden and arbitrary organization selection rejected. |
| AE | PASS | Actual role/status/location/name-search filters return only correctly scoped matching staff. |
| AF | PASS | Real sufficient Auth/PG fixtures produce complete stable two-page staff list with no duplicates/missing rows. |
| AG | PASS | Invalid/fixed-zone policy rejected; confirmed IANA timezone edit changes current customer timeline display while historical UTC screening instants remain unchanged. |
| AH | PASS | Native 390x844 customer menu/cart/order progress retain readable configured logo/name and no horizontal page overflow. |
| AI | PASS | 390px admin settings and staff screens tested for usable responsive controls/full content/no page overflow; full loaded mobile settings captured. |
| AJ | PASS | New staff/settings business records persisted in actual PostgreSQL only; implementation contains no Firestore writes. |
| AK | PASS | Source diff and actual audit metadata scanned against ephemeral private key/job/webhook/session/setup/password secrets; none embedded. Native visual review and staged local-secret scan follow. |
| AL | PASS | Eight real full-page native browser PNGs captured with fictional reserved-domain demo contacts, no desktop/browser chrome or setup-link UI. |
| EXTRA_CONCURRENCY_SECURITY | PASS | Executed real concurrent settings CAS/one conflict, staff CAS/one conflict, logo replacement/one conflict with one live object and old/losing cleanup; manager/foreign location denial, CSRF, email-edit denial, private setup restart and target-only Phase 17 staff-change notifications. |
| EXTRA_LIFECYCLE_RACES | PASS | Actual role-vs-suspension race preserves one revision winner; membership/location uniqueness and cross-tenant FK rejection verified; held identity lease leaves stale Firebase claims denied until explicit repair; Firebase-disabled identity cannot be silently reactivated. |
| REAL_INVITATION_EMAIL | NOT EXECUTABLE | No approved application email provider configured; actual Firebase setup/reset/password sign-in executed on emulator, but no production invitation email sent or claimed. |

The runner scans actual audit metadata and its changed source against ephemeral secrets. Final native image review passed. The staged-artifact scan passed for 68 files: no private environment/test/browser artifacts, private key material, live database URLs or matching local server secrets were staged. The staged whitespace check also passed. Expected 400/401/403/404/405/409 responses in negative tests are successful policy checks, not unresolved application failures.

## Isolation and reproduction

The runner refuses to proceed without `--local`, overwrites database/provider configuration before initializing the clients, and never needs `--env-file=.env.local`. It creates randomized demo fixtures, ephemeral credentials and test-only server secrets; passwords, keys and setup URLs must not be printed or committed.

Prerequisites:

1. A dedicated PostgreSQL 17 instance on loopback port 55414 with a local test role `cinebite_test` and **test-only** database `cinebite_phase18_test`. In this run the isolated cluster's timezone was UTC.
2. Official Firebase CLI and Java 21, with only the Auth and Storage emulators for project `demo-cinebite-phase18`. Auth: 9144; Storage: 9198; hub: 4444; logging: 4544. The committed emulator Storage rules deny direct client access; the test uses Admin SDK operations.
3. A Chrome/Chromium installation usable by Playwright. The runner uses Windows Chrome's standard installation path, or the executable you explicitly supply through `CHROME_PATH`; it does not add a runtime application browser dependency.
4. Installed repository dependencies and an available Next production build. Build and browser integration must run sequentially so they do not compete for `.next`.

Example PowerShell workflow, **after** provisioning that isolated database:

```powershell
npm.cmd ci
$env:DATABASE_URL = "postgresql://cinebite_test@127.0.0.1:55414/cinebite_phase18_test"
$env:DIRECT_URL = $env:DATABASE_URL
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run prisma:migrate:deploy
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run build
```

Start the emulators in a separate terminal:

```powershell
firebase.cmd emulators:start --only auth,storage --project demo-cinebite-phase18 --config scripts/phase-18-emulators.json
```

Then run the actual integration/browser suite:

```powershell
npx.cmd tsx --conditions=react-server scripts/verify-phase-18.ts --local
```

The runner starts Next on loopback port 3118, exercises real API/session/customer workflows, captures native pages, writes the safe evidence JSON, and stops its own browser/server in `finally`. Test identities are disabled at teardown; historical test data stays in the disposable test database. Do not repurpose the runner for a production connection or provide it production credential files.

This execution used a checksum-verified portable Java runtime under the ignored `.phase18-test` directory; no global Java installation or persistent system PATH change was made. A final fresh-schema check deployed the final migration bytes to a second disposable local database, `cinebite_phase18_migration_check`, then confirmed no pending migration and no schema drift. Firebase [Storage emulator configuration](https://firebase.google.com/docs/emulator-suite/connect_storage) is separate from live Storage. Firebase [email action links](https://firebase.google.com/docs/auth/admin/email-action-links) generate setup/reset URLs; delivering a company invitation is a separate application responsibility.

## Security and lifecycle observations

- PG current activity, platform role, primary organization, membership role, authorization version and active location ownership are enforced server-side. Posted organization/role/email fields are not trusted.
- Invitations reject all existing Firebase/PG identities. There is no automatic cross-organization linking, custom password storage or public signup.
- Role/suspension/reactivation increments the authorization version. Old sessions remain invalid after reactivation, even if the role returns to its previous value. Unchanged-role location grants are reread from PG on the next request.
- Organization row locking serializes sensitive staff mutations; revision comparison prevents stale edits. The ready-active-admin count excludes invited accounts. A role-vs-suspension race and concurrent mutual-admin suspension were executed.
- Identity synchronization uses a ten-minute persisted lease and compare-and-set completion. A held lease left old claims denied until explicit authorized repair. A Firebase-disabled identity could not be silently reactivated.
- Firebase and Storage calls remain outside PG business transactions. Failure leaves fail-closed pending identity state or compensates only newly created assets/identities. Shared legacy memberships and platform SUPER_ADMIN accounts are not tenant-mutable.
- Logo replacement validates actual bytes and format, normalizes to WebP, strips metadata and uses generated scoped paths. Concurrent replacement had one winning reference/object; old and losing uploads were cleaned up.
- Staff notification events reuse Phase 17's durable outbox and are addressed only to the affected user. Notification processing is not an authorization authority or invitation email transport.
- Audit events contain safe actor/target/status/role/location changes, never passwords, setup URLs, credential claims or provider errors.
- Public company support fields are intentional public data. All screenshot contacts use reserved `example.test` addresses and a synthetic placeholder phone. Private setup dialogs and browser/desktop chrome are excluded.

## Deployment and limits

Only the feature branch is pushed; the user reviews and merges it. **Apply the additive Phase 18 migration before starting the updated application**, because the authentication profile now reads the new User authorization/setup fields. Use the deployment's normal approved migration workflow and its existing server-only Firebase Auth/Storage credentials. This development run did not migrate production or change production identities.

Use the authorized private setup-link dialog for secure manual handoff. Do not claim an invitation email was sent. A future approved provider requires its own implementation and isolated delivery checks. Review pending identity synchronization and use the explicit admin retry action; no new automatic identity reconciliation scheduler was added. Do not override a Firebase-level disabled account from the tenant UI.

Keep Phase 17 notification processing configured. Branding is deliberately allowlisted, not arbitrary CSS/HTML, and cached layouts may need a refresh. Shared/multi-organization staff management, email editing, payroll, shifts, promotional messaging and Phase 19 are not implemented. Production-scale performance, live email and live provider deployment were not tested.

An initial harness assertion expected 200 for a customer-session creation route that correctly returns 201; the assertion was corrected and the full suite reran successfully. A nested Prisma input typing issue was corrected before the final build and real invitation tests. Restricted font-network fetching was resolved by running the build with approved network access; no application font behavior was changed. No unresolved implementation failure remains in the executed suites.

See the [62-topic architecture explanation](phase-18-architecture.md) for structure, rationale, alternatives, constraints and examples.
