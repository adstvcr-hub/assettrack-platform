"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RestaurantSessionActions } from "../_components/restaurant-session-actions";

type Item = {
  id: string;
  name: string;
  quantity: number;
  station: "KITCHEN" | "BAR";
  status: string;
  fulfillment: "DINE_IN" | "TAKEOUT";
};
type Order = {
  id: string;
  createdAt: string;
  table: { id: string; name: string };
  items: Item[];
  isDelayed: boolean;
};
type Visit = {
  id: string;
  table: { name: string };
  canClose: boolean;
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
  items: Array<{
    id: string;
    orderId: string;
    orderCreatedAt: string;
    name: string;
    quantity: number;
    price: number;
    status: string;
    fulfillment: "DINE_IN" | "TAKEOUT";
  }>;
};

const statusLabel: Record<string, string> = {
  RECEIVED: "Recibido",
  ACCEPTED: "Aceptado",
  PREPARING: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

export default function WaiterPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState("AVAILABLE");
  const [availabilityChoice, setAvailabilityChoice] = useState("AVAILABLE");
  const [availabilityDetails, setAvailabilityDetails] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [staffName, setStaffName] = useState("");
  const profileInitialized = useRef(false);

  const load = useCallback(async () => {
    const [profileResponse, response, visitsResponse] = await Promise.all([
      authenticatedFetch(`${API_URL}/api/v1/restaurant/profile`),
      authenticatedFetch(`${API_URL}/api/v1/restaurant/orders`),
      authenticatedFetch(`${API_URL}/api/v1/restaurant/visits`),
    ]);
    if (
      profileResponse.status === 401 ||
      response.status === 401 ||
      visitsResponse.status === 401
    ) {
      router.replace("/?next=/restaurant/waiter");
      return;
    }
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      if (profile.restaurantRole !== "WAITER") {
        router.replace("/restaurant/staff");
        return;
      }
      setAvailability(profile.restaurantAvailability);
      setStaffName(profile.name);
      if (!profileInitialized.current) {
        setAvailabilityChoice(profile.restaurantAvailability);
        profileInitialized.current = true;
      }
    }
    if (response.status === 403 || visitsResponse.status === 403) {
      router.replace("/restaurant/staff");
      return;
    }
    if (!response.ok || !visitsResponse.ok) {
      setError("No se pudieron cargar las mesas asignadas");
      return;
    }
    const data: Order[] = await response.json();
    setOrders(data.filter((order) => order.items.length > 0));
    setVisits(await visitsResponse.json());
    setError("");
  }, [router]);

  useEffect(() => {
    if (!sessionStorage.getItem("assettrack_token")) {
      router.replace("/?next=/restaurant/waiter");
      return;
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load, router]);

  async function deliver(itemId: string) {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/items/${itemId}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DELIVERED" }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "No se pudo confirmar la entrega");
      return;
    }
    await load();
  }

  async function correctFulfillment(item: Item) {
    const next = item.fulfillment === "TAKEOUT" ? "DINE_IN" : "TAKEOUT";
    if (
      !window.confirm(
        `¿Cambiar a ${next === "TAKEOUT" ? "PARA LLEVAR" : "CONSUMO EN EL LOCAL"}?`,
      )
    )
      return;
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/items/${item.id}/fulfillment`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfillment: next }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "No se pudo corregir la modalidad");
      return;
    }
    await load();
  }

  async function closeVisit(visitId: string) {
    if (
      !window.confirm("¿Confirma que la cuenta fue atendida y puede cerrarse?")
    ) {
      return;
    }
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/visits/${visitId}/close`,
      { method: "PATCH" },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "No se pudo cerrar la cuenta");
      return;
    }
    await load();
  }

  async function updateAvailability() {
    const labels: Record<string, string> = {
      BREAK: "Descanso programado",
      OFF_SHIFT: "Turno finalizado",
      TEMPORARILY_UNAVAILABLE: "Fuera de servicio temporal",
    };
    if (
      availabilityChoice === "TEMPORARILY_UNAVAILABLE" &&
      !availabilityDetails.trim()
    ) {
      setError("Explique por qué quedará temporalmente fuera de servicio");
      return;
    }
    if (
      availabilityChoice !== "AVAILABLE" &&
      !window.confirm(
        "Tus mesas activas serán reasignadas automáticamente. ¿Deseas continuar?",
      )
    ) {
      return;
    }
    const reason =
      availabilityChoice === "AVAILABLE"
        ? undefined
        : `${labels[availabilityChoice]}${
            availabilityDetails.trim() ? `: ${availabilityDetails.trim()}` : ""
          }`;
    setSavingAvailability(true);
    setError("");
    setAvailabilityMessage("");
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/staff/availability`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability: availabilityChoice,
          reason,
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setSavingAvailability(false);
    if (!response.ok) {
      setError(body.message ?? "No se pudo cambiar la disponibilidad");
      return;
    }
    setAvailability(body.staff.restaurantAvailability);
    setAvailabilityChoice(body.staff.restaurantAvailability);
    setAvailabilityDetails("");
    if (body.unassignedTables.length > 0) {
      setAvailabilityMessage(
        `${body.unassignedTables.length} mesa(s) quedaron sin mesero disponible. Se requiere intervención administrativa.`,
      );
    } else if (body.reassignments.length > 0) {
      setAvailabilityMessage(
        `${body.reassignments.length} mesa(s) fueron reasignadas automáticamente.`,
      );
    } else {
      setAvailabilityMessage("Disponibilidad actualizada correctamente.");
    }
    await load();
  }

  const readyCount = orders
    .flatMap((order) => order.items)
    .filter((item) => item.status === "READY").length;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="bg-slate-950 px-5 py-5 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-sky-400">
              ASSETTRACK · RESTAURANTE
            </p>
            <h1 className="text-3xl font-bold">
              Mesero{staffName ? ` — ${staffName}` : ""}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-amber-400 px-4 py-2 font-bold text-slate-950">
              {readyCount} listos
            </span>
            <RestaurantSessionActions />
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl space-y-5 p-5">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 font-semibold">
              Mi disponibilidad
              <select
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900"
                value={availabilityChoice}
                onChange={(event) => setAvailabilityChoice(event.target.value)}
              >
                <option value="AVAILABLE">Disponible</option>
                <option value="BREAK">Descanso programado</option>
                <option value="OFF_SHIFT">Turno finalizado</option>
                <option value="TEMPORARILY_UNAVAILABLE">
                  Fuera de servicio temporal
                </option>
              </select>
            </label>
            {availabilityChoice !== "AVAILABLE" && (
              <label className="min-w-64 flex-[2] font-semibold">
                Explicación
                <input
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                  value={availabilityDetails}
                  onChange={(event) =>
                    setAvailabilityDetails(event.target.value)
                  }
                  placeholder="Información adicional para administración"
                  maxLength={180}
                />
              </label>
            )}
            <button
              className="rounded-lg bg-sky-700 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                savingAvailability || availabilityChoice === availability
              }
              onClick={() => void updateAvailability()}
            >
              {savingAvailability ? "Guardando…" : "Actualizar estado"}
            </button>
          </div>
          {availabilityMessage && (
            <p className="mt-3 rounded-lg bg-sky-50 p-3 text-sky-900">
              {availabilityMessage}
            </p>
          )}
        </div>
        {visits.length > 0 && (
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Cuentas activas</h2>
            <div className="mt-3 space-y-3">
              {visits.map((visit) => (
                <div key={visit.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{visit.table.name}</p>
                      <p>
                        Total acumulado: ₡{visit.billing.total.toLocaleString()}
                      </p>
                    </div>
                    <button
                      disabled={!visit.canClose}
                      className="rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => void closeVisit(visit.id)}
                    >
                      {visit.canClose ? "Cerrar cuenta" : "Pedidos pendientes"}
                    </button>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b bg-slate-50">
                        <tr>
                          <th className="p-2">Hora</th>
                          <th className="p-2">Consumo</th>
                          <th className="p-2">Cantidad</th>
                          <th className="p-2">Importe</th>
                          <th className="p-2">Estado</th>
                          <th className="p-2">Modalidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visit.items.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="p-2 whitespace-nowrap">
                              {new Date(
                                item.orderCreatedAt,
                              ).toLocaleTimeString()}
                            </td>
                            <td className="p-2 font-medium">{item.name}</td>
                            <td className="p-2">{item.quantity}</td>
                            <td className="p-2 whitespace-nowrap">
                              ₡{(item.price * item.quantity).toLocaleString()}
                            </td>
                            <td className="p-2">
                              {statusLabel[item.status] ?? item.status}
                            </td>
                            <td className="p-2">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-sm font-black ${
                                  item.fulfillment === "TAKEOUT"
                                    ? "bg-fuchsia-100 text-fuchsia-900 ring-1 ring-fuchsia-300"
                                    : "bg-sky-100 text-sky-900 ring-1 ring-sky-300"
                                }`}
                              >
                                {item.fulfillment === "TAKEOUT"
                                  ? "PARA LLEVAR"
                                  : "CONSUMO EN EL LOCAL"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="mt-4 ml-auto grid max-w-md grid-cols-2 gap-x-5 gap-y-1 rounded-lg bg-slate-50 p-4 text-sm">
                    <dt>Subtotal de productos</dt>
                    <dd className="text-right">
                      ₡{visit.billing.grossSubtotal.toLocaleString()}
                    </dd>
                    {visit.billing.promotionCredit > 0 && (
                      <>
                        <dt className="text-emerald-700">
                          Crédito promocional
                        </dt>
                        <dd className="text-right text-emerald-700">
                          − ₡{visit.billing.promotionCredit.toLocaleString()}
                        </dd>
                      </>
                    )}
                    <dt>Subtotal neto</dt>
                    <dd className="text-right">
                      ₡{visit.billing.subtotal.toLocaleString()}
                    </dd>
                    <dt>
                      IVA {visit.billing.taxRateBps / 100}%
                      {visit.billing.taxIncluded ? " (incluido)" : ""}
                    </dt>
                    <dd className="text-right">
                      ₡{visit.billing.tax.toLocaleString()}
                    </dd>
                    {visit.billing.serviceChargeEnabled && (
                      <>
                        <dt>Servicio {visit.billing.serviceRateBps / 100}%</dt>
                        <dd className="text-right">
                          ₡{visit.billing.service.toLocaleString()}
                        </dd>
                      </>
                    )}
                    <dt className="border-t pt-2 text-base font-black">
                      Total a pagar
                    </dt>
                    <dd className="border-t pt-2 text-right text-base font-black">
                      ₡{visit.billing.total.toLocaleString()}
                    </dd>
                  </dl>
                </div>
              ))}
            </div>
          </section>
        )}
        {error && (
          <p className="rounded-lg bg-red-100 p-4 text-red-800">{error}</p>
        )}
        {orders.length === 0 && (
          <p className="rounded-xl border bg-white p-8 text-center text-lg">
            No hay pedidos abiertos en tus mesas asignadas.
          </p>
        )}
        {orders.map((order) => (
          <article
            key={order.id}
            className={`rounded-xl border bg-white p-5 shadow-sm ${order.isDelayed ? "border-red-500 ring-2 ring-red-200" : ""}`}
          >
            {order.isDelayed && (
              <p className="mb-3 rounded bg-red-100 p-3 font-bold text-red-900">
                Esta orden superó el umbral interno. Informe personalmente al
                cliente y coordine con la estación responsable.
              </p>
            )}
            <h2 className="text-2xl font-bold">{order.table.name}</h2>
            <p className="mb-4 text-sm text-slate-600">
              Pedido recibido a las{" "}
              {new Date(order.createdAt).toLocaleTimeString()}
            </p>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
                    item.status === "READY"
                      ? "border-amber-400 bg-amber-50"
                      : ""
                  }`}
                >
                  <div>
                    <strong>
                      {item.quantity} × {item.name}
                    </strong>
                    <p className="text-sm text-slate-600">
                      {item.station === "KITCHEN" ? "Cocina" : "Bar"} ·{" "}
                      {statusLabel[item.status] ?? item.status}
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-4 py-2 text-base font-black ${
                        item.fulfillment === "TAKEOUT"
                          ? "bg-fuchsia-100 text-fuchsia-900 ring-2 ring-fuchsia-300"
                          : "bg-sky-100 text-sky-900 ring-2 ring-sky-300"
                      }`}
                    >
                      {item.fulfillment === "TAKEOUT"
                        ? "PARA LLEVAR"
                        : "CONSUMO EN EL LOCAL"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded border px-3 py-2 text-sm"
                      onClick={() => void correctFulfillment(item)}
                    >
                      Corregir modalidad
                    </button>
                    {item.status === "READY" && (
                      <button
                        className="rounded-lg bg-sky-700 px-5 py-3 font-bold text-white"
                        onClick={() => void deliver(item.id)}
                      >
                        Confirmar entrega
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
