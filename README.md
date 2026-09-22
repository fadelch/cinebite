# CineBite

CineBite will allow cinema customers to order food and have it delivered directly to their seats.

## Current phase

**Phase 5 — Cinema Admin Structure Management**

Phase 5 replaces the Cinema Admin placeholder with a tenant-isolated dashboard for locations, halls, and seats. `CINEMA_ADMIN` users manage their organization's complete cinema structure. `LOCATION_MANAGER` users see and manage only permitted locations. Phase 4 Super Admin behavior remains intact.

Phase 5 intentionally excludes QR codes, screenings, menus, products, customers, ordering, kitchen and delivery workflows, inventory, payments, revenue, and analytics.

## Phase 5 Cinema Admin routes

- `/admin`: real organization overview with accessible location, hall, and maintained seat counts.
- `/admin/locations`: server-scoped location directory.
- `/admin/locations/new`: `CINEMA_ADMIN`-only location creation.
- `/admin/locations/{locationId}`: authorized location details and hall creation.
- `/admin/locations/{locationId}/halls/{hallId}`: hall status, seat generator, seat grid, and seat status management.

The shared `/admin` layout permits only `CINEMA_ADMIN` and `LOCATION_MANAGER`. Every read and mutation repeats authentication, tenant-status, role, and location authorization in the server service layer.

## Phase 5 tenant data flow

```text
verified session + users/{uid} profile
  -> trusted role and organizationId
  -> reload ACTIVE organization
  -> apply CINEMA_ADMIN or LOCATION_MANAGER location policy
  -> validate browser data with Zod
  -> parent-scoped repository operation
  -> Firebase Admin / Firestore
  -> mutation audit event
```

Normal tenant requests never accept `organizationId` from the browser. A create-location body contains location fields only; the service derives the parent organization from the verified session. Strict Zod objects reject extra fields such as a client-supplied foreign organization ID.

### Cinema Admin and Location Manager permissions

- `CINEMA_ADMIN` sees every location in its own organization and may create locations, halls, and seats.
- `LOCATION_MANAGER` receives either explicit `locationIds` or `allLocations` from the trusted user profile. It may create halls and manage seats only inside those locations.
- `LOCATION_MANAGER` cannot create organization-level locations in Phase 5.
- `KITCHEN_STAFF`, `DELIVERY_STAFF`, inactive users, missing tenants, and suspended/inactive organizations are denied.
- An unauthorized location ID is rejected before its document is read, preventing metadata leakage.

### Firestore hierarchy and parent-scoped repositories

```text
organizations/{organizationId}
  locations/{locationId}
    halls/{hallId}
      seats/{normalizedSeatLabel}
```

Repository reads require every parent ID, for example `getLocationHall(organizationId, locationId, hallId)` and `listHallSeats(organizationId, locationId, hallId)`. Location Managers are fetched by their assigned document paths; the browser never receives all CineBite locations for client-side filtering.

### Location and hall creation

Location slugs remain unique only inside one organization through `organizations/{organizationId}/locationSlugs/{slug}`. The location document, slug reservation, and audit event are created in one transaction. Different organizations may safely use the same slug.

Hall IDs remain opaque Firestore IDs. Hall numbers are checked within the parent location. `seatCount` starts at zero on the server and is never accepted as authoritative browser input. Halls and locations use status changes instead of normal hard deletion so future historical references remain valid.

### Seat generation and uniqueness

The generator accepts a starting row, row count, seats per row, and starting number. Preview is local and performs no Firestore write. After explicit confirmation, the server validates the numbers again and creates canonical labels such as `A1`, `A2`, and `B1`; client-generated labels are never accepted.

Seat document IDs are deterministic lowercase labels (`A12` becomes document `a12`) inside the hall's seat collection. This makes a label unique within one hall while allowing `A1` in other halls. Firestore batch `create` operations never overwrite an existing seat and make concurrent duplicate attempts fail.

Generation limits are centralized in `src/validation/seat.ts`:

- maximum rows: 26
- maximum seats per row: 30
- maximum seats per request: 300

One generation uses at most 302 writes: 300 seat creates, one hall count update, and one audit create. This remains below Firestore's 500-write batch limit, so Phase 5 deliberately uses one atomic batch instead of chunking and risking a partially created layout.

Seats use `ACTIVE` and `DISABLED`. Disabling preserves the seat document and label; reactivation updates that same identity. The seat grid shows both text and visual state and supports horizontal scrolling for larger halls.

### Phase 5 audit events

Phase 5 extends the existing trusted audit log with:

- `LOCATION_CREATED`
- `HALL_CREATED`
- `HALL_STATUS_CHANGED`
- `SEATS_GENERATED`
- `SEAT_DISABLED`
- `SEAT_ENABLED`

Events record the verified actor UID, organization, entity and safe parent identifiers using a server timestamp. Tokens, cookies, passwords, credentials, and request secrets are never audit metadata.

### Phase 5 interface and Motion

Cinema Admin reuses the Phase 4 dark design tokens, panels, controls, status badges, loading skeletons, errors, and empty states. Motion for React provides restrained page, card, dialog, preview, navigation, and success transitions. Reduced-motion preferences disable nonessential movement. No additional package or environment variable was required for Phase 5.

## Phase 4 Super Admin routes

- `/super-admin`: live organization totals, status counts, recent organizations, and onboarding entry point.
- `/super-admin/organizations`: searchable and status-filterable tenant directory.
- `/super-admin/organizations/new`: four-step organization, location, administrator, and review wizard.
- `/super-admin/organizations/{organizationId}`: organization status, locations, safe administrator profile information, location creation, and status actions.

Every page verifies `SUPER_ADMIN` on the server. The matching API routes repeat authorization and never rely on navigation visibility.

## Organization onboarding architecture

The onboarding wizard collects all information in browser memory and performs one authoritative server workflow only after review:

```text
validated request + verified SUPER_ADMIN session
  → confirm administrator email is unused
  → allocate server-side organization/location/audit IDs
  → create Firebase Authentication user without a password
  → assign CINEMA_ADMIN + organizationId custom claims
  → generate a sensitive Firebase password setup link
  → run one Firestore transaction
       organization
       first location
       CINEMA_ADMIN users/{uid} profile
       organization slug ownership
       location slug ownership
       audit events
  → return the setup link once to the authenticated SUPER_ADMIN
```

The browser never controls IDs, roles, custom claims, actor identity, timestamps, or administrator tenant membership. Zod validates the full request server-side even though the wizard also validates each step for usability.

### Password setup and invitation

CineBite never asks a Super Admin to choose another user's permanent password. Firebase Admin creates the account and generates a password-reset/setup link. Until an email provider is integrated, the link is displayed once in the authenticated onboarding success state so the Super Admin can copy and deliver it securely.

The setup link is deliberately excluded from Firestore writes, audit metadata, and server logs. It disappears when the success page is left or refreshed.

### Slug uniqueness

Organization slug ownership is reserved at `organizationSlugs/{slug}` in the same transaction that creates the organization. Location ownership is reserved at `organizations/{organizationId}/locationSlugs/{slug}` with its location. These registry documents turn slug creation into an atomic create-or-conflict decision and prevent the race in a query-then-create design.

### Transaction and cleanup strategy

Firebase Authentication and Firestore cannot share one transaction. CineBite therefore creates only a new Auth user, assigns claims, and generates the setup link before the Firestore transaction. If claims, link generation, or the Firestore transaction fail, the newly created Auth account is deleted as compensating cleanup. A pre-existing account is rejected before creation and is never reassigned or deleted.

The Firestore transaction atomically creates all tenant records and audit events, so an organization tree is not intentionally left half-created.

## Organization status and tenant access

Organizations reuse the Phase 2 statuses: `ACTIVE`, `SUSPENDED`, and `INACTIVE`. No hard delete is available.

- `ACTIVE`: eligible tenant staff may authenticate and use their assigned routes.
- `SUSPENDED` or `INACTIVE`: tenant sessions fail closed, even if the user profile and custom claims are otherwise valid.
- `SUPER_ADMIN`: remains able to inspect and reactivate a suspended organization.

Both ID-token session creation and later session-cookie verification reload organization state. A status change therefore takes effect without trusting stale client state.

## Audit logging

Security-relevant operations write to `auditLogs/{auditLogId}` from trusted server code. Current actions are:

- `ORGANIZATION_CREATED`
- `CINEMA_ADMIN_CREATED`
- `LOCATION_CREATED`
- `ORGANIZATION_SUSPENDED`
- `ORGANIZATION_REACTIVATED`

Audit entries contain the verified actor UID, action, entity type and ID, relevant organization ID, safe metadata, and a server timestamp. Passwords, setup links, ID tokens, session cookies, and credentials are forbidden from audit data.

## Phase 4 interface and Motion

The Super Admin UI uses a responsive dark dashboard shell with a desktop sidebar and mobile navigation. Reusable panels, fields, buttons, status badges, loading skeletons, empty states, error recovery, dialogs, and focus styles share design tokens from `globals.css`.

Motion for React provides restrained page, statistic-card, wizard-step, active-navigation, dialog, and success transitions. Client components call Motion's reduced-motion hook so operating-system `prefers-reduced-motion` settings remove nonessential movement.

## Authentication architecture

Authentication proves who a person is. Authorization decides what that authenticated person may access. Firebase Authentication verifies staff credentials, but CineBite does not treat a client login as authorization.

```text
Email + password
  → Firebase Authentication
  → short-lived Firebase ID token
  → POST /api/auth/session
  → Firebase Admin verifies token and revocation
  → server loads and validates users/{uid}
  → claims must match the current profile
  → 12-hour HttpOnly cinebite_session cookie
  → server verifies session and profile on protected requests
```

The password is sent only to Firebase Authentication. CineBite never stores it in Firestore, sends it to a custom server endpoint, hashes it, or logs it.

## UserProfile authorization model

Each staff profile lives at `users/{uid}`. The UID is derived from the document path and is not duplicated inside the document.

```text
email
displayName
role
organizationId
locationIds
allLocations
active
createdAt
updatedAt
```

Security invariants are validated with Zod:

- `SUPER_ADMIN`: no organization and no location restrictions.
- `CINEMA_ADMIN`: an organization is required and `allLocations` must be true.
- `LOCATION_MANAGER`: an organization is required; it may have all-location access or an explicit nonempty location list.
- `KITCHEN_STAFF` and `DELIVERY_STAFF`: an organization and at least one explicit location are required. Organization-wide access is intentionally disallowed.
- Duplicate location IDs and inconsistent combinations are rejected.
- `active: false` always fails authorization.

## Custom claims

Firebase custom claims contain only compact authorization metadata:

```json
{
  "role": "CINEMA_ADMIN",
  "organizationId": "organization-document-id"
}
```

Location arrays, display names, and other profile data remain in Firestore. Claims have size limits and can become stale, so every protected request also loads the current profile. Session creation and protected requests require the claim role and organization to match that profile.

Only Firebase Admin code may set claims. Clients never submit their role or organization.

## RBAC and tenant isolation

Central role landing paths are:

| Role | Landing path |
| --- | --- |
| `SUPER_ADMIN` | `/super-admin` |
| `CINEMA_ADMIN` | `/admin` |
| `LOCATION_MANAGER` | `/admin` |
| `KITCHEN_STAFF` | `/kitchen` |
| `DELIVERY_STAFF` | `/delivery` |

Tenant users may access only their own organization. Location access first checks the organization, then permits access when `allLocations` is true or the location appears in `locationIds`. `SUPER_ADMIN` may cross tenants only when a server operation explicitly calls the corresponding authorization helper.

Protected pages perform authorization in server components. Middleware is not the security boundary. Future sensitive APIs must independently call `requireAuth`, `requireRole`, `requireOrganizationAccess`, or `requireLocationAccess`.

## Session and cookie security

The `cinebite_session` cookie is:

- `HttpOnly`, so client JavaScript cannot read it.
- `Secure` in production, so browsers send it only over HTTPS.
- `SameSite=Lax`, providing a strong same-site baseline while preserving normal navigation.
- Scoped to `Path=/`.
- Limited to approximately 12 hours.

Session creation accepts only recently authenticated ID tokens. Protected requests use Firebase Admin session verification with revocation checking and reload `users/{uid}`. Disabled Firebase users, revoked sessions, inactive profiles, invalid profiles, and claims/profile mismatches fail closed.

Authentication state-changing endpoints require the HTTP `Origin` to match the request origin. This complements `SameSite` cookies. Future authenticated mutation APIs must consistently use the same-origin/CSRF strategy.

## Staff pages

- `/login`: email/password login; no registration link or signup flow.
- `/forgot-password`: Firebase password reset with a generic account-enumeration-safe response.
- `/super-admin`: `SUPER_ADMIN` only.
- `/admin`: `CINEMA_ADMIN` or `LOCATION_MANAGER`.
- `/kitchen`: `KITCHEN_STAFF` only.
- `/delivery`: `DELIVERY_STAFF` only.
- `/unauthorized`: safe landing page for a valid session with the wrong role.

The Cinema Admin routes are now a real structure-management dashboard. Kitchen and delivery routes remain authorization placeholders.

## First SUPER_ADMIN bootstrap

The bootstrap is a local server-side operation, never an HTTP endpoint.

1. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**.
2. In **Authentication → Users**, manually add your initial developer account.
3. Add valid Firebase Admin credentials to `.env.local`.
4. Run:

   ```bash
   npm run bootstrap:super-admin -- user@example.com
   ```

The script finds the existing Firebase Auth user, rejects disabled accounts, sets only the `SUPER_ADMIN` role and null organization claims, and creates or updates `users/{uid}` with server timestamps. It never accepts, changes, or prints a password and never prints credentials.

Sign in again after bootstrapping so Firebase issues a token containing the new claims.

## Firebase and environment setup

Client values come from **Firebase Console → Project settings → General → Your apps → Web app**:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Server values come from **Project settings → Service accounts → Generate new private key**:

```env
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

Phases 4 and 5 add no environment variables. Keep the private key quoted when it contains escaped `\n` characters.
Copy only the raw values from the downloaded service-account JSON. An `.env.local`
assignment is not a JSON property, so do not include the JSON key name or trailing
comma. For example:

```env
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-example@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Also consider enabling Firebase Authentication email enumeration protection. No Firebase Console settings are modified automatically by this repository.

### Manual Firebase configuration for Phase 4

1. In **Authentication → Sign-in method**, keep Email/Password enabled.
2. In **Authentication → Settings → Authorized domains**, verify `localhost` is present for local development and add each HTTPS production domain before deployment.
3. In **Authentication → Templates → Password reset**, review the sender name, subject, and action URL. Firebase Admin uses this template/action handler when generating the administrator setup link.
4. If you customize the action URL, ensure its domain is authorized and that it can complete Firebase password actions for this project.
5. Keep service-account credentials only in `.env.local` locally and in encrypted deployment environment variables in production.

No organization, location, or cinema administrator needs to be created manually in Firebase Console after Phase 4. Use the CineBite onboarding wizard.

## Firestore security

Client Firestore access remains denied by `firestore.rules`. Staff traffic follows:

```text
Browser → authenticated Next.js server → Firebase Admin → Firestore
```

The Admin SDK bypasses client Firestore rules, so server authorization checks are mandatory. Rules and indexes are not deployed automatically.

## Development

```bash
npm install
npm test
npm run lint
npm run build
npm run dev
```

Tests cover validation, role and suspension authorization, onboarding orchestration, trusted claim/profile intent, duplicate email and slug handling, tenant-derived location creation, assigned-location scoping, hall authorization, canonical seat labels, generation limits, duplicate-seat protection, mutation audit intent, and Auth cleanup after Firestore failure. Integrations are mocked; automated tests do not connect to Firebase or create production users/data.

## Manual Phase 4 test

1. Start the app with `npm run dev` and sign in as the bootstrapped `SUPER_ADMIN`.
2. Open `/super-admin` and confirm the counts match Firestore.
3. Open **Organizations → Add organization**.
4. Complete all four wizard steps using a unique organization slug and administrator email.
5. Copy the setup link from the success screen; do not paste it into logs or source files.
6. Open the organization detail page and add another unique location.
7. Suspend the organization and confirm its tenant administrator can no longer access tenant routes.
8. Reactivate it and confirm tenant eligibility is restored after a fresh sign-in/session.
9. Confirm Firestore contains the organization, locations, slug registries, user profile, and audit entries, but not the setup link.

## Manual Phase 5 test

1. Start the app with `npm run dev` and sign in as a Phase 4-created `CINEMA_ADMIN`.
2. Open `/admin`; confirm the organization name and structure counts match its Firestore hierarchy.
3. Open **Locations**, add a location with a unique slug, and confirm no organization selector is shown.
4. Open the new location, add a hall, and confirm its seat count starts at zero.
5. Open the hall and preview rows `A` through `J` with 16 seats per row. Confirm preview makes no Firestore changes.
6. Confirm generation, refresh the page, and verify the grid contains `A1` through `J16`.
7. Select a seat such as `A1`; verify it visibly changes to `Off`/`DISABLED` but its document is preserved. Select it again to reactivate it.
8. Try generating an overlapping range and confirm the whole request is rejected without overwriting existing seats.
9. Mark the hall inactive and confirm seat generation/status controls are unavailable; reactivate it afterward.
10. If a `LOCATION_MANAGER` test user exists, sign in and confirm only assigned locations appear. Confirm `/admin/locations/new` and its POST API reject that role.
11. While signed in as a Location Manager, manually navigate to an unassigned location ID and confirm access is denied without revealing its details.
12. Suspend the organization as Super Admin, sign in again as tenant staff, and confirm `/admin` and tenant APIs fail closed. Reactivate it when finished.
13. Inspect `auditLogs` and verify the mutations above have safe events with actor and parent identifiers but no tokens or secrets.

Normal Phase 5 usage does not require manually creating Firestore location, hall, or seat documents. Creating a Location Manager test account remains outside Phase 5 because employee management is not implemented yet.

## Current limitations

- Invitation delivery is manual; a future phase can send the setup link through a transactional email provider.
- Kitchen and delivery routes remain authorization placeholders.
- There is no staff-management UI beyond creating the first `CINEMA_ADMIN` during onboarding.
- There is no UI to change a location's status; Super Admin and trusted future workflows preserve the existing status model.
- Hall layouts are generated as row/number grids; advanced drag-and-drop floorplans and aisles are intentionally deferred.
- There are no seat QR codes, screenings, menus, products, customer accounts, carts, orders, kitchen workflows, delivery workflows, inventory, payments, or operational analytics.
- Organization search is an in-memory filter over the authorized server result; pagination/full-text search can be introduced when tenant volume requires it.
- Logging out clears the current browser cookie; account-wide revocation remains reserved for explicit security/admin operations.
