"use client";

import { API_URL } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  station: string;
  course: string;
  available: boolean;
};
type Menu = {
  restaurant: string;
  table: string;
  waiter: { id: string; name: string } | null;
  menu: MenuItem[];
};

export default function RestaurantTablePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [data, setData] = useState<Menu | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/restaurant/guest/tables/${encodeURIComponent(code)}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          "This table is unavailable. Please ask the staff for assistance.",
        );
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load menu");
    }
  }, [code]);
  useEffect(() => {
    void load();
    setTrackedOrder(
      window.localStorage.getItem(`assettrack_restaurant_order_${code}`),
    );
  }, [code, load]);

  async function submit() {
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (!items.length) {
      setError("Choose at least one item.");
      return;
    }
    setSending(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    setAttempted(true);
    try {
      const response = await fetch(
        `${API_URL}/api/v1/restaurant/guest/tables/${encodeURIComponent(code)}/orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, requestId: requestId.current }),
        },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join(", ")
            : body.message || "Unable to place order",
        );
      }
      const order = await response.json();
      window.localStorage.setItem(
        `assettrack_restaurant_order_${code}`,
        order.accessCode,
      );
      setTrackedOrder(order.accessCode);
      router.push(`/restaurant/order/${order.accessCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to place order");
    } finally {
      setSending(false);
    }
  }

  const selected =
    data?.menu.filter((item) => item.available && quantities[item.id] > 0) ??
    [];
  const total = selected.reduce(
    (sum, item) => sum + item.price * quantities[item.id],
    0,
  );
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-slate-900">
      {trackedOrder && (
        <button
          type="button"
          onClick={() => router.push(`/restaurant/order/${trackedOrder}`)}
          className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-sky-700 px-5 py-3 font-bold text-white shadow-lg"
          aria-label="Volver al seguimiento de mi pedido"
        >
          <span aria-hidden="true">🧾</span>
          Ver mi pedido
        </button>
      )}
      <header className="mb-8">
        <p className="font-semibold tracking-widest text-emerald-700">
          ASSETTRACK · RESTAURANT
        </p>
        <h1 className="text-3xl font-bold">{data?.restaurant ?? "Menu"}</h1>
        <p>{data?.table ?? "Loading table..."}</p>
        {data && (
          <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sky-900">
            {data.waiter
              ? `Mesero a cargo: ${data.waiter.name}`
              : "Mesero por asignar. Consulte al personal."}
          </p>
        )}
      </header>
      {error && (
        <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {data?.menu.length === 0 && (
        <p>No menu items are available. Please ask the staff.</p>
      )}
      <div className="space-y-4">
        {data?.menu.map((item) => (
          <section
            key={item.id}
            className={`rounded-xl border p-4 shadow-sm ${
              item.available
                ? "border-slate-200 bg-white"
                : "border-amber-300 bg-amber-50"
            }`}
          >
            <div className="flex justify-between gap-4">
              <div>
                <span className="text-xs uppercase text-emerald-700">
                  {item.course.toLowerCase()}
                </span>
                <h2 className="text-lg font-semibold">{item.name}</h2>
                <p className="text-slate-600">{item.description}</p>
                {!item.available && (
                  <p className="mt-2 font-semibold text-amber-800">
                    Temporalmente no disponible. Consulte al personal para más
                    información.
                  </p>
                )}
              </div>
              <span className="whitespace-nowrap font-medium">
                ₡{item.price.toLocaleString()}
              </span>
            </div>
            <label className="mt-3 block">
              Quantity{" "}
              <select
                className="ml-2 rounded border p-2"
                disabled={attempted || !item.available}
                value={quantities[item.id] ?? 0}
                onChange={(event) =>
                  setQuantities((current) => ({
                    ...current,
                    [item.id]: Number(event.target.value),
                  }))
                }
              >
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ))}
      </div>
      {data && (
        <footer className="sticky bottom-0 mt-6 rounded-xl bg-slate-900 p-4 text-white">
          <div className="mb-3 flex justify-between">
            <span>{selected.length} selected</span>
            <strong>₡{total.toLocaleString()}</strong>
          </div>
          <button
            disabled={sending || !selected.length}
            onClick={submit}
            className="w-full rounded bg-emerald-400 p-3 font-semibold text-slate-900 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Confirm order"}
          </button>
          <p className="mt-2 text-sm text-slate-300">
            Payment is handled by the restaurant. Please check your order before
            confirming.
          </p>
        </footer>
      )}
    </main>
  );
}
