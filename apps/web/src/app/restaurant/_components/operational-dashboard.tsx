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
};
type Order = {
  id: string;
  createdAt: string;
  table: { name: string };
  items: OrderItem[];
  isDelayed: boolean;
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

export function OperationalDashboard({ station }: { station: Station }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [profileResponse, response] = await Promise.all([
      authenticatedFetch(`${API_URL}/api/v1/restaurant/profile`),
      authenticatedFetch(`${API_URL}/api/v1/restaurant/orders`),
    ]);
    if (profileResponse.status === 401 || response.status === 401) {
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

  const items = orders.flatMap((order) =>
    order.items
      .filter((item) => item.station === station)
      .map((item) => ({ order, item })),
  );
  const alerts = useOperationalAlerts(
    station.toLowerCase(),
    items
      .filter(({ item }) => item.status === "RECEIVED")
      .map(({ item }) => item.id),
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
              {station === "KITCHEN" ? "Cocina" : "Bar"}
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
              </div>
              {nextStatus[item.status] && (
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
              {item.status === "READY" && (
                <span className="rounded-lg bg-amber-100 px-5 py-4 font-bold text-amber-900">
                  Esperando al mesero
                </span>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
