"use client";

import { API_URL } from "@/lib/api";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Fulfillment = "DINE_IN" | "TAKEOUT";
type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  station: string;
  course: string;
  available: boolean;
  productType: string;
  categories: string[];
  alcoholic: boolean;
  imageData?: string | null;
};
type Promotion = {
  id: string;
  title: string;
  productType?: string | null;
  menuItemId?: string | null;
  creditAmount: number;
  menuItem: MenuItem;
};
type Menu = {
  restaurant: string;
  branding: {
    displayName: string;
    headerImageData?: string | null;
    useHeaderImage: boolean;
    menuBackgroundImageData?: string | null;
    menuBackgroundEnabled: boolean;
    menuBackgroundPosition: "center" | "top" | "bottom";
    menuBackgroundSize: "cover" | "contain";
  };
  table: string;
  tableKind: "DINING" | "TAKEOUT_STATION";
  activeAccountCount: number;
  waiter: { id: string; name: string } | null;
  productTypes: string[];
  promotions: Promotion[];
  billing: {
    taxRateBps: number;
    taxIncluded: boolean;
    serviceRateBps: number;
    serviceChargeEnabled: boolean;
  };
  menu: MenuItem[];
};

const categoryStyles = [
  "border-rose-300 bg-rose-100 text-rose-950",
  "border-amber-300 bg-amber-100 text-amber-950",
  "border-emerald-300 bg-emerald-100 text-emerald-950",
  "border-sky-300 bg-sky-100 text-sky-950",
  "border-violet-300 bg-violet-100 text-violet-950",
  "border-pink-300 bg-pink-100 text-pink-950",
];

export default function RestaurantTablePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [data, setData] = useState<Menu | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<Fulfillment>("DINE_IN");
  const [takeoutItems, setTakeoutItems] = useState<Record<string, boolean>>({});
  const [activeType, setActiveType] = useState<string | null>(null);
  const [showMainMenu, setShowMainMenu] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<string | null>(null);
  const [separateAcknowledged, setSeparateAcknowledged] = useState(false);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [promotionQuantity, setPromotionQuantity] = useState(1);
  const requestId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/restaurant/guest/tables/${encodeURIComponent(code)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Esta estación no está disponible.");
      const next: Menu = await response.json();
      setData(next);
      if (next.tableKind === "TAKEOUT_STATION") setFulfillment("TAKEOUT");
      setActiveType((current) => current ?? next.productTypes[0] ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el menú",
      );
    }
  }, [code]);

  useEffect(() => {
    void load();
    const storageKey = `assettrack_restaurant_order_${code}`;
    const storedAccessCode = window.localStorage.getItem(storageKey);
    if (!storedAccessCode) {
      setTrackedOrder(null);
      return;
    }
    let active = true;
    void fetch(
      `${API_URL}/api/v1/restaurant/guest/orders/${encodeURIComponent(storedAccessCode)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          status: "OPEN" | "CLOSED";
          table: { code: string };
        }>;
      })
      .then((account) => {
        if (!active) return;
        if (account?.status === "OPEN" && account.table.code === code) {
          setTrackedOrder(storedAccessCode);
          return;
        }
        window.localStorage.removeItem(storageKey);
        setTrackedOrder(null);
      })
      .catch(() => {
        if (active) setTrackedOrder(storedAccessCode);
      });
    return () => {
      active = false;
    };
  }, [code, load]);

  useEffect(() => {
    if (!data || promotion) return;
    const key = `assettrack_promotions_seen_${code}`;
    const seen = new Set<string>(
      JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[],
    );
    const selected =
      data.promotions.find((candidate) => !seen.has(candidate.id)) ??
      data.promotions[0] ??
      null;
    if (selected) {
      seen.add(selected.id);
      window.localStorage.setItem(key, JSON.stringify([...seen]));
      setPromotion(selected);
    }
  }, [code, data, promotion]);

  function addPromotionToCart() {
    if (!promotion?.menuItem.available) return;
    setQuantities((current) => ({
      ...current,
      [promotion.menuItem.id]:
        (current[promotion.menuItem.id] ?? 0) + promotionQuantity,
    }));
    setActiveType(promotion.menuItem.productType);
    setError("");
    document
      .getElementById(`menu-item-${promotion.menuItem.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const recentTypes = useMemo(() => {
    if (typeof window === "undefined") return [] as string[];
    return JSON.parse(
      window.localStorage.getItem(`assettrack_recent_types_${code}`) ?? "[]",
    ) as string[];
  }, [code, trackedOrder]);
  const menuTypes = [
    ...recentTypes.filter((type) => data?.productTypes.includes(type)),
    ...(data?.productTypes.filter((type) => !recentTypes.includes(type)) ?? []),
  ];
  const visibleItems =
    data?.menu.filter(
      (item) => activeType === null || item.productType === activeType,
    ) ?? [];

  async function submit() {
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([menuItemId, quantity]) => ({
        menuItemId,
        quantity,
        fulfillment:
          data?.tableKind === "TAKEOUT_STATION" ||
          fulfillment === "TAKEOUT" ||
          takeoutItems[menuItemId]
            ? "TAKEOUT"
            : "DINE_IN",
      }));
    if (!items.length) {
      setError("Seleccione al menos un producto.");
      return;
    }
    if (
      data &&
      data.activeAccountCount > 0 &&
      !trackedOrder &&
      !separateAcknowledged
    ) {
      setError(
        "Confirme que desea iniciar una cuenta separada para esta mesa.",
      );
      return;
    }
    setSending(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        `${API_URL}/api/v1/restaurant/guest/tables/${encodeURIComponent(code)}/orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            requestId: requestId.current,
            accountAccessCode: trackedOrder ?? undefined,
            fulfillment:
              data?.tableKind === "TAKEOUT_STATION" ? "TAKEOUT" : fulfillment,
            promotionId: promotion?.id,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        const message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
        if (
          response.status === 400 &&
          typeof message === "string" &&
          (message.includes("cuenta anterior") ||
            message.includes("selected account"))
        ) {
          window.localStorage.removeItem(`assettrack_restaurant_order_${code}`);
          setTrackedOrder(null);
          setSeparateAcknowledged(false);
          requestId.current = null;
          throw new Error(
            "La cuenta anterior ya fue cerrada o trasladada. Revise el menú y confirme nuevamente para iniciar una cuenta nueva.",
          );
        }
        throw new Error(message || "No se pudo enviar la orden");
      }
      const orderedTypes = [
        ...new Set(
          items
            .map(
              (line) =>
                data?.menu.find((item) => item.id === line.menuItemId)
                  ?.productType,
            )
            .filter(Boolean) as string[],
        ),
      ];
      window.localStorage.setItem(
        `assettrack_recent_types_${code}`,
        JSON.stringify([
          ...orderedTypes,
          ...recentTypes.filter((type) => !orderedTypes.includes(type)),
        ]),
      );
      window.localStorage.setItem(
        `assettrack_restaurant_order_${code}`,
        body.accessCode,
      );
      router.push(`/restaurant/order/${body.accessCode}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo enviar la orden",
      );
    } finally {
      setSending(false);
    }
  }

  const selected =
    data?.menu.filter(
      (item) => item.available && (quantities[item.id] ?? 0) > 0,
    ) ?? [];
  const grossSubtotal = selected.reduce(
    (sum, item) => sum + item.price * quantities[item.id],
    0,
  );
  const eligible = promotion
    ? selected
        .filter(
          (item) =>
            (!promotion.menuItemId || promotion.menuItemId === item.id) &&
            (!promotion.productType ||
              promotion.productType === item.productType),
        )
        .reduce((sum, item) => sum + item.price * quantities[item.id], 0)
    : 0;
  const credit = Math.min(promotion?.creditAmount ?? 0, eligible);
  const subtotal = grossSubtotal - credit;
  const tax = data?.billing.taxIncluded
    ? Math.round(
        subtotal - (subtotal * 10000) / (10000 + data.billing.taxRateBps),
      )
    : Math.round((subtotal * (data?.billing.taxRateBps ?? 0)) / 10000);
  const service = data?.billing.serviceChargeEnabled
    ? Math.round((subtotal * data.billing.serviceRateBps) / 10000)
    : 0;
  const total = subtotal + service + (data?.billing.taxIncluded ? 0 : tax);
  const menuBackgroundStyle: CSSProperties | undefined =
    data?.branding.menuBackgroundEnabled &&
    data.branding.menuBackgroundImageData
      ? {
          backgroundAttachment: "fixed",
          backgroundImage: `linear-gradient(rgba(248, 250, 252, 0.88), rgba(248, 250, 252, 0.88)), url("${data.branding.menuBackgroundImageData}")`,
          backgroundPosition: `center ${data.branding.menuBackgroundPosition}`,
          backgroundRepeat: "no-repeat",
          backgroundSize: data.branding.menuBackgroundSize,
        }
      : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-slate-900">
      {trackedOrder && (
        <button
          type="button"
          onClick={() => router.push(`/restaurant/order/${trackedOrder}`)}
          className="fixed bottom-5 right-5 z-20 rounded-full bg-sky-700 px-5 py-3 font-bold text-white shadow-lg"
        >
          🧾 Ver mi cuenta
        </button>
      )}
      <header className="mb-6">
        <p className="font-semibold tracking-widest text-emerald-700">
          ASSETTRACK · RESTAURANTE
        </p>
        {data?.branding.useHeaderImage && data.branding.headerImageData ? (
          <Image
            src={data.branding.headerImageData}
            alt={data.branding.displayName}
            width={600}
            height={200}
            unoptimized
            className="mt-2 h-auto max-h-24 w-auto max-w-full object-contain object-left"
          />
        ) : (
          <h1 className="text-3xl font-bold">
            {data?.branding.displayName ?? data?.restaurant ?? "Menú"}
          </h1>
        )}
        <p>{data?.table ?? "Cargando..."}</p>
        {data && data.tableKind === "DINING" && (
          <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sky-900">
            {data.waiter
              ? `Mesero a cargo: ${data.waiter.name}`
              : "Asignando mesero, es un gusto servirle."}
          </p>
        )}
      </header>

      {data &&
        data.activeAccountCount > 0 &&
        !trackedOrder &&
        !separateAcknowledged && (
          <section className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-bold">
              Está iniciando una cuenta separada en {data.table}.
            </p>
            <p className="mt-1 text-sm">
              Sus pedidos y cobro se mantendrán separados de las demás cuentas.
            </p>
            <button
              className="mt-3 rounded bg-amber-600 px-4 py-2 font-semibold text-white"
              onClick={() => setSeparateAcknowledged(true)}
            >
              Comprendo, continuar
            </button>
          </section>
        )}
      {promotion && (
        <section className="mb-6 rounded-2xl bg-fuchsia-700 p-5 text-white shadow-lg ring-4 ring-fuchsia-200">
          <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-700">
            Promoción
          </span>
          <p className="text-2xl font-black">{promotion.title}</p>
          <p className="mt-1 text-lg">{promotion.menuItem.name}</p>
          {promotion.creditAmount > 0 && (
            <p className="font-semibold">
              Crédito de hasta ₡{promotion.creditAmount.toLocaleString()}.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="font-semibold">
              Cantidad{" "}
              <select
                className="rounded bg-white px-3 py-2 text-slate-950"
                value={promotionQuantity}
                onChange={(event) =>
                  setPromotionQuantity(Number(event.target.value))
                }
              >
                {Array.from({ length: 10 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={addPromotionToCart}
              className="rounded-lg bg-white px-5 py-3 font-black text-fuchsia-800"
            >
              Agregar promoción al pedido
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}

      {data?.tableKind === "DINING" && (
        <fieldset className="mb-5 min-h-36 rounded-xl border bg-white px-4 pb-5 pt-3">
          <legend className="max-w-full px-2 text-lg font-bold leading-snug">
            ¿Cómo desea su pedido?
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-12 items-center gap-2 rounded-lg bg-slate-50 p-3">
              <input
                type="radio"
                checked={fulfillment === "DINE_IN"}
                onChange={() => setFulfillment("DINE_IN")}
              />
              <span>Consumir en el local</span>
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-lg bg-slate-50 p-3">
              <input
                type="radio"
                checked={fulfillment === "TAKEOUT"}
                onChange={() => setFulfillment("TAKEOUT")}
              />
              <span>Todo para llevar</span>
            </label>
          </div>
        </fieldset>
      )}

      <section
        className="rounded-2xl px-3 py-4 sm:px-4"
        style={menuBackgroundStyle}
      >
        <nav className="mb-5 flex flex-wrap gap-2">
          <button
            aria-pressed={showMainMenu}
            className={`rounded-lg border border-sky-300 bg-sky-100 px-4 py-2 font-semibold text-sky-950 ${
              showMainMenu ? "ring-2 ring-sky-700 ring-offset-2" : ""
            }`}
            onClick={() => setShowMainMenu(true)}
          >
            Menú principal
          </button>
          <button
            aria-pressed={!showMainMenu}
            className={`rounded-lg border border-emerald-300 bg-emerald-100 px-4 py-2 font-semibold text-emerald-950 ${
              !showMainMenu ? "ring-2 ring-emerald-700 ring-offset-2" : ""
            }`}
            onClick={() => setShowMainMenu(false)}
          >
            Menú rápido
          </button>
        </nav>
        <div className="mb-6 flex flex-wrap gap-2">
          {(showMainMenu ? (data?.productTypes ?? []) : menuTypes).map(
            (type, index) => (
              <button
                key={type}
                aria-pressed={activeType === type}
                onClick={() => setActiveType(type)}
                className={`rounded-full border px-4 py-2 font-semibold transition ${
                  categoryStyles[index % categoryStyles.length]
                } ${
                  activeType === type
                    ? "ring-2 ring-slate-800 ring-offset-2"
                    : "hover:brightness-95"
                }`}
              >
                {type}
              </button>
            ),
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {visibleItems.map((item) => (
            <section
              key={item.id}
              id={`menu-item-${item.id}`}
              className={`overflow-hidden rounded-xl border shadow-sm ${
                item.available ? "bg-white" : "bg-amber-50"
              }`}
            >
              {item.imageData && (
                <Image
                  src={item.imageData}
                  alt={item.name}
                  width={520}
                  height={600}
                  unoptimized
                  className="mx-auto block h-[60mm] max-h-[60mm] w-[52mm] max-w-full object-cover object-center"
                />
              )}
              <div className="p-4">
                <div className="flex justify-between gap-3">
                  <h2 className="text-lg font-bold">{item.name}</h2>
                  <strong>₡{item.price.toLocaleString()}</strong>
                </div>
                <p className="text-slate-600">{item.description}</p>
                {!item.available && (
                  <p className="mt-2 font-semibold text-amber-800">
                    Temporalmente no disponible. Consulte al personal.
                  </p>
                )}
                <label className="mt-3 block">
                  Cantidad{" "}
                  <select
                    className="ml-2 rounded border p-2"
                    disabled={!item.available}
                    value={quantities[item.id] ?? 0}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [item.id]: Number(event.target.value),
                      }))
                    }
                  >
                    {Array.from({ length: 11 }, (_, index) => (
                      <option key={index} value={index}>
                        {index}
                      </option>
                    ))}
                  </select>
                </label>
                {data?.tableKind === "DINING" &&
                  fulfillment === "DINE_IN" &&
                  (quantities[item.id] ?? 0) > 0 && (
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(takeoutItems[item.id])}
                        onChange={(event) =>
                          setTakeoutItems((current) => ({
                            ...current,
                            [item.id]: event.target.checked,
                          }))
                        }
                      />{" "}
                      Este producto es para llevar
                    </label>
                  )}
              </div>
            </section>
          ))}
        </div>
      </section>

      {data && (
        <footer className="sticky bottom-0 mt-6 rounded-xl bg-slate-900 p-4 text-white">
          <div className="mb-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal de productos</span>
              <span>₡{grossSubtotal.toLocaleString()}</span>
            </div>
            {credit > 0 && (
              <div className="flex justify-between text-emerald-300">
                <span>Crédito promocional</span>
                <span>− ₡{credit.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Subtotal neto</span>
              <span>₡{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>
                IVA {data.billing.taxRateBps / 100}%
                {data.billing.taxIncluded ? " (incluido)" : ""}
              </span>
              <span>₡{tax.toLocaleString()}</span>
            </div>
            {data.billing.serviceChargeEnabled && (
              <div className="flex justify-between text-slate-300">
                <span>Servicio {data.billing.serviceRateBps / 100}%</span>
                <span>₡{service.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-700 pt-2 text-lg">
              <strong>Total estimado</strong>
              <strong>₡{total.toLocaleString()}</strong>
            </div>
          </div>
          <button
            disabled={sending || !selected.length}
            onClick={submit}
            className="w-full rounded bg-emerald-400 p-3 font-semibold text-slate-900 disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Confirmar orden"}
          </button>
          <p className="mt-2 text-sm text-slate-300">
            Le atenderemos con prontitud. El pago es gestionado por el
            restaurante.
          </p>
        </footer>
      )}
    </main>
  );
}
