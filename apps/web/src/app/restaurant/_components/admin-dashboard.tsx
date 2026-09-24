"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { RestaurantSessionActions } from "./restaurant-session-actions";

type Table = {
  id: string;
  name: string;
  code: string;
  waiterId?: string | null;
  waiter?: { id: string; name: string; email: string } | null;
  serviceChargeEnabled: boolean;
  kind: "DINING" | "TAKEOUT_STATION";
};
type RestaurantRole = "RESTAURANT_ADMIN" | "KITCHEN" | "BAR" | "WAITER";
type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantRole: RestaurantRole | null;
  restaurantAvailability:
    "AVAILABLE" | "BREAK" | "TEMPORARILY_UNAVAILABLE" | "OFF_SHIFT";
};
type MenuItem = {
  id: string;
  name: string;
  price: number;
  station: string;
  course: string;
  active: boolean;
  productType: string;
  categories: string[];
  origin: "HOUSE_MADE" | "THIRD_PARTY";
  prepMinutes?: number | null;
  alcoholic: boolean;
  imageData?: string | null;
};
type Promotion = {
  id: string;
  title: string;
  productType?: string | null;
  creditAmount: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
};
type InvoiceRequest = {
  id: string;
  table: { name: string };
  invoiceRequestStatus: string;
  invoiceName: string;
  invoiceEmail: string;
  invoicePhone: string;
  invoiceTaxId: string;
  invoiceRequestedAt: string;
};
type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  station: string;
  course: string;
  status: string;
  acceptedAt?: string;
  readyAt?: string;
};
type Order = {
  id: string;
  createdAt: string;
  table: { name: string };
  items: OrderItem[];
};
type Station = "KITCHEN" | "BAR";
type BillingSettings = {
  restaurantTaxRateBps: number;
  restaurantTaxIncluded: boolean;
  restaurantServiceRateBps: number;
};
const nextStatus: Record<string, string | null> = {
  RECEIVED: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

export default function RestaurantAdminDashboard() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [station, setStation] = useState<Station>("KITCHEN");
  const [tableName, setTableName] = useState("");
  const [tableKind, setTableKind] = useState<"DINING" | "TAKEOUT_STATION">(
    "DINING",
  );
  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [itemStation, setItemStation] = useState<Station>("KITCHEN");
  const [course, setCourse] = useState("MAIN");
  const [productType, setProductType] = useState("Platos fuertes");
  const [categories, setCategories] = useState("");
  const [origin, setOrigin] = useState<"HOUSE_MADE" | "THIRD_PARTY">(
    "HOUSE_MADE",
  );
  const [prepMinutes, setPrepMinutes] = useState("10");
  const [alcoholic, setAlcoholic] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [invoiceRequests, setInvoiceRequests] = useState<InvoiceRequest[]>([]);
  const [promotionTitle, setPromotionTitle] = useState("");
  const [promotionType, setPromotionType] = useState("");
  const [promotionCredit, setPromotionCredit] = useState("0");
  const [promotionStart, setPromotionStart] = useState("");
  const [promotionEnd, setPromotionEnd] = useState("");
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  const [error, setError] = useState("");
  const [billing, setBilling] = useState<BillingSettings | null>(null);
  const [taxRate, setTaxRate] = useState("13");
  const [serviceRate, setServiceRate] = useState("10");
  const [taxIncluded, setTaxIncluded] = useState(false);
  const billingInitialized = useRef(false);

  const load = useCallback(async () => {
    try {
      const responses = await Promise.all(
        [
          "tables",
          "menu",
          "orders",
          "staff-users",
          "billing-settings",
          "promotions",
          "invoice-requests",
        ].map((path) =>
          authenticatedFetch(`${API_URL}/api/v1/restaurant/${path}`),
        ),
      );
      if (responses.some((response) => response.status === 401)) {
        router.replace("/?next=/restaurant/admin");
        return;
      }
      if (responses.some((response) => response.status === 403)) {
        router.replace("/restaurant/staff");
        return;
      }
      if (responses.some((response) => !response.ok))
        throw new Error("Unable to load restaurant workspace");
      const [
        tableData,
        menuData,
        orderData,
        staffData,
        billingData,
        promotionData,
        invoiceData,
      ] = await Promise.all(responses.map((response) => response.json()));
      setTables(tableData);
      setMenu(menuData);
      setOrders(orderData);
      setStaffUsers(staffData);
      setBilling(billingData);
      setPromotions(promotionData);
      setInvoiceRequests(invoiceData);
      if (!billingInitialized.current) {
        setTaxRate(String(billingData.restaurantTaxRateBps / 100));
        setServiceRate(String(billingData.restaurantServiceRateBps / 100));
        setTaxIncluded(billingData.restaurantTaxIncluded);
        billingInitialized.current = true;
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load orders");
    }
  }, [router]);
  useEffect(() => {
    if (!sessionStorage.getItem("assettrack_token")) {
      router.replace("/?next=/restaurant/admin");
      return;
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load, router]);

  async function post(path: string, payload: object, method = "POST") {
    setError("");
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/${path}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join(", ")
            : body.message || "Update failed",
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }
  async function showQr(id: string) {
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/tables/${id}/qr`,
      );
      if (!response.ok) throw new Error("QR unavailable");
      setQr(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR unavailable");
    }
  }

  async function selectProductImage(file?: File) {
    if (!file) {
      setImageData(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("La imagen debe ser JPEG, PNG o WebP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen supera el límite de 2 MB de la prueba gratuita");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new window.Image();
        image.onerror = () => reject(new Error("La imagen no es válida"));
        image.onload = () =>
          resolve({ width: image.width, height: image.height });
        image.src = dataUrl;
      },
    );
    if (dimensions.width > 1600 || dimensions.height > 1600) {
      setError("La resolución máxima es 1600 × 1600 píxeles");
      return;
    }
    setImageData(dataUrl);
    setError("");
  }

  const visible = orders.flatMap((order) =>
    order.items
      .filter(
        (item) =>
          item.station === station &&
          !["DELIVERED", "CANCELLED"].includes(item.status),
      )
      .map((item) => ({ order, item })),
  );
  const isAdmin = true;
  const waiters = staffUsers.filter((user) => user.restaurantRole === "WAITER");
  const availableWaiters = waiters.filter(
    (user) => user.restaurantAvailability === "AVAILABLE",
  );
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-slate-900">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold tracking-widest text-emerald-700">
            ASSETTRACK · PILOT
          </p>
          <h1 className="text-3xl font-bold">Administración del restaurante</h1>
        </div>
        <div className="rounded bg-slate-900 p-2 text-white">
          <RestaurantSessionActions admin />
        </div>
      </header>
      {error && (
        <p role="alert" className="my-4 rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      <div className="mb-5 flex gap-2">
        {(["KITCHEN", "BAR"] as const).map((value) => (
          <button
            key={value}
            className={`rounded px-5 py-3 ${station === value ? "bg-emerald-600 text-white" : "bg-slate-100"}`}
            onClick={() => setStation(value)}
          >
            {value === "KITCHEN" ? "Kitchen" : "Bar"}
          </button>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          {station === "KITCHEN" ? "Kitchen" : "Bar"} queue · {visible.length}{" "}
          items
        </h2>
        {visible.length === 0 && (
          <p className="rounded border p-4">No open items for this station.</p>
        )}
        {visible.map(({ order, item }) => (
          <article
            key={item.id}
            className="rounded-xl border bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong>
                  {order.table.name} · {item.quantity} × {item.name}
                </strong>
                <p className="text-sm text-slate-600">
                  {item.course.toLowerCase()} · {item.status.toLowerCase()} ·
                  received {new Date(order.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex gap-2">
                {nextStatus[item.status] && (
                  <button
                    className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white"
                    onClick={() =>
                      void post(
                        `items/${item.id}/status`,
                        { status: nextStatus[item.status] },
                        "PATCH",
                      )
                    }
                  >
                    {nextStatus[item.status] === "DELIVERED"
                      ? "Mark delivered"
                      : nextStatus[item.status] === "READY"
                        ? "Mark ready"
                        : nextStatus[item.status] === "ACCEPTED"
                          ? "Accept"
                          : "Start"}
                  </button>
                )}
                {isAdmin &&
                  ["RECEIVED", "ACCEPTED", "PREPARING"].includes(
                    item.status,
                  ) && (
                    <button
                      className="rounded border border-red-300 px-3 py-2 text-red-700"
                      onClick={() => {
                        const reason = window.prompt(
                          "Motivo obligatorio para cancelar toda la orden",
                        );
                        if (reason?.trim()) {
                          void post(
                            `orders/${order.id}/cancel`,
                            { reason: reason.trim() },
                            "PATCH",
                          );
                        }
                      }}
                    >
                      Cancelar orden
                    </button>
                  )}
              </div>
            </div>
          </article>
        ))}
      </section>
      {isAdmin && (
        <>
          <section className="mt-12 rounded-xl border bg-slate-50 p-5">
            <h2 className="text-xl font-bold">Configuración de facturación</h2>
            <p className="mt-1 text-sm text-slate-600">
              Define cómo se calcula el IVA y el servicio para las cuentas
              abiertas.
            </p>
            <form
              className="mt-4 grid gap-4 md:grid-cols-4 md:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                const taxRateBps = Math.round(Number(taxRate) * 100);
                const serviceRateBps = Math.round(Number(serviceRate) * 100);
                if (
                  !Number.isFinite(taxRateBps) ||
                  !Number.isFinite(serviceRateBps) ||
                  taxRateBps < 0 ||
                  serviceRateBps < 0
                ) {
                  setError("Ingrese porcentajes válidos");
                  return;
                }
                void post(
                  "billing-settings",
                  { taxRateBps, taxIncluded, serviceRateBps },
                  "PATCH",
                );
              }}
            >
              <label className="font-semibold">
                IVA (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={taxRate}
                  onChange={(event) => setTaxRate(event.target.value)}
                />
              </label>
              <label className="font-semibold">
                Tratamiento del IVA
                <select
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={taxIncluded ? "included" : "added"}
                  onChange={(event) =>
                    setTaxIncluded(event.target.value === "included")
                  }
                >
                  <option value="added">Agregar al subtotal</option>
                  <option value="included">Incluido en los precios</option>
                </select>
              </label>
              <label className="font-semibold">
                Servicio de mesa (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="mt-1 w-full rounded border bg-white p-2"
                  value={serviceRate}
                  onChange={(event) => setServiceRate(event.target.value)}
                />
              </label>
              <button className="rounded bg-slate-900 px-4 py-3 font-semibold text-white">
                Guardar configuración
              </button>
            </form>
            {billing && (
              <p className="mt-3 text-sm text-emerald-800">
                Configuración activa: IVA {billing.restaurantTaxRateBps / 100}%{" "}
                {billing.restaurantTaxIncluded ? "incluido" : "agregado"};
                servicio {billing.restaurantServiceRateBps / 100}%.
              </p>
            )}
          </section>
          <section className="mt-12 grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-xl font-bold">Tables & QR codes</h2>
              <form
                className="my-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void post("tables", {
                    name: tableName,
                    kind: tableKind,
                  }).then(() => setTableName(""));
                }}
              >
                <input
                  required
                  maxLength={60}
                  className="min-w-0 flex-1 rounded border p-2"
                  placeholder="Table name"
                  value={tableName}
                  onChange={(event) => setTableName(event.target.value)}
                />
                <select
                  className="rounded border bg-white p-2"
                  value={tableKind}
                  onChange={(event) =>
                    setTableKind(
                      event.target.value as "DINING" | "TAKEOUT_STATION",
                    )
                  }
                >
                  <option value="DINING">Mesa de salón</option>
                  <option value="TAKEOUT_STATION">Estación para llevar</option>
                </select>
                <button className="rounded bg-slate-900 px-3 text-white">
                  Add table
                </button>
              </form>
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="grid gap-2 border-b py-3 sm:grid-cols-[1fr_220px_auto] sm:items-center"
                >
                  <span>{table.name}</span>
                  {table.kind === "DINING" ? (
                    <select
                      aria-label={`Mesero asignado a ${table.name}`}
                      className="rounded border p-2"
                      value={table.waiterId ?? ""}
                      onChange={(event) =>
                        void post(
                          `tables/${table.id}/waiter`,
                          { waiterId: event.target.value || null },
                          "PATCH",
                        )
                      }
                    >
                      <option value="">Sin mesero asignado</option>
                      {availableWaiters.map((waiter) => (
                        <option key={waiter.id} value={waiter.id}>
                          {waiter.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded bg-amber-50 p-2 text-sm font-semibold">
                      Pedidos para llevar
                    </span>
                  )}
                  <button
                    className="text-emerald-700 underline"
                    onClick={() => void showQr(table.id)}
                  >
                    Show QR
                  </button>
                  <label className="col-span-full flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={table.serviceChargeEnabled}
                      onChange={(event) =>
                        void post(
                          `tables/${table.id}/billing`,
                          { serviceChargeEnabled: event.target.checked },
                          "PATCH",
                        )
                      }
                    />
                    Aplicar servicio de mesa
                  </label>
                </div>
              ))}
              {qr && (
                <div className="my-3 rounded border p-4">
                  <Image
                    src={qr.image}
                    alt="QR code for this table"
                    width={260}
                    height={260}
                    unoptimized
                  />
                  <a
                    className="break-all text-emerald-700 underline"
                    href={qr.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {qr.url}
                  </a>
                  <p className="mt-2 text-sm">
                    Print this QR and place it on the selected table.
                  </p>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">Menu</h2>
              <form
                className="my-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = Number(price);
                  if (!Number.isInteger(value) || value < 0) {
                    setError("Enter a valid price in colones");
                    return;
                  }
                  void post("menu", {
                    name: itemName,
                    price: value,
                    station: itemStation,
                    course,
                    productType,
                    categories: categories
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                    origin,
                    prepMinutes:
                      origin === "HOUSE_MADE" ? Number(prepMinutes) : undefined,
                    alcoholic,
                    imageData,
                  }).then(() => {
                    setItemName("");
                    setPrice("");
                    setImageData(null);
                  });
                }}
              >
                <input
                  required
                  maxLength={100}
                  className="w-full rounded border p-2"
                  placeholder="Item name"
                  value={itemName}
                  onChange={(event) => setItemName(event.target.value)}
                />
                <input
                  required
                  maxLength={60}
                  className="w-full rounded border p-2"
                  placeholder="Tipo de producto: Postres, Platos fuertes..."
                  value={productType}
                  onChange={(event) => setProductType(event.target.value)}
                />
                <input
                  className="w-full rounded border p-2"
                  placeholder="Categorías adicionales, separadas por coma"
                  value={categories}
                  onChange={(event) => setCategories(event.target.value)}
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <select
                    className="rounded border bg-white p-2"
                    value={origin}
                    onChange={(event) =>
                      setOrigin(
                        event.target.value as "HOUSE_MADE" | "THIRD_PARTY",
                      )
                    }
                  >
                    <option value="HOUSE_MADE">Hecho en casa</option>
                    <option value="THIRD_PARTY">De terceros</option>
                  </select>
                  <input
                    disabled={origin === "THIRD_PARTY"}
                    required={origin === "HOUSE_MADE"}
                    min="5"
                    max="15"
                    type="number"
                    className="rounded border p-2"
                    placeholder="Minutos de elaboración"
                    value={prepMinutes}
                    onChange={(event) => setPrepMinutes(event.target.value)}
                  />
                  <label className="flex items-center gap-2 rounded border p-2">
                    <input
                      type="checkbox"
                      checked={alcoholic}
                      onChange={(event) => setAlcoholic(event.target.checked)}
                    />{" "}
                    Contiene alcohol
                  </label>
                </div>
                <label className="block rounded border p-2 text-sm">
                  Imagen del producto (JPEG, PNG o WebP; máximo 2 MB y 1600 ×
                  1600)
                  <input
                    className="mt-2 block w-full"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      void selectProductImage(event.target.files?.[0])
                    }
                  />
                </label>
                <input
                  required
                  min="0"
                  step="1"
                  type="number"
                  className="w-full rounded border p-2"
                  placeholder="Price in colones"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
                <div className="flex gap-2">
                  <select
                    className="rounded border p-2"
                    value={itemStation}
                    onChange={(event) =>
                      setItemStation(event.target.value as Station)
                    }
                  >
                    <option value="KITCHEN">Kitchen</option>
                    <option value="BAR">Bar</option>
                  </select>
                  <select
                    className="rounded border p-2"
                    value={course}
                    onChange={(event) => setCourse(event.target.value)}
                  >
                    <option value="DRINK">Drink</option>
                    <option value="STARTER">Starter</option>
                    <option value="MAIN">Main</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <button className="rounded bg-slate-900 px-3 text-white">
                    Add item
                  </button>
                </div>
              </form>
              {menu.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b py-2"
                >
                  <span>
                    {item.name} · ₡{item.price.toLocaleString()} ·{" "}
                    {item.productType} {item.active ? "" : "(unavailable)"}
                  </span>
                  <button
                    className="text-emerald-700 underline"
                    onClick={() =>
                      void post(
                        `menu/${item.id}`,
                        { active: !item.active },
                        "PATCH",
                      )
                    }
                  >
                    {item.active ? "Pause" : "Enable"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <section className="mt-12 grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-xl font-bold">Promociones</h2>
          <p className="mt-1 text-sm text-slate-600">
            Una promoción vigente podrá mostrarse al iniciar una orden
            adicional. El precio de catálogo no cambia; el beneficio se aplica
            como crédito.
          </p>
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void post("promotions", {
                title: promotionTitle,
                productType: promotionType,
                creditAmount: Number(promotionCredit),
                startsAt: new Date(promotionStart).toISOString(),
                endsAt: new Date(promotionEnd).toISOString(),
              }).then(() => {
                setPromotionTitle("");
                setPromotionCredit("0");
              });
            }}
          >
            <input
              required
              className="w-full rounded border p-2"
              placeholder="Nombre de la promoción"
              value={promotionTitle}
              onChange={(event) => setPromotionTitle(event.target.value)}
            />
            <input
              required
              className="w-full rounded border p-2"
              placeholder="Tipo de producto promocionado"
              value={promotionType}
              onChange={(event) => setPromotionType(event.target.value)}
              list="restaurant-product-types"
            />
            <datalist id="restaurant-product-types">
              {[...new Set(menu.map((item) => item.productType))].map(
                (type) => (
                  <option key={type} value={type} />
                ),
              )}
            </datalist>
            <input
              required
              min="0"
              type="number"
              className="w-full rounded border p-2"
              placeholder="Crédito en colones"
              value={promotionCredit}
              onChange={(event) => setPromotionCredit(event.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                Inicio
                <input
                  required
                  type="datetime-local"
                  className="mt-1 w-full rounded border p-2"
                  value={promotionStart}
                  onChange={(event) => setPromotionStart(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Final
                <input
                  required
                  type="datetime-local"
                  className="mt-1 w-full rounded border p-2"
                  value={promotionEnd}
                  onChange={(event) => setPromotionEnd(event.target.value)}
                />
              </label>
            </div>
            <button className="rounded bg-fuchsia-700 px-4 py-2 font-semibold text-white">
              Crear promoción
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {promotions.map((promotion) => (
              <div key={promotion.id} className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <strong>{promotion.title}</strong>
                  <button
                    className="text-emerald-700 underline"
                    onClick={() =>
                      void post(
                        `promotions/${promotion.id}`,
                        { active: !promotion.active },
                        "PATCH",
                      )
                    }
                  >
                    {promotion.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
                <p className="text-sm">
                  {promotion.productType} · crédito ₡
                  {promotion.creditAmount.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(promotion.startsAt).toLocaleString()} —{" "}
                  {new Date(promotion.endsAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-xl font-bold">
            Solicitudes de factura electrónica
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            La aplicación recopila la solicitud; la emisión se realiza mediante
            el proceso externo del restaurante.
          </p>
          <div className="mt-4 space-y-3">
            {invoiceRequests.length === 0 && (
              <p>No hay solicitudes pendientes.</p>
            )}
            {invoiceRequests.map((request) => (
              <article key={request.id} className="rounded border p-3">
                <strong>
                  {request.table.name} · {request.invoiceName}
                </strong>
                <p className="text-sm">
                  {request.invoiceTaxId} · {request.invoiceEmail} ·{" "}
                  {request.invoicePhone}
                </p>
                <p className="text-sm">
                  Estado: {request.invoiceRequestStatus}
                </p>
                {request.invoiceRequestStatus === "PENDING" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded bg-emerald-700 px-3 py-1 text-white"
                      onClick={() => {
                        const reference = window.prompt(
                          "Referencia de la factura emitida",
                        );
                        if (reference?.trim())
                          void post(
                            `invoice-requests/${request.id}`,
                            { status: "PROCESSED", reference },
                            "PATCH",
                          );
                      }}
                    >
                      Marcar procesada
                    </button>
                    <button
                      className="rounded border border-red-500 px-3 py-1 text-red-700"
                      onClick={() =>
                        void post(
                          `invoice-requests/${request.id}`,
                          { status: "REJECTED" },
                          "PATCH",
                        )
                      }
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="mt-12">
        <h2 className="text-xl font-bold">Personal y estación de trabajo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Los propietarios y administradores generales conservan acceso total.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm">
              <tr>
                <th className="p-3">Persona</th>
                <th className="p-3">Correo</th>
                <th className="p-3">Dashboard</th>
                <th className="p-3">Disponibilidad</th>
              </tr>
            </thead>
            <tbody>
              {staffUsers.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="p-3 font-semibold">{user.name}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">
                    {user.role === "OWNER" || user.role === "ADMIN" ? (
                      <span className="font-semibold text-emerald-700">
                        Administración
                      </span>
                    ) : (
                      <select
                        className="rounded border p-2"
                        value={user.restaurantRole ?? ""}
                        onChange={(event) =>
                          void post(
                            `staff-users/${user.id}/role`,
                            { role: event.target.value || null },
                            "PATCH",
                          )
                        }
                      >
                        <option value="">Sin acceso al restaurante</option>
                        <option value="RESTAURANT_ADMIN">Administración</option>
                        <option value="KITCHEN">Cocina</option>
                        <option value="BAR">Bar</option>
                        <option value="WAITER">Mesero</option>
                      </select>
                    )}
                  </td>
                  <td className="p-3">
                    <select
                      className="rounded border p-2"
                      value={user.restaurantAvailability}
                      onChange={(event) => {
                        const availability = event.target.value;
                        const reason =
                          availability === "AVAILABLE"
                            ? "Reincorporación autorizada"
                            : window.prompt(
                                "Indique el motivo del cambio de disponibilidad",
                              );
                        if (!reason?.trim()) return;
                        void post(
                          `staff-users/${user.id}/availability`,
                          { availability, reason: reason.trim() },
                          "PATCH",
                        );
                      }}
                    >
                      <option value="AVAILABLE">Disponible</option>
                      <option value="BREAK">Descanso</option>
                      <option value="TEMPORARILY_UNAVAILABLE">
                        Fuera de servicio temporal
                      </option>
                      <option value="OFF_SHIFT">Turno finalizado</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
