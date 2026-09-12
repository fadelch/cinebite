# CineBite

CineBite will allow cinema customers to order food and have it delivered directly to their seats.

## Current phase

**Phase 3 — Authentication & Authorization**

Phase 3 adds secure staff email/password authentication, server session cookies, role-based authorization, organization and location access checks, password reset, logout, and protected placeholder pages. It does not add public signup or any cinema operations.

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

Protected pages are authorization proofs only, not dashboards.

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

Phase 3 adds no environment variables. Keep the private key quoted when it contains escaped `\n` characters.

Also consider enabling Firebase Authentication email enumeration protection. No Firebase Console settings are modified automatically by this repository.

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

Tests cover pure validation and authorization without connecting to Firebase or creating production users/data.

## Current limitations

- There is no public signup or staff management UI.
- Only the initial `SUPER_ADMIN` has a bootstrap script; later staff provisioning belongs to an authorized administration phase.
- Protected pages are placeholders.
- There are no customer accounts or cinema operations.
- Normal unit tests do not use live Firebase credentials.
- Logging out clears the current browser cookie; account-wide revocation is reserved for explicit security/admin operations.
