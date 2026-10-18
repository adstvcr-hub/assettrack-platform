import test from "node:test";
import assert from "node:assert/strict";
import {
  formatClosedRestaurantReceipt,
  closedRestaurantReceiptRawBtHref,
} from "../src/lib/restaurant-receipt.ts";

const sample = () => ({
  status: "CLOSED", restaurant: "Bar Mariposa", table: "Mesa 04",
  receiptNumber: "AT-001-2026", closedAt: "2026-10-18T18:00:00Z",
  paymentMethod: "SINPE",
  items: [
    { name: "Cerveza Imperial", quantity: 2, unitPrice: 1200, total: 2400, status: "DELIVERED" },
    { name: "Pizza cancelada", quantity: 1, unitPrice: 6000, total: 6000, status: "CANCELLED" },
  ],
  billing: { grossSubtotal: 2400, promotionCredit: 500, subtotal: 1900,
    tax: 247, service: 190, total: 2337, taxIncluded: false },
});

test("formats only delivered products with closed receipt on 32 columns", () => {
  const output = formatClosedRestaurantReceipt(sample());
  assert.match(output, /Bar Mariposa/);
  assert.match(output, /Cerveza Imperial/);
  assert.doesNotMatch(output, /Pizza cancelada/);
  assert.match(output, /TOTAL\s+CRC 2,337/);
  assert.match(output, /Promocion\s+CRC -500/);
  assert.match(output, /Pago: SINPE/);
  assert.ok(output.split("\n").every(line => line.length <= 32));
});

test("generates the RawBT deep link proven on the Android test device", () => {
  const href = closedRestaurantReceiptRawBtHref(sample());
  assert.ok(href.startsWith("rawbt:"));
  assert.match(href, /%0A/);
  assert.match(href, /Bar%20Mariposa/);
});

test("rejects open accounts, missing receipts and invalid dates", () => {
  assert.throws(() => formatClosedRestaurantReceipt({...sample(), status:"OPEN"}));
  assert.throws(() => formatClosedRestaurantReceipt({...sample(), receiptNumber:""}));
  assert.throws(() => formatClosedRestaurantReceipt({...sample(), closedAt:"invalid"}));
});

test("wraps lengthy product names without overflowing the printer", () => {
  const receipt = sample();
  receipt.items[0].name = "Combo de hamburguesa con papas especiales y ensalada de la casa";
  assert.ok(formatClosedRestaurantReceipt(receipt).split("\n").every(x => x.length <= 32));
});

test("renders inclusive IVA without adding it to the total", () => {
  const receipt = sample();
  receipt.billing.taxIncluded = true;
  receipt.billing.total = 2090;
  const output = formatClosedRestaurantReceipt(receipt);
  assert.match(output, /IVA incluido/);
  assert.match(output, /TOTAL\s+CRC 2,090/);
});

test("receipt printing is disabled by default without a browser", async () => {
  const { isReceiptPrinterEnabled } = await import("../src/lib/restaurant-printer-settings.ts");
  assert.equal(isReceiptPrinterEnabled(), false);
});
