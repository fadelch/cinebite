# Phase 18 — Organization Settings & Staff Management

Real CineBite pages captured with fictional identities/public cinema contacts in isolated PostgreSQL and official Firebase Auth/Storage emulators. Desktop viewport: 1440 CSS pixels; mobile: 390 × 844 CSS pixels. Native browser pixel density is 2× for clearer originals (2880px desktop / 780px mobile width); files are not upscaled, composited, blurred or reconstructed. Full-page capture retains the complete app content, including below-the-fold settings/history, while excluding desktop/taskbar/browser chrome. A deliberate suspension dialog darkens the background as the actual app does.

Phase 18 separates administrative and public cinema names, validates public support contacts and controlled dark accents, safely normalizes logos to WebP, previews customer branding and reuses existing location fields. Staff management keeps Firebase as identity/credential provider and PostgreSQL as current authorization. Invitations use private Firebase setup links, not public signup or stored passwords. Role/location grants, suspension/reactivation, last-active-admin protection, safe audits and optimistic concurrency are enforced server-side. Role/access changes reuse the Phase 17 durable notification layer; in-app alerts do not replace setup-link delivery.

## 01 — Organization profile

![Full organization settings page with separate administrative/public names and public demo contact fields](01-organization-settings.png)

## 02 — Safe branding controls

![Full branding/settings page with actual normalized demo logo and controlled teal accent preview](02-branding-settings.png)

## 03 — Branding applied to seat scan

![Real mobile seat-scan confirmation showing the demo cinema identity, logo and public support details](03-branding-preview.png)

## 04 — Staff management

![Full staff directory with fictional reserved-domain emails, roles, statuses and scoped locations](04-staff-management.png)

## 05 — Invitation review

![Real invite wizard review with demo staff name, role and selected cinema location—no setup/reset URL](05-invite-staff.png)

## 06 — Role and location access

![Full staff detail page with current manager role, explicit location grants and safe audit history](06-staff-role-location-access.png)

## 07 — Explicit suspension confirmation

![Native in-app suspension confirmation explains immediate access loss and historical-record preservation](07-staff-suspension.png)

## 08 — Complete mobile settings

![Fully loaded high-density mobile settings page with all profile, branding, preview, location and staff sections](08-mobile-settings.png)

All addresses ending `example.test`, staff names and the placeholder cinema phone are synthetic test data; no real personal contacts are shown. No Firebase UID/token/key, setup/reset URL, QR credential, session token, database connection or provider secret is visible. A private setup-link dialog is explicitly excluded from capture. No production invitation email delivery is claimed. See [executed evidence](../../docs/phase-18-integration-results.json) and [architecture](../../docs/phase-18-architecture.md).
