# Phase 14 — Secure Payments

Real CineBite application evidence captured from the optimized Next.js build with isolated local PostgreSQL, Firebase Auth emulator and demo-only payment provider. No real money/card data was used. Images preserve native browser rendering without desktop/browser chrome, secret credentials, QR codes or session tokens.

The phase introduces a provider abstraction, server-authoritative totals, financial state separate from fulfillment, raw-body webhook signature verification/idempotency, short-lived inventory reservations, payment-gated kitchen operations and a dark mobile checkout. Raw card details are never collected or stored. Refunds/manual-review resolution are future work, not implied by a payment confirmation.

1. `01-payment-checkout.png` — trusted seat/order summary and explicit sandbox controls.
2. `02-payment-processing.png` — confirming server result while stock remains reserved.
3. `03-payment-success.png` — verified payment and link to fulfillment progress.
4. `04-payment-failed.png` — clear failure explanation, released stock and safe same-order retry.
5. `05-admin-payment-status.png` — tenant-scoped safe financial summary.
6. `06-kitchen-payment-gating.png` — actual paid order becomes actionable; unpaid orders are excluded.
7. `07-inventory-reservation.png` — physical, reserved and available balances (10 / 2 / 8).
8. `08-mobile-payment-flow.png` — real 390-pixel mobile confirmation with Hall/Seat.

See [architecture](../../docs/phase-14-architecture.md) and [executed verification](../../docs/phase-14-verification.md). These test screenshots do not establish a live merchant integration or PCI certification.
