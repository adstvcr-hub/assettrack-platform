/** Device-local opt-in. No changes to restaurant account or billing settings. */
const KEY = "menu-interactivo.rawbt-receipts.enabled.v1";

export function isReceiptPrinterEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "yes";
  } catch {
    return false;
  }
}

export function setReceiptPrinterEnabled(enabled: boolean): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY, enabled ? "yes" : "no");
    return true;
  } catch {
    return false;
  }
}
