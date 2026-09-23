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
};
type Order = {
  id: string;
  createdAt: string;
  table: { id: string; name: string };
  items: Item[];
};

const statusLabel: Record<string, string> = {
  RECEIVED: "Recibido",
  ACCEPTED: "Aceptado",
  PREPARING: "En preparación",
  READY: "Listo",
};

export default function WaiterPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState("AVAILABLE");
  const [availabilityChoice, setAvailabilityChoice] = useState("AVAILABLE");
  const [availabilityDetails, setAvailabilityDetails] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [savingAvailability, setSavingAvailability] = useState(false);
  const profileInitialized = useRef(false);

  const load = useCallback(async () => {
    const [profileResponse, response] = await Promise.all([
      authenticatedFetch(`${API_URL}/api/v1/restaurant/profile`),
      authenticatedFetch(`${API_URL}/api/v1/restaurant/orders`),
    ]);
    if (profileResponse.status === 401 || response.status === 401) {
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
      if (!profileInitialized.current) {
        setAvailabilityChoice(profile.restaurantAvailability);
        profileInitialized.current = true;
      }
    }
    if (response.status === 403) {
      router.replace("/restaurant/staff");
      return;
    }
    if (!response.ok) {
      setError("No se pudieron cargar las mesas asignadas");
      return;
    }
    const data: Order[] = await response.json();
    setOrders(data.filter((order) => order.items.length > 0));
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
            availabilityDetails.trim()
              ? `: ${availabilityDetails.trim()}`
              : ""
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
            <h1 className="text-3xl font-bold">Mesero</h1>
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
                onChange={(event) =>
                  setAvailabilityChoice(event.target.value)
                }
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
            className="rounded-xl border bg-white p-5 shadow-sm"
          >
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
                  </div>
                  {item.status === "READY" && (
                    <button
                      className="rounded-lg bg-sky-700 px-5 py-3 font-bold text-white"
                      onClick={() => void deliver(item.id)}
                    >
                      Confirmar entrega
                    </button>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
