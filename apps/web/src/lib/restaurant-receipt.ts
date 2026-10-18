/**
 * Final internal receipt, 58mm thermal paper (384 dots / ~32 characters).
 * This never prints an open account or changes account/payment state.
 */
export type ClosedRestaurantReceipt = {
  status: string;
  restaurant: string;
  table: string;
  receiptNumber: string;
  closedAt: string;
  paymentMethod?: "CASH" | "SINPE" | "CARD" | "OTHER" | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    status: string;
  }>;
  billing: {
    grossSubtotal?: number;
    promotionCredit?: number;
    subtotal: number;
    tax: number;
    service: number;
    total: number;
    taxIncluded?: boolean;
    taxRateBps?: number;
    serviceChargeEnabled?: boolean;
  };
};

const RECEIPT_WIDTH = 32;
const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  SINPE: "SINPE",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

function clean(value: string): string {
  return value.replace(/[\r\n\t\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
}

function money(value: number): string {
  return "CRC " + Math.round(value).toLocaleString("en-US");
}

function wrap(value: string, width = RECEIPT_WIDTH): string[] {
  const words = clean(value).split(" ").filter(Boolean);
  const result: string[] = [];
  let row = "";
  for (const word of words) {
    if (row && row.length + word.length + 1 > width) {
      result.push(row);
      row = "";
    }
    let remaining = word;
    while (remaining.length > width) {
      if (row) {
        result.push(row);
        row = "";
      }
      result.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    if (remaining) row = row ? row + " " + remaining : remaining;
  }
  if (row) result.push(row);
  return result.length ? result : [""];
}

function amount(label: string, value: number): string[] {
  const right = money(value);
  const left = clean(label);
  const space = RECEIPT_WIDTH - left.length - right.length;
  return space > 0
    ? [left + " ".repeat(space) + right]
    : [...wrap(left), right.padStart(RECEIPT_WIDTH)];
}

export function formatClosedRestaurantReceipt(
  receipt: ClosedRestaurantReceipt,
): string {
  if (
    receipt.status !== "CLOSED" ||
    !receipt.closedAt ||
    !Number.isFinite(Date.parse(receipt.closedAt)) ||
    !receipt.receiptNumber ||
    !Number.isFinite(receipt.billing.total)
  ) {
    throw new Error("Solo se imprimen cuentas con cierre confirmado.");
  }
  const items = receipt.items.filter((item) => item.status !== "CANCELLED");
  const lines = [
    ...wrap(receipt.restaurant),
    "COMPROBANTE DE CUENTA CERRADA",
    "-".repeat(RECEIPT_WIDTH),
    ...wrap("Recibo: " + receipt.receiptNumber),
    ...wrap("Mesa / posicion: " + receipt.table),
    new Date(receipt.closedAt).toLocaleString("es-CR"),
    "-".repeat(RECEIPT_WIDTH),
  ];
  for (const item of items) {
    lines.push(...wrap(item.quantity + " x " + item.name));
    lines.push(...amount("", item.total));
  }
  lines.push("-".repeat(RECEIPT_WIDTH));
  if (receipt.billing.promotionCredit && receipt.billing.promotionCredit > 0) {
    lines.push(...amount("Productos", receipt.billing.grossSubtotal ?? receipt.billing.subtotal));
    lines.push(...amount("Promocion", -receipt.billing.promotionCredit));
  }
  lines.push(...amount("Subtotal", receipt.billing.subtotal));
  if (receipt.billing.tax) {
    lines.push(...amount(receipt.billing.taxIncluded ? "IVA incluido" : "IVA", receipt.billing.tax));
  }
  if (receipt.billing.service) {
    lines.push(...amount("Servicio", receipt.billing.service));
  }
  lines.push("=".repeat(RECEIPT_WIDTH));
  lines.push(...amount("TOTAL", receipt.billing.total));
  lines.push("Pago: " + (PAYMENT_LABELS[receipt.paymentMethod ?? ""] ?? "No indicado"));
  lines.push("-".repeat(RECEIPT_WIDTH));
  lines.push("COMPROBANTE INTERNO");
  lines.push("NO ES FACTURA ELECTRONICA");
  lines.push("Gracias por su visita", "", "", "");
  return lines.flatMap((line) => (line.length > RECEIPT_WIDTH ? wrap(line) : [line])).join("\n");
}

/** Verified in the Android 15 HSD01 -> RawBT -> USB -> PR-100 pilot. */
export function closedRestaurantReceiptRawBtHref(receipt: ClosedRestaurantReceipt): string {
  return "rawbt:" + encodeURIComponent(formatClosedRestaurantReceipt(receipt));
}
