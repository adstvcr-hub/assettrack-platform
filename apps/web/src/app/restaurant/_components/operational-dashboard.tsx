"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RestaurantSessionActions } from "./restaurant-session-actions";
import { useOperationalAlerts } from "./use-operational-alerts";

type Station = "KITCHEN" | "BAR";
type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  station: Station;
  course: string;
  status: string;
  fulfillment: "DINE_IN" | "TAKEOUT";
  handedOffAt?: string | null;
  serviceAction?: boolean;
};
type Order = {
  id: string;
  createdAt: string;
  table: { name: string };
  items: OrderItem[];
  isDelayed: boolean;
  thresholdMinutes?: number | null;
};
type Visit = {
  id: string;
  table: { name: string };
  canClose: boolean;
  billing: { total: number };
  transferDestinations: Array<{
    id: string;
    name: string;
    kind: "DINING" | "BAR_SEAT" | "TAKEOUT_STATION";
    activeAccountCount: number;
  }>;
};

const nextStatus: Record<string, string | null> = {
  RECEIVED: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: null,
};

const labels: Record<string, string> = {
  RECEIVED: "Recibido",
  ACCEPTED: "Aceptado",
  PREPARING: "En preparación",
  READY: "Listo para entregar",
};

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function OperationalDashboard({ station }: { station: Station }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const [profileResponse, response, visitsResponse] = await Promise.all([
      authenticatedFetch(`${API_URL}/api/v1/restaurant/profile`),
      authenticatedFetch(`${API_URL}/api/v1/restaurant/orders`),
      station === "BAR"
        ? authenticatedFetch(`${API_URL}/api/v1/restaurant/visits`)
        : Promise.resolve(null),
    ]);
    if (
      profileResponse.status === 401 ||
      response.status === 401 ||
      visitsResponse?.status === 401
    ) {
      router.replace(`/?next=/restaurant/${station.toLowerCase()}`);
      return;
    }
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      if (profile.restaurantRole !== station) {
        router.replace("/restaurant/staff");
        return;
      }
    }
    if (response.status === 403) {
      router.replace("/restaurant/staff");
      return;
    }
    if (!response.ok) {
      setError("No se pudo cargar la cola de trabajo");
      return;
    }
    setOrders(await response.json());
    if (visitsResponse?.ok) setVisits(await visitsResponse.json());
    setError("");
  }, [router, station]);

  useEffect(() => {
    if (!sessionStorage.getItem("assettrack_token")) {
      router.replace(`/?next=/restaurant/${station.toLowerCase()}`);
      return;
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load, router, station]);

  useEffect(() => {
    if (station !== "KITCHEN") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [station]);

  async function advance(item: OrderItem) {
    const status = nextStatus[item.status];
    if (!status) return;
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/items/${item.id}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "No se pudo actualizar el pedido");
      return;
    }
    await load();
  }

  async function handoff(itemId: string) {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/items/${itemId}/handoff`,
      { method: "PATCH" },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "No se pudo confirmar la recepción");
      return;
    }
    await load();
  }

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

  async function closeVisit(visitId: string) {
    if (!window.confirm("¿Confirma el cierre de esta cuenta?")) return;
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

  async function transferVisit(visitId: string, destinationTableId: string) {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/visits/${visitId}/transfer`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationTableId }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? "No se pudo trasladar la cuenta");
      return;
    }
    await load();
  }

  const items = orders.flatMap((order) =>
    order.items
      .filter((item) => item.station === station || Boolean(item.serviceAction))
      .map((item) => ({ order, item })),
  );
  const alerts = useOperationalAlerts(
    station.toLowerCase(),
    items
      .filter(
        ({ item }) =>
          (item.station === station && item.status === "RECEIVED") ||
          (item.serviceAction && item.status === "READY" && !item.handedOffAt),
      )
      .map(({ item }) => item.id),
    { maxAttempts: 3 },
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header
        className={`px-5 py-5 text-white transition-colors ${alerts.flash ? "bg-red-600" : "bg-slate-950"}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-emerald-400">
              ASSETTRACK · RESTAURANTE
            </p>
            <h1 className="text-3xl font-bold">
              {station === "KITCHEN" ? "Cocina" : "Bar y barra"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-emerald-500 px-4 py-2 font-bold text-slate-950">
              {items.length} pendientes
            </span>
            <RestaurantSessionActions />
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl space-y-4 p-5">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${alerts.flash ? "border-red-500 bg-yellow-200 ring-4 ring-red-300" : "bg-white"}`}
        >
          <p className="font-bold">
            Alertas operativas: {alerts.enabled ? "activadas" : "desactivadas"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded bg-emerald-700 px-4 py-2 font-bold text-white"
              onClick={alerts.enableAndTest}
            >
              {alerts.enabled
                ? "Probar sonido y vibración"
                : "Activar y probar alertas"}
            </button>
            {alerts.enabled && (
              <button
                className="rounded border px-4 py-2 font-semibold"
                onClick={alerts.disable}
              >
                Desactivar
              </button>
            )}
          </div>
          <p className="w-full text-sm text-slate-600">
            La vibración depende de la compatibilidad del dispositivo; el sonido
            y la alerta visual permanecen disponibles.
          </p>
        </div>
        {error && (
          <p className="rounded-lg bg-red-100 p-4 text-red-800">{error}</p>
        )}
        {items.length === 0 && (
          <p className="rounded-xl border bg-white p-8 text-center text-lg">
            No hay pedidos pendientes para esta estación.
          </p>
        )}
        {station === "BAR" && visits.length > 0 && (
          <section className="rounded-xl border-2 border-violet-400 bg-violet-50 p-5">
            <h2 className="text-xl font-black text-violet-950">
              Cuentas de barra bajo mi responsabilidad
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {visits.map((visit) => (
                <article
                  key={visit.id}
                  className="rounded-lg bg-white p-4 shadow-sm"
                >
                  <p className="font-bold">{visit.table.name}</p>
                  <p>Total: ₡{visit.billing.total.toLocaleString()}</p>
                  <button
                    disabled={!visit.canClose}
                    className="mt-3 rounded bg-violet-800 px-4 py-2 font-bold text-white disabled:opacity-40"
                    onClick={() => void closeVisit(visit.id)}
                  >
                    {visit.canClose ? "Cerrar cuenta" : "Entregas pendientes"}
                  </button>
                  <label className="mt-3 block text-sm font-semibold">
                    Trasladar a otra posición
                    <select
                      className="mt-1 w-full rounded border bg-white p-2"
                      defaultValue=""
                      onChange={(event) => {
                        const destinationId = event.target.value;
                        event.target.value = "";
                        if (
                          destinationId &&
                          window.confirm(
                            "¿Confirma el traslado de esta cuenta?",
                          )
                        ) {
                          void transferVisit(visit.id, destinationId);
                        }
                      }}
                    >
                      <option value="">Seleccione destino</option>
                      {visit.transferDestinations.map((destination) => (
                        <option key={destination.id} value={destination.id}>
                          {destination.name}
                          {destination.activeAccountCount
                            ? ` · ${destination.activeAccountCount} cuenta(s)`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          </section>
        )}
        {items.map(({ order, item }) => (
          <article
            key={item.id}
            className={`rounded-xl border bg-white p-5 shadow-sm ${order.isDelayed ? "border-red-500 ring-2 ring-red-200" : ""}`}
          >
            {order.isDelayed && (
              <p className="mb-3 rounded bg-red-100 p-3 font-bold text-red-900">
                Atención: esta orden superó el umbral interno de espera.
                Priorice y coordine con el mesero.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-2xl font-bold">{order.table.name}</p>
                <p className="mt-1 text-xl">
                  {item.quantity} × {item.name}
                </p>
                <span
                  className={`mt-3 inline-flex rounded-full px-4 py-2 text-lg font-black ${
                    item.fulfillment === "TAKEOUT"
                      ? "bg-fuchsia-100 text-fuchsia-900 ring-2 ring-fuchsia-300"
                      : "bg-sky-100 text-sky-900 ring-2 ring-sky-300"
                  }`}
                >
                  {item.fulfillment === "TAKEOUT"
                    ? "PARA LLEVAR"
                    : "CONSUMO EN EL LOCAL"}
                </span>
                <p className="mt-2 text-sm text-slate-600">
                  {labels[item.status] ?? item.status} · recibido a las{" "}
                  {new Date(order.createdAt).toLocaleTimeString()}
                </p>
                {station === "KITCHEN" && (
                  <p
                    className={`mt-3 inline-flex rounded-lg px-4 py-2 text-lg font-black ${
                      order.thresholdMinutes &&
                      (new Date(item.handedOffAt ?? now).getTime() -
                        new Date(order.createdAt).getTime()) /
                        60_000 >=
                        order.thresholdMinutes
                        ? "bg-red-100 text-red-900 ring-2 ring-red-400"
                        : order.thresholdMinutes &&
                            (new Date(item.handedOffAt ?? now).getTime() -
                              new Date(order.createdAt).getTime()) /
                              60_000 >=
                              order.thresholdMinutes * 0.75
                          ? "bg-amber-100 text-amber-950 ring-2 ring-amber-400"
                          : "bg-emerald-100 text-emerald-950 ring-2 ring-emerald-400"
                    }`}
                  >
                    Tiempo de cocina:{" "}
                    {formatElapsed(
                      new Date(item.handedOffAt ?? now).getTime() -
                        new Date(order.createdAt).getTime(),
                    )}
                    {item.handedOffAt ? " · entregado al responsable" : ""}
                  </p>
                )}
              </div>
              {item.station === station && nextStatus[item.status] && (
                <button
                  className="min-w-40 rounded-lg bg-emerald-600 px-5 py-4 text-lg font-bold text-white"
                  onClick={() => void advance(item)}
                >
                  {item.status === "RECEIVED"
                    ? "Aceptar"
                    : item.status === "ACCEPTED"
                      ? "Iniciar"
                      : "Marcar listo"}
                </button>
              )}
              {item.status === "READY" && item.serviceAction && (
                <button
                  className="rounded-lg bg-violet-700 px-5 py-4 font-bold text-white"
                  onClick={() =>
                    void (item.handedOffAt
                      ? deliver(item.id)
                      : handoff(item.id))
                  }
                >
                  {item.handedOffAt
                    ? "Confirmar entrega al cliente"
                    : "Recibido para entregar"}
                </button>
              )}
              {item.status === "READY" && !item.serviceAction && (
                <span className="rounded-lg bg-amber-100 px-5 py-4 font-bold text-amber-900">
                  Esperando al responsable de la cuenta
                </span>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
