# Restaurant pilot: order visibility

This is the first vertical slice of the restaurant module. It is intended for a controlled pilot, not for production deployment until the migration and workflow have been tested with a restaurant partner.

## Included

- An administrator creates menu items and tables at `/restaurant/staff`. Each table has a printable QR that opens `/restaurant/table/{code}`. Set `PUBLIC_WEB_URL` on the API to the HTTPS address of the web application before printing table QRs.
- A guest selects items, confirms an order, and receives a private status URL. The kitchen and bar queues are separated by station, and staff move each item through `RECEIVED → ACCEPTED → PREPARING → READY → DELIVERED` or cancel it before it is ready.
- Status changes and their actors are recorded. Menu names and prices are snapshotted on orders. No payments or invoices are collected by AssetTrack.
- The browser refreshes order status every five seconds while open. Keep the status URL private; it grants read access to that order. The QR alone grants ordering for that table, so display it only at the table and replace it if misused.

## Before an on-site pilot

1. Apply `20260922000000_restaurant_pilot` to a staging database, test the workflow, and confirm backup and restore procedures. The migration adds new tables and does not modify existing scan records.
2. Set `PUBLIC_WEB_URL`, create a pilot organization, invite staff, add the tables and menu, and print and scan a QR from a real phone.
3. Rehearse simultaneous orders, an unavailable item, a retry after a dropped connection, cancellation, and loss of connectivity. Confirm that guests are not shown an order as submitted before the API saves it.
4. Observe baseline service times in the restaurant before publishing estimates. This initial slice shows stages; it intentionally does not promise estimated completion times without measured data.
5. Staff must offer an alternative to QR ordering. The existing point-of-sale process remains responsible for payment and invoicing.

## Measure

Record order receipt-to-acceptance and acceptance-to-ready times by station, forgotten or duplicated orders, incidents needing staff intervention, guest usage, and a brief customer/staff assessment. Decide the pilot duration and numerical targets with the restaurant after recording a baseline.

## Known limits

This slice uses polling, not background notifications; the customer must keep the status page open or revisit its private link. Guest QR access is bearer access: rate limits and a limit on open orders mitigate accidental repeats, but a copied QR does not establish physical presence. The next iteration should test a table activation or staff approval mechanism if remote ordering or abuse occurs. The initial currency display is CRC and should become organization-specific before offering the module in other markets.
