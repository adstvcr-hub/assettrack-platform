"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import {
  closedRestaurantReceiptRawBtHref,
  type ClosedRestaurantReceipt,
} from "@/lib/restaurant-receipt";
import { useEffect, useState } from "react";

/** Returns only a previously closed account authorized for this operator. */
export async function fetchClosedRestaurantReceipt(
  visitId: string,
): Promise<ClosedRestaurantReceipt> {
  const response = await authenticatedFetch(
    `${API_URL}/api/v1/restaurant/visits/${encodeURIComponent(visitId)}/receipt`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error("No se pudo recuperar el recibo cerrado");
  const receipt = (await response.json()) as ClosedRestaurantReceipt;
  if (receipt.status !== "CLOSED") {
    throw new Error("La cuenta todavía no está cerrada");
  }
  return receipt;
}

export function ClosedReceiptDialog({
  visitId,
  onDismiss,
}: {
  visitId: string | null;
  onDismiss: () => void;
}) {
  const [ready, setReady] = useState<{
    receipt: ClosedRestaurantReceipt;
    href: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!visitId) return;
    let active = true;
    setReady(null);
    setError("");
    setAttempted(false);

    async function loadReceipt(id: string) {
      try {
        const receipt = await fetchClosedRestaurantReceipt(id);
        const href = closedRestaurantReceiptRawBtHref(receipt);
        if (active) setReady({ receipt, href });
      } catch {
        if (active) {
          setError(
            "El cierre quedó registrado, pero no se pudo cargar el recibo. Puedes reintentar sin volver a cobrar.",
          );
        }
      }
    }

    void loadReceipt(visitId);
    return () => {
      active = false;
    };
  }, [visitId, retry]);

  if (!visitId) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recibo de cuenta cerrada"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 text-slate-950 shadow-xl">
        <h2 className="text-2xl font-black">Cuenta cerrada</h2>
        {!ready && !error && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            Cargando recibo para imprimir…
          </p>
        )}
        {error && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950">
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-3 rounded-lg border px-4 py-3 font-bold"
            >
              Volver a cargar recibo
            </button>
          </div>
        )}
        {ready && (
          <>
            <p className="mt-2 break-all text-sm">
              Recibo: {ready.receipt.receiptNumber}
            </p>
            <p className="mt-2 text-lg font-bold">
              Total: ₡{ready.receipt.billing.total.toLocaleString("es-CR")}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              El cierre quedó registrado. Para imprimir en este equipo Android,
              abra RawBT y confirme la impresión en la impresora USB
              configurada.
            </p>
            <a
              href={ready.href}
              onClick={() => setAttempted(true)}
              className="mt-5 block rounded-lg bg-emerald-700 px-5 py-4 text-center font-black text-white"
            >
              {attempted ? "Volver a enviar a RawBT" : "Imprimir recibo"}
            </a>
            {attempted && (
              <p className="mt-2 text-sm text-amber-900">
                Confirme IMPRIMIR en RawBT. Enviar de nuevo podría generar otra
                copia.
              </p>
            )}
          </>
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
