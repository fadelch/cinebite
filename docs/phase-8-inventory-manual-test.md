# Phase 8 inventory manual test guide

Use a non-production test database or a reviewed staging environment. Apply committed migrations with `npm run prisma:migrate:deploy`; never reset or use `prisma db push` against production. Keep `.env.local`, Neon URLs, and Firebase Admin credentials private.

## Test setup

Prepare two organizations. In Organization A, create two active locations (A1 and A2), a Cinema Admin, a Location Manager restricted to A1, and a Kitchen Staff user. Keep one user and location in Organization B for isolation checks. In Phase 7, ensure Organization A has an active `Large Popcorn` product assigned and manually available at A1.

## Item catalog

1. Sign in as the Organization A Cinema Admin and open `/admin/inventory/items`.
2. Create `Popcorn Kernels`, SKU `INV-POPCORN-KERNEL`, unit `GRAM`, status `ACTIVE`.
3. Create `Large Popcorn Cup`, SKU `INV-LARGE-CUP`, unit `EACH`.
4. Verify search finds each name and SKU, status filtering works, and pagination controls appear only when needed.
5. Attempt the same SKU again. Expect “This SKU is already in use,” with no raw Prisma message.
6. Edit the name/SKU/status. Disable and re-enable an item and confirm its state.
7. Before using a new item, change its unit successfully. After configuring it at a location or using it in a recipe, attempt another unit change and expect the safe unit-lock conflict.
8. Sign in as the Location Manager. Confirm the catalog is visible but global create/edit controls are unavailable and direct mutation requests return `403`.

## Location configuration and thresholds

1. As Cinema Admin, open `/admin/inventory`, choose A1, and open Manage stock.
2. Configure both items with thresholds: kernels `500.000`, cups `10.000`.
3. Confirm each starts at `0.000`; configuration must not accept an initial quantity.
4. Try configuring the same item again. Expect “This inventory item already exists at this location.”
5. Change the cup threshold and confirm the update appears after returning to the dashboard.
6. Repeat as the A1 Location Manager. Confirm A1 is allowed and A2 is absent/forbidden.

## Receipts, adjustments, waste, and negative protection

1. At A1, receive `5000.000 GRAM` kernels. Confirm new stock `5000.000`, a `RECEIVE +5000.000` history row, and a success notification.
2. Receive `30.000 EACH` cups. Confirm stock `30.000`.
3. Apply `ADJUSTMENT_IN 2.000` to cups. Confirm `32.000` and a positive adjustment row.
4. Apply `ADJUSTMENT_OUT 2.000` with reason `Physical count correction`. Confirm `30.000` and a negative row.
5. Record `WASTE 5.000` with reason `Damaged during delivery`. Confirm `25.000` and a waste row.
6. Attempt to remove more than the current quantity. Expect “Insufficient stock for this adjustment,” unchanged stock, and no movement/audit row for the rejected operation.
7. Try zero, negative, more than three decimal places, and an overlarge quantity. Confirm server validation rejects all values.
8. Submit two reductions close together from separate browser sessions. Confirm the database never becomes negative and only valid conditional updates produce history rows.

## Stock status

1. Set a cup threshold of `10.000`.
2. Reduce cups to `10.000`; expect the explicit `LOW STOCK` text label.
3. Reduce cups to `0.000`; expect `OUT OF STOCK`.
4. Receive to `11.000`; expect `IN STOCK`.
5. Confirm the overview totals for configured, low, and out-of-stock items match A1 and change when A2 is selected.

## Recipes and projected availability

1. As Cinema Admin, open the Large Popcorn product detail page.
2. Add kernels at `150.000 GRAM` and cup at `1.000 EACH`.
3. Try adding a duplicate component and expect the friendly duplicate message.
4. Try zero/negative recipe quantity and expect validation failure.
5. Confirm Location Manager can view but not alter organization-wide recipes.
6. With `5000.000g` kernels and `30` cups, verify server projected availability is `min(floor(5000/150), floor(30/1)) = 30`.
7. For a product without components, verify inventory state is `NOT_TRACKED`, not out of stock.

## Effective availability and restocking

1. Keep Product status active and ProductLocation manually available.
2. Reduce a required component below one product’s requirement. Verify effective availability becomes false while `ProductLocation.isAvailable` remains true.
3. Receive enough stock. Verify effective availability becomes true again without manually toggling the Phase 7 location offer.
4. Set manual location availability false. Confirm stock receipt does not override that choice.
5. Disable the Product globally. Confirm effective availability stays false regardless of stock.

## Movement history and audit records

1. Open `/admin/inventory/movements`.
2. Filter by location, item, movement type, start date, and end date; verify bounded pagination and actor/timestamp/reason/note data.
3. Confirm no edit or delete controls/API routes exist for movements. Correct a mistake with a compensating adjustment.
4. Inspect AuditLog in the staging database/admin tooling. Verify events exist for item create/update/disable/enable, location configuration, receipt, adjustment in/out, waste, threshold change, and recipe add/update/remove.
5. Confirm audit metadata includes safe IDs/quantities but no cookies, tokens, credentials, database URLs, or private keys.

## Location and tenant isolation

1. As the A1-restricted manager, try direct URLs and API calls for A2. Expect `403` and no writes.
2. Submit Organization B location/item/product IDs to Organization A endpoints. Expect not found/denied responses and no cross-tenant relation.
3. As Kitchen Staff and Delivery Staff, open inventory routes and call mutation APIs. Expect denied access.
4. Confirm organization identity always comes from the authenticated membership; no inventory request body contains a trusted `organizationId`.

## Responsive and accessibility checks

1. Test overview, item list, location stock actions, recipe forms, and history at desktop, tablet, and phone widths.
2. On touch width, confirm quantity, reason, note, and action controls are large enough and do not overflow.
3. Navigate every form and button by keyboard; verify visible focus, associated labels, readable validation, and bottom-right completion/error notifications.
4. Enable reduced motion at OS/browser level and confirm transitions remain understandable without unnecessary animation.
5. Verify low/out/in-stock meaning remains clear from text when colors are unavailable.

## Automated safety checks

Run `npm run prisma:validate`, `npm run prisma:generate`, `npx tsc --noEmit`, `npm test`, `npm run lint`, and `npm run build`. The test suite mocks database persistence and must not connect to or modify production Neon.

## Intentional Phase 8 limits

There is no order consumption, cart reservation, refund restocking, transfer, supplier/purchase-order system, customer ordering, payment, QR, movie/screening, kitchen/delivery workflow, or revenue analytics. A later phase may call the centralized stock service for transaction-safe order consumption, but Phase 8 does not start that work.
