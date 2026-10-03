"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { RestaurantSessionActions } from "./restaurant-session-actions";

type Category = { id: string; name: string };
type MenuItem = { id: string; name: string };
type Movement = {
  id: string;
  type: "ENTRY" | "ADJUSTMENT" | "CONSUMPTION";
  quantityDelta: number;
  occurredAt: string;
  note?: string | null;
};
type Weighing = {
  id: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  consumedWeightGrams?: number | null;
  relatedOrderQuantity: number;
  measuredAt: string;
};
type Product = {
  id: string;
  name: string;
  productType: "STANDARD" | "LIQUOR";
  presentation: string;
  quantity: number;
  minimumQuantity: number;
  unitCost: number;
  receivedAt: string;
  liquorBrand?: string | null;
  liquorInitialTareGrams?: number | null;
  active: boolean;
  category: Category;
  menuItem?: MenuItem | null;
  movements: Movement[];
  weighings: Weighing[];
};
type Inventory = {
  categories: Category[];
  menuItems: MenuItem[];
  products: Product[];
  alerts: Array<{
    productId: string;
    name: string;
    quantity: number;
    minimumQuantity: number;
    presentation: string;
  }>;
  summary: {
    activeProducts: number;
    lowStockProducts: number;
    inventoryCost: number;
  };
  permissions: {
    canManageCatalog: boolean;
    canRecordMovements: boolean;
  };
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);

export default function InventoryDashboard() {
  const router = useRouter();
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [product, setProduct] = useState({
    categoryId: "",
    menuItemId: "",
    name: "",
    productType: "STANDARD" as "STANDARD" | "LIQUOR",
    presentation: "",
    quantity: "0",
    minimumQuantity: "0",
    unitCost: "0",
    receivedAt: today(),
    liquorBrand: "",
    liquorInitialTareGrams: "",
  });
  const [movementProductId, setMovementProductId] = useState("");
  const [movementType, setMovementType] = useState<"ENTRY" | "ADJUSTMENT">(
    "ENTRY",
  );
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementCost, setMovementCost] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [weighingProductId, setWeighingProductId] = useState("");
  const [grossWeight, setGrossWeight] = useState("");
  const [weighingNote, setWeighingNote] = useState("");

  const load = useCallback(async () => {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/inventory`,
    );
    if (response.status === 401) {
      router.replace("/?next=/restaurant/admin/inventory");
      return;
    }
    if (response.status === 403) {
      router.replace("/restaurant/staff");
      return;
    }
    if (!response.ok) throw new Error(`No se pudo cargar el inventario (${response.status})`);
    const data = (await response.json()) as Inventory;
    setInventory(data);
    setProduct((current) => ({
      ...current,
      categoryId: current.categoryId || data.categories[0]?.id || "",
    }));
    setMovementProductId((current) => current || data.products[0]?.id || "");
    setWeighingProductId(
      (current) =>
        current || data.products.find((item) => item.productType === "LIQUOR")?.id || "",
    );
  }, [router]);

  useEffect(() => {
    load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el inventario"),
    );
  }, [load]);

  async function send(path: string, method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetch(`${API_URL}/api/v1/restaurant/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message || `La operación falló (${response.status})`);
      }
      await load();
      setNotice("Inventario actualizado correctamente");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el inventario");
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    try {
      await send("inventory/categories", "POST", { name: categoryName });
      setCategoryName("");
    } catch {}
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    try {
      await send("inventory/products", "POST", {
        ...product,
        menuItemId: product.menuItemId || undefined,
        quantity: Number(product.quantity),
        minimumQuantity: Number(product.minimumQuantity),
        unitCost: Number(product.unitCost),
        receivedAt: new Date(`${product.receivedAt}T12:00:00`).toISOString(),
        liquorBrand: product.productType === "LIQUOR" ? product.liquorBrand : undefined,
        liquorInitialTareGrams:
          product.productType === "LIQUOR"
            ? Number(product.liquorInitialTareGrams)
            : undefined,
      });
      setProduct((current) => ({
        ...current,
        name: "",
        presentation: "",
        quantity: "0",
        minimumQuantity: "0",
        unitCost: "0",
        liquorBrand: "",
        liquorInitialTareGrams: "",
      }));
    } catch {}
  }

  async function registerMovement(event: FormEvent) {
    event.preventDefault();
    try {
      await send(`inventory/products/${movementProductId}/movements`, "POST", {
        type: movementType,
        quantityDelta: Number(movementQuantity),
        unitCost:
          inventory?.permissions.canManageCatalog && movementCost
            ? Number(movementCost)
            : undefined,
        note: movementNote || undefined,
      });
      setMovementQuantity("");
      setMovementCost("");
      setMovementNote("");
    } catch {}
  }

  async function registerWeighing(event: FormEvent) {
    event.preventDefault();
    try {
      await send(`inventory/products/${weighingProductId}/weighings`, "POST", {
        grossWeightGrams: Number(grossWeight),
        note: weighingNote || undefined,
      });
      setGrossWeight("");
      setWeighingNote("");
    } catch {}
  }

  async function editProduct(item: Product) {
    const minimum = window.prompt(
      `Cantidad mínima para ${item.name}`,
      String(item.minimumQuantity),
    );
    if (minimum === null) return;
    const cost = window.prompt("Costo unitario en colones", String(item.unitCost));
    if (cost === null) return;
    const minimumQuantity = Number(minimum);
    const unitCost = Number(cost);
    if (!Number.isInteger(minimumQuantity) || minimumQuantity < 0 || !Number.isInteger(unitCost) || unitCost < 0) {
      setError("El mínimo y el costo deben ser números enteros positivos");
      return;
    }
    try {
      await send(`inventory/products/${item.id}`, "PATCH", {
        minimumQuantity,
        unitCost,
      });
    } catch {}
  }

  const liquorProducts = inventory?.products.filter(
    (item) => item.productType === "LIQUOR" && item.active,
  ) ?? [];
  const canManageCatalog =
    inventory?.permissions.canManageCatalog ?? false;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-slate-900">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold tracking-widest text-emerald-700">ASSETTRACK · RESTAURANTE</p>
          <h1 className="text-3xl font-black">Control de inventario</h1>
          <p className="mt-1 text-slate-600">Existencias, costos, mínimos y control de licores.</p>
        </div>
        <div className="flex flex-wrap gap-2 rounded-lg bg-slate-950 p-2 text-white">
          <Link
            className="rounded border px-4 py-2 font-bold"
            href={canManageCatalog ? "/restaurant/admin" : "/restaurant/bar"}
          >
            {canManageCatalog ? "Administración" : "Volver al bar"}
          </Link>
          <RestaurantSessionActions admin={canManageCatalog} />
        </div>
      </header>

      {error && <p role="alert" className="mb-5 rounded-lg bg-red-100 p-4 font-semibold text-red-900">{error}</p>}
      {notice && <p role="status" className="mb-5 rounded-lg bg-emerald-100 p-4 font-semibold text-emerald-900">{notice}</p>}

      {inventory?.alerts.length ? (
        <section className="mb-6 rounded-xl border-4 border-red-500 bg-amber-50 p-5 shadow-lg">
          <h2 className="text-2xl font-black text-red-800">Alerta de existencias mínimas</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {inventory.alerts.map((alert) => (
              <button
                type="button"
                key={alert.productId}
                onClick={() => setMovementProductId(alert.productId)}
                className="rounded-lg bg-white p-4 text-left shadow"
              >
                <strong className="block text-lg">{alert.name}</strong>
                <span className="text-red-700">Quedan {alert.quantity} · mínimo {alert.minimumQuantity} ({alert.presentation})</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Productos activos</p><p className="text-3xl font-black">{inventory?.summary.activeProducts ?? 0}</p></div>
        <div className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">En nivel mínimo</p><p className="text-3xl font-black text-red-700">{inventory?.summary.lowStockProducts ?? 0}</p></div>
        <div className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Costo inventariado</p><p className="text-3xl font-black">{money(inventory?.summary.inventoryCost ?? 0)}</p></div>
      </section>

      <div className={`grid gap-6 ${canManageCatalog ? "xl:grid-cols-2" : ""}`}>
        {canManageCatalog && <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Categorías y productos</h2>
          <form onSubmit={createCategory} className="mt-4 flex gap-2">
            <input required maxLength={80} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Nueva categoría" className="min-w-0 flex-1 rounded border p-3" />
            <button disabled={busy} className="rounded bg-slate-950 px-4 font-bold text-white">Crear</button>
          </form>
          <form onSubmit={createProduct} className="mt-6 grid gap-3 sm:grid-cols-2">
            <input required value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Producto" className="rounded border p-3" />
            <select required value={product.categoryId} onChange={(e) => setProduct({ ...product, categoryId: e.target.value })} className="rounded border p-3"><option value="">Categoría</option>{inventory?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select value={product.productType} onChange={(e) => setProduct({ ...product, productType: e.target.value as "STANDARD" | "LIQUOR" })} className="rounded border p-3"><option value="STANDARD">Producto general</option><option value="LIQUOR">Licor</option></select>
            <input required value={product.presentation} onChange={(e) => setProduct({ ...product, presentation: e.target.value })} placeholder="Presentación (unidad, caja, 750 ml...)" className="rounded border p-3" />
            <label className="text-sm font-bold">Cantidad<input required type="number" min="0" value={product.quantity} onChange={(e) => setProduct({ ...product, quantity: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            <label className="text-sm font-bold">Cantidad mínima<input required type="number" min="0" value={product.minimumQuantity} onChange={(e) => setProduct({ ...product, minimumQuantity: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            <label className="text-sm font-bold">Costo unitario (₡)<input required type="number" min="0" value={product.unitCost} onChange={(e) => setProduct({ ...product, unitCost: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            <label className="text-sm font-bold">Fecha de ingreso<input required type="date" value={product.receivedAt} onChange={(e) => setProduct({ ...product, receivedAt: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            <label className="text-sm font-bold sm:col-span-2">Relacionar con producto vendido<select value={product.menuItemId} onChange={(e) => setProduct({ ...product, menuItemId: e.target.value })} className="mt-1 w-full rounded border p-3"><option value="">Sin relación con el menú</option>{inventory?.menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {product.productType === "LIQUOR" && <><input required value={product.liquorBrand} onChange={(e) => setProduct({ ...product, liquorBrand: e.target.value })} placeholder="Marca del licor" className="rounded border p-3" /><input required type="number" min="0" value={product.liquorInitialTareGrams} onChange={(e) => setProduct({ ...product, liquorInitialTareGrams: e.target.value })} placeholder="Tara del envase (gramos)" className="rounded border p-3" /></>}
            <button disabled={busy || !inventory?.categories.length} className="rounded bg-emerald-700 p-3 font-black text-white sm:col-span-2">Guardar producto</button>
          </form>
        </section>}

        <div className="space-y-6">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Ingreso o ajuste</h2>
            <p className="mt-1 text-sm text-slate-600">Use valores negativos únicamente para ajustes de salida.</p>
            <form onSubmit={registerMovement} className="mt-4 grid gap-3 sm:grid-cols-2">
              <select required value={movementProductId} onChange={(e) => setMovementProductId(e.target.value)} className="rounded border p-3 sm:col-span-2"><option value="">Seleccione producto</option>{inventory?.products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quantity}</option>)}</select>
              <select value={movementType} onChange={(e) => setMovementType(e.target.value as "ENTRY" | "ADJUSTMENT")} className="rounded border p-3"><option value="ENTRY">Ingreso</option><option value="ADJUSTMENT">Ajuste</option></select>
              <input required type="number" value={movementQuantity} onChange={(e) => setMovementQuantity(e.target.value)} placeholder="Cantidad (+/-)" className="rounded border p-3" />
              {canManageCatalog && (
                <input type="number" min="0" value={movementCost} onChange={(e) => setMovementCost(e.target.value)} placeholder="Nuevo costo unitario (opcional)" className="rounded border p-3" />
              )}
              <input value={movementNote} onChange={(e) => setMovementNote(e.target.value)} placeholder="Nota" className="rounded border p-3" />
              <button disabled={busy || !movementProductId} className="rounded bg-slate-950 p-3 font-black text-white sm:col-span-2">Registrar movimiento</button>
            </form>
          </section>

          <section className="rounded-xl border border-violet-300 bg-violet-50 p-5 shadow-sm">
            <h2 className="text-xl font-black">Pesaje de licores</h2>
            <p className="mt-1 text-sm text-slate-700">El sistema resta la tara y compara el consumo por peso con las órdenes entregadas desde el pesaje anterior.</p>
            <form onSubmit={registerWeighing} className="mt-4 grid gap-3 sm:grid-cols-2">
              <select required value={weighingProductId} onChange={(e) => setWeighingProductId(e.target.value)} className="rounded border p-3 sm:col-span-2"><option value="">Seleccione licor</option>{liquorProducts.map((item) => <option key={item.id} value={item.id}>{item.liquorBrand} · {item.name}</option>)}</select>
              <input required type="number" min="0" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="Peso total actual (gramos)" className="rounded border p-3" />
              <input value={weighingNote} onChange={(e) => setWeighingNote(e.target.value)} placeholder="Nota del pesaje" className="rounded border p-3" />
              <button disabled={busy || !weighingProductId} className="rounded bg-violet-800 p-3 font-black text-white sm:col-span-2">Guardar pesaje</button>
            </form>
          </section>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="p-5"><h2 className="text-xl font-black">Existencias registradas</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-100"><tr><th className="p-3">Producto</th><th className="p-3">Categoría</th><th className="p-3">Presentación</th><th className="p-3">Cantidad / mínimo</th><th className="p-3">Costo</th><th className="p-3">Ingreso</th><th className="p-3">Último control</th>{canManageCatalog && <th className="p-3">Acción</th>}</tr></thead>
            <tbody>{inventory?.products.map((item) => {
              const weighing = item.weighings[0];
              const movement = item.movements[0];
              const low = item.active && item.quantity <= item.minimumQuantity;
              return <tr key={item.id} className={`border-t ${low ? "bg-red-50" : ""}`}><td className="p-3"><strong>{item.name}</strong>{item.productType === "LIQUOR" && <span className="ml-2 rounded bg-violet-100 px-2 py-1 text-xs font-bold text-violet-900">LICOR · {item.liquorBrand}</span>}<p className="text-xs text-slate-500">{item.menuItem ? `Menú: ${item.menuItem.name}` : "Sin vínculo al menú"}</p></td><td className="p-3">{item.category.name}</td><td className="p-3">{item.presentation}</td><td className={`p-3 font-black ${low ? "text-red-700" : ""}`}>{item.quantity} / {item.minimumQuantity}</td><td className="p-3">{money(item.unitCost)}</td><td className="p-3">{new Date(item.receivedAt).toLocaleDateString("es-CR")}</td><td className="p-3">{weighing ? <><p>{weighing.netWeightGrams} g netos</p><p className="text-xs text-slate-600">Consumo: {weighing.consumedWeightGrams ?? "—"} g · {weighing.relatedOrderQuantity} unidades ordenadas</p></> : movement ? `${movement.quantityDelta > 0 ? "+" : ""}${movement.quantityDelta} · ${new Date(movement.occurredAt).toLocaleDateString("es-CR")}` : "Sin movimientos"}</td>{canManageCatalog && <td className="p-3"><button type="button" onClick={() => editProduct(item)} className="rounded border border-slate-400 px-3 py-2 font-bold">Editar mínimo/costo</button></td>}</tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
