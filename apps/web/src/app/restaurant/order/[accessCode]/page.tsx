"use client";

import { API_URL } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Order = {
  id: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  table: {
    name: string;
    code: string;
    waiter: { id: string; name: string } | null;
  };
  items: {
    id: string;
    name: string;
    quantity: number;
    price: number;
    status: string;
    course: string;
    station: string;
    fulfillment: "DINE_IN" | "TAKEOUT";
  }[];
  billing: {
    grossSubtotal: number;
    promotionCredit: number;
    subtotal: number;
    tax: number;
    service: number;
    total: number;
    taxIncluded: boolean;
    taxRateBps: number;
    serviceRateBps: number;
    serviceChargeEnabled: boolean;
  };
  invoiceRequestStatus: "NOT_REQUESTED" | "PENDING" | "PROCESSED" | "REJECTED";
};
const labels: Record<string, string> = {
  RECEIVED: "Received",
  ACCEPTED: "Accepted",
  PREPARING: "Being prepared",
  READY: "Ready!",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};
export default function RestaurantOrderPage() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    name: "",
    email: "",
    phone: "",
    taxId: "",
  });
  const [invoiceMessage, setInvoiceMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/restaurant/guest/orders/${encodeURIComponent(accessCode)}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error("Order unavailable. Please ask the staff.");
      const nextOrder: Order = await response.json();
      setOrder(nextOrder);
      const storageKey = `assettrack_restaurant_order_${nextOrder.table.code}`;
      if (nextOrder.status === "OPEN") {
        window.localStorage.setItem(storageKey, accessCode);
      } else if (window.localStorage.getItem(storageKey) === accessCode) {
        window.localStorage.removeItem(storageKey);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update order");
    }
  }, [accessCode]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const allFinished =
    order?.items.length &&
    order.items.every(
      (item) =>
        item.status === "READY" ||
        item.status === "DELIVERED" ||
        item.status === "CANCELLED",
    );
  const delivered =
    allFinished &&
    order?.items.every(
      (item) => item.status === "DELIVERED" || item.status === "CANCELLED",
    );
  const ready =
    allFinished &&
    !delivered &&
    order?.items.some((item) => item.status === "READY");
  const cancelled =
    allFinished && order?.items.every((item) => item.status === "CANCELLED");

  async function requestInvoice(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(
      `${API_URL}/api/v1/restaurant/guest/orders/${encodeURIComponent(accessCode)}/invoice-request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceForm),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "No se pudo registrar la solicitud");
      return;
    }
    setInvoiceMessage(
      "Solicitud registrada. La administración del restaurante preparará la factura electrónica.",
    );
    setInvoiceRequested(false);
    await load();
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-slate-900">
      <p className="font-semibold tracking-widest text-emerald-700">
        ASSETTRACK · RESTAURANT
      </p>
      <h1 className="text-3xl font-bold">Your order · {order?.table.name}</h1>
      {order && (
        <p className="mt-3 rounded-lg bg-sky-50 px-4 py-3 font-semibold text-sky-900">
          {order.table.waiter
            ? `Mesero a cargo: ${order.table.waiter.name}`
            : "Asignando mesero, es un gusto servirle."}
        </p>
      )}
      <p className="my-4 text-slate-600">
        Your order updates automatically while this page is open.
      </p>
      {order && (
        <Link
          href={`/restaurant/table/${encodeURIComponent(order.table.code)}`}
          className="mb-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white"
        >
          <span aria-hidden="true">＋</span>
          Ordenar algo más
        </Link>
      )}
      {error && (
        <p role="alert" className="rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {cancelled ? (
        <p role="status" className="my-5 rounded-xl bg-red-50 p-5 text-red-900">
          Your order was cancelled. Please ask the staff for assistance.
        </p>
      ) : delivered ? (
        <p
          role="status"
          className="my-5 rounded-xl bg-emerald-100 p-5 text-emerald-900"
        >
          Your order has been delivered.
        </p>
      ) : ready ? (
        <p
          role="status"
          className="my-5 rounded-xl bg-emerald-100 p-5 text-xl font-bold text-emerald-900"
        >
          Your order is ready! Please follow staff instructions for collection.
        </p>
      ) : (
        <p role="status" className="my-5 rounded-xl bg-blue-50 p-4">
          Your order is being handled. We will show each item&apos;s progress
          here.
        </p>
      )}
      <div className="space-y-3">
        {order?.items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between rounded border bg-white p-4"
          >
            <span>
              {item.quantity} × {item.name} · ₡
              {(item.price * item.quantity).toLocaleString()}
              {item.fulfillment === "TAKEOUT" ? " · Para llevar" : ""}
            </span>
            <strong>{labels[item.status]}</strong>
          </div>
        ))}
      </div>
      {order && (
        <section className="mt-6 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">Resumen de la cuenta</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal de productos</span>
              <span>₡{order.billing.grossSubtotal.toLocaleString()}</span>
            </div>
            {order.billing.promotionCredit > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Crédito promocional</span>
                <span>− ₡{order.billing.promotionCredit.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Subtotal neto</span>
              <span>₡{order.billing.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>
                IVA {(order.billing.taxRateBps / 100).toLocaleString()}%
                {order.billing.taxIncluded ? " (incluido)" : ""}
              </span>
              <span>₡{order.billing.tax.toLocaleString()}</span>
            </div>
            {order.billing.serviceChargeEnabled && (
              <div className="flex justify-between">
                <span>
                  Servicio{" "}
                  {(order.billing.serviceRateBps / 100).toLocaleString()}%
                </span>
                <span>₡{order.billing.service.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-xl font-bold">
              <span>Total a pagar</span>
              <span>₡{order.billing.total.toLocaleString()}</span>
            </div>
          </div>
        </section>
      )}
      {order && (
        <section className="mt-6 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Factura electrónica</h2>
          {order.invoiceRequestStatus === "NOT_REQUESTED" ? (
            <>
              <p className="mt-2">¿Necesita factura electrónica?</p>
              {!invoiceRequested ? (
                <button
                  className="mt-3 rounded bg-slate-900 px-4 py-2 font-semibold text-white"
                  onClick={() => setInvoiceRequested(true)}
                >
                  Solicitar factura
                </button>
              ) : (
                <form className="mt-4 space-y-3" onSubmit={requestInvoice}>
                  <input
                    required
                    maxLength={120}
                    className="w-full rounded border p-3"
                    placeholder="Nombre completo"
                    value={invoiceForm.name}
                    onChange={(event) =>
                      setInvoiceForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <input
                    required
                    type="email"
                    maxLength={160}
                    className="w-full rounded border p-3"
                    placeholder="Correo electrónico"
                    value={invoiceForm.email}
                    onChange={(event) =>
                      setInvoiceForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                  <input
                    required
                    maxLength={40}
                    className="w-full rounded border p-3"
                    placeholder="Número telefónico"
                    value={invoiceForm.phone}
                    onChange={(event) =>
                      setInvoiceForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                  <input
                    required
                    maxLength={40}
                    className="w-full rounded border p-3"
                    placeholder="Identificación ante Hacienda"
                    value={invoiceForm.taxId}
                    onChange={(event) =>
                      setInvoiceForm((current) => ({
                        ...current,
                        taxId: event.target.value,
                      }))
                    }
                  />
                  <p className="text-sm text-slate-600">
                    Estos datos serán visibles únicamente para la administración
                    del restaurante y se utilizarán para gestionar su factura.
                  </p>
                  <button className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white">
                    Enviar solicitud
                  </button>
                </form>
              )}
            </>
          ) : (
            <p className="mt-2 rounded bg-emerald-50 p-3 text-emerald-800">
              Solicitud de factura: {order.invoiceRequestStatus.toLowerCase()}.
            </p>
          )}
          {invoiceMessage && (
            <p className="mt-3 text-emerald-700">{invoiceMessage}</p>
          )}
        </section>
      )}
      <p className="mt-6 text-sm text-slate-500">
        If you need to change your order, please ask a staff member.
      </p>
    </main>
  );
}
