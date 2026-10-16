"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { RestaurantSessionActions } from "./restaurant-session-actions";

type Category = { id: string; name: string };
type MenuItem = { id: string; name: string; station: "KITCHEN" | "BAR"; active: boolean };
type Movement = {
  id: string;
  type: "ENTRY" | "ADJUSTMENT" | "CONSUMPTION" | "REVERSAL";
  quantityDelta: number;
  occurredAt: string;
  note?: string | null;
  unitSnapshot?: "UNIT" | "GRAM" | "MILLILITER" | null;
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
  stockUnit: "UNIT" | "GRAM" | "MILLILITER";
  unitsPerPresentation: number;
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
  recipes: Array<{
    id: string;
    menuItemId: string;
    productId: string;
    quantityPerMenuItem: number;
    menuItem: MenuItem;
    product: {
      id: string;
      name: string;
      stockUnit: "UNIT" | "GRAM" | "MILLILITER";
      quantity: number;
      active: boolean;
    };
  }>;
  recipeRevisions: Array<{
    id: string;
    menuItemId: string;
    version: number;
    ingredients: unknown;
    reason?: string | null;
    createdAt: string;
  }>;
  comboComponents: Array<{
    id: string;
    parentMenuItemId: string;
    componentMenuItemId: string;
    quantity: number;
    parentMenuItem: { id: string; name: string };
    componentMenuItem: MenuItem;
  }>;
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
    isBar?: boolean;
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

const unitLabel = (unit: Product["stockUnit"]) =>
  unit === "GRAM" ? "g" : unit === "MILLILITER" ? "ml" : "unid.";

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
    stockUnit: "UNIT" as "UNIT" | "GRAM" | "MILLILITER",
    unitsPerPresentation: "1",
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
  const [movementInPresentations, setMovementInPresentations] = useState(false);
  const [weighingProductId, setWeighingProductId] = useState("");
  const [grossWeight, setGrossWeight] = useState("");
  const [weighingNote, setWeighingNote] = useState("");
  const [recipeMenuItemId, setRecipeMenuItemId] = useState("");
  const [recipeProductId, setRecipeProductId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("");
  const [recipeReason, setRecipeReason] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeDraft, setRecipeDraft] = useState<
    Array<{ productId: string; quantityPerMenuItem: number }>
  >([]);
  const [comboMenuItemId, setComboMenuItemId] = useState("");
  const [comboComponentId, setComboComponentId] = useState("");
  const [comboQuantity, setComboQuantity] = useState("1");
  const [comboDraft, setComboDraft] = useState<
    Array<{ menuItemId: string; quantity: number }>
  >([]);
  const [conversion, setConversion] = useState<null | {
    product: Product;
    stockUnit: Product["stockUnit"];
    unitsPerPresentation: string;
    quantity: string;
    minimumQuantity: string;
    unitCost: string;
    reason: string;
    recipeUpdates: Record<string, string>;
  }>(null);

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
    setRecipeMenuItemId((current) => current || data.menuItems[0]?.id || "");
    setRecipeProductId((current) => current || data.products[0]?.id || "");
    setComboMenuItemId((current) => current || data.menuItems[0]?.id || "");
    setComboComponentId((current) => current || data.menuItems[0]?.id || "");
  }, [router]);

  useEffect(() => {
    load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el inventario"),
    );
  }, [load]);

  useEffect(() => {
    if (!inventory || !recipeMenuItemId) {
      setRecipeDraft([]);
      return;
    }
    setRecipeDraft(
      inventory.recipes
        .filter((item) => item.menuItemId === recipeMenuItemId)
        .map((item) => ({
          productId: item.productId,
          quantityPerMenuItem: item.quantityPerMenuItem,
        })),
    );
  }, [inventory, recipeMenuItemId]);

  useEffect(() => {
    if (!inventory || !comboMenuItemId) {
      setComboDraft([]);
      return;
    }
    setComboDraft(
      inventory.comboComponents
        .filter((item) => item.parentMenuItemId === comboMenuItemId)
        .map((item) => ({
          menuItemId: item.componentMenuItemId,
          quantity: item.quantity,
        })),
    );
  }, [inventory, comboMenuItemId]);

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
        unitsPerPresentation: Number(product.unitsPerPresentation),
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
        stockUnit: "UNIT",
        unitsPerPresentation: "1",
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
        quantityInPresentations: movementInPresentations,
      });
      setMovementQuantity("");
      setMovementCost("");
      setMovementNote("");
    } catch {}
  }

  function addRecipeIngredient() {
    const quantity = Number(recipeQuantity);
    if (
      !recipeProductId ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      setError("Seleccione un ingrediente e indique una cantidad válida");
      return;
    }
    setRecipeDraft((current) => [
      ...current.filter((item) => item.productId !== recipeProductId),
      { productId: recipeProductId, quantityPerMenuItem: quantity },
    ]);
    setRecipeQuantity("");
    setError("");
  }

  async function saveRecipe() {
    if (!recipeMenuItemId) {
      setError("Seleccione un producto del menú");
      return;
    }
    try {
      await send(`inventory/recipes/${recipeMenuItemId}`, "PATCH", {
        ingredients: recipeDraft,
        reason: recipeReason.trim() || undefined,
      });
      setRecipeReason("");
    } catch {}
  }

  function addComboComponent() {
    const quantity = Number(comboQuantity);
    if (!comboComponentId || comboComponentId === comboMenuItemId) {
      setError("Seleccione un producto diferente al combo");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("La cantidad del componente debe ser un entero mayor que cero");
      return;
    }
    setComboDraft((current) => [
      ...current.filter((item) => item.menuItemId !== comboComponentId),
      { menuItemId: comboComponentId, quantity },
    ]);
    setComboQuantity("1");
    setError("");
  }

  async function saveCombo() {
    if (!comboMenuItemId) {
      setError("Seleccione el producto que funcionará como combo");
      return;
    }
    try {
      await send(`inventory/combos/${comboMenuItemId}`, "PATCH", {
        components: comboDraft,
      });
    } catch {}
  }

  async function saveConversion(event: FormEvent) {
    event.preventDefault();
    if (!conversion) return;
    const recipeUpdates = Object.entries(conversion.recipeUpdates).map(
      ([menuItemId, quantityPerMenuItem]) => ({
        menuItemId,
        quantityPerMenuItem: Number(quantityPerMenuItem),
      }),
    );
    try {
      await send(`inventory/products/${conversion.product.id}/convert-unit`, "POST", {
        stockUnit: conversion.stockUnit,
        unitsPerPresentation: Number(conversion.unitsPerPresentation),
        quantity: Number(conversion.quantity),
        minimumQuantity: Number(conversion.minimumQuantity),
        unitCost: Number(conversion.unitCost),
        reason: conversion.reason,
        recipeUpdates,
      });
      setConversion(null);
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
    const stockUnit = window.prompt(
      "Unidad base: UNIT, GRAM o MILLILITER",
      item.stockUnit,
    );
    if (stockUnit === null) return;
    const normalizedUnit = stockUnit.trim().toUpperCase();
    if (!["UNIT", "GRAM", "MILLILITER"].includes(normalizedUnit)) {
      setError("La unidad base debe ser UNIT, GRAM o MILLILITER");
      return;
    }
    const presentationUnits = window.prompt(
      `Contenido de una presentación en ${unitLabel(normalizedUnit as Product["stockUnit"])}`,
      String(item.unitsPerPresentation),
    );
    if (presentationUnits === null) return;
    const minimum = window.prompt(
      `Cantidad mínima para ${item.name}`,
      String(item.minimumQuantity),
    );
    if (minimum === null) return;
    const cost = window.prompt("Costo unitario en colones", String(item.unitCost));
    if (cost === null) return;
    const minimumQuantity = Number(minimum);
    const unitCost = Number(cost);
    const unitsPerPresentation = Number(presentationUnits);
    if (!Number.isInteger(unitsPerPresentation) || unitsPerPresentation < 1 || !Number.isInteger(minimumQuantity) || minimumQuantity < 0 || !Number.isInteger(unitCost) || unitCost < 0) {
      setError("La presentación, el mínimo y el costo deben ser números enteros válidos");
      return;
    }
    if (normalizedUnit !== item.stockUnit) {
      const recipeUpdates = Object.fromEntries(
        (inventory?.recipes ?? [])
          .filter((recipe) => recipe.productId === item.id)
          .map((recipe) => [recipe.menuItemId, String(recipe.quantityPerMenuItem)]),
      );
      setConversion({
        product: item,
        stockUnit: normalizedUnit as Product["stockUnit"],
        unitsPerPresentation: String(unitsPerPresentation),
        quantity: String(item.quantity),
        minimumQuantity: String(minimumQuantity),
        unitCost: String(unitCost),
        reason: "Conversión de unidad de inventario",
        recipeUpdates,
      });
      return;
    }
    try {
      await send(`inventory/products/${item.id}`, "PATCH", {
        unitsPerPresentation,
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
  const movementProduct = inventory?.products.find(
    (item) => item.id === movementProductId,
  );

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
            href={inventory?.permissions.isBar ? "/restaurant/bar" : "/restaurant/admin"}
          >
            {inventory?.permissions.isBar ? "Volver al bar" : "Administración"}
          </Link>
          <RestaurantSessionActions admin={canManageCatalog && !inventory?.permissions.isBar} />
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
            <label className="text-sm font-bold">Unidad base<select value={product.stockUnit} onChange={(e) => setProduct({ ...product, stockUnit: e.target.value as Product["stockUnit"] })} className="mt-1 w-full rounded border p-3"><option value="UNIT">Unidad</option><option value="GRAM">Gramo</option><option value="MILLILITER">Mililitro</option></select></label>
            <label className="text-sm font-bold">Contenido por presentación<input required type="number" min="1" value={product.unitsPerPresentation} onChange={(e) => setProduct({ ...product, unitsPerPresentation: e.target.value })} className="mt-1 w-full rounded border p-3" /><span className="mt-1 block text-xs font-normal text-slate-500">Ejemplo: caja de 24 = 24 unidades; botella de 750 ml = 750.</span></label>
            <label className="text-sm font-bold">Existencia inicial en unidad base<input required type="number" min="0" value={product.quantity} onChange={(e) => setProduct({ ...product, quantity: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            <label className="text-sm font-bold">Cantidad mínima en unidad base<input required type="number" min="0" value={product.minimumQuantity} onChange={(e) => setProduct({ ...product, minimumQuantity: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            <label className="text-sm font-bold">Costo unitario (₡)<input required type="number" min="0" value={product.unitCost} onChange={(e) => setProduct({ ...product, unitCost: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            <label className="text-sm font-bold">Fecha de ingreso<input required type="date" value={product.receivedAt} onChange={(e) => setProduct({ ...product, receivedAt: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            <label className="text-sm font-bold sm:col-span-2">
              Relacionar con producto vendido
              <select value={product.menuItemId} onChange={(e) => setProduct({ ...product, menuItemId: e.target.value })} className="mt-1 w-full rounded border p-3"><option value="">Sin relación con el menú</option>{inventory?.menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              {product.menuItemId ? (
                <span className="mt-1 block text-xs font-normal text-emerald-800">
                  {product.stockUnit === "UNIT"
                    ? "Descuento automático: 1 unidad por cada producto entregado, salvo que configure una receta explícita."
                    : "La relación identifica el producto, pero debe configurar una receta para descontar gramos o mililitros."}
                </span>
              ) : null}
            </label>
            {product.productType === "LIQUOR" && <><input required value={product.liquorBrand} onChange={(e) => setProduct({ ...product, liquorBrand: e.target.value })} placeholder="Marca del licor" className="rounded border p-3" /><input required type="number" min="0" value={product.liquorInitialTareGrams} onChange={(e) => setProduct({ ...product, liquorInitialTareGrams: e.target.value })} placeholder="Tara del envase (gramos)" className="rounded border p-3" /></>}
            <button disabled={busy || !inventory?.categories.length} className="rounded bg-emerald-700 p-3 font-black text-white sm:col-span-2">Guardar producto</button>
          </form>
        </section>}

        <div className="space-y-6">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Ingreso o ajuste</h2>
            <p className="mt-1 text-sm text-slate-600">Use valores negativos únicamente para ajustes de salida. Los consumos de recetas se generan automáticamente al entregar.</p>
            <form onSubmit={registerMovement} className="mt-4 grid gap-3 sm:grid-cols-2">
              <select required value={movementProductId} onChange={(e) => setMovementProductId(e.target.value)} className="rounded border p-3 sm:col-span-2"><option value="">Seleccione producto</option>{inventory?.products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quantity}</option>)}</select>
              <select value={movementType} onChange={(e) => setMovementType(e.target.value as "ENTRY" | "ADJUSTMENT")} className="rounded border p-3"><option value="ENTRY">Ingreso</option><option value="ADJUSTMENT">Ajuste</option></select>
              <input required type="number" value={movementQuantity} onChange={(e) => setMovementQuantity(e.target.value)} placeholder={`Cantidad (+/-) ${movementInPresentations ? "presentaciones" : movementProduct ? unitLabel(movementProduct.stockUnit) : ""}`} className="rounded border p-3" />
              <label className="flex items-center gap-2 rounded border p-3 text-sm font-bold sm:col-span-2"><input type="checkbox" checked={movementInPresentations} onChange={(e) => setMovementInPresentations(e.target.checked)} />Registrar en presentaciones{movementProduct ? ` · 1 ${movementProduct.presentation} = ${movementProduct.unitsPerPresentation} ${unitLabel(movementProduct.stockUnit)}` : ""}</label>
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

      {canManageCatalog && (
        <section id="recipe-editor" className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Recetas y consumo automático</h2>
              <p className="mt-1 text-sm text-slate-700">
                Defina cuánto inventario consume una unidad vendida. Los productos
                relacionados directamente y medidos por unidad descuentan 1:1 si
                no tienen receta. Una receta explícita reemplaza esa regla. El
                descuento ocurre al marcar el producto como entregado y se revierte
                si la orden entregada se corrige.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-900">
              Unidad base obligatoria
            </span>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_1.3fr_1fr_auto] lg:items-end">
            <label className="text-sm font-bold">
              Producto del menú
              <select
                value={recipeMenuItemId}
                onChange={(event) => setRecipeMenuItemId(event.target.value)}
                className="mt-1 w-full rounded border bg-white p-3"
              >
                <option value="">Seleccione</option>
                {inventory?.menuItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              Ingrediente del inventario
              <select
                value={recipeProductId}
                onChange={(event) => setRecipeProductId(event.target.value)}
                className="mt-1 w-full rounded border bg-white p-3"
              >
                <option value="">Seleccione</option>
                {inventory?.products.filter((item) => item.active).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.quantity} {unitLabel(item.stockUnit)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              Cantidad por unidad vendida
              <input
                type="number"
                min="1"
                step="1"
                value={recipeQuantity}
                onChange={(event) => setRecipeQuantity(event.target.value)}
                placeholder={
                  inventory?.products.find((item) => item.id === recipeProductId)
                    ? unitLabel(inventory.products.find((item) => item.id === recipeProductId)!.stockUnit)
                    : "Cantidad"
                }
                className="mt-1 w-full rounded border bg-white p-3"
              />
            </label>
            <button
              type="button"
              onClick={addRecipeIngredient}
              className="rounded bg-emerald-800 px-4 py-3 font-black text-white"
            >
              Agregar
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {recipeDraft.length ? recipeDraft.map((ingredient) => {
              const item = inventory?.products.find(
                (productItem) => productItem.id === ingredient.productId,
              );
              return (
                <div key={ingredient.productId} className="grid gap-3 rounded-lg bg-white p-3 shadow-sm sm:grid-cols-[1fr_180px_auto] sm:items-end">
                  <div>
                    <strong>{item?.name ?? "Ingrediente"}</strong>
                    <p className="text-sm text-slate-600">
                      Consumo en {item ? unitLabel(item.stockUnit) : "unidad base"} por producto vendido
                    </p>
                  </div>
                  <label className="text-sm font-bold">
                    Cantidad
                    <input type="number" min="1" step="1" value={ingredient.quantityPerMenuItem} onChange={(event) => setRecipeDraft((current) => current.map((entry) => entry.productId === ingredient.productId ? { ...entry, quantityPerMenuItem: Number(event.target.value) } : entry))} className="mt-1 w-full rounded border p-2" />
                  </label>
                  <button
                    type="button"
                    onClick={() => setRecipeDraft((current) => current.filter((entry) => entry.productId !== ingredient.productId))}
                    className="rounded border border-red-300 px-3 py-2 font-bold text-red-700"
                  >
                    Quitar
                  </button>
                </div>
              );
            }) : (
              <p className="rounded-lg bg-white p-4 text-slate-600">
                Este producto del menú no tiene receta. Podrá entregarse, pero no descontará inventario.
              </p>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="text-sm font-bold">Motivo del cambio (opcional)<input value={recipeReason} onChange={(event) => setRecipeReason(event.target.value)} placeholder="Ejemplo: nueva porción" className="mt-1 w-full rounded border bg-white p-3" /></label>
            <button type="button" disabled={busy || !recipeMenuItemId} onClick={() => void saveRecipe()} className="rounded bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50">Guardar nueva versión</button>
          </div>
          <div className="mt-8 border-t border-emerald-300 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black">Recetas existentes</h3><p className="text-sm text-slate-700">Las órdenes anteriores conservan la versión usada al crearse.</p></div><input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="Buscar receta" className="rounded border bg-white p-3" /></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {inventory?.menuItems.filter((menuItem) => inventory.recipes.some((recipe) => recipe.menuItemId === menuItem.id)).filter((menuItem) => menuItem.name.toLowerCase().includes(recipeSearch.trim().toLowerCase())).map((menuItem) => {
                const ingredients = inventory.recipes.filter((recipe) => recipe.menuItemId === menuItem.id);
                const versions = inventory.recipeRevisions.filter((revision) => revision.menuItemId === menuItem.id);
                return <article key={menuItem.id} className="rounded-lg border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><strong>{menuItem.name}</strong><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold">v{Math.max(1, ...versions.map((version) => version.version))}</span></div><ul className="mt-2 space-y-1 text-sm text-slate-700">{ingredients.map((ingredient) => <li key={ingredient.id}>{ingredient.product.name}: {ingredient.quantityPerMenuItem} {unitLabel(ingredient.product.stockUnit)}</li>)}</ul><button type="button" onClick={() => { setRecipeMenuItemId(menuItem.id); document.getElementById("recipe-editor")?.scrollIntoView({ behavior: "smooth" }); }} className="mt-3 rounded border border-emerald-700 px-3 py-2 font-bold text-emerald-900">Editar receta</button></article>;
              })}
            </div>
          </div>
        </section>
      )}

      {canManageCatalog && (
        <section className="mt-6 rounded-xl border border-sky-300 bg-sky-50 p-5 shadow-sm">
          <h2 className="text-xl font-black">Combos y productos compuestos</h2>
          <p className="mt-1 text-sm text-slate-700">El combo cobra un precio, distribuye sus componentes entre cocina y bar, y descuenta la receta de cada componente.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1.2fr_140px_auto] lg:items-end">
            <label className="text-sm font-bold">Producto combo<select value={comboMenuItemId} onChange={(event) => setComboMenuItemId(event.target.value)} className="mt-1 w-full rounded border bg-white p-3"><option value="">Seleccione</option>{inventory?.menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-bold">Producto incluido<select value={comboComponentId} onChange={(event) => setComboComponentId(event.target.value)} className="mt-1 w-full rounded border bg-white p-3"><option value="">Seleccione</option>{inventory?.menuItems.filter((item) => item.id !== comboMenuItemId).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.station === "BAR" ? "Bar" : "Cocina"}</option>)}</select></label>
            <label className="text-sm font-bold">Cantidad<input type="number" min="1" step="1" value={comboQuantity} onChange={(event) => setComboQuantity(event.target.value)} className="mt-1 w-full rounded border bg-white p-3" /></label>
            <button type="button" onClick={addComboComponent} className="rounded bg-sky-800 px-4 py-3 font-black text-white">Agregar</button>
          </div>
          <div className="mt-4 space-y-2">{comboDraft.length ? comboDraft.map((component) => { const menuItem = inventory?.menuItems.find((item) => item.id === component.menuItemId); return <div key={component.menuItemId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 shadow-sm"><div><strong>{component.quantity} × {menuItem?.name}</strong><p className="text-sm text-slate-600">Estación: {menuItem?.station === "BAR" ? "Bar" : "Cocina"}</p></div><button type="button" onClick={() => setComboDraft((current) => current.filter((item) => item.menuItemId !== component.menuItemId))} className="rounded border border-red-300 px-3 py-2 font-bold text-red-700">Quitar</button></div>; }) : <p className="rounded-lg bg-white p-4 text-slate-600">Sin componentes. Guardar vacío elimina la configuración.</p>}</div>
          <button type="button" disabled={busy || !comboMenuItemId} onClick={() => void saveCombo()} className="mt-4 rounded bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50">Guardar combo</button>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="p-5"><h2 className="text-xl font-black">Existencias registradas</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-100"><tr><th className="p-3">Producto</th><th className="p-3">Categoría</th><th className="p-3">Presentación</th><th className="p-3">Cantidad / mínimo</th><th className="p-3">Costo</th><th className="p-3">Ingreso</th><th className="p-3">Último control</th>{canManageCatalog && <th className="p-3">Acción</th>}</tr></thead>
            <tbody>{inventory?.products.map((item) => {
              const weighing = item.weighings[0];
              const movement = item.movements[0];
              const low = item.active && item.quantity <= item.minimumQuantity;
              return <tr key={item.id} className={`border-t ${low ? "bg-red-50" : ""}`}><td className="p-3"><strong>{item.name}</strong>{item.productType === "LIQUOR" && <span className="ml-2 rounded bg-violet-100 px-2 py-1 text-xs font-bold text-violet-900">LICOR · {item.liquorBrand}</span>}<p className="text-xs text-slate-500">{item.menuItem ? `Menú: ${item.menuItem.name}` : "Sin vínculo directo al menú"}</p></td><td className="p-3">{item.category.name}</td><td className="p-3">{item.presentation}<span className="block text-xs text-slate-500">1 presentación = {item.unitsPerPresentation} {unitLabel(item.stockUnit)}</span></td><td className={`p-3 font-black ${low ? "text-red-700" : ""}`}>{item.quantity} / {item.minimumQuantity} {unitLabel(item.stockUnit)}</td><td className="p-3">{money(item.unitCost)}<span className="block text-xs text-slate-500">por {unitLabel(item.stockUnit)}</span></td><td className="p-3">{new Date(item.receivedAt).toLocaleDateString("es-CR")}</td><td className="p-3">{weighing ? <><p>{weighing.netWeightGrams} g netos</p><p className="text-xs text-slate-600">Consumo: {weighing.consumedWeightGrams ?? "—"} g · {weighing.relatedOrderQuantity} unidades ordenadas</p></> : movement ? <><strong>{movement.type === "CONSUMPTION" ? "Consumo automático" : movement.type === "REVERSAL" ? "Reversión automática" : movement.type === "ENTRY" ? "Ingreso" : "Ajuste"}</strong><span className="block text-xs text-slate-600">{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta} {unitLabel(movement.unitSnapshot ?? item.stockUnit)} · {new Date(movement.occurredAt).toLocaleDateString("es-CR")}</span></> : "Sin movimientos"}</td>{canManageCatalog && <td className="p-3"><button type="button" onClick={() => editProduct(item)} className="rounded border border-slate-400 px-3 py-2 font-bold">Editar medida/mínimo/costo</button></td>}</tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      {conversion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <form onSubmit={saveConversion} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black">Convertir unidad de {conversion.product.name}</h2>
            <p className="mt-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">Esta operación conserva los movimientos anteriores en su unidad original. Confirme las existencias y cada receta usando {unitLabel(conversion.stockUnit)}.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">Nueva unidad<input readOnly value={conversion.stockUnit} className="mt-1 w-full rounded border bg-slate-100 p-3" /></label>
              <label className="text-sm font-bold">Contenido por presentación<input required type="number" min="1" value={conversion.unitsPerPresentation} onChange={(event) => setConversion({ ...conversion, unitsPerPresentation: event.target.value })} className="mt-1 w-full rounded border p-3" /></label>
              <label className="text-sm font-bold">Existencia actual convertida<input required type="number" min="0" value={conversion.quantity} onChange={(event) => setConversion({ ...conversion, quantity: event.target.value })} className="mt-1 w-full rounded border p-3" /></label>
              <label className="text-sm font-bold">Mínimo convertido<input required type="number" min="0" value={conversion.minimumQuantity} onChange={(event) => setConversion({ ...conversion, minimumQuantity: event.target.value })} className="mt-1 w-full rounded border p-3" /></label>
              <label className="text-sm font-bold">Costo por nueva unidad<input required type="number" min="0" value={conversion.unitCost} onChange={(event) => setConversion({ ...conversion, unitCost: event.target.value })} className="mt-1 w-full rounded border p-3" /></label>
              <label className="text-sm font-bold">Motivo<input required value={conversion.reason} onChange={(event) => setConversion({ ...conversion, reason: event.target.value })} className="mt-1 w-full rounded border p-3" /></label>
            </div>
            {Object.keys(conversion.recipeUpdates).length ? <div className="mt-5"><h3 className="font-black">Actualizar recetas relacionadas</h3><div className="mt-2 space-y-2">{Object.entries(conversion.recipeUpdates).map(([menuItemId, quantity]) => <label key={menuItemId} className="grid gap-2 rounded border p-3 sm:grid-cols-[1fr_180px] sm:items-center"><span className="font-bold">{inventory?.menuItems.find((item) => item.id === menuItemId)?.name}</span><span className="flex items-center gap-2"><input required type="number" min="1" value={quantity} onChange={(event) => setConversion({ ...conversion, recipeUpdates: { ...conversion.recipeUpdates, [menuItemId]: event.target.value } })} className="w-full rounded border p-2" />{unitLabel(conversion.stockUnit)}</span></label>)}</div></div> : null}
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConversion(null)} className="rounded border px-5 py-3 font-bold">Cancelar</button><button disabled={busy} className="rounded bg-emerald-700 px-5 py-3 font-black text-white">Confirmar conversión</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
