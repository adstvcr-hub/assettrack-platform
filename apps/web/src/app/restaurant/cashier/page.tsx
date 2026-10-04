"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RestaurantSessionActions } from "../_components/restaurant-session-actions";

type CashState = {
  canAccess: boolean;
  businessDate: string;
  register: { id: string | null; name: string };
  session?: {
    id: string;
    responsibleUserId: string;
    startedAt: string;
    responsibleUser: {
      id: string;
      name: string;
      restaurantRole: string | null;
    };
  } | null;
  currentSummary?: {
    accountCount: number;
    salesTotal: number;
  } | null;
  dayClose?: {
    responsibleUser: { name: string };
    closedAt: string;
    accountCount: number;
    salesTotal: number;
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
    note?: string | null;
  } | null;
  daySummary: {
    accountCount: number;
    salesTotal: number;
  };
};

type EmployeeDaily = {
  businessDate: string;
  employee: {
    id: string;
    name: string;
    restaurantRole: string | null;
  };
  summary: {
    accountCount: number;
    salesTotal: number;
  };
  accounts: Array<{
    id: string;
    receiptNumber?: string | null;
    closedAt?: string | null;
    table: { name: string; kind: string };
    billing: { total: number };
  }>;
};

function money(value: number) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RestaurantCashierPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [cash, setCash] = useState<CashState | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [personal, setPersonal] = useState<EmployeeDaily | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const profileResponse = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/profile`,
    );
    if (profileResponse.status === 401) {
      router.replace("/");
      return;
    }
    if (!profileResponse.ok) {
      setError("No se pudo cargar la sesiÃ³n.");
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

    const [dailyResponse, personalResponse] = await Promise.all([
      authenticatedFetch(
        `${API_URL}/api/v1/restaurant/cash-registers/daily?date=${encodeURIComponent(nextCash.businessDate)}`,
      ),
      authenticatedFetch(
        `${API_URL}/api/v1/restaurant/staff/daily-close?date=${encodeURIComponent(nextCash.businessDate)}`,
      ),
    ]);
    if (dailyResponse.ok) setDaily(await dailyResponse.json());
    if (personalResponse.ok) setPersonal(await personalResponse.json());
  }, [router]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function assume() {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/cash-registers/assume`,
      { method: "POST" },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? "No se pudo asumir la caja.");
      return;
    }
    setMessage("La caja quedÃ³ registrada a su nombre.");
    await load();
  }

  async function close(finalDailyClose: boolean) {
    if (!cash?.session?.id) return;
    setBusy(true);
    setError("");
    setMessage("");
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/restaurant/cash-sessions/${cash.session.id}/close`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalDailyClose,
          note: note.trim() || undefined,
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? "No se pudo cerrar la responsabilidad de caja.");
      return;
    }
    setNote("");
    setMessage(
      finalDailyClose
        ? "Cierre general registrado a su nombre."
        : "Caja entregada. Ya puede ser asumida por otra persona autorizada.",
    );
    await load();
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="bg-slate-950 px-5 py-5 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
              RESPONSABILIDAD DE CAJA
            </p>
            <h1 className="text-2xl font-black">{cash?.register.name ?? "Caja"}</h1>
          </div>
          <RestaurantSessionActions />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 p-5">
        {error && (
          <p role="alert" className="rounded-xl bg-red-100 p-4 font-semibold text-red-900">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-xl bg-emerald-100 p-4 font-semibold text-emerald-900">
            {message}
          </p>
        )}

        {cash && !cash.canAccess && (
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-black">Acceso a caja no autorizado</h2>
            <p className="mt-2 text-slate-600">
              AdministraciÃ³n debe habilitar â€œPuede asumir cajaâ€ para esta persona.
            </p>
          </section>
        )}

        {cash?.canAccess && (
          <>
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                    Responsable actual
                  </p>
                  <h2 className="mt-1 text-2xl font-black">
                    {cash.session?.responsibleUser.name ?? "Sin responsable"}
                  </h2>
                  {cash.session && (
                    <p className="text-sm text-slate-600">
                      Desde{" "}
                      {new Date(cash.session.startedAt).toLocaleString("es-CR")}
                    </p>
                  )}
                </div>
                {cash.currentUserIsResponsible && (
                  <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-950">
                    Caja a nombre de {profile?.name}
                  </span>
                )}
              </div>

              {cash.currentSummary && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                      Cuentas cerradas durante esta responsabilidad
                    </p>
                    <p className="text-2xl font-black">
                      {cash.currentSummary.accountCount}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                      Ventas cerradas durante esta responsabilidad
                    </p>
                    <p className="text-2xl font-black">
                      {money(cash.currentSummary.salesTotal)}
                    </p>
                  </div>
                </div>
              )}

              {!cash.session && !cash.dayClose && (
                <button
                  disabled={busy}
                  onClick={() => void assume()}
                  className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-40"
                >
                  Asumir {cash.register.name}
                </button>
              )}

              {cash.session && !cash.currentUserIsResponsible && (
                <p className="mt-5 rounded-xl bg-amber-50 p-4 font-semibold text-amber-950">
                  La caja ya estÃ¡ bajo responsabilidad de{" "}
                  {cash.session.responsibleUser.name}. Debe entregarla antes de
                  que otra persona pueda asumirla.
                </p>
              )}

              {cash.currentUserIsResponsible && cash.session && (
                <div className="mt-5 space-y-3">
                  <label className="block font-semibold">
                    ObservaciÃ³n
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className="mt-2 min-h-20 w-full rounded border p-3"
                      placeholder="Opcional: relevo, incidencia, observaciÃ³n de cierre..."
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      disabled={busy}
                      onClick={() => void close(false)}
                      className="rounded-xl border border-slate-400 px-5 py-3 font-black"
                    >
                      Entregar caja
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void close(true)}
                      className="rounded-xl bg-emerald-800 px-5 py-3 font-black text-white"
                    >
                      Cierre general del dÃ­a
                    </button>
                  </div>
                </div>
              )}

              {cash.dayClose && (
                <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-950">
                  <p className="font-black">Cierre general registrado</p>
                  <p>
                    Responsable: {cash.dayClose.responsibleUser.name}
                  </p>
                  <p>
                    {cash.dayClose.accountCount} cuentas Â·{" "}
                    {money(cash.dayClose.salesTotal)}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Responsables de caja del dÃ­a</h2>
              <p className="mt-1 text-sm text-slate-600">
                Cada relevo conserva el nombre de quien tuvo la caja y el
                perÃ­odo exacto de responsabilidad.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-3">Responsable</th>
                      <th className="p-3">Inicio</th>
                      <th className="p-3">Fin</th>
                      <th className="p-3">Cuentas</th>
                      <th className="p-3">Ventas</th>
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily?.sessions.map((session) => (
                      <tr key={session.id} className="border-t">
                        <td className="p-3 font-bold">
                          {session.responsibleUser.name}
                        </td>
                        <td className="p-3">
                          {new Date(session.startedAt).toLocaleString("es-CR")}
                        </td>
                        <td className="p-3">
                          {session.endedAt
                            ? new Date(session.endedAt).toLocaleString("es-CR")
                            : "En curso"}
                        </td>
                        <td className="p-3">{session.accountCount ?? 0}</td>
                        <td className="p-3">
                          {money(session.salesTotal ?? 0)}
                        </td>
                        <td className="p-3">
                          {session.status === "OPEN"
                            ? "Abierta"
                            : session.status === "CLOSED_HANDOFF"
                              ? "Entregada"
                              : "Cierre del dÃ­a"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">
                Cierre personal Â· {personal?.employee.name ?? profile?.name}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Cuentas asociadas</p>
                  <p className="text-2xl font-black">
                    {personal?.summary.accountCount ?? 0}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Ventas asociadas</p>
                  <p className="text-2xl font-black">
                    {money(personal?.summary.salesTotal ?? 0)}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {personal?.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-wrap justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <strong>{account.table.name}</strong>
                      <p className="text-xs text-slate-500">
                        {account.closedAt
                          ? new Date(account.closedAt).toLocaleString("es-CR")
                          : ""}
                      </p>
                    </div>
                    <strong>{money(account.billing.total)}</strong>
                  </div>
                ))}
                {personal?.accounts.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No hay cuentas asociadas a este empleado en la fecha.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}