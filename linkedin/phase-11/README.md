# Phase 11 — Customer Cart & Secure Order Creation

Phase 11 turns the verified seat session from Phase 10 into a secure mobile ordering flow. PostgreSQL owns each cart, the server reloads prices and availability at checkout, and order creation, immutable snapshots, inventory deductions, movement history, audit history, and cart clearing commit together.

The screenshots use safe demo data and are captured directly from CineBite. They contain no credentials, session tokens, QR credentials, private email addresses, developer tools, browser chrome, or desktop content.

- `01-customer-menu-add-to-cart.png` — live location menu with server-derived prices and touch-friendly Add controls.
- `02-menu-cart-summary.png` — quantity control and persistent mobile cart summary.
- `03-cart-with-items.png` — CustomerSession-bound cart with Popcorn and Pepsi.
- `04-cart-price-summary.png` — exact server-calculated quantities, line totals, subtotal, and total.
- `05-checkout-ready.png` — optional note and pending checkout action without payment claims.
- `06-order-confirmation.png` — immutable order number, seat context, item snapshots, and confirmed total.
- `07-admin-orders.png` — tenant-scoped, read-only operational order list.
- `08-admin-order-detail.png` — read-only item, total, movie, hall, and seat snapshot detail.

This phase prepares clean inputs for a future Kitchen workflow. Payment and fulfillment state are intentionally outside Phase 11.
