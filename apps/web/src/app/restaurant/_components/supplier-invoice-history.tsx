"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const paymentLabels = {
  CASH: "Efectivo",
  SINPE: "SINPE",
  CARD: "Tarjeta",
  OTHER: "Otro",
};
type PaymentMethod = keyof typeof paymentLabels;

export type SupplierAuditInvoice = {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  status: "PENDING" | "PAID";
  paymentMethod?: PaymentMethod | null;
  paidAt?: string | null;
  createdAt: string;
  note?: string | null;
  cashImpactInClose?: number | null;
  recordedBy: { id: string; name: string };
  cashSession?: {
    cashDay?: { id: string; businessDate: string; timezone: string } | null;
    cashRegister: { id: string; name: string };
    responsibleUser: { id: string; name: string };
  };
};

export type SupplierPaymentSummary = {
  invoiceCount: number;
  supplierInvoicesTotal: number;
  pendingInvoicesTotal: number;
  supplierPaymentsTotal: number;
  cashSupplierPayments: number;
  sinpeSupplierPayments: number;
  cardSupplierPayments: number;
  otherSupplierPayments: number;
  unclassifiedSupplierPayments?: number;
  breakdownComplete?: boolean;
};

type Filters = {
  from: string;
  to: string;
  dateBy: string;
  supplier: string;
  status: string;
  paymentMethod: string;
};
type History = {
  from: string;
  to: string;
  timezone: string;
  dateBy: string;
  invoices: SupplierAuditInvoice[];
  totals: SupplierPaymentSummary;
  page: number;
  pageSize: number;
  totalPages: number;
};

function money(value: number) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);
}

export function SupplierPaymentMetrics({
  summary,
}: {
  summary: SupplierPaymentSummary;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Facturas recibidas", summary.supplierInvoicesTotal],
        ["Pendientes de pago", summary.pendingInvoicesTotal],
        ["Total pagado a proveedores", summary.supplierPaymentsTotal],
        ["Pagado en efectivo", summary.cashSupplierPayments],
        ["Pagado por SINPE", summary.sinpeSupplierPayments],
        ["Pagado con tarjeta", summary.cardSupplierPayments],
        ["Pagado por otros medios", summary.otherSupplierPayments],
      ].map(([label, amount]) => (
        <div
          key={label}
          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <p className="text-sm text-slate-600">{label}</p>
          <p className="mt-1 text-xl font-black">{money(Number(amount))}</p>
        </div>
      ))}
      {(summary.unclassifiedSupplierPayments ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="text-sm">Pagado sin método registrado</p>
          <p className="mt-1 text-xl font-black">
            {money(summary.unclassifiedSupplierPayments!)}
          </p>
        </div>
      )}
    </div>
  );
}

export function SupplierInvoiceTable({
  invoices,
  timezone,
  showCashDay = false,
}: {
  invoices: SupplierAuditInvoice[];
  timezone: string;
  showCashDay?: boolean;
}) {
  if (invoices.length === 0)
    return (
      <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-slate-600">
        No hay facturas de proveedores para esta consulta.
      </p>
    );
  const dateTime = (value: string, zone: string) =>
    new Date(value).toLocaleString("es-CR", { timeZone: zone });
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[1050px] text-left text-sm">
        <caption className="sr-only">
          Detalle de facturas de proveedores
        </caption>
        <thead className="bg-slate-100">
          <tr>
            <th scope="col" className="p-3">
              Proveedor / factura
            </th>
            {showCashDay && (
              <th scope="col" className="p-3">
                Jornada / caja
              </th>
            )}
            <th scope="col" className="p-3">
              Fecha de factura
            </th>
            <th scope="col" className="p-3">
              Registro / pago
            </th>
            <th scope="col" className="p-3">
              Monto
            </th>
            <th scope="col" className="p-3">
              Estado / método
            </th>
            <th scope="col" className="p-3">
              Impacto en efectivo
            </th>
            <th scope="col" className="p-3">
              Registró
            </th>
            <th scope="col" className="p-3">
              Motivo / observación
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => {
            const zone = invoice.cashSession?.cashDay?.timezone ?? timezone;
            const cashImpact =
              invoice.cashImpactInClose !== undefined
                ? invoice.cashImpactInClose
                : invoice.status === "PENDING"
                  ? 0
                  : !invoice.paymentMethod || !invoice.paidAt
                    ? null
                    : invoice.paymentMethod === "CASH"
                      ? invoice.amount
                      : 0;
            return (
              <tr key={invoice.id} className="border-t align-top">
                <td className="max-w-56 break-words p-3">
                  <strong>{invoice.supplierName}</strong>
                  <p>{invoice.invoiceNumber}</p>
                </td>
                {showCashDay && (
                  <td className="p-3">
                    <strong>
                      {invoice.cashSession?.cashDay?.businessDate ??
                        new Intl.DateTimeFormat("en-CA", {
                          timeZone: zone,
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(new Date(invoice.createdAt))}
                    </strong>
                    <p>{invoice.cashSession?.cashRegister.name}</p>
                    <p className="text-xs text-slate-600">
                      Responsable:{" "}
                      {invoice.cashSession?.responsibleUser.name ?? "Sin dato"}
                    </p>
                    {!invoice.cashSession?.cashDay && (
                      <p className="text-xs text-slate-500">
                        Registro anterior: fecha de registro
                      </p>
                    )}
                  </td>
                )}
                <td className="p-3">{invoice.invoiceDate}</td>
                <td className="p-3">
                  <p>{dateTime(invoice.createdAt, zone)}</p>
                  {invoice.paidAt && (
                    <p className="mt-1 text-xs text-slate-600">
                      Pago: {dateTime(invoice.paidAt, zone)}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap p-3 font-bold">
                  {money(invoice.amount)}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded px-2 py-1 text-xs font-bold ${invoice.status === "PAID" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}
                  >
                    {invoice.status === "PAID" ? "Pagada" : "Pendiente"}
                  </span>
                  {invoice.status === "PAID" && (
                    <p className="mt-2">
                      {invoice.paymentMethod
                        ? paymentLabels[invoice.paymentMethod]
                        : "Sin método registrado"}
                    </p>
                  )}
                </td>
                <td
                  className={`p-3 font-semibold ${cashImpact ? "text-red-700" : "text-slate-600"}`}
                >
                  {cashImpact === null
                    ? "Sin evidencia suficiente"
                    : cashImpact > 0
                      ? `Resta ${money(cashImpact)}`
                      : "No afecta efectivo"}
                </td>
                <td className="p-3">{invoice.recordedBy.name}</td>
                <td className="min-w-52 max-w-80 whitespace-pre-wrap break-words p-3">
                  {invoice.note || "Sin observación registrada"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SupplierInvoiceHistory({
  today,
  refreshKey,
}: {
  today: string;
  refreshKey: number;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(() => {
    const from = new Date(`${today}T12:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 29);
    return {
      from: from.toISOString().slice(0, 10),
      to: today,
      dateBy: "JOURNAL",
      supplier: "",
      status: "",
      paymentMethod: "",
    };
  });
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const applied = useRef(filters);
  const requestId = useRef(0);

  const load = useCallback(
    async (query: Filters, page = 1) => {
      const id = ++requestId.current;
      applied.current = query;
      setBusy(true);
      setError("");
      setHistory(null);
      try {
        const params = new URLSearchParams({ ...query, page: String(page) });
        const response = await authenticatedFetch(
          `${API_URL}/api/v1/restaurant/cash-registers/supplier-invoices?${params}`,
        );
        if (id !== requestId.current) return;
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        const body = await response.json().catch(() => ({}));
        if (id !== requestId.current) return;
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "La consulta histórica de proveedores está pendiente de actualizar en el servicio."
              : body.message ||
                  "No se pudo consultar el historial de proveedores.",
          );
        setHistory(body as History);
      } catch (reason) {
        if (id === requestId.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "No se pudo consultar el historial de proveedores.",
          );
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void load(applied.current);
    return () => {
      requestId.current++;
    };
  }, [load, refreshKey]);

  return (
    <section
      aria-labelledby="supplier-history-title"
      className="min-w-0 rounded-2xl border bg-white p-6 shadow-sm"
    >
      <h2 id="supplier-history-title" className="text-xl font-black">
        Historial de facturas de proveedores
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Consulte facturas de jornadas abiertas y cerradas. Los totales
        corresponden a todos los resultados del filtro.
      </p>
      <form
        className="mt-4 grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load(filters);
        }}
      >
        <label className="font-semibold">
          Desde
          <input
            required
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
            className="mt-1 block w-full rounded border bg-white p-3"
          />
        </label>
        <label className="font-semibold">
          Hasta
          <input
            required
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
            className="mt-1 block w-full rounded border bg-white p-3"
          />
        </label>
        <label className="font-semibold">
          Consultar por
          <select
            value={filters.dateBy}
            onChange={(event) =>
              setFilters({ ...filters, dateBy: event.target.value })
            }
            className="mt-1 block w-full rounded border bg-white p-3"
          >
            <option value="JOURNAL">Fecha de jornada de caja</option>
            <option value="INVOICE">Fecha de factura</option>
          </select>
        </label>
        <label className="font-semibold">
          Proveedor
          <input
            type="search"
            maxLength={120}
            value={filters.supplier}
            onChange={(event) =>
              setFilters({ ...filters, supplier: event.target.value })
            }
            placeholder="Todos los proveedores"
            className="mt-1 block w-full rounded border bg-white p-3"
          />
        </label>
        <label className="font-semibold">
          Estado
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({
                ...filters,
                status: event.target.value,
                ...(event.target.value === "PENDING"
                  ? { paymentMethod: "" }
                  : {}),
              })
            }
            className="mt-1 block w-full rounded border bg-white p-3"
          >
            <option value="">Todos</option>
            <option value="PAID">Pagada</option>
            <option value="PENDING">Pendiente de pago</option>
          </select>
        </label>
        <label className="font-semibold">
          Método de pago
          <select
            disabled={filters.status === "PENDING"}
            value={filters.paymentMethod}
            onChange={(event) =>
              setFilters({ ...filters, paymentMethod: event.target.value })
            }
            className="mt-1 block w-full rounded border bg-white p-3 disabled:opacity-50"
          >
            <option value="">Todos</option>
            {Object.entries(paymentLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
          La fecha de jornada conserva la apertura original, incluso si se cerró
          otro día. Los registros anteriores sin jornada usan su fecha de
          registro. Consulte hasta 366 días por búsqueda.
        </p>
        <button
          disabled={busy}
          className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-40 sm:col-span-2 lg:col-span-3"
        >
          {busy ? "Consultando proveedores…" : "Consultar proveedores"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-100 p-4 text-red-900">
          {error}
        </p>
      )}
      {history && (
        <>
          <p role="status" className="mt-4 text-sm font-semibold">
            {history.totals.invoiceCount} factura(s) · {history.from} al{" "}
            {history.to} ·{" "}
            {history.dateBy === "INVOICE"
              ? "Fecha de factura"
              : "Fecha de jornada"}
          </p>
          <SupplierPaymentMetrics summary={history.totals} />
          <SupplierInvoiceTable
            invoices={history.invoices}
            timezone={history.timezone}
            showCashDay
          />
          {history.totalPages > 1 && (
            <nav
              aria-label="Páginas de facturas de proveedores"
              className="mt-4 flex flex-wrap items-center gap-3"
            >
              <button
                type="button"
                disabled={busy || history.page <= 1}
                onClick={() => void load(applied.current, history.page - 1)}
                className="rounded border px-4 py-2 font-bold disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-sm">
                Página {history.page} de {history.totalPages}
              </span>
              <button
                type="button"
                disabled={busy || history.page >= history.totalPages}
                onClick={() => void load(applied.current, history.page + 1)}
                className="rounded border px-4 py-2 font-bold disabled:opacity-40"
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
