"use client";

import { removeSessionValue } from "@/lib/session";
import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionProfile = {
  id: string;
  name: string;
  restaurantRole:
    | "RESTAURANT_ADMIN"
    | "KITCHEN"
    | "BAR"
    | "WAITER"
    | "CASHIER";
};

type CashState = {
  canAccess: boolean;
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
  currentUserIsResponsible: boolean;
};

function roleLabel(role: SessionProfile["restaurantRole"]) {
  if (role === "RESTAURANT_ADMIN") return "AdministraciÃ³n";
  if (role === "KITCHEN") return "Cocina";
  if (role === "BAR") return "Bar";
  if (role === "WAITER") return "Mesero";
  if (role === "CASHIER") return "Cajero";
  return role;
}

export function RestaurantSessionActions({
  admin = false,
}: {
  admin?: boolean;
}) {
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [cashState, setCashState] = useState<CashState | null>(null);

  async function refreshIdentity() {
    const [profileResponse, cashResponse] = await Promise.all([
      authenticatedFetch(`${API_URL}/api/v1/restaurant/profile`),
      authenticatedFetch(
        `${API_URL}/api/v1/restaurant/cash-registers/current`,
      ),
    ]);
    if (profileResponse.ok) setProfile(await profileResponse.json());
    if (cashResponse.ok) setCashState(await cashResponse.json());
  }

  useEffect(() => {
    void refreshIdentity();
    const timer = window.setInterval(() => {
      void refreshIdentity();
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function logout() {
    const response = await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("No se pudo cerrar la sesiÃ³n. Reintente.");
    removeSessionValue("assettrack_token");
    removeSessionValue("assettrack_user");
    router.replace("/");
  }

  async function requestLogout() {
    setBusy(true);
    setError("");
    try {
      const [profileResponse, cashResponse] = await Promise.all([
        authenticatedFetch(`${API_URL}/api/v1/restaurant/profile`),
        authenticatedFetch(
          `${API_URL}/api/v1/restaurant/cash-registers/current`,
        ),
      ]);
      if (!profileResponse.ok) {
        throw new Error("No se pudo verificar el puesto de trabajo.");
      }
      const freshProfile = await profileResponse.json();
      const freshCash = cashResponse.ok ? await cashResponse.json() : null;
      setProfile(freshProfile);
      if (freshCash) setCashState(freshCash);
      if (
        freshCash?.session?.responsibleUserId === freshProfile.id
      ) {
        throw new Error(
          `Debe entregar o cerrar ${freshCash.register.name} antes de cerrar sesiÃ³n.`,
        );
      }
      if (
        ["KITCHEN", "BAR", "WAITER", "CASHIER"].includes(
          freshProfile.restaurantRole,
        )
      ) {
        setChoosing(true);
      } else {
        await logout();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cerrar la sesiÃ³n.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function finishWork(availability: string, reason: string) {
    setBusy(true);
    setError("");
    try {
      const cashResponse = await authenticatedFetch(
        `${API_URL}/api/v1/restaurant/cash-registers/current`,
      );
      if (cashResponse.ok) {
        const freshCash = await cashResponse.json();
        if (freshCash?.session?.responsibleUserId === profile?.id) {
          throw new Error(
            `Debe entregar o cerrar ${freshCash.register.name} antes de finalizar su turno.`,
          );
        }
      }
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
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo registrar la salida.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {profile && (
        <div className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white">
          <strong className="block text-sm">{profile.name}</strong>
          <span className="block text-xs text-slate-200">
            {roleLabel(profile.restaurantRole)} Â· SesiÃ³n activa
          </span>
          {cashState?.currentUserIsResponsible && (
            <span className="mt-1 block text-xs font-bold text-amber-300">
              Responsable Â· {cashState.register.name}
            </span>
          )}
        </div>
      )}

      {cashState?.canAccess && (
        <button
          type="button"
          className="rounded border border-amber-300 px-4 py-2 font-semibold text-amber-200"
          onClick={() => router.push("/restaurant/cashier")}
        >
          {cashState.currentUserIsResponsible
            ? cashState.register.name
            : "Caja"}
        </button>
      )}

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
        Cerrar sesiÃ³n
      </button>

      {choosing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-exit-title"
            className="w-full max-w-md rounded-xl bg-white p-6 text-slate-950 shadow-xl"
          >
            <h2 id="staff-exit-title" className="text-xl font-black">
              Â¿Por quÃ© cierra sesiÃ³n?
            </h2>
            <p className="mt-2 text-sm">
              Se registrarÃ¡ su disponibilidad y se reasignarÃ¡n sus cuentas
              cuando corresponda.
            </p>
            <div className="mt-4 grid gap-3">
              <button
                disabled={busy}
                className="rounded bg-slate-900 p-3 font-bold text-white"
                onClick={() =>
                  void finishWork("OFF_SHIFT", "Turno finalizado")
                }
              >
                Turno finalizado
              </button>
              <button
                disabled={busy}
                className="rounded bg-amber-100 p-3 font-bold"
                onClick={() =>
                  void finishWork(
                    "TEMPORARILY_UNAVAILABLE",
                    "Fuera de servicio al cerrar sesiÃ³n",
                  )
                }
              >
                Fuera de servicio
              </button>
              <button
                disabled={busy}
                className="rounded bg-sky-100 p-3 font-bold"
                onClick={() =>
                  void finishWork("BREAK", "Descanso programado")
                }
              >
                Descanso
              </button>
              <button
                disabled={busy}
                className="rounded border p-3"
                onClick={() => setChoosing(false)}
              >
                Cancelar
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-red-700">
                {error}
              </p>
            )}
          </section>
        </div>
      )}

      {!choosing && error && (
        <p
          role="alert"
          className="w-full rounded bg-red-100 p-2 text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}