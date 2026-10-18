"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import {
  closedRestaurantReceiptRawBtHref,
  type ClosedRestaurantReceipt,
} from "@/lib/restaurant-receipt";
import { useState } from "react";

/** Returns only a previously closed account authorized for this operator. */
export async function fetchClosedRestaurantReceipt(
  visitId: string,
): Promise<ClosedRestaurantReceipt> {
  const response = await authenticatedFetch(
    `${API_URL}/api/v1/restaurant/visits/${encodeURIComponent(visitId)}/receipt`,
  );
  if (!response.ok) throw new Error("No se pudo recuperar el recibo cerrado");
  const receipt = (await response.json()) as ClosedRestaurantReceipt;
  if (receipt.status !== "CLOSED") {
    throw new Error("La cuenta todavía no está cerrada");
  }
  return receipt;
}

export function ClosedReceiptDialog({
  receipt,
  onDismiss,
}: {
  receipt: ClosedRestaurantReceipt | null;
  onDismiss: () => void;
}) {
  const [attempted, setAttempted] = useState(false);
  if (!receipt) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recibo de cuenta cerrada"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 text-slate-950 shadow-xl">
        <h2 className="text-2xl font-black">Cuenta cerrada</h2>
        <p className="mt-2 break-all text-sm">Recibo: {receipt.receiptNumber}</p>
        <p className="mt-2 text-lg font-bold">Total: ₡{receipt.billing.total.toLocaleString("es-CR")}</p>
        <p className="mt-3 text-sm text-slate-600">
          El cierre quedó registrado. Para imprimir en este equipo Android,
          abra RawBT y confirme la impresión en la impresora USB configurada.
        </p>
        <a
          href={closedRestaurantReceiptRawBtHref(receipt)}
          onClick={() => setAttempted(true)}
          className="mt-5 block rounded-lg bg-emerald-700 px-5 py-4 text-center font-black text-white"
        >
          {attempted ? "Volver a enviar a RawBT" : "Imprimir recibo"}
        </a>
        {attempted && (
          <p className="mt-2 text-sm text-amber-900">
            Confirme IMPRIMIR en RawBT. Enviar de nuevo podría generar otra copia.
          </p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 w-full rounded-lg border px-5 py-3 font-semibold"
        >
          Cerrar sin imprimir
        </button>
        <p className="mt-3 text-xs text-slate-500">
          Comprobante interno; no sustituye la factura electrónica.
        </p>
      </div>
    </div>
  );
}
