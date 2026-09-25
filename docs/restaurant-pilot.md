# Restaurant pilot: order visibility

This is the first vertical slice of the restaurant module. It is intended for a controlled pilot, not for production deployment until the migration and workflow have been tested with a restaurant partner.

## Included

- `/restaurant/staff` resolves each authenticated employee to one server-authorized workspace: `/restaurant/admin`, `/restaurant/kitchen`, `/restaurant/bar`, or `/restaurant/waiter`.
- An administrator creates menu items and tables at `/restaurant/admin`, assigns restaurant roles to existing users, and assigns waiters to tables. Each table has a printable QR that opens `/restaurant/table/{code}`. Set `PUBLIC_WEB_URL` on the API to the HTTPS address of the web application before printing table QRs.
- A guest selects items, confirms an order, and receives a private status URL. The kitchen and bar queues are separated by station, and staff move each item through `RECEIVED → ACCEPTED → PREPARING → READY → DELIVERED` or cancel it before it is ready.
- Kitchen and bar can only accept, start, and mark ready items for their own station. The assigned waiter sees only their tables and confirms delivery. Restaurant administrators retain the complete operational view and configuration access. These restrictions are enforced by the API, not only by the web interface.
- Status changes and their actors are recorded. Menu names and prices are snapshotted on orders. No payments or invoices are collected by AssetTrack.
- Waiter availability now triggers deterministic balancing of every active dining table across available waiters. Manual assignment remains restricted to restaurant administrators.
- A physical table can hold multiple private accounts. A new browser session starts a separate account after a warning; a browser that already owns an open account adds later orders to that account.
- Menu items support administrator-controlled product types, multiple categories, origin, preparation time, alcohol classification, and one trial image (JPEG/PNG/WebP, up to 2 MB and 1600 × 1600). The guest menu includes category navigation and a session-specific **Menú rápido**.
- Orders can mix dine-in and takeout lines. An administrator can create a dedicated takeout QR station, which never receives a dining-table waiter assignment.
- Active promotions are date-bound and may grant a separate credit. Product prices remain unchanged; the credit is subtracted before tax and service calculations.
- A current promotion is presented first in both the guest menu and account tracking screen. The guest can choose a quantity and add its product directly to the active account.
- Product records can be fully edited. Products with order history are archived to preserve traceability; permanent deletion is limited to products that have never been ordered.
- The waiter account view mirrors the customer's consumption and billing totals but never exposes electronic-invoice identity or contact data.
- Guests may request an electronic invoice by securely submitting contact and tax-identification data. AssetTrack records the request for authorized administrators; it does not issue the fiscal document.
- Preparation estimates remain internal. Kitchen, bar, and waiter dashboards highlight orders that exceed the weighted operational threshold; guests are not shown minutes or automated delay messages.
- The browser refreshes order status every five seconds while open. Keep the status URL private; it grants read access to that order. The QR alone grants ordering for that table, so display it only at the table and replace it if misused.

## Before an on-site pilot

1. Apply all migrations through `20260924190000_restaurant_revision_bundle` to a staging database, test the workflow, and confirm backup and restore procedures. The new migration preserves existing restaurant and scan records, removes the one-open-account-per-table restriction, and adds catalog, promotion, fulfillment, invoice-request, and internal timing fields.
2. Set `PUBLIC_WEB_URL` to the public production web domain, never a `*-git-*` Vercel preview address. Confirm that Vercel Deployment Protection does not require a Vercel account for guest QR routes, then create the pilot organization, invite staff, add the tables and menu, and print and scan a QR from a signed-out phone.
3. Rehearse simultaneous orders, an unavailable item, a retry after a dropped connection, cancellation, and loss of connectivity. Confirm that guests are not shown an order as submitted before the API saves it.
4. Observe baseline service times before relying on internal delay thresholds. Customers intentionally receive no numeric estimate; delays are communicated personally by the assigned waiter.
5. Staff must offer an alternative to QR ordering. The existing point-of-sale process remains responsible for payment and invoicing.
6. Confirm from a signed-out phone that `/restaurant/table/{code}` and `/restaurant/order/{accessCode}` are public. Preview deployment protection may request a Vercel login; production QR access must never require an AssetTrack or Vercel account.

## Measure

Record order receipt-to-acceptance and acceptance-to-ready times by station, forgotten or duplicated orders, incidents needing staff intervention, guest usage, and a brief customer/staff assessment. Decide the pilot duration and numerical targets with the restaurant after recording a baseline.

## Known limits

This slice uses polling, not background notifications; the customer must keep the status page open or revisit its private link. Vibration depends on browser and device support and still requires a real-phone acceptance test. Guest QR access is bearer access: rate limits and a limit on open orders mitigate accidental repeats, but a copied QR does not establish physical presence. The next iteration should test a table activation or staff approval mechanism if remote ordering or abuse occurs. The initial currency display is CRC and should become organization-specific before offering the module in other markets. Optional promotional email consent is intentionally outside the ordering requirement and must be implemented as a separate opt-in feature.

Promotion ownership by subscription tier is intentionally deferred to a separate monetization module. The approved direction is: paid restaurants manage their own promotion space; after the trial, free accounts surrender that space to clearly labelled, date-bound third-party advertising controlled by AssetTrack. Advertising must remain separate from restaurant pricing, taxes, service charges, and orders unless a future explicitly accepted commercial promotion integrates it.
