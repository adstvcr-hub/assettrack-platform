"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { RestaurantSessionActions } from "../_components/restaurant-session-actions";

type PaymentMethod = "CASH" | "SINPE" | "CARD" | "OTHER";
type SupplierInvoiceStatus = "PENDING" | "PAID";

type CashSummary = {
  accountCount: number;
  salesTotal: number;
  cashSales: number;
  sinpeSales: number;
  cardSales: number;
  otherSales: number;
};

type Reconciliation = {
  openingCash: number;
  cashSupplierPayments: number;
  cashEmployeePayments: number;
  supplierInvoicesTotal?: number;
  supplierPaymentsTotal?: number;
  employeePaymentsTotal?: number;
  expectedCash: number;
};

type SupplierInvoice = {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  status: SupplierInvoiceStatus;
  paymentMethod?: PaymentMethod | null;
  paidAt?: string | null;
  createdAt: string;
  note?: string | null;
  recordedBy: { id: string; name: string };
};

type EmployeePayment = {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  note?: string | null;
  paidAt: string;
  employee: { id: string; name: string; restaurantRole?: string | null };
  recordedBy: { id: string; name: string };
};

type CashState = {
  canAccess: boolean;
  businessDate: string;
  register: { id: string | null; name: string };
  session?: {
    id: string;
    responsibleUserId: string;
    startedAt: string;
    openingCash: number;
    responsibleUser: {
      id: string;
      name: string;
      restaurantRole: string | null;
    };
  } | null;
  currentSummary?: CashSummary | null;
  currentReconciliation?: Reconciliation | null;
  currentMovements?: {
    supplierInvoices: SupplierInvoice[];
    employeePayments: EmployeePayment[];
  } | null;
  dayClose?: {
    responsibleUser: { name: string };
    closedAt: string;
    accountCount: number;
    salesTotal: number;
    countedCash: number;
    discrepancy: number;
  } | null;
  currentUserIsResponsible: boolean;
};

type Daily = {
  businessDate: string;
  timezone: string;
  register: { id: string | null; name: string };
  sessions: Array<{
    id: string;
    startedAt: string;
    endedAt?: string | null;
    status: "OPEN" | "CLOSED_HANDOFF" | "CLOSED_DAY";
    accountCount?: number | null;
    salesTotal?: number | null;
    openingCash: number;
    expectedCash?: number | null;
    countedCash?: number | null;
    discrepancy?: number | null;
    closeNote?: string | null;
    responsibleUser: {
      id: string;
      name: string;
      restaurantRole: string | null;
    };
  }>;
  dayClose?: {
    responsibleUser: { name: string };
    closedAt: string;
    accountCount: number;
    salesTotal: number;
    sessionCount: number;
    openingCash: number;
    cashSales: number;
    sinpeSales: number;
    cardSales: number;
    otherSales: number;
    supplierInvoicesTotal: number;
    supplierPaymentsTotal: number;
    employeePaymentsTotal: number;
    expectedCash: number;
    countedCash: number;
    discrepancy: number;
    note?: string | null;
  } | null;
  daySummary: CashSummary;
  reconciliation: Reconciliation;
  accounts: Array<{
    id: string;
    receiptNumber?: string | null;
    closedAt?: string | null;
    paymentMethod?: PaymentMethod | null;
    paymentReference?: string | null;
    table: { name: string; kind: string };
    billing: { total: number };
  }>;
  supplierInvoices: SupplierInvoice[];
  employeePayments: EmployeePayment[];
};

type EmployeeDaily = {
  businessDate: string;
  employee: {
    id: string;
    name: string;
    restaurantRole: string | null;
  };
  summary: { accountCount: number; salesTotal: number };
  accounts: Array<{
    id: string;
    receiptNumber?: string | null;
    closedAt?: string | null;
    table: { name: string; kind: string };
    billing: { total: number };
  }>;
};

type Employee = {
  id: string;
  name: string;
  restaurantRole?: string | null;
};

type CashCloseHistory = {
  from: string;
  to: string;
  timezone: string;
  closes: Array<{
    id: string;
    businessDate: string;
    closedAt: string;
    accountCount: number;
    salesTotal: number;
    sessionCount: number;
    openingCash: number;
    cashSales: number;
    sinpeSales: number;
    cardSales: number;
    otherSales: number;
    expectedCash: number;
    countedCash: number;
    discrepancy: number;
    note?: string | null;
    cashRegister: { id: string; name: string };
    responsibleUser: {
      id: string;
      name: string;
      restaurantRole?: string | null;
    };
    employeePaymentSummary: {
      employeePaymentsTotal: number;
      cashEmployeePayments: number;
      sinpeEmployeePayments: number;
      cardEmployeePayments: number;
      otherEmployeePayments: number;
      breakdownComplete: boolean;
    };
    employeePayments: EmployeePayment[];
  }>;
  totals: {
    accountCount: number;
    salesTotal: number;
    cashSales: number;
    sinpeSales: number;
    cardSales: number;
    otherSales: number;
    employeePaymentsTotal: number;
    cashEmployeePayments: number;
    sinpeEmployeePayments: number;
    cardEmployeePayments: number;
    otherEmployeePayments: number;
    incompleteEmployeePaymentBreakdowns: number;
    discrepancy: number;
  };
};

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  SINPE: "SINPE",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

function money(value: number) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);
}

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysAgoInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

const historyMetricStyles = {
  neutral: "border-slate-200 bg-slate-50 text-slate-950",
  green: "border-emerald-200 bg-emerald-50 text-emerald-950",
  blue: "border-blue-200 bg-blue-50 text-blue-950",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  red: "border-red-200 bg-red-50 text-red-950",
};

function HistoryMetric({
  label,
  value,
  tone = "neutral",
  note,
}: {
  label: string;
  value: string | number;
  tone?: keyof typeof historyMetricStyles;
  note?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${historyMetricStyles[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      {note && <p className="mt-1 text-xs font-semibold opacity-70">{note}</p>}
    </div>
  );
}

function CashCloseHistoryCard({
  close,
  initiallyOpen,
}: {
  close: CashCloseHistory["closes"][number];
  initiallyOpen: boolean;
}) {
  const totalCashOutflows = Math.max(
    0,
    close.openingCash + close.cashSales - close.expectedCash,
  );
  const otherCashOutflows = Math.max(
    0,
    totalCashOutflows - close.employeePaymentSummary.cashEmployeePayments,
  );
  const reconciled = close.discrepancy === 0;

  return (
    <details open={initiallyOpen} className="group overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4 bg-slate-950 p-5 text-white marker:hidden">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-400">{close.cashRegister.name}</p>
          <h3 className="mt-1 text-xl font-black">Cierre del {close.businessDate}</h3>
          <p className="mt-2 text-sm text-slate-300">Responsable: {close.responsibleUser.name}</p>
          <p className="text-sm text-slate-300">Registrado: {new Date(close.closedAt).toLocaleString("es-CR")}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${reconciled ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
            {reconciled ? "Cierre conciliado" : "Revisar diferencia"}
          </span>
          <span className="text-sm font-bold text-slate-300 group-open:hidden">Mostrar detalle</span>
          <span className="hidden text-sm font-bold text-slate-300 group-open:inline">Ocultar detalle</span>
        </div>
      </summary>

      <div className="space-y-6 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HistoryMetric label="Ventas totales" value={money(close.salesTotal)} tone="blue" note={`${close.accountCount} cuenta(s)`} />
          <HistoryMetric label="Pagos inmediatos" value={money(close.employeePaymentSummary.employeePaymentsTotal)} tone="amber" note="Personal" />
          <HistoryMetric label="Efectivo esperado" value={money(close.expectedCash)} tone="green" />
          <HistoryMetric label="Diferencia" value={money(close.discrepancy)} tone={reconciled ? "green" : "red"} />
        </div>

        <section>
          <h4 className="font-black">Ventas por método de cobro</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HistoryMetric label="Efectivo" value={money(close.cashSales)} tone="green" />
            <HistoryMetric label="SINPE" value={money(close.sinpeSales)} tone="blue" />
            <HistoryMetric label="Tarjeta" value={money(close.cardSales)} tone="neutral" />
            <HistoryMetric label="Otros" value={money(close.otherSales)} tone="neutral" />
          </div>
        </section>

        <section>
          <h4 className="font-black">Conciliación del efectivo</h4>
          <p className="mt-1 text-sm text-slate-600">Solo los movimientos físicos modifican el efectivo esperado.</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
            <div className="overflow-hidden rounded-xl border">
              <div className="flex justify-between gap-4 border-b p-3"><span>Efectivo inicial</span><strong>{money(close.openingCash)}</strong></div>
              <div className="flex justify-between gap-4 border-b p-3 text-emerald-800"><span>Ventas en efectivo</span><strong>+ {money(close.cashSales)}</strong></div>
              <div className="flex justify-between gap-4 border-b bg-red-50 p-3 text-red-800"><span>Pagos al personal en efectivo</span><strong>− {close.employeePaymentSummary.breakdownComplete ? money(close.employeePaymentSummary.cashEmployeePayments) : "Sin desglose"}</strong></div>
              <div className="flex justify-between gap-4 border-b bg-red-50 p-3 text-red-800"><span>Otros egresos en efectivo</span><strong>− {close.employeePaymentSummary.breakdownComplete ? money(otherCashOutflows) : money(totalCashOutflows)}</strong></div>
              <div className="flex justify-between gap-4 bg-slate-950 p-4 text-white"><span className="font-black">Efectivo esperado</span><strong className="text-lg">{money(close.expectedCash)}</strong></div>
            </div>
            <div className={`grid content-center rounded-xl border p-5 text-center ${reconciled ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950"}`}>
              <span className="text-sm font-bold opacity-70">Efectivo contado</span>
              <strong className="my-2 text-3xl">{money(close.countedCash)}</strong>
              <span className="text-sm font-black">Diferencia: {money(close.discrepancy)}</span>
            </div>
          </div>
        </section>

        <section>
          <h4 className="font-black">Pagos inmediatos al personal</h4>
          <p className="mt-1 text-sm text-slate-600">El método determina si el pago reduce el efectivo físico de la caja.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <HistoryMetric label="Efectivo" value={money(close.employeePaymentSummary.cashEmployeePayments)} tone="green" note="Reduce la caja" />
            <HistoryMetric label="SINPE" value={money(close.employeePaymentSummary.sinpeEmployeePayments)} tone="blue" note="No afecta efectivo" />
            <HistoryMetric label="Tarjeta" value={money(close.employeePaymentSummary.cardEmployeePayments)} note="No afecta efectivo" />
            <HistoryMetric label="Otros" value={money(close.employeePaymentSummary.otherEmployeePayments)} note="No afecta efectivo" />
            <HistoryMetric label="Total pagado" value={money(close.employeePaymentSummary.employeePaymentsTotal)} tone="amber" />
          </div>

          {close.employeePayments.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-100">
                  <tr><th className="p-3">Empleado</th><th className="p-3">Fecha y hora</th><th className="p-3">Monto</th><th className="p-3">Método</th><th className="p-3">Impacto en efectivo</th><th className="p-3">Registró</th><th className="p-3">Detalle</th></tr>
                </thead>
                <tbody>
                  {close.employeePayments.map((payment) => (
                    <tr key={payment.id} className="border-t">
                      <td className="p-3 font-bold">{payment.employee.name}</td>
                      <td className="p-3">{new Date(payment.paidAt).toLocaleString("es-CR")}</td>
                      <td className="p-3 font-bold">{money(payment.amount)}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${payment.paymentMethod === "CASH" ? "bg-emerald-100 text-emerald-800" : payment.paymentMethod === "SINPE" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{paymentLabels[payment.paymentMethod]}</span></td>
                      <td className={`p-3 font-bold ${payment.paymentMethod === "CASH" ? "text-red-700" : "text-slate-600"}`}>{payment.paymentMethod === "CASH" ? `Resta ${money(payment.amount)}` : "No afecta efectivo"}</td>
                      <td className="p-3">{payment.recordedBy.name}</td>
                      <td className="p-3">{payment.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!close.employeePaymentSummary.breakdownComplete && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">El cierre conserva el total pagado, pero parte del detalle individual ya no está disponible. El saldo sin método conocido no se atribuye automáticamente al efectivo.</p>
          )}
          {close.employeePaymentSummary.employeePaymentsTotal === 0 && <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-slate-500">No se registraron pagos inmediatos al personal en este cierre.</p>}
        </section>

        {close.note && <p className="rounded-xl bg-slate-100 p-4 text-sm"><strong>Observación:</strong> {close.note}</p>}
      </div>
    </details>
  );
}

export default function RestaurantCashierPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const [cash, setCash] = useState<CashState | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [personal, setPersonal] = useState<EmployeeDaily | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [openingCash, setOpeningCash] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayInput());
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<SupplierInvoiceStatus>("PENDING");
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<PaymentMethod>("CASH");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeAmount, setEmployeeAmount] = useState("");
  const [employeePaymentMethod, setEmployeePaymentMethod] = useState<PaymentMethod>("CASH");
  const [employeeNote, setEmployeeNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyFrom, setHistoryFrom] = useState(daysAgoInput(29));
  const [historyTo, setHistoryTo] = useState(todayInput());
  const [closeHistory, setCloseHistory] = useState<CashCloseHistory | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyLoaded = useRef(false);

  const load = useCallback(async () => {
    const profileResponse = await authenticatedFetch(`${API_URL}/api/v1/restaurant/profile`);
    if (profileResponse.status === 401) {
      router.replace("/");
      return;
    }
    if (!profileResponse.ok) {
      setError("No se pudo cargar la sesión.");
      return;
    }
    const nextProfile = await profileResponse.json();
    setProfile(nextProfile);

    const currentResponse = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/cash-registers/current`,
    );
    if (!currentResponse.ok) {
      setError("No se pudo consultar la caja.");
      return;
    }
    const nextCash: CashState = await currentResponse.json();
    setCash(nextCash);
    if (!nextCash.canAccess) return;

    const [dailyResponse, personalResponse, employeesResponse] = await Promise.all([
      authenticatedFetch(
        `${API_URL}/api/v1/restaurant/cash-registers/daily?date=${encodeURIComponent(nextCash.businessDate)}`,
      ),
      authenticatedFetch(
        `${API_URL}/api/v1/restaurant/staff/daily-close?date=${encodeURIComponent(nextCash.businessDate)}`,
      ),
      authenticatedFetch(`${API_URL}/api/v1/restaurant/cash-registers/employees`),
    ]);
    if (dailyResponse.ok) setDaily(await dailyResponse.json());
    if (personalResponse.ok) setPersonal(await personalResponse.json());
    if (employeesResponse.ok) {
      const nextEmployees: Employee[] = await employeesResponse.json();
      setEmployees(nextEmployees);
      setEmployeeId((current) => current || nextEmployees[0]?.id || "");
    }
  }, [router]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const loadCloseHistory = useCallback(
    async (from: string, to: string) => {
      setHistoryBusy(true);
      setHistoryError("");
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/cash-registers/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const body = await response.json().catch(() => ({}));
      setHistoryBusy(false);
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) {
        setHistoryError(body.message ?? "No se pudo consultar el historial de cierres.");
        return;
      }
      setCloseHistory(body as CashCloseHistory);
    },
    [router],
  );

  useEffect(() => {
    if (!cash?.canAccess || historyLoaded.current) return;
    historyLoaded.current = true;
    void loadCloseHistory(historyFrom, historyTo);
  }, [cash?.canAccess, historyFrom, historyTo, loadCloseHistory]);

  async function runMutation(
    path: string,
    body: object,
    successMessage: string,
    reset?: () => void,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await authenticatedFetch(`${API_URL}/api/v1/restaurant/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(responseBody.message ?? "No se pudo completar la operación.");
      return false;
    }
    reset?.();
    setMessage(successMessage);
    await load();
    return true;
  }

  async function assume() {
    await runMutation(
      "cash-registers/assume",
      { openingCash: Number(openingCash) },
      "La caja quedó registrada a su nombre.",
    );
  }

  async function close(finalDailyClose: boolean) {
    if (!cash?.session?.id) return;
    const amount = Number(countedCash);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      setError("Indique el efectivo contado en caja.");
      return;
    }
    const completed = await runMutation(
      `cash-sessions/${cash.session.id}/close`,
      { finalDailyClose, countedCash: amount, note: note.trim() || undefined },
      finalDailyClose
        ? "Cierre general registrado a su nombre."
        : "Caja entregada. Ya puede ser asumida por otra persona autorizada.",
      () => {
        setNote("");
        setCountedCash("");
      },
    );
    if (completed && finalDailyClose) setOpeningCash("0");
  }

  async function submitSupplierInvoice(event: FormEvent) {
    event.preventDefault();
    await runMutation(
      "cash-registers/supplier-invoices",
      {
        supplierName,
        invoiceNumber,
        invoiceDate,
        amount: Number(invoiceAmount),
        status: invoiceStatus,
        paymentMethod: invoiceStatus === "PAID" ? invoicePaymentMethod : undefined,
        note: invoiceNote.trim() || undefined,
      },
      "Factura de proveedor registrada.",
      () => {
        setSupplierName("");
        setInvoiceNumber("");
        setInvoiceAmount("");
        setInvoiceStatus("PENDING");
        setInvoicePaymentMethod("CASH");
        setInvoiceNote("");
      },
    );
  }

  async function submitEmployeePayment(event: FormEvent) {
    event.preventDefault();
    await runMutation(
      "cash-registers/employee-payments",
      {
        employeeId,
        amount: Number(employeeAmount),
        paymentMethod: employeePaymentMethod,
        note: employeeNote.trim() || undefined,
      },
      "Pago al empleado registrado en el cierre.",
      () => {
        setEmployeeAmount("");
        setEmployeeNote("");
      },
    );
  }

  const expectedCash = cash?.currentReconciliation?.expectedCash ?? 0;
  const liveDiscrepancy = countedCash === "" ? null : Number(countedCash) - expectedCash;

  function returnToOrigin() {
    const stored = window.sessionStorage.getItem("restaurantCashReturnTo");
    const destination =
      stored?.startsWith("/restaurant/") && stored !== "/restaurant/cashier"
        ? stored
        : "/restaurant/staff";
    window.sessionStorage.removeItem("restaurantCashReturnTo");
    router.push(destination);
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="bg-slate-950 px-5 py-5 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">RESPONSABILIDAD DE CAJA</p>
            <h1 className="text-2xl font-black">{cash?.register.name ?? "Caja"}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={returnToOrigin}
              className="rounded border border-white/50 px-4 py-2 font-bold text-white"
            >
              Volver al módulo anterior
            </button>
            <RestaurantSessionActions />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 p-5">
        {error && <p role="alert" className="rounded-xl bg-red-100 p-4 font-semibold text-red-900">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-100 p-4 font-semibold text-emerald-900">{message}</p>}

        {cash && !cash.canAccess && (
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-black">Acceso a caja no autorizado</h2>
            <p className="mt-2 text-slate-600">Administración debe habilitar “Puede asumir caja” para esta persona.</p>
          </section>
        )}

        {cash?.canAccess && (
          <>
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Responsable actual</p>
                  <h2 className="mt-1 text-2xl font-black">{cash.session?.responsibleUser.name ?? "Sin responsable"}</h2>
                  {cash.session && <p className="text-sm text-slate-600">Desde {new Date(cash.session.startedAt).toLocaleString("es-CR")}</p>}
                </div>
                {cash.currentUserIsResponsible && <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-950">Caja a nombre de {profile?.name}</span>}
              </div>

              {cash.currentSummary && cash.currentReconciliation && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Cuentas cerradas" value={cash.currentSummary.accountCount} />
                  <Metric label="Ventas totales" value={money(cash.currentSummary.salesTotal)} />
                  <Metric label="Ventas en efectivo" value={money(cash.currentSummary.cashSales)} />
                  <Metric label="Efectivo esperado" value={money(cash.currentReconciliation.expectedCash)} />
                </div>
              )}

              {!cash.session && !cash.dayClose && (
                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <label className="font-semibold">Efectivo recibido al asumir caja<input type="number" min="0" step="1" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} className="mt-2 block rounded border p-3" /></label>
                  <button disabled={busy} onClick={() => void assume()} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-40">Asumir {cash.register.name}</button>
                </div>
              )}

              {cash.session && !cash.currentUserIsResponsible && (
                <p className="mt-5 rounded-xl bg-amber-50 p-4 font-semibold text-amber-950">La caja ya está bajo responsabilidad de {cash.session.responsibleUser.name}. Debe entregarla antes de que otra persona pueda asumirla.</p>
              )}

              {cash.currentUserIsResponsible && cash.session && (
                <div className="mt-5 space-y-3 border-t pt-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Metric label="Efectivo inicial" value={money(cash.currentReconciliation?.openingCash ?? 0)} />
                    <Metric label="Efectivo esperado" value={money(expectedCash)} />
                    <label className="rounded-xl bg-amber-50 p-4 font-semibold">Efectivo contado<input type="number" min="0" step="1" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} className="mt-2 w-full rounded border bg-white p-3" placeholder="Monto físico" />{liveDiscrepancy !== null && <span className={`mt-2 block text-sm ${liveDiscrepancy === 0 ? "text-emerald-800" : "text-red-800"}`}>Diferencia: {money(liveDiscrepancy)}</span>}</label>
                  </div>
                  <label className="block font-semibold">Observación<textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-20 w-full rounded border p-3" placeholder="Opcional: relevo, incidencia, observación de cierre..." /></label>
                  <div className="flex flex-wrap gap-3">
                    <button disabled={busy} onClick={() => void close(false)} className="rounded-xl border border-slate-400 px-5 py-3 font-black disabled:opacity-40">Entregar caja</button>
                    <button disabled={busy} onClick={() => void close(true)} className="rounded-xl bg-emerald-800 px-5 py-3 font-black text-white disabled:opacity-40">Cierre general del día</button>
                  </div>
                </div>
              )}

              {cash.dayClose && (
                <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-950">
                  <p className="font-black">Cierre general registrado</p><p>Responsable: {cash.dayClose.responsibleUser.name}</p><p>{cash.dayClose.accountCount} cuentas · {money(cash.dayClose.salesTotal)}</p><p>Efectivo contado: {money(cash.dayClose.countedCash)} · Diferencia: {money(cash.dayClose.discrepancy)}</p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Historial de cierres</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Consulte los cierres generales registrados dentro de un rango de fechas.
                  </p>
                </div>
                {closeHistory && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold">
                    {closeHistory.closes.length} cierre(s)
                  </span>
                )}
              </div>
              <form
                className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadCloseHistory(historyFrom, historyTo);
                }}
              >
                <label className="font-semibold">
                  Desde
                  <input type="date" required value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} className="mt-1 block w-full rounded border bg-white p-3" />
                </label>
                <label className="font-semibold">
                  Hasta
                  <input type="date" required value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} className="mt-1 block w-full rounded border bg-white p-3" />
                </label>
                <button disabled={historyBusy} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-40 lg:self-end">
                  {historyBusy ? "Consultando…" : "Consultar cierres"}
                </button>
              </form>
              {historyError && <p role="alert" className="mt-4 rounded-xl bg-red-100 p-4 font-semibold text-red-900">{historyError}</p>}
              {closeHistory && (
                <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <HistoryMetric label="Cuentas cerradas" value={closeHistory.totals.accountCount} />
                    <HistoryMetric label="Ventas del rango" value={money(closeHistory.totals.salesTotal)} tone="blue" />
                    <HistoryMetric label="Ventas en efectivo" value={money(closeHistory.totals.cashSales)} tone="green" />
                    <HistoryMetric label="Pagos inmediatos al personal" value={money(closeHistory.totals.employeePaymentsTotal)} tone="amber" />
                    <HistoryMetric label="Pagos al personal en efectivo" value={money(closeHistory.totals.cashEmployeePayments)} tone="red" note="Reducen la caja" />
                    <HistoryMetric label="Pagos por otras vías" value={money(closeHistory.totals.sinpeEmployeePayments + closeHistory.totals.cardEmployeePayments + closeHistory.totals.otherEmployeePayments)} tone="blue" note="No afectan el efectivo" />
                    <HistoryMetric label="Diferencia acumulada" value={money(closeHistory.totals.discrepancy)} tone={closeHistory.totals.discrepancy === 0 ? "green" : "red"} />
                  </div>
                  {closeHistory.totals.incompleteEmployeePaymentBreakdowns > 0 && (
                    <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-950">
                      {closeHistory.totals.incompleteEmployeePaymentBreakdowns} cierre(s) conservan el total pagado al personal, pero no todo su desglose individual está disponible. Esos montos no se clasifican como efectivo sin evidencia del método utilizado.
                    </p>
                  )}
                  <div className="mt-6 space-y-5">
                    {closeHistory.closes.map((close, index) => (
                      <CashCloseHistoryCard key={close.id} close={close} initiallyOpen={index === 0} />
                    ))}
                    {closeHistory.closes.length === 0 && (
                      <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No existen cierres generales en el rango seleccionado.</p>
                    )}
                  </div>
                </>
              )}
            </section>

            {cash.currentUserIsResponsible && (
              <section className="grid gap-5 lg:grid-cols-2">
                <form onSubmit={submitSupplierInvoice} className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-black">Factura entrante de proveedor</h2>
                  <p className="mt-1 text-sm text-slate-600">Registra facturas recibidas hoy. Solo las pagadas en efectivo reducen el efectivo esperado.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="font-semibold">Proveedor<input required maxLength={120} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} className="mt-1 w-full rounded border p-3" /></label>
                    <label className="font-semibold">Número de factura<input required maxLength={80} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className="mt-1 w-full rounded border p-3" /></label>
                    <label className="font-semibold">Fecha de factura<input required type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="mt-1 w-full rounded border p-3" /></label>
                    <label className="font-semibold">Monto<input required type="number" min="1" step="1" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} className="mt-1 w-full rounded border p-3" /></label>
                    <label className="font-semibold">Estado<select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value as SupplierInvoiceStatus)} className="mt-1 w-full rounded border p-3"><option value="PENDING">Pendiente de pago</option><option value="PAID">Pagada</option></select></label>
                    {invoiceStatus === "PAID" && <label className="font-semibold">Método de pago<select value={invoicePaymentMethod} onChange={(event) => setInvoicePaymentMethod(event.target.value as PaymentMethod)} className="mt-1 w-full rounded border p-3">{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
                  </div>
                  <label className="mt-3 block font-semibold">Observación<input maxLength={500} value={invoiceNote} onChange={(event) => setInvoiceNote(event.target.value)} className="mt-1 w-full rounded border p-3" /></label>
                  <button disabled={busy} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-40">Registrar factura</button>
                </form>

                <form onSubmit={submitEmployeePayment} className="rounded-2xl border bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-black">Pago inmediato a empleado</h2>
                  <p className="mt-1 text-sm text-slate-600">Registra el pago del día individualmente y conserva quién lo recibió.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="font-semibold">Empleado<select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-1 w-full rounded border p-3">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
                    <label className="font-semibold">Monto<input required type="number" min="1" step="1" value={employeeAmount} onChange={(event) => setEmployeeAmount(event.target.value)} className="mt-1 w-full rounded border p-3" /></label>
                    <label className="font-semibold">Método de pago<select value={employeePaymentMethod} onChange={(event) => setEmployeePaymentMethod(event.target.value as PaymentMethod)} className="mt-1 w-full rounded border p-3">{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="font-semibold">Detalle<input maxLength={500} value={employeeNote} onChange={(event) => setEmployeeNote(event.target.value)} className="mt-1 w-full rounded border p-3" placeholder="Ej. pago de jornada" /></label>
                  </div>
                  <button disabled={busy || !employeeId} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-40">Registrar pago</button>
                </form>
              </section>
            )}

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Resumen del día</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Ventas en efectivo" value={money(daily?.daySummary.cashSales ?? 0)} /><Metric label="Cobros por SINPE" value={money(daily?.daySummary.sinpeSales ?? 0)} /><Metric label="Cobros por tarjeta" value={money(daily?.daySummary.cardSales ?? 0)} /><Metric label="Otros cobros" value={money(daily?.daySummary.otherSales ?? 0)} /><Metric label="Efectivo inicial" value={money(daily?.reconciliation.openingCash ?? 0)} /><Metric label="Pagos en efectivo a proveedores" value={money(daily?.reconciliation.cashSupplierPayments ?? 0)} /><Metric label="Pagos en efectivo a empleados" value={money(daily?.reconciliation.cashEmployeePayments ?? 0)} /><Metric label="Efectivo esperado" value={money(daily?.reconciliation.expectedCash ?? 0)} /><Metric label="Facturas de proveedores recibidas" value={money(daily?.reconciliation.supplierInvoicesTotal ?? 0)} /><Metric label="Pagos totales a proveedores" value={money(daily?.reconciliation.supplierPaymentsTotal ?? 0)} /><Metric label="Pagos inmediatos totales" value={money(daily?.reconciliation.employeePaymentsTotal ?? 0)} />
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Facturas de venta del día</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">Factura</th><th className="p-3">Hora</th><th className="p-3">Mesa/posición</th><th className="p-3">Cobro</th><th className="p-3">Referencia</th><th className="p-3 text-right">Total</th></tr></thead><tbody>{daily?.accounts.map((account) => <tr key={account.id} className="border-t"><td className="p-3 font-bold">{account.receiptNumber ?? "Sin número"}</td><td className="p-3">{account.closedAt ? new Date(account.closedAt).toLocaleTimeString("es-CR") : ""}</td><td className="p-3">{account.table.name}</td><td className="p-3">{paymentLabels[account.paymentMethod ?? "OTHER"]}</td><td className="p-3">{account.paymentReference ?? "—"}</td><td className="p-3 text-right font-bold">{money(account.billing.total)}</td></tr>)}</tbody></table>
                {daily?.accounts.length === 0 && <p className="p-4 text-sm text-slate-500">No hay cuentas cerradas hoy.</p>}
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Facturas entrantes del día</h2><div className="mt-4 space-y-2">{daily?.supplierInvoices.map((invoice) => <article key={invoice.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-black">{invoice.supplierName} · {invoice.invoiceNumber}</p><p className="text-sm text-slate-600">Factura: {invoice.invoiceDate} · Registró: {invoice.recordedBy.name}</p></div><strong>{money(invoice.amount)}</strong></div><p className="mt-2 text-sm font-bold">{invoice.status === "PAID" ? `Pagada · ${paymentLabels[invoice.paymentMethod ?? "OTHER"]}` : "Pendiente de pago"}</p>{invoice.note && <p className="mt-1 text-sm text-slate-600">{invoice.note}</p>}</article>)}{daily?.supplierInvoices.length === 0 && <p className="text-sm text-slate-500">No hay facturas de proveedores registradas hoy.</p>}</div></div>
              <div className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Pagos inmediatos a empleados</h2><div className="mt-4 space-y-2">{daily?.employeePayments.map((payment) => <article key={payment.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-black">{payment.employee.name}</p><p className="text-sm text-slate-600">{new Date(payment.paidAt).toLocaleString("es-CR")} · {paymentLabels[payment.paymentMethod]}</p></div><strong>{money(payment.amount)}</strong></div>{payment.note && <p className="mt-1 text-sm text-slate-600">{payment.note}</p>}</article>)}{daily?.employeePayments.length === 0 && <p className="text-sm text-slate-500">No hay pagos inmediatos registrados hoy.</p>}</div></div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Responsables de caja del día</h2><p className="mt-1 text-sm text-slate-600">Cada relevo conserva el efectivo recibido, esperado, contado y su diferencia.</p>
              <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">Responsable</th><th className="p-3">Inicio</th><th className="p-3">Fin</th><th className="p-3">Cuentas</th><th className="p-3">Ventas</th><th className="p-3">Inicial</th><th className="p-3">Esperado</th><th className="p-3">Contado</th><th className="p-3">Diferencia</th><th className="p-3">Estado</th></tr></thead><tbody>{daily?.sessions.map((session) => <tr key={session.id} className="border-t"><td className="p-3 font-bold">{session.responsibleUser.name}</td><td className="p-3">{new Date(session.startedAt).toLocaleString("es-CR")}</td><td className="p-3">{session.endedAt ? new Date(session.endedAt).toLocaleString("es-CR") : "En curso"}</td><td className="p-3">{session.accountCount ?? 0}</td><td className="p-3">{money(session.salesTotal ?? 0)}</td><td className="p-3">{money(session.openingCash)}</td><td className="p-3">{session.expectedCash == null ? "—" : money(session.expectedCash)}</td><td className="p-3">{session.countedCash == null ? "—" : money(session.countedCash)}</td><td className="p-3">{session.discrepancy == null ? "—" : money(session.discrepancy)}</td><td className="p-3">{session.status === "OPEN" ? "Abierta" : session.status === "CLOSED_HANDOFF" ? "Entregada" : "Cierre del día"}</td></tr>)}</tbody></table></div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Cierre personal · {personal?.employee.name ?? profile?.name}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><Metric label="Cuentas asociadas" value={personal?.summary.accountCount ?? 0} /><Metric label="Ventas asociadas" value={money(personal?.summary.salesTotal ?? 0)} /></div>
              <div className="mt-4 space-y-2">{personal?.accounts.map((account) => <div key={account.id} className="flex flex-wrap justify-between gap-3 rounded-lg border p-3"><div><strong>{account.table.name}</strong><p className="text-xs text-slate-500">{account.closedAt ? new Date(account.closedAt).toLocaleString("es-CR") : ""}</p></div><strong>{money(account.billing.total)}</strong></div>)}{personal?.accounts.length === 0 && <p className="text-sm text-slate-500">No hay cuentas asociadas a este empleado en la fecha.</p>}</div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
