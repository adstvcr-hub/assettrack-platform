"use client";

import { removeSessionValue } from "@/lib/session";
import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RestaurantSessionActions({
  admin = false,
}: {
  admin?: boolean;
}) {
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    const response = await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("No se pudo cerrar la sesión. Reintente.");
    removeSessionValue("assettrack_token");
    removeSessionValue("assettrack_user");
    router.replace("/");
  }

  async function requestLogout() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(`${API_URL}/api/v1/restaurant/profile`);
      if (!response.ok) throw new Error("No se pudo verificar el puesto de trabajo.");
      const profile = await response.json();
      if (["KITCHEN", "BAR", "WAITER"].includes(profile.restaurantRole)) {
        setChoosing(true);
      } else {
        await logout();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cerrar la sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function finishWork(availability: string, reason: string) {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/staff/availability`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ availability, reason }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "No se pudo registrar la salida.");
      }
      await logout();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar la salida.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {admin && (
        <button
          className="rounded border border-current px-4 py-2 font-semibold"
          onClick={() => router.push("/dashboard")}
        >
          Dashboard principal
        </button>
      )}
      <button
        disabled={busy}
        className="rounded bg-white px-4 py-2 font-semibold text-slate-950"
        onClick={() => void requestLogout()}
      >
        Cerrar sesión
      </button>
      {choosing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="staff-exit-title" className="w-full max-w-md rounded-xl bg-white p-6 text-slate-950 shadow-xl">
            <h2 id="staff-exit-title" className="text-xl font-black">¿Por qué cierra sesión?</h2>
            <p className="mt-2 text-sm">Se registrará su disponibilidad y se reasignarán sus cuentas cuando corresponda.</p>
            <div className="mt-4 grid gap-3">
              <button disabled={busy} className="rounded bg-slate-900 p-3 font-bold text-white" onClick={() => void finishWork("OFF_SHIFT", "Turno finalizado")}>Turno finalizado</button>
              <button disabled={busy} className="rounded bg-amber-100 p-3 font-bold" onClick={() => void finishWork("TEMPORARILY_UNAVAILABLE", "Fuera de servicio al cerrar sesión")}>Fuera de servicio</button>
              <button disabled={busy} className="rounded bg-sky-100 p-3 font-bold" onClick={() => void finishWork("BREAK", "Descanso programado")}>Descanso</button>
              <button disabled={busy} className="rounded border p-3" onClick={() => setChoosing(false)}>Cancelar</button>
            </div>
            {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
          </section>
        </div>
      )}
      {!choosing && error && <p role="alert" className="w-full rounded bg-red-100 p-2 text-red-800">{error}</p>}
    </div>
  );
}
