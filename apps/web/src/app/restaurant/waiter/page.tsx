"use client";

import { getSessionValue } from "@/lib/session";


import { StaffAccountDetail } from "../_components/staff-account-detail";
import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RestaurantSessionActions } from "../_components/restaurant-session-actions";
import { useOperationalAlerts } from "../_components/use-operational-alerts";
import {
  StaffOrderCorrection,
  type StaffCorrection,
} from "../_components/staff-order-correction";

type Item = {
  id: string;
  name: string;
  quantity: number;
  station: "KITCHEN" | "BAR";
  status: string;
  fulfillment: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  handedOffAt?: string | null;
  serviceAction?: boolean;
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
  table: { name: string; kind?: "DINING" | "BAR_SEAT" | "TAKEOUT_STATION" };
  responsibleStaff?: {
    id: string;
    name: string;
    restaurantRole: string;
  } | null;
  canClose: boolean;
  canHandoffDelivery: boolean;
  occupiesTable: boolean;
  deliveryPhone?: string | null;
  deliveryAddress?: string | null;
  paymentStatus: "NOT_REQUIRED" | "PENDING" | "CONFIRMED" | "REJECTED";
  correctionRequest?: {
    orderId: string;
    requestedAt: string;
    note?: string | null;
  } | null;
  staffCorrection?: StaffCorrection | null;
  transferDestinations: Array<{
    id: string;
    name: string;
    kind: "DINING" | "BAR_SEAT" | "TAKEOUT_STATION";
    serviceChargeEnabled: boolean;
    activeAccountCount: number;
  }>;
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
    fulfillment: "DINE_IN" | "TAKEOUT" | "DELIVERY";
    handedOffAt?: string | null;
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
    if (!getSessionValue("assettrack_token")) {
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
    if (item.fulfillment === "DELIVERY") return;
    const next = item.fulfillment === "TAKEOUT" ? "DINE_IN" : "TAKEOUT";
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

  async function acknowledgeCorrectionRequest(orderId: string) {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/orders/${orderId}/correction-request/acknowledge`,
      { method: "PATCH" },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "No se pudo cerrar la solicitud de corrección");
      return;
    }
    await load();
  }

  async function updatePayment(
    visitId: string,
    status: "CONFIRMED" | "REJECTED",
  ) {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/visits/${visitId}/payment`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "No se pudo actualizar el pago");
      return;
    }
    await load();
  }

  async function handoffDelivery(visitId: string) {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/visits/${visitId}/delivery-handoff`,
      { method: "PATCH" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "No se pudo cerrar la entrega");
      return;
    }
    await load();
  }

  async function transferVisit(visit: Visit, destinationId: string) {
    const destination = visit.transferDestinations.find(
      (item) => item.id === destinationId,
    );
    if (!destination) return;
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/visits/${visit.id}/transfer`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationTableId: destination.id }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "No se pudo trasladar la cuenta");
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
    const reason =
      availabilityChoice === "AVAILABLE"
        ? undefined
        : `${labels[availabilityChoice]}${
            availabilityDetails.trim() ? `: ${availabilityDetails.trim()}` : ""
          }`;
    let location:
      | {
          latitude: number;
          longitude: number;
          locationAccuracy: number;
        }
      | undefined;
    if (availabilityChoice === "AVAILABLE") {
      try {
        location = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(
              new Error("Este dispositivo no permite verificar la ubicación."),
            );
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                locationAccuracy: position.coords.accuracy,
              }),
            () =>
              reject(
                new Error(
                  "Debe permitir la ubicación para activar su puesto de trabajo.",
                ),
              ),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
          );
        });
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "No fue posible verificar su ubicación.",
        );
        return;
      }
    }
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
          ...location,
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
    .filter((item) => ["RECEIVED", "ACCEPTED", "PREPARING", "READY"].includes(item.status)).length;
  const alerts = useOperationalAlerts(
    "waiter",
    [
      ...orders.flatMap((order) =>
        order.items
          .filter((item) => ["RECEIVED", "ACCEPTED", "PREPARING", "READY"].includes(item.status))
          .map((item) => item.id),
      ),
      ...visits
        .filter((visit) => Boolean(visit.correctionRequest))
        .map((visit) => `correction-${visit.correctionRequest!.orderId}-${visit.correctionRequest!.requestedAt}`),
      ...visits
        .filter(
          (visit) => !visit.occupiesTable && visit.paymentStatus === "PENDING",
        )
        .map((visit) => `payment-${visit.id}`),
    ],
    { maxAttempts: null },
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header
        className={`px-5 py-5 text-white transition-colors ${alerts.flash ? "bg-red-600" : "bg-slate-950"}`}
      >
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
              {readyCount} pendientes
            </span>
            <RestaurantSessionActions />
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl space-y-5 p-5">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${alerts.flash ? "border-red-500 bg-yellow-200 ring-4 ring-red-300" : "bg-white"}`}
        >
          <p className="font-bold">
            Alertas de entregas: {alerts.enabled ? "activadas" : "desactivadas"}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded bg-sky-700 px-4 py-2 font-bold text-white"
              onClick={alerts.enableAndTest}
            >
              {alerts.enabled ? "Probar alerta" : "Activar y probar"}
            </button>
            {alerts.enabled && (
              <button
                className="rounded border px-4 py-2"
                onClick={alerts.disable}
              >
                Desactivar
              </button>
            )}
          </div>
        </div>
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
                  {visit.correctionRequest && (
                    <div
                      role="alert"
                      className="mb-4 animate-pulse rounded-xl border-2 border-amber-500 bg-amber-100 p-4 text-amber-950"
                    >
                      <p className="text-lg font-black">
                        El cliente solicita corregir su pedido
                      </p>
                      <p>{visit.correctionRequest.note}</p>
                      <p className="mt-1 text-sm font-semibold">
                        Solicitud recibida a las{" "}
                        {new Date(
                          visit.correctionRequest.requestedAt,
                        ).toLocaleTimeString()}
                      </p>
                      <button
                        type="button"
                        className="mt-3 rounded-lg bg-amber-800 px-4 py-2 font-bold text-white"
                        onClick={() =>
                          void acknowledgeCorrectionRequest(
                            visit.correctionRequest!.orderId,
                          )
                        }
                      >
                        Marcar solicitud como atendida
                      </button>
                    </div>
                  )}
                  <StaffOrderCorrection
                    correction={visit.staffCorrection}
                    requestedAt={visit.correctionRequest?.requestedAt}
                    onSaved={load}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{visit.table.name}</p>
                      <p className="text-sm text-slate-600">
                        Responsable: {visit.responsibleStaff?.name ?? staffName}
                      </p>
                      <p>
                        Total acumulado: ₡{visit.billing.total.toLocaleString()}
                      </p>
                      {!visit.occupiesTable && (
                        <div className="mt-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-950">
                          <p className="font-black">ENTREGA A DOMICILIO</p>
                          <p>Teléfono: {visit.deliveryPhone}</p>
                          <p>Dirección: {visit.deliveryAddress}</p>
                          <p>
                            Pago:{" "}
                            {visit.paymentStatus === "PENDING"
                              ? "pendiente"
                              : visit.paymentStatus === "CONFIRMED"
                                ? "confirmado"
                                : "rechazado"}
                          </p>
                        </div>
                      )}
                    </div>
                    {visit.occupiesTable ? (
                      <button
                        disabled={!visit.canClose}
                        className="rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => void closeVisit(visit.id)}
                      >
                        {visit.canClose
                          ? "Cerrar cuenta"
                          : "Pedidos pendientes"}
                      </button>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {visit.paymentStatus !== "CONFIRMED" && (
                          <button
                            className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white"
                            onClick={() =>
                              void updatePayment(visit.id, "CONFIRMED")
                            }
                          >
                            Contacto validado y pago confirmado
                          </button>
                        )}
                        {visit.paymentStatus !== "REJECTED" &&
                          visit.paymentStatus !== "CONFIRMED" && (
                            <button
                              className="rounded-lg border border-red-600 px-4 py-3 font-semibold text-red-700"
                              onClick={() =>
                                void updatePayment(visit.id, "REJECTED")
                              }
                            >
                              Rechazar pago
                            </button>
                          )}
                        <button
                          disabled={!visit.canHandoffDelivery}
                          className="rounded-lg bg-violet-800 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => void handoffDelivery(visit.id)}
                        >
                          {visit.canHandoffDelivery
                            ? "Entregar a repartidor y cerrar"
                            : "Entrega pendiente"}
                        </button>
                      </div>
                    )}
                  </div>
                  {visit.occupiesTable && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      <label className="text-sm font-semibold">
                        Trasladar cliente y cuenta
                        <select
                          className="mt-1 w-full rounded border bg-white p-2"
                          defaultValue=""
                          onChange={(event) => {
                            const value = event.target.value;
                            event.target.value = "";
                            if (value) void transferVisit(visit, value);
                          }}
                        >
                          <option value="">Seleccione la nueva posición</option>
                          {visit.transferDestinations.map((destination) => (
                            <option key={destination.id} value={destination.id}>
                              {destination.name} ·{" "}
                              {destination.kind === "BAR_SEAT"
                                ? "Bar, sin servicio"
                                : destination.kind === "DINING"
                                  ? "Mesa"
                                  : "Para llevar"}
                              {destination.activeAccountCount
                                ? ` · ${destination.activeAccountCount} cuenta(s)`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  <StaffAccountDetail visit={visit} />
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
                        item.fulfillment === "DELIVERY"
                          ? "bg-violet-100 text-violet-900 ring-2 ring-violet-300"
                          : item.fulfillment === "TAKEOUT"
                            ? "bg-fuchsia-100 text-fuchsia-900 ring-2 ring-fuchsia-300"
                            : "bg-sky-100 text-sky-900 ring-2 ring-sky-300"
                      }`}
                    >
                      {item.fulfillment === "DELIVERY"
                        ? "ENTREGA A DOMICILIO"
                        : item.fulfillment === "TAKEOUT"
                          ? "PARA LLEVAR"
                          : "CONSUMO EN EL LOCAL"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.fulfillment !== "DELIVERY" && (
                      <button
                        className="rounded border px-3 py-2 text-sm"
                        onClick={() => void correctFulfillment(item)}
                      >
                        Corregir modalidad
                      </button>
                    )}
                    {["RECEIVED", "ACCEPTED", "PREPARING", "READY"].includes(item.status) && (
                      <button
                        className="rounded-lg bg-sky-700 px-5 py-3 font-bold text-white"
                        onClick={() => void deliver(item.id)}
                      >
                        Confirmar entregado
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
