"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";

type Table = {
  id: string;
  name: string;
  kind: "DINING" | "BAR_SEAT" | "TAKEOUT_STATION";
};

type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  station: "KITCHEN" | "BAR";
  productType: string;
};

const categoryStyles = [
  "border-rose-300 bg-rose-100 text-rose-950",
  "border-amber-300 bg-amber-100 text-amber-950",
  "border-emerald-300 bg-emerald-100 text-emerald-950",
  "border-sky-300 bg-sky-100 text-sky-950",
  "border-violet-300 bg-violet-100 text-violet-950",
  "border-pink-300 bg-pink-100 text-pink-950",
];

export function BarOrderEntry({ onCreated }: { onCreated: () => void }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tableId, setTableId] = useState("");
  const [fulfillment, setFulfillment] = useState<"DINE_IN" | "TAKEOUT">(
    "DINE_IN",
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeType, setActiveType] = useState("");

  const load = useCallback(async () => {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/order-entry`,
    );
    if (!response.ok) return;
    const data: { tables: Table[]; menu: MenuItem[] } = await response.json();
    setTables(data.tables);
    setMenu(data.menu);
    setActiveType((current) =>
      current && data.menu.some((item) => item.productType === current)
        ? current
        : data.menu[0]?.productType || "",
    );
  }, []);

  useEffect(() => {
    if (open && !menu.length) void load();
  }, [load, menu.length, open]);

  const selectedItems = useMemo(
    () =>
      menu
        .filter((item) => (quantities[item.id] ?? 0) > 0)
        .map((item) => ({ ...item, quantity: quantities[item.id] })),
    [menu, quantities],
  );
  const productTypes = useMemo(
    () => [...new Set(menu.map((item) => item.productType))],
    [menu],
  );
  const visibleMenu = useMemo(
    () => menu.filter((item) => !activeType || item.productType === activeType),
    [activeType, menu],
  );
  const total = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const changeQuantity = (id: string, change: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(10, (current[id] ?? 0) + change)),
    }));
  };

  const removeProduct = (id: string) => {
    setQuantities((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setMessage("");
  };

  const toggleMenu = () => {
    setTableId("");
    setMessage("");
    setOpen((current) => !current);
  };

  const submit = async () => {
    if (!tableId || !selectedItems.length) {
      setMessage("Seleccione una posición y al menos un producto.");
      return;
    }
    setSaving(true);
    setMessage("");
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/orders`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          tableId,
          fulfillment,
          items: selectedItems.map((item) => ({
            menuItemId: item.id,
            quantity: item.quantity,
            fulfillment,
          })),
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(body.message ?? "No fue posible crear la orden.");
      return;
    }
    setQuantities({});
    setTableId("");
    setMessage("Orden creada y asignada a su cuenta de trabajo.");
    onCreated();
  };

  return (
    <section className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-emerald-950">
            Crear orden desde bar
          </h2>
          <p className="text-sm text-emerald-900">
            Seleccione una mesa o posición. La cuenta quedará bajo su
            responsabilidad.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-emerald-800 px-5 py-3 font-black text-white"
          onClick={toggleMenu}
        >
          {open ? "Cerrar menú" : "Abrir menú y ordenar"}
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-emerald-300 pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="font-semibold">
              Mesa o posición de barra
              <select
                className="mt-1 w-full rounded-lg border bg-white p-3"
                value={tableId}
                onChange={(event) => setTableId(event.target.value)}
              >
                <option value="" disabled>
                  Seleccione una mesa o posición
                </option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} · {table.kind === "BAR_SEAT" ? "Barra" : table.kind === "TAKEOUT_STATION" ? "Para llevar" : "Mesa"}
                  </option>
                ))}
              </select>
            </label>
            <label className="font-semibold">
              Modalidad
              <select
                className="mt-1 w-full rounded-lg border bg-white p-3"
                value={fulfillment}
                onChange={(event) =>
                  setFulfillment(event.target.value as "DINE_IN" | "TAKEOUT")
                }
              >
                <option value="DINE_IN">Consumir en el local</option>
                <option value="TAKEOUT">Para llevar</option>
              </select>
            </label>
          </div>
          <div>
            <p className="mb-2 font-black text-emerald-950">
              Categorías del menú
            </p>
            <div className="flex flex-wrap gap-2">
              {productTypes.map((type, index) => {
                return (
                  <button
                    type="button"
                    key={type}
                    aria-pressed={activeType === type}
                    onClick={() => setActiveType(type)}
                    className={`rounded-full border px-4 py-2 font-semibold transition ${categoryStyles[index % categoryStyles.length]} ${
                      activeType === type
                        ? "ring-2 ring-slate-800 ring-offset-2"
                        : "hover:brightness-95"
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {visibleMenu.map((item) => (
              <article key={item.id} className="rounded-lg border bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      {item.productType} · {item.station === "BAR" ? "Bar" : "Cocina"}
                    </p>
                    {item.description && (
                      <p className="mt-1 text-sm text-slate-600">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-1 font-black">
                      ₡{item.price.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-10 w-10 rounded-full border text-xl font-black"
                      onClick={() => changeQuantity(item.id, -1)}
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center font-black">
                      {quantities[item.id] ?? 0}
                    </span>
                    <button
                      type="button"
                      className="h-10 w-10 rounded-full bg-emerald-700 text-xl font-black text-white"
                      onClick={() => changeQuantity(item.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {visibleMenu.length === 0 && (
              <p className="rounded-lg bg-white p-4 text-slate-600 md:col-span-2">
                No hay productos disponibles en esta categoría.
              </p>
            )}
          </div>
          {selectedItems.length > 0 && (
            <section className="rounded-lg border border-emerald-300 bg-white p-4">
              <h3 className="font-black text-emerald-950">Productos de la orden</h3>
              <p className="mt-1 text-sm text-slate-600">
                Puede eliminar un producto completo antes de crear la orden.
              </p>
              <ul className="mt-3 divide-y">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-bold">{item.quantity} × {item.name}</p>
                      <p className="text-sm text-slate-600">
                        ₡{(item.price * item.quantity).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      aria-label={`Eliminar ${item.name} de la orden`}
                      className="rounded-lg border border-red-400 px-4 py-2 font-bold text-red-700 disabled:opacity-40"
                      onClick={() => removeProduct(item.id)}
                    >
                      Eliminar de la orden
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4">
            <p className="text-lg font-black">
              {selectedItems.reduce((sum, item) => sum + item.quantity, 0)} productos · ₡{total.toLocaleString()}
            </p>
            <button
              type="button"
              disabled={saving || !tableId || !selectedItems.length}
              className="rounded-lg bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-40"
              onClick={() => void submit()}
            >
              {saving ? "Creando…" : "Crear orden"}
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-3 rounded-lg bg-white p-3 font-semibold">{message}</p>}
    </section>
  );
}
