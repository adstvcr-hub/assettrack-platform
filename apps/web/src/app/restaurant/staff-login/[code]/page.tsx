"use client";

import { API_URL } from "@/lib/api";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type StaffAccessProfile = {
  restaurantName: string;
  staffName: string;
  staffRole: "RESTAURANT_ADMIN" | "KITCHEN" | "BAR" | "WAITER";
  locationVerificationRequired: boolean;
  locationVerified: boolean;
};

type StaffLocation = {
  latitude: number;
  longitude: number;
  locationAccuracy: number;
};

const roleLabels: Record<StaffAccessProfile["staffRole"], string> = {
  RESTAURANT_ADMIN: "Administración",
  KITCHEN: "Cocina",
  BAR: "Bar",
  WAITER: "Mesero",
};

export default function StaffAccessPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const accessCode = params.code;
  const [profile, setProfile] = useState<StaffAccessProfile | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [location, setLocation] = useState<StaffLocation | null>(null);

  useEffect(() => {
    let cancelled = false;
    const getLocation = () =>
      new Promise<StaffLocation>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(
            new Error("Este dispositivo no permite verificar la ubicación."),
          );
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) =>
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              locationAccuracy: position.coords.accuracy,
            }),
          () =>
            reject(
              new Error(
                "Debe permitir el acceso a su ubicación para usar este puesto de trabajo.",
              ),
            ),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
        );
      });
    async function loadProfile() {
      try {
        const profileUrl = `${API_URL}/api/v1/auth/staff-access/${encodeURIComponent(accessCode)}`;
        let response = await fetch(profileUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("Este código QR no está activo.");
        let data = (await response.json()) as Partial<StaffAccessProfile> & {
          message?: string;
        };
        if (data.locationVerificationRequired && !data.locationVerified) {
          const verifiedLocation = await getLocation();
          const query = new URLSearchParams({
            latitude: String(verifiedLocation.latitude),
            longitude: String(verifiedLocation.longitude),
            locationAccuracy: String(verifiedLocation.locationAccuracy),
          });
          response = await fetch(`${profileUrl}?${query}`, {
            cache: "no-store",
          });
          data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              data.message ?? "No fue posible verificar su ubicación.",
            );
          }
          if (!cancelled) setLocation(verifiedLocation);
        }
        if (!cancelled) setProfile(data as StaffAccessProfile);
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "No fue posible validar este acceso.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [accessCode]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/v1/auth/staff-access/login`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessCode, password, ...location }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Demasiados intentos. Espere un minuto antes de continuar."
            : (data.message ?? "Contraseña incorrecta."),
        );
      }
      sessionStorage.setItem("assettrack_token", data.accessToken);
      sessionStorage.setItem("assettrack_user", JSON.stringify(data.user));
      router.replace("/restaurant/staff");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible iniciar sesión.",
      );
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-700">
          AssetTrack · Restaurante
        </p>
        {loading ? (
          <p className="mt-8 text-slate-600">Validando acceso…</p>
        ) : profile ? (
          <>
            <h1 className="mt-3 text-3xl font-black text-slate-950">
              {profile.restaurantName}
            </h1>
            <div className="mt-6 rounded-2xl bg-emerald-50 p-5">
              <p className="text-sm font-semibold text-emerald-800">
                Acceso de personal
              </p>
              <p className="mt-2 text-xl font-bold text-slate-950">
                {profile.staffName}
              </p>
              <p className="text-sm text-slate-600">
                {roleLabels[profile.staffRole]}
              </p>
            </div>
            <form onSubmit={signIn} className="mt-7">
              <label
                htmlFor="password"
                className="mb-2 block font-semibold text-slate-800"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                required
              />
              <button
                type="submit"
                disabled={signingIn}
                className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-4 text-lg font-bold text-white disabled:opacity-60"
              >
                {signingIn ? "Ingresando…" : "Ingresar"}
              </button>
            </form>
          </>
        ) : null}

        {error && (
          <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <Link
          href="/"
          className="mt-6 block text-center text-sm font-semibold text-slate-600 underline"
        >
          Usar el acceso convencional
        </Link>
      </section>
    </main>
  );
}
