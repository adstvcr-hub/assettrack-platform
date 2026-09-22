"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
    }
    if (response.status === 403) {
      router.replace("/restaurant/staff");
      return;
    }
    if (!response.ok) {
      setError("No se pudieron cargar las mesas asignadas");
      return;
    }
    setOrders(await response.json());
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
          <span className="rounded-full bg-amber-400 px-4 py-2 font-bold text-slate-950">
            {readyCount} listos
          </span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl space-y-5 p-5">
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
