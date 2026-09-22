# Restaurant pilot: order visibility

This is the first vertical slice of the restaurant module. It is intended for a controlled pilot, not for production deployment until the migration and workflow have been tested with a restaurant partner.

## Included

- `/restaurant/staff` resolves each authenticated employee to one server-authorized workspace: `/restaurant/admin`, `/restaurant/kitchen`, `/restaurant/bar`, or `/restaurant/waiter`.
- An administrator creates menu items and tables at `/restaurant/admin`, assigns restaurant roles to existing users, and assigns waiters to tables. Each table has a printable QR that opens `/restaurant/table/{code}`. Set `PUBLIC_WEB_URL` on the API to the HTTPS address of the web application before printing table QRs.
- A guest selects items, confirms an order, and receives a private status URL. The kitchen and bar queues are separated by station, and staff move each item through `RECEIVED → ACCEPTED → PREPARING → READY → DELIVERED` or cancel it before it is ready.
- Kitchen and bar can only accept, start, and mark ready items for their own station. The assigned waiter sees only their tables and confirms delivery. Restaurant administrators retain the complete operational view and configuration access. These restrictions are enforced by the API, not only by the web interface.
- Status changes and their actors are recorded. Menu names and prices are snapshotted on orders. No payments or invoices are collected by AssetTrack.
- The browser refreshes order status every five seconds while open. Keep the status URL private; it grants read access to that order. The QR alone grants ordering for that table, so display it only at the table and replace it if misused.

## Before an on-site pilot

1. Apply `20260922000000_restaurant_pilot` and `20260922200000_restaurant_staff_roles` to a staging database, test the workflow, and confirm backup and restore procedures. The migrations do not modify existing scan records.
2. Set `PUBLIC_WEB_URL`, create a pilot organization, invite staff, add the tables and menu, and print and scan a QR from a real phone.
3. Rehearse simultaneous orders, an unavailable item, a retry after a dropped connection, cancellation, and loss of connectivity. Confirm that guests are not shown an order as submitted before the API saves it.
4. Observe baseline service times in the restaurant before publishing estimates. This initial slice shows stages; it intentionally does not promise estimated completion times without measured data.
5. Staff must offer an alternative to QR ordering. The existing point-of-sale process remains responsible for payment and invoicing.
6. Confirm from a signed-out phone that `/restaurant/table/{code}` and `/restaurant/order/{accessCode}` are public. Preview deployment protection may request a Vercel login; production QR access must never require an AssetTrack or Vercel account.

## Measure

Record order receipt-to-acceptance and acceptance-to-ready times by station, forgotten or duplicated orders, incidents needing staff intervention, guest usage, and a brief customer/staff assessment. Decide the pilot duration and numerical targets with the restaurant after recording a baseline.

## Known limits

This slice uses polling, not background notifications; the customer must keep the status page open or revisit its private link. Vibration depends on browser and device support and still requires a real-phone acceptance test. Guest QR access is bearer access: rate limits and a limit on open orders mitigate accidental repeats, but a copied QR does not establish physical presence. The next iteration should test a table activation or staff approval mechanism if remote ordering or abuse occurs. The initial currency display is CRC and should become organization-specific before offering the module in other markets. Optional promotional email consent is intentionally outside the ordering requirement and must be implemented as a separate opt-in feature.
