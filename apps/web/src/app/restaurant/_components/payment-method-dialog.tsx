"use client";

import { FormEvent, useEffect, useState } from "react";
import { isReceiptPrinterEnabled } from "@/lib/restaurant-printer-settings";
import { API_URL, authenticatedFetch } from "@/lib/api";
import {
  isRegularRestaurantPaymentMethod,
  regularRestaurantPaymentOptions,
  tilopayPreparationMessage,
  type RegularRestaurantPaymentMethod,
} from "@/lib/restaurant-payment-options";

export type RestaurantPaymentDetails = {
  paymentMethod: RegularRestaurantPaymentMethod;
  paymentReference?: string;
};

export function PaymentMethodDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (
    payment: RestaurantPaymentDetails,
    printReceipt: boolean,
  ) => void | Promise<void>;
}) {
  const [paymentMethod, setPaymentMethod] =
    useState<RestaurantPaymentDetails["paymentMethod"]>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [printReceipt, setPrintReceipt] = useState(false);
  const [tilopayMessage, setTilopayMessage] = useState(
    "Tilopay está pendiente de activación. Puede cobrar con los métodos regulares.",
  );

  useEffect(() => {
    if (!open) return;
    setPaymentMethod("CASH");
    setPaymentReference("");
    setPrintReceipt(isReceiptPrinterEnabled());
    setTilopayMessage(
      "Tilopay está pendiente de activación. Puede cobrar con los métodos regulares.",
    );
    const controller = new AbortController();
    void authenticatedFetch(`${API_URL}/api/v1/restaurant/payment-options`, {
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (!controller.signal.aborted)
          setTilopayMessage(tilopayPreparationMessage(body));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setTilopayMessage(tilopayPreparationMessage(null));
      });
    return () => controller.abort();
  }, [open]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    void onConfirm(
      {
        paymentMethod,
        paymentReference: paymentReference.trim() || undefined,
      },
      printReceipt,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-method-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
    >
      <form
        onSubmit={submit}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-slate-950 shadow-2xl"
      >
        <h2 id="payment-method-title" className="text-2xl font-black">
          Registrar cobro y cerrar cuenta
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          El método seleccionado quedará incluido en el cierre de caja.
        </p>
        <label className="mt-5 block font-semibold">
          Método de cobro
          <select
            value={paymentMethod}
            onChange={(event) => {
              if (isRegularRestaurantPaymentMethod(event.target.value)) {
                setPaymentMethod(event.target.value);
              }
            }}
            className="mt-2 w-full rounded-lg border p-3"
          >
            <optgroup label="Pagos regulares">
              {regularRestaurantPaymentOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Pago por plataforma">
              <option value="TILOPAY" disabled>
                Tilopay — pendiente de activación
              </option>
            </optgroup>
          </select>
        </label>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-bold">Pagos por Tilopay</p>
          <p role="status" className="mt-1 text-slate-600">
            {tilopayMessage}
          </p>
        </div>
        {paymentMethod !== "CASH" && (
          <label className="mt-4 block font-semibold">
            Referencia del cobro
            <input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              maxLength={120}
              className="mt-2 w-full rounded-lg border p-3"
              placeholder="Opcional"
            />
          </label>
        )}
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <input
            type="checkbox"
            checked={printReceipt}
            onChange={(event) => setPrintReceipt(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-emerald-800"
          />
          <span>
            <span className="block font-bold">Imprimir recibo al cerrar</span>
            <span className="mt-1 block text-sm text-slate-600">
              Después de confirmar el pago podrás enviar el recibo a RawBT en
              este equipo.
            </span>
          </span>
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-5 py-3 font-bold"
          >
            Cancelar
          </button>
          <button className="rounded-lg bg-emerald-800 px-5 py-3 font-black text-white">
            {printReceipt ? "Confirmar cierre e imprimir" : "Confirmar cierre"}
          </button>
        </div>
      </form>
    </div>
  );
}
