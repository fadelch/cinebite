# Phase 18 — Organization settings and staff architecture

Phase 18 builds on merged Phase 17 (main baseline fa2dfa3). Only this phase is implemented. Firebase remains the credential/identity provider, PostgreSQL remains current authorization/business truth, and Storage remains the media store.

## Structure and request flow

```text
prisma/schema.prisma + additive Phase 18 migration
src/validation/settings.ts             strict profile/branding/location/staff schemas
src/types/settings.ts                  bounded public/admin DTOs, never reset metadata
src/lib/staff/policy.ts                 last-admin and changed-grant policy
src/server/services/settings-context.ts current actor/tenant/version checks + org lock
src/server/services/organization-settings.service.ts
src/server/services/staff-management.service.ts
src/server/services/staff-identity.service.ts
src/server/media/organization-logo.ts   shared Sharp raster pipeline and safe paths
src/server/http/settings-request.ts    same-origin, bounded JSON/multipart readers
src/app/api/admin/settings/             profile, branding, logo, location endpoints
src/app/api/admin/staff/                list/invite/detail/edit/status/setup/sync
src/app/api/branding/[organizationId]/logo/
src/app/admin/settings/ + staff/        protected pages, loading and existing error boundary
src/components/admin/settings-client.tsx + staff-client.tsx
src/app/customer/layout.tsx             valid-session public branding around customer pages
src/components/customer/customer-brand.tsx
scripts/verify-phase-18.ts              isolated actual integration/native evidence
scripts/phase-18-emulators.json + phase-18-test-storage.rules
docs/phase-18-integration-results.json
linkedin/phase-18/                      eight real high-density full-page PNGs
```

```text
Verified Firebase session
  -> current PostgreSQL profile / authorizationVersion / ACTIVE organization
  -> Cinema Admin and fresh transaction scope
  -> organization row lock + target revision + owned active locations
  -> atomic profile/membership/grants/activity/audit + staff-change outbox commit
       -> safe DTO to admin
       -> separate leased Firebase claims/revocation reconciliation
       -> separate Phase 17 notification processing

Logo: authorize -> bounded MIME/raster decode -> unique Storage upload
  -> PG version check/reference commit -> old cleanup
  -> on failed PG commit: compensate newly uploaded object only

Invitation: authorize/validate -> reject existing identity -> create Auth identity
  -> initial role/version claims + private Firebase setup link
  -> locked PG User/membership/grants/audit commit
  -> authorized ephemeral manual-link dialog (no email delivery claim)
  -> verified Firebase sign-in -> setup READY, never automatic reactivation
```

For example, inviting Demo Maya as kitchen staff for Beirut creates exactly one identity/membership/grant. The password is set through Firebase, not CineBite's database. Promoting Maya to Location Manager changes current PG permissions and increments her security version; old cookies stop working. Adding Dbayeh afterwards, without changing role, is effective on the same session's next request because location grants are reread from PG.

## Requested 62 topics

### 1. What Phase 17 achieved

Phase 17 supplies persisted staff/customer operational notifications, a bell/inbox/preferences, trusted business outbox publication, deduplication, scoped recipients and bounded retry. It does not make alerts authoritative for order/payment/refund/stock/delivery. That design is preserved: Phase 18 adds only target-specific staff role/access events rather than rebuilding its worker or introducing marketing.

### 2. Phase 18 purpose

Cinema administrators need explicit company branding and safe staff lifecycle controls. This phase adds settings, location editing and staff invitation/role/grant/activity management while retaining current authentication and business models. Payroll, shifts, attendance, HR files, loyalty, ticket sales and promotional messaging remain outside the phase.

### 3. Organization settings

The current Organization is extended, not copied into a second settings/auth object. Fields are administrative name, separate optional public name, public support contact, HTTPS website, controlled accent, logo path and settingsVersion. The service derives organization from the verified actor; a submitted foreign organizationId, ownership/status/payment field or extra arbitrary setting is rejected.

### 4. Internal vs customer-facing name

Organization.name keeps its administrative meaning and is explicitly labeled as such. customerFacingName provides the optional public cinema name, with a fallback to the administrative name. Saving either is deliberate; existing immutable order/movie/location/price snapshots are not rewritten merely to make historical records reflect today's branding.

### 5. Branding model

AMBER, TEAL and VIOLET are allowlisted safe accents for the branding component, not unrestricted CSS. Company name/contact and processed logo use controlled React components. Dark page backgrounds, core action/status colors and readable financial messages remain CineBite's accessible design. No custom HTML, JavaScript, style sheet, script URL, remote logo URL or locale subsystem is accepted.

### 6. Logo upload

Authorization occurs before multipart parsing and upload. Actual request bytes are capped at 6 MB; the file itself must be at most 5 MB and declared JPEG/PNG/WebP. The shared Sharp decoder also checks real format and input-pixel limits, auto-orients, bounds dimensions and removes original metadata during WebP normalization. Fake images, oversized input and SVG are rejected.

### 7. Storage path

The server generates organizations/{organizationId}/branding/{uuid}.webp. The ID is validated and the caller cannot choose a directory/object name. Random immutable filenames prevent concurrent uploads from overwriting each other's bytes. The public logo URL is an internal server route; Storage Admin credentials or a Firebase download token are not handed to customers.

### 8. Replacement and compensation

Upload the new normalized object, then lock/check the current PG settings version and commit its reference with a safe audit. If that update fails, delete only the freshly uploaded object and preserve the old reference/object. Delete the old object only after success; a cleanup failure is safely logged for operator review without making the organization point to a missing new file.

### 9. Customer integration

Valid seat-scan confirmation derives public branding from the resolved seat's active organization. A secure customer layout surrounds menu, cart, payment and order progress with the same header/support component. It uses the existing anonymous session validator, not staff identity or an arbitrary requested organization. Cached client layouts may retain old presentation until refresh; every protected API still authorizes current state independently.

### 10. Location settings

A separate location settings route edits existing name/address/city/country/timezone fields. No duplicate location, payment policy, ordering permission or ownership model is introduced. Existing product availability, inventory and payment controls remain in their established modules. Cinema Admin edits own locations; Location Manager can view only currently permitted ones and has no new mutation privilege.

### 11. Timezone policy

Use named IANA zones, with UTC explicitly allowed, not arbitrary offsets. Changing timezone requires an explicit acknowledgement because future schedule/report interpretation and display can change. Persist only the location timezone; do not rewrite old screening/order/status UTC instants. Integration compared exact before/after timestamps and observed the new zone in the customer timeline.

### 12. Staff page

/admin/staff renders bounded cards with name, email, role, permitted locations or organization-wide access, status and detail link. Records come only from the current cinema. Setup and sync status are non-secret metadata. No invented login timestamp or Firebase UID is included in the staff DTO.

### 13. Staff roles

The existing four tenant roles remain unchanged: CINEMA_ADMIN, LOCATION_MANAGER, KITCHEN_STAFF and DELIVERY_STAFF. PLATFORM SUPER_ADMIN stays separate. Cinema Admin is tenant-wide; the other newly managed roles require one or more explicit active location grants. Historical all-location manager permission is not silently expanded to new staff.

### 14. SUPER_ADMIN protection

SUPER_ADMIN is not in the invite/edit enum. Targets are filtered to platformRole=USER, so manually requesting a platform identity cannot modify it through staff APIs. Verified Super Admin also has no tenant staff/settings editor bypass here. Existing platform onboarding/bootstrap remains unchanged; Phase 18 does not create platform-user administration.

### 15. Invitation

Only current Cinema Admin may invite into the actor-derived organization. Inputs are normalized email, bounded plain display name, allowlisted role and owned active location IDs. There is no public signup or password field. Review explains organization-wide admin grants before confirmation; location and duplicate checks are enforced server-side even for forged requests.

### 16. Firebase identity flow

Prepare a new Firebase identity, initial role/organization/version claims and Firebase password setup/reset link outside the business transaction. Then atomically commit PG User, membership, grants and audit after locking/rechecking the actor. If PG commit fails, compensation removes only an exclusively new identity without a retained business User. Existing linked identities and historical users are never cleanup targets.

### 17. Existing identities

An email already present in Firebase is rejected rather than blindly duplicated or automatically linked. This deliberately follows the conservative existing onboarding flow. An own-cinema member should be managed through their existing detail/status/setup actions. Unclaimed Firebase identities require deliberate platform review; claiming ownership of an email in a JSON request is not proof of identity.

### 18. Duplicate invitation

PG email/Firebase UID, user-organization membership and membership-location pairs remain unique. Duplicate invitation returns conflict rather than creating another membership or grant. Firebase's email conflict is mapped safely in races. Integration verified one identity, one User, one membership and one grant after a repeated invitation.

### 19. Cross-organization policy

New Phase 18 invitations preserve one-primary-organization provisioning: they do not attach an existing other-cinema identity. The existing schema can contain legacy multi-membership users; their own-tenant list/detail is readable, but lifecycle mutations are blocked to avoid global active/name/claims changes affecting another cinema. This is a conservative administration boundary, not a silent tenancy-model migration.

### 20. Setup state

User.setupState defaults READY for historical accounts and is INVITED for newly provisioned staff. A successful verified Firebase session exchange completes setup by changing INVITED to READY, conditioned on current activity/security version. UI ACTIVE derives from active+READY; SUSPENDED derives from inactive. This describes CineBite onboarding, not a saved password or fabricated Firebase credential status.

### 21. Password security

Passwords, hashes, reset codes, setup URLs and refresh/session tokens are never stored in PG staff/audit records. Password input exists only in Firebase's supported credential flow. The verification runner uses ephemeral randomly generated passwords and emulator tokens in memory; its sanitized results/source scan avoid publishing them.

### 22. Setup/reset flow

Reuse Firebase Admin's generated password-reset/action link, as the earlier onboarding flow did. The authorized admin gets an ephemeral private handoff dialog, with copy/open actions and clear no-email-delivery messaging. The raw URL is not rendered as text, persisted locally or included in screenshots/audit. Clipboard unavailability fails safely. [Firebase's action-link documentation](https://firebase.google.com/docs/auth/admin/email-action-links) distinguishes generation from an application's chosen delivery.

### 23. Location access

All submitted location IDs must belong to the current organization and be ACTIVE. Non-admin roles require at least one unique location; duplicates and foreign IDs are rejected. Composite foreign keys also bind grants to the membership and location's same organization. The administrator cannot assign global platform access or choose another organization in the browser.

### 24. Role changes

Role edits require current Cinema Admin, owned manageable target, current membership revision, valid grants and explicit confirmation when role changes. The transaction changes role/profile/grants and audits coherently, increments a security version and flags provider reconciliation. Old role cookies become invalid; fresh sign-in after sync uses the new authoritative role.

### 25. Normalization

Promoting to Cinema Admin sets allLocations=true and removes redundant individual grants. Moving to a restricted role sets false and requires explicit valid locations. Current display-name edits preserve immutable user identity. No historical actor reference, payment/refund attribution or inventory movement is rewritten because permissions changed.

### 26. Escalation protection

All staff mutations use fresh PG actor scope rather than a browser role assertion. Manager/Kitchen/Delivery cannot invite, promote self, assign locations, suspend/reactivate or regenerate staff setup. Platform role, Firebase UID, arbitrary target organization, active state and email are not accepted in the profile/role editor schema. Protected APIs—not hidden buttons—enforce this.

### 27. Self-role policy

Self-demotion and self-suspension are disallowed even if another admin exists. Harmless current display-name editing is allowed. The last-admin guard may reject first with its explanatory minimum-admin message. This avoids a UI action accidentally removing the administrator's own ability to repair access.

### 28. Suspension

Suspension requires explicit confirmation and current revision. Under the org lock, update PG active=false, increment authorizationVersion, retain role/grants/history, audit and flag sync. Subsequent protected requests fail current-user checks immediately. There is no routine hard deletion or automatic inventory/refund/order transition.

### 29. Open-session suspension

An already-open staff browser was tested: the next protected read and kitchen mutation were denied without waiting for cookie expiry, and order state stayed unchanged. A cached screen cannot authorize a mutation. PG active-state checks remain mandatory even if Firebase revocation is delayed/unavailable.

### 30. Refresh-token revocation

The separate identity reconciler revokes Firebase refresh tokens and sets current role/organization/security-version claims from PG. This is additional defense, not the sole suspension authority. The security version prevents old same-role cookies from reviving after reactivation, even if revocation timing/granularity would otherwise be ambiguous.

### 31. Reactivation

Check the target's Firebase identity availability before PG reactivation, without silently enabling an independent provider/platform-disabled identity. The transaction rechecks current target revision/role and valid configured grants, then activates with a new security version. Only those configured permissions return, and a fresh sign-in is required; old sessions stay invalid.

### 32. No hard deletion

Historical status events, refunds, inventory movements, delivery assignments and audits depend on immutable User references. Suspension retains them. There is no staff DELETE handler or hard-delete button. Compensation for a failed brand-new, uncommitted identity is not a destructive employee lifecycle action.

### 33. Email editing

Staff email is read-only after invitation because it is part of Firebase identity and profile-claim matching. A casual PG email rewrite could break login or misassociate an identity. Forged email-edit JSON is rejected. A future explicit verified identity-change flow needs its own scoped specification.

### 34. Detail page

Detail includes current profile, status, role, grants, real membership joined date, sync state and latest twenty relevant lifecycle audits. Actor names and safe role/access summaries are shown, not arbitrary raw audit metadata. Suspended/shared identities remain readable where tenant-authorized; shared legacy targets are not mutable.

### 35. Audit events

New events cover STAFF_INVITED, STAFF_ROLE_CHANGED, STAFF_LOCATION_ACCESS_CHANGED, STAFF_SUSPENDED, STAFF_REACTIVATED, STAFF_PROFILE_UPDATED, STAFF_SETUP_RESTARTED, ORGANIZATION_SETTINGS_UPDATED, ORGANIZATION_BRANDING_UPDATED and LOCATION_SETTINGS_UPDATED. Actor/target/tenant are recorded. Role/access before/after and version/count changes are useful metadata; raw credential/setup/email provider errors are excluded.

### 36. Organization permissions

Cinema Admin edits the current active organization's profile/branding. Location Manager has read-only scoped settings visibility; operational staff and anonymous customers cannot mutate. Super Admin remains platform-only here. The service rechecks current actor/organization under lock for writes and applies version checks, not just initial page authorization.

### 37. Location permissions

Only Cinema Admin edits own-organization location settings in this phase. Managers may read currently granted locations, never a foreign location or unrestricted ownership/payment/security fields. The existing structure/operational permissions are not duplicated or broadened. Foreign location settings return generic not found or access denied without exposing their data.

### 38. Preview

The preview renders the actual customer header/support component with controlled data and fixed dark styling. It shows name, processed logo/fallback and the chosen accent without arbitrary HTML publishing. The illustrative menu copy is explicitly preview content; real customer integration is separately tested/captured on the scan/menu flow.

### 39. Fallback

No configured logo yields a simple text/initial identity and public cinema name. A broken logo triggers client fallback rather than blocking ordering or crashing the page. Logo removal commits null before cleanup; native customer menu/cart remained functional during integration. CineBite's product identity is preserved.

### 40. Public support

Only Organization supportEmail/supportPhone/website are used for customer support. Staff email/phone is not automatically published. Fields are bounded/validated, website is HTTPS without embedded credentials, and external links use noreferrer/noopener so a scan credential is not forwarded as referrer. Operators are instructed to enter public cinema contacts, not employee personal details.

### 41. Settings concurrency

Organization and Location have integer settingsVersion counters. The current version is required; writes lock/recheck ownership then compare/increment, with audit in the same transaction. Concurrent saves produce one success and one conflict rather than a lost update. Concurrent logo replacement likewise preserves one live reference and compensates the losing object.

### 42. Staff concurrency

Membership revision coordinates profile/role/grant/status/setup actions. The organization row lock serializes high-privilege mutations and last-admin decisions. Actor role/activity/security version is reread in transaction, so a stale caller cannot rely on old initial scope. Actual simultaneous edit/status and same-revision requests were executed with one winner and safe conflicts.

### 43. Last-admin protection

Count only tenant CINEMA_ADMIN memberships with active normal Users and READY setup, not incomplete invitations. Before suspending/demoting an eligible admin, require another ready active admin. This is transactionally serialized application logic, not a misleading cross-row CHECK constraint. Concurrent mutual suspensions left exactly one ready active administrator.

### 44. Notifications

Role/access changes write target-only STAFF_ROLE_CHANGED/STAFF_ACCESS_CHANGED outbox entries in the same PG mutation transaction. Phase 17 handles dedupe, retries and current recipient scope. These types are mandatory security updates; they never confer permissions. Inactive staff cannot read actionable inbox data simply because an old notification exists.

### 45. Staff UI

Dark responsive cards, search/filter controls, explicit role/status/location text, paging and safe detail links make the directory manageable. Navigation exposes staff management only to Cinema Admin, with backend enforcement independent of that visibility. Empty results and existing generic error/loading UI do not reveal database stacks.

### 46. Invite UI

The details step gathers bounded name/email, allowed role and location checkboxes. Review repeats the proposed role and grants; Cinema Admin's tenant-wide authority is explicit. A separate private setup dialog appears only after success, with no fake email delivery claim or password form. There is no arbitrary organization selector.

### 47. Edit UI

Display name is editable; email is visibly read-only. Role choice and explicit location grants align with server normalization. Changing role requires a confirmation checkbox and explains fresh-sign-in consequences. Saving a conflict does not silently overwrite someone else's changes; reload/review is required.

### 48. Suspension UX

Sensitive actions have a separate section and native accessible dialog, distinct from ordinary edit controls. Confirmation names the demo staff member, explains immediate loss of access and preserved history, and displays the current grants. Reactivation similarly shows what becomes active. Self/destructive operations remain disabled/rejected.

### 49. Mobile

390×844 logical viewport tests covered settings, staff directory and branded customer menu/cart/order progress without horizontal page overflow. Controls wrap, grants use touch-sized labeled checkboxes and forms/cards stack. Screenshots wait for actual loaded content and use native 2× density for clearer originals, not artificial upscaling.

### 50. Accessibility

Native labeled forms, selects, checkboxes and dialogs provide semantics and keyboard focus behavior. Status has explicit words, not color alone. Logo has meaningful alt text and fallback; controls use visible focus/touch sizes. Feedback uses the existing notification/toast provider. This is implemented/tested behavior, not a claim of external WCAG certification.

### 51. Motion

Motion is subtle in the branding preview and invitation review, with initial=false and reduced-motion checks. Dark background/contrast remain stable; no flashing transitions, forced audio or browser notification prompt is introduced. Native capture disables animations so screenshots do not freeze partial transitions.

### 52. Migration

The additive Phase 18 migration adds useful settings/setup/security/sync/revision fields, two controlled enums, new audit/notification values and a scoped membership index/checks. Existing User/Membership/LocationAccess tables are reused. All eighteen migrations applied in a fresh isolated DB; reapplication and schema diff passed. Production must migrate before the updated profile/login query runs.

### 53. Constraints/indexes

Existing unique Firebase UID/email, user-org membership and membership-location keys are preserved, as are composite tenant foreign keys. New counters are nonnegative. The org/role/creation index supports directory filtering and admin counts; targeted identity sync uses User's PK/lease conditions, not unnecessary global indexes. Actual duplicate/FK inserts were rejected in isolation.

### 54. Automated tests

490 tests in 61 files passed, including settings/URL/theme/timezone validation, controlled roles/grants, last-admin policy, session-version matching, image boundary/compensation, current settings authority and durable identity-sync failure/lease behavior. The scripted real integration suite additionally exercises database constraints and concurrent protected HTTP operations; code inspection alone is not called a passing test.

### 55. Actual integration

Every A–AL requested case was executed: 38 PASS, 0 FAIL, 0 NOT EXECUTABLE in that required matrix. Two extra check groups passed, covering CAS/cleanup/CSRF/setup/notifications and role-status races/constraints/held-sync repair/provider-disabled reactivation. The raw JSON records each case's actual evidence rather than a blanket unexecuted checklist.

### 56. Actual Firebase tests

Official Auth and Storage emulators executed identity creation, generated Firebase reset/action links, actual password reset, password sign-in, cookie verification, claims/revocation and Storage upload/download/removal. A checksum-verified portable Java 21 runtime allowed the real Storage emulator to run without a global install. No production Firebase/Neon identity, credential or resource was mutated.

### 57. Firestore

No normal staff/settings business persistence uses Firestore. PostgreSQL stores current permission/state/settings/audit/outbox and Firebase supplies credentials/media. The old Firebase integration/migration utility may remain in the repository, but Phase 18 introduced no Firestore business calls.

### 58. Screenshots

Eight actual UI PNGs show organization settings, branding controls, real scan branding, staff management, invite review, role/location grants, suspension confirmation and mobile settings. All use fictional reserved-domain identities and placeholder cinema contact data. No AI UI reconstruction or composites are used.

### 59. Cropping/full page

Browser page capture excludes taskbar, desktop, tabs, bookmarks, extensions and developer tools. fullPage includes complete app sections below the fold. Desktop 1440 logical pixels and mobile 390 logical pixels use 2× native density; original files remain sharper than a scaled viewer preview. The suspension backdrop is the real modal design, not post-processed blur.

### 60. Private-data confirmation

Native frames contain only demo staff/company names, reserved example.test contacts and a non-personal placeholder phone. No Firebase UID/token/key, private setup/reset URL, QR credential, session secret, database connection or provider key is visible. The runner excludes private setup dialogs and scans source/audit against ephemeral secrets; staged local-secret review is performed before commit.

### 61. Known limitations

No invitation email provider/delivery, multi-organization linking, email change, automatic identity-sync job, full audit export, new locale system, HR, arbitrary themes or Phase 19 is implemented. Terminal/pending identity sync requires authorized retry/operator review; a killed worker's ten-minute lease may delay a retry. Firebase/PG/Storage are not a distributed atomic transaction: compensation and fail-closed state manage failures, while residual orphan cleanup may require an operator. Cached branding can need refresh. Stable offset pagination can shift under newly arriving staff. Production-scale performance and live deployment/provider delivery were not claimed.

### 62. Phase 19

No Phase 19 brief was supplied and no Phase 19 work has begun. A sensible next specification could prioritize deployment/operator observability, measured scale, automated reconciliation, and an explicitly approved invitation delivery provider with privacy/consent and isolated tests. The user defines that scope after reviewing/merging this phase; these are recommendations, not a new implementation mandate.
