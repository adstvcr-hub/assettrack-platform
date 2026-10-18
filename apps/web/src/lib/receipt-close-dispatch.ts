import type { ClosedRestaurantReceipt } from "./restaurant-receipt";

/** Only dispatch a verified closed receipt. Does not touch payments or closures. */
export async function dispatchReceiptAfterConfirmedClose(
  enabled: boolean,
  loadReceipt: () => Promise<ClosedRestaurantReceipt>,
  sendToPrinterApp: (receipt: ClosedRestaurantReceipt) => void,
): Promise<boolean> {
  if (!enabled) return false;
  const receipt = await loadReceipt();
  if (receipt.status !== "CLOSED" || !receipt.receiptNumber) {
    throw new Error("Solo se imprimen cuentas con cierre confirmado.");
  }
  sendToPrinterApp(receipt);
  return true;
}
