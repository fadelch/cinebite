# Phase 17 — Notifications & Alerts

Eight native full-page browser captures of real CineBite UI, using only fictional demo orders in isolated local PostgreSQL, Firebase Auth emulator identities and the explicit payment/refund sandbox. Desktop captures are 1440px wide; the mobile capture is 390px wide. No AI reconstruction, scaling, composite overlays, browser chrome or full-desktop capture is used. The mobile image is captured only after the notification content finishes loading, not during the loading skeleton.

This phase adds durable operational in-app notifications, not marketing or external messaging. Database triggers capture trusted business events transactionally; the outbox processor creates deduplicated, recipient-scoped inbox entries with bounded retries. Staff role/location grants are checked server-side. Customer updates require the owning, unexpired anonymous seat session. Notification preferences cannot suppress critical operational exceptions. The work queues, orders, payments, refunds and inventory remain the business authority.

## Notification center

![Staff notification center with unread count, safe deep links, operational alerts and preferences](01-notification-center.png)

## Eligible kitchen order

![Kitchen queue and private new-order bell alert for the demo seat](02-new-order-kitchen-alert.png)

## Ready for delivery

![Delivery ready queue and authorized location alert](03-order-ready-delivery-alert.png)

## Private customer order updates

![Full customer order page with delivered state, financial truth and private notification history](04-customer-order-notifications.png)

## Low-stock transition

![Type-filtered inventory warning and preferences](05-low-stock-alert.png)

## Refund failure

![Type-filtered refund requires-attention alert without provider errors or false completion](06-refund-failed-alert.png)

## Preferences

![Full unread notification page and category preferences with mandatory safety alerts](07-notification-preferences.png)

## Mobile notifications

![Complete loaded 390px mobile notification page with notification cards and preferences](08-mobile-notifications.png)

Public demo order codes and fictional seat labels are shown; no session/QR credentials, real contacts, Firebase tokens, private provider IDs or server secrets are visible. These are actual WARNING/CRITICAL business alerts intentionally showcased, not application errors. External email/SMS/push is not configured or claimed. See [architecture](../../docs/phase-17-architecture.md) and [executed results](../../docs/phase-17-integration-results.json).
