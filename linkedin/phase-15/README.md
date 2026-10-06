# Phase 15 — Cancellations, Refunds & Exceptions

Native CineBite application evidence from an optimized build, isolated local PostgreSQL, Firebase Auth emulator and explicit sandbox provider. No real customer, card or merchant financial data is used. These images do not imply real-money readiness.

Customers cancel only before Kitchen acceptance. Supervisors use confirmed exceptional cancellations or separate full/partial refunds; kitchen/delivery staff only report issues. Refund records preserve original captures and delivered history. Original consumption, not edited recipes, is restored only for pre-acceptance cancellation. Refund != restock. Serializable transitions, captured-exposure locks, durable provider keys, signed/idempotent callbacks and append-only audits protect concurrency and financial accountability. Canceled screenings use reviewed bounded reconciliation rather than blind mass refunds.

1. `01-customer-cancel-order.png` — owned placed order with cancellation window and safe balance.
2. `02-cancellation-confirmation.png` — native accessible confirmation and truthful bank-settlement explanation.
3. `03-refund-processing.png` — canceled order and verified provider-processing refund, not false completion.
4. `04-refund-completed.png` — original charge preserved with actual successful sandbox return.
5. `05-admin-refund-panel.png` — paid 12.50, returned 2.50, processing 8.00, remaining 2.00; safe provider-free history.
6. `06-partial-refund.png` — original order unchanged, multiple partial adjustments and remaining refund form.
7. `07-order-exception.png` — assigned delivery issue for supervisor decision, without automatic refund/restock.
8. `08-screening-cancellation-reconciliation.png` — real canceled-screening preview/classification before financial execution.
9. `09-mobile-refund-flow.png` — completed native 390×844 cancellation/refund flow without horizontal overflow.

All images preserve complete relevant application content and exclude desktop/browser chrome, error notifications, secrets, card details, provider binding IDs, cookies and QR/session tokens. See [architecture](../../docs/phase-15-architecture.md) and [executed verification](../../docs/phase-15-verification.md).
