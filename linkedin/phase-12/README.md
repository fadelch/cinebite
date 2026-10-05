# Phase 12 — Kitchen Operations

Real CineBite production UI with isolated professional demo records. Captures include application content only: no desktop, browser chrome, editor, terminal, operational QR credentials or real customer information.

Achievements: location-scoped kitchen authorization; oldest-first operational queue; strict PLACED → ACCEPTED → PREPARING → READY state machine; concurrency-safe status changes; append-only history; automatic queue/customer progress updates; tablet/phone layouts. READY is preparation complete, not payment or delivery. This establishes a safe foundation for Phase 13 without implementing delivery.

| Image | Demonstrates |
| --- | --- |
| `01-kitchen-queue.png` | Desktop queue, snapshots, counts and state actions |
| `02-new-order-ticket.png` | Newly placed read-only ticket in the native dialog |
| `03-order-accepted.png` | Accepted snapshot and preparation action |
| `04-order-preparing.png` | Preparing snapshot and mark-ready action |
| `05-order-ready.png` | Preparation complete; no delivery/payment claim |
| `06-order-status-timeline.png` | Four operational events and safe staff display name |
| `07-customer-order-progress.png` | Actual mobile customer progress and immutable order details |
| `08-tablet-kitchen-view.png` | Reflowed 1024×768 kitchen queue |
| `09-mobile-kitchen-view.png` | Functional 390×844 kitchen layout |

Reproduce deliberately after building with `npx tsx --conditions=react-server --env-file=.env.local scripts/verify-phase-12.ts --demo`. This manual integration scenario uses configured Firebase/Neon demo access and local Chrome; it is never run by the unit test suite or CI. Test staff are disabled afterward, while isolated demo orders/history remain as evidence. See [integration outcomes](../../docs/phase-12-integration-results.json) and the [architecture guide](../../docs/phase-12-architecture.md).
