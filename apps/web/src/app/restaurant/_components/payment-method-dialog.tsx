"use client";

import { FormEvent, useEffect, useState } from "react";

export type RestaurantPaymentDetails = {
  paymentMethod: "CASH" | "SINPE" | "CARD" | "OTHER";
  paymentReference?: string;
};

export function PaymentMethodDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (payment: RestaurantPaymentDetails) => void | Promise<void>;
}) {
  const [paymentMethod, setPaymentMethod] = useState<
    RestaurantPaymentDetails["paymentMethod"]
  >("CASH");
  const [paymentReference, setPaymentReference] = useState("");

  useEffect(() => {
    if (!open) return;
    setPaymentMethod("CASH");
    setPaymentReference("");
  }, [open]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    void onConfirm({
      paymentMethod,
      paymentReference: paymentReference.trim() || undefined,
    });
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
        className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-950 shadow-2xl"
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
            onChange={(event) =>
              setPaymentMethod(
                event.target.value as RestaurantPaymentDetails["paymentMethod"],
              )
            }
            className="mt-2 w-full rounded-lg border p-3"
          >
            <option value="CASH">Efectivo</option>
            <option value="SINPE">SINPE</option>
            <option value="CARD">Tarjeta</option>
            <option value="OTHER">Otro</option>
          </select>
        </label>
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
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-5 py-3 font-bold"
          >
            Cancelar
          </button>
          <button className="rounded-lg bg-emerald-800 px-5 py-3 font-black text-white">
            Confirmar cierre
          </button>
        </div>
      </form>
    </div>
  );
}
