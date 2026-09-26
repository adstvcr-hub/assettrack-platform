"use client";

import { API_URL } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useGuestAlerts } from "../../_components/use-guest-alerts";

type Order = {
  id: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  closedAt?: string | null;
  restaurant?: string;
  table: {
    name: string;
    code: string;
    kind: "DINING" | "BAR_SEAT" | "TAKEOUT_STATION";
    waiter: { id: string; name: string } | null;
  };
  responsibleStaff?: {
    id: string;
    name: string;
    restaurantRole: "WAITER" | "BAR" | "KITCHEN" | "RESTAURANT_ADMIN";
  } | null;
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
  promotions: Array<{
    id: string;
    title: string;
    creditAmount: number;
    menuItem: {
      id: string;
      name: string;
      price: number;
      productType: string;
    };
  }>;
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
  const [promotionQuantity, setPromotionQuantity] = useState(1);
  const [addingPromotion, setAddingPromotion] = useState(false);
  const [promotionMessage, setPromotionMessage] = useState("");
  const [showExitOptions, setShowExitOptions] = useState(false);
  const [visitEnded, setVisitEnded] = useState(false);
  const [loyaltyForm, setLoyaltyForm] = useState({
    nickname: "",
    email: "",
    marketingOptIn: false,
  });
  const [loyaltyMessage, setLoyaltyMessage] = useState("");
  const guestEventKey = order
    ? `${order.status}:${order.items.map((item) => `${item.id}:${item.status}`).join("|")}`
    : "";
  const guestEventMessage =
    order?.status === "CLOSED"
      ? "Su cuenta ha sido cerrada. Gracias por su visita."
      : order?.items.length &&
          order.items.every(
            (item) =>
              item.status === "DELIVERED" || item.status === "CANCELLED",
          )
        ? "La entrega de su pedido fue confirmada."
        : order?.items.some((item) => item.status === "READY")
          ? "Una parte de su pedido está lista."
          : order?.items.some((item) => item.status === "PREPARING")
            ? "Estamos preparando su pedido."
            : order?.items.some((item) => item.status === "ACCEPTED")
              ? "Su pedido fue aceptado."
              : "Su pedido fue recibido.";
  const guestAlerts = useGuestAlerts(guestEventKey, guestEventMessage);
  const clearStoredAccountReferences = useCallback((accountCode: string) => {
    const prefix = "assettrack_restaurant_order_";
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (
        key?.startsWith(prefix) &&
        window.localStorage.getItem(key) === accountCode
      ) {
        window.localStorage.removeItem(key);
      }
    }
  }, []);
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
      clearStoredAccountReferences(accessCode);
      if (nextOrder.status === "OPEN") {
        window.localStorage.setItem(storageKey, accessCode);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update order");
    }
  }, [accessCode, clearStoredAccountReferences]);
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

  async function addPromotion() {
    const promotion = order?.promotions[0];
    if (!order || !promotion) return;
    setAddingPromotion(true);
    setError("");
    setPromotionMessage("");
    const response = await fetch(
      `${API_URL}/api/v1/restaurant/guest/tables/${encodeURIComponent(order.table.code)}/orders`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          accountAccessCode: accessCode,
          promotionId: promotion.id,
          fulfillment:
            order.table.kind === "TAKEOUT_STATION" ? "TAKEOUT" : "DINE_IN",
          items: [
            {
              menuItemId: promotion.menuItem.id,
              quantity: promotionQuantity,
              fulfillment:
                order.table.kind === "TAKEOUT_STATION" ? "TAKEOUT" : "DINE_IN",
            },
          ],
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setAddingPromotion(false);
    if (!response.ok) {
      setError(body.message ?? "No se pudo agregar la promoción");
      return;
    }
    setPromotionMessage("La promoción fue agregada a su cuenta.");
    await load();
  }

  async function joinLoyalty(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(
      `${API_URL}/api/v1/restaurant/guest/orders/${encodeURIComponent(accessCode)}/loyalty`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loyaltyForm),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "No se pudo completar la afiliación");
      return;
    }
    setLoyaltyMessage(
      `Afiliación confirmada. Nivel ${body.vipTier}; ${body.assettrackPoints} puntos AssetTrack.`,
    );
  }

  function receiptText() {
    if (!order) return "";
    const lines = order.items.map(
      (item) =>
        `${item.quantity} x ${item.name}: ₡${(item.price * item.quantity).toLocaleString()}`,
    );
    return [
      order.restaurant ?? "Restaurante",
      order.table.name,
      ...lines,
      `Subtotal neto: ₡${order.billing.subtotal.toLocaleString()}`,
      `IVA: ₡${order.billing.tax.toLocaleString()}`,
      `Servicio: ₡${order.billing.service.toLocaleString()}`,
      `Total: ₡${order.billing.total.toLocaleString()}`,
    ].join("\n");
  }

  function downloadReceipt() {
    const blob = new Blob([receiptText()], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `comprobante-${accessCode.slice(0, 8)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function emailReceipt() {
    window.location.href = `mailto:?subject=${encodeURIComponent("Comprobante de consumo")}&body=${encodeURIComponent(receiptText())}`;
  }

  function finishVisit() {
    if (order) {
      clearStoredAccountReferences(accessCode);
    }
    setVisitEnded(true);
  }

  if (visitEnded) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center text-slate-900">
        <p className="font-semibold tracking-widest text-emerald-700">
          ASSETTRACK · RESTAURANT
        </p>
        <h1 className="mt-3 text-3xl font-bold">Gracias por su visita</h1>
        <p className="mt-4 text-slate-600">
          La sesión de esta mesa fue retirada de este dispositivo.
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-slate-900">
      <p className="font-semibold tracking-widest text-emerald-700">
        ASSETTRACK · RESTAURANT
      </p>
      <h1 className="text-3xl font-bold">Your order · {order?.table.name}</h1>
      <section className="mt-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-cyan-50 to-violet-50 p-4 text-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-sky-950">Avisos de seguimiento</h2>
            <p className="text-sm text-slate-600">
              Sonidos y vibraciones suaves para mantenerle informado.
            </p>
          </div>
          <button
            className="rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white"
            onClick={
              guestAlerts.settings.enabled
                ? guestAlerts.disable
                : guestAlerts.enableAndTest
            }
          >
            {guestAlerts.settings.enabled
              ? "Apagar alertas"
              : "Activar y probar"}
          </button>
        </div>
        {guestAlerts.settings.enabled && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={guestAlerts.settings.sound}
                onChange={(event) => guestAlerts.setSound(event.target.checked)}
              />
              Sonido
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={guestAlerts.settings.vibration}
                onChange={(event) =>
                  guestAlerts.setVibration(event.target.checked)
                }
              />
              Vibración
            </label>
          </div>
        )}
        {guestAlerts.notice && (
          <p
            role="status"
            className="mt-3 rounded-xl bg-white/80 px-4 py-3 font-semibold text-teal-900 ring-1 ring-teal-200"
          >
            {guestAlerts.notice}
          </p>
        )}
      </section>
      {order && (
        <p className="mt-3 rounded-lg bg-sky-50 px-4 py-3 font-semibold text-sky-900">
          {order.responsibleStaff
            ? `${order.responsibleStaff.restaurantRole === "BAR" ? "Bartender" : "Mesero"} a cargo: ${order.responsibleStaff.name}`
            : order.table.waiter
              ? `Mesero a cargo: ${order.table.waiter.name}`
              : "Asignando mesero, es un gusto servirle."}
        </p>
      )}
      {order?.status === "CLOSED" && (
        <section className="mt-6 rounded-xl border-2 border-emerald-600 bg-emerald-50 p-5">
          <h2 className="text-xl font-bold">
            Afíliate para obtener premios y promociones
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            La afiliación y el permiso para recibir mensajes promocionales son
            decisiones independientes.
          </p>
          <form className="mt-4 space-y-3" onSubmit={joinLoyalty}>
            <input
              required
              maxLength={60}
              className="w-full rounded border bg-white p-3 text-slate-900"
              placeholder="Nombre o nickname (sin apellidos)"
              value={loyaltyForm.nickname}
              onChange={(event) =>
                setLoyaltyForm((current) => ({
                  ...current,
                  nickname: event.target.value,
                }))
              }
            />
            <input
              required
              type="email"
              maxLength={160}
              className="w-full rounded border bg-white p-3 text-slate-900"
              placeholder="Correo electrónico"
              value={loyaltyForm.email}
              onChange={(event) =>
                setLoyaltyForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={loyaltyForm.marketingOptIn}
                onChange={(event) =>
                  setLoyaltyForm((current) => ({
                    ...current,
                    marketingOptIn: event.target.checked,
                  }))
                }
              />
              Deseo recibir mensajes promocionales. Puedo cancelar este permiso
              posteriormente.
            </label>
            <button className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white">
              Afiliarme
            </button>
          </form>
          {loyaltyMessage && (
            <p className="mt-3 font-semibold text-emerald-800">
              {loyaltyMessage}
            </p>
          )}
        </section>
      )}
      {order?.status === "CLOSED" && (
        <section className="mt-6 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Finalizar visita</h2>
          {!showExitOptions ? (
            <button
              className="mt-3 rounded bg-slate-900 px-4 py-2 font-semibold text-white"
              onClick={() => setShowExitOptions(true)}
            >
              Salir
            </button>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <button
                className="rounded bg-indigo-700 px-4 py-3 font-semibold text-white"
                onClick={downloadReceipt}
              >
                Guardar comprobante
              </button>
              <button
                className="rounded bg-sky-700 px-4 py-3 font-semibold text-white"
                onClick={emailReceipt}
              >
                Enviar por correo
              </button>
              <button
                className="rounded bg-slate-700 px-4 py-3 font-semibold text-white"
                onClick={finishVisit}
              >
                Salir sin guardar
              </button>
            </div>
          )}
        </section>
      )}
      {order?.promotions[0] && (
        <section className="mb-6 rounded-2xl bg-fuchsia-700 p-5 text-white shadow-lg ring-4 ring-fuchsia-200">
          <p className="text-sm font-black uppercase tracking-widest">
            Promoción vigente
          </p>
          <h2 className="mt-1 text-2xl font-black">
            {order.promotions[0].title}
          </h2>
          <p className="text-lg">{order.promotions[0].menuItem.name}</p>
          <p className="font-semibold">
            Crédito de hasta ₡
            {order.promotions[0].creditAmount.toLocaleString()}.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="font-semibold">
              Cantidad{" "}
              <select
                className="rounded bg-white px-3 py-2 text-slate-950"
                value={promotionQuantity}
                onChange={(event) =>
                  setPromotionQuantity(Number(event.target.value))
                }
              >
                {Array.from({ length: 10 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={addingPromotion || order.status !== "OPEN"}
              onClick={() => void addPromotion()}
              className="rounded-lg bg-white px-5 py-3 font-black text-fuchsia-800 disabled:opacity-50"
            >
              {addingPromotion ? "Agregando…" : "Agregar a mi cuenta"}
            </button>
          </div>
          {promotionMessage && (
            <p className="mt-3 rounded bg-white/20 p-2 font-semibold">
              {promotionMessage}
            </p>
          )}
        </section>
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
              <span
                className={`ml-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${
                  item.fulfillment === "TAKEOUT"
                    ? "bg-fuchsia-100 text-fuchsia-900"
                    : "bg-sky-100 text-sky-900"
                }`}
              >
                {item.fulfillment === "TAKEOUT"
                  ? "PARA LLEVAR"
                  : "CONSUMO EN EL LOCAL"}
              </span>
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
