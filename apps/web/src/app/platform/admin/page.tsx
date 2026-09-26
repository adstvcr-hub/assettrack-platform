"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Overview = {
  organizations: number;
  orders: number;
  visits: number;
  globalSales: number;
  loyaltyMembers: number;
  frequentCustomers: number;
  restaurants: Array<{ organizationId: string; name: string; orders: number; sales: number }>;
  geography: Array<{ area: string; restaurants: number }>;
  demandPeaks: Array<{ period: string; count: number }>;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
  restaurantAccessEnabled: boolean;
  _count: { users: number; restaurantTables: number; restaurantOrders: number; restaurantVisits: number };
};
type PlatformUser = { id: string; name: string; email: string; role: string; restaurantRole?: string | null };
type CreatedRestaurant = {
  organization: {
    id: string;
    name: string;
    slug: string;
    restaurantAccessEnabled: boolean;
  };
  administrator: { id: string; name: string; email: string };
  temporaryPassword: string;
};

function createSlug(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PlatformAdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null);
  const [organizationUsers, setOrganizationUsers] = useState<PlatformUser[]>([]);
  const [temporaryCredential, setTemporaryCredential] = useState("");
  const [rewardName, setRewardName] = useState("");
  const [rewardPoints, setRewardPoints] = useState("100");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [restaurantAdminName, setRestaurantAdminName] = useState("");
  const [restaurantAdminEmail, setRestaurantAdminEmail] = useState("");
  const [restaurantCountry, setRestaurantCountry] = useState("Costa Rica");
  const [restaurantRegion, setRestaurantRegion] = useState("");
  const [restaurantCity, setRestaurantCity] = useState("");
  const [restaurantTimezone, setRestaurantTimezone] = useState(
    "America/Costa_Rica",
  );
  const [restaurantEnabled, setRestaurantEnabled] = useState(true);
  const [creatingRestaurant, setCreatingRestaurant] = useState(false);
  const [createdRestaurant, setCreatedRestaurant] =
    useState<CreatedRestaurant | null>(null);

  const load = useCallback(async () => {
    const [overviewResponse, organizationsResponse] = await Promise.all([
      authenticatedFetch(`${API_URL}/api/v1/platform-admin/overview`),
      authenticatedFetch(`${API_URL}/api/v1/platform-admin/organizations`),
    ]);
    if (overviewResponse.status === 401) {
      router.replace("/?next=/platform/admin");
      return;
    }
    if (!overviewResponse.ok || !organizationsResponse.ok) {
      setError(
        overviewResponse.status === 403
          ? "No tiene autorización para administrar la plataforma."
          : "No se pudo cargar el panel de AssetTrack.",
      );
      setLoading(false);
      return;
    }
    setOverview(await overviewResponse.json());
    setOrganizations(await organizationsResponse.json());
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleAccess(organization: Organization) {
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/platform-admin/organizations/${organization.id}/restaurant-access`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !organization.restaurantAccessEnabled }),
      },
    );
    if (!response.ok) {
      setError("No se pudo actualizar el acceso del restaurante.");
      return;
    }
    await load();
  }

  async function loadUsers(organizationId: string) {
    const response = await authenticatedFetch(`${API_URL}/api/v1/platform-admin/organizations/${organizationId}/users`);
    if (!response.ok) {
      setError("No se pudieron cargar los usuarios.");
      return;
    }
    setSelectedOrganization(organizationId);
    setOrganizationUsers(await response.json());
    setTemporaryCredential("");
  }

  async function resetCredential(user: PlatformUser) {
    if (!selectedOrganization) return;
    const reason = window.prompt("Motivo de auditoría para restablecer la credencial");
    if (!reason?.trim()) return;
    const response = await authenticatedFetch(
      `${API_URL}/api/v1/platform-admin/organizations/${selectedOrganization}/users/${user.id}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "No se pudo restablecer la credencial.");
      return;
    }
    setTemporaryCredential(`${body.email}: ${body.temporaryPassword}`);
  }

  async function createAssetTrackReward() {
    if (!rewardName.trim()) return;
    const response = await authenticatedFetch(`${API_URL}/api/v1/platform-admin/loyalty/rewards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: rewardName, pointsRequired: Number(rewardPoints) }),
    });
    if (!response.ok) {
      setError("No se pudo crear el premio global.");
      return;
    }
    setRewardName("");
  }

  async function createRestaurant() {
    setCreatingRestaurant(true);
    setError("");
    setCreatedRestaurant(null);
    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/platform-admin/organizations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: restaurantName.trim(),
            slug: restaurantSlug.trim(),
            adminName: restaurantAdminName.trim(),
            adminEmail: restaurantAdminEmail.trim(),
            country: restaurantCountry.trim(),
            region: restaurantRegion.trim() || undefined,
            city: restaurantCity.trim() || undefined,
            timezone: restaurantTimezone.trim() || undefined,
            enabled: restaurantEnabled,
          }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join(", ")
            : body.message || "No se pudo crear el restaurante.",
        );
      }
      setCreatedRestaurant(body as CreatedRestaurant);
      setRestaurantName("");
      setRestaurantSlug("");
      setRestaurantAdminName("");
      setRestaurantAdminEmail("");
      setRestaurantRegion("");
      setRestaurantCity("");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear el restaurante.",
      );
    } finally {
      setCreatingRestaurant(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold uppercase tracking-[0.2em] text-indigo-700">AssetTrack · Plataforma</p>
            <h1 className="text-3xl font-bold">Administración global de restaurantes</h1>
          </div>
          <button className="rounded border bg-white px-4 py-2 font-semibold" onClick={() => router.push("/dashboard")}>Dashboard principal</button>
        </div>
        {loading && <p className="mt-8">Cargando estadísticas…</p>}
        {error && <p className="mt-6 rounded bg-red-50 p-4 text-red-700">{error}</p>}
        {overview && (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {[
                ["Restaurantes", overview.organizations],
                ["Órdenes", overview.orders],
                ["Visitas", overview.visits],
                ["Ventas netas", `₡${overview.globalSales.toLocaleString()}`],
                ["Afiliados", overview.loyaltyMembers],
                ["Frecuentes", overview.frequentCustomers],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </section>
            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Ventas por restaurante</h2>
                <div className="mt-4 space-y-3">
                  {overview.restaurants.map((restaurant) => (
                    <div key={restaurant.organizationId} className="flex justify-between border-b pb-2">
                      <span>{restaurant.name} · {restaurant.orders} órdenes</span>
                      <strong>₡{restaurant.sales.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Picos de demanda</h2>
                <div className="mt-4 space-y-2">
                  {overview.demandPeaks.map((peak) => (
                    <div key={peak.period} className="flex justify-between"><span>{peak.period}</span><strong>{peak.count}</strong></div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Crear nuevo restaurante</h2>
          <p className="mt-1 text-sm text-slate-600">
            Crea una organización independiente con todas las funciones del
            módulo aprobado. No se copian pedidos, clientes, mesas ni productos
            de otros restaurantes.
          </p>
          <form
            className="mt-5 grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createRestaurant();
            }}
          >
            <label className="font-semibold">
              Nombre del establecimiento
              <input
                required
                maxLength={120}
                className="mt-1 w-full rounded border p-3"
                value={restaurantName}
                onChange={(event) => {
                  const previousAutomaticSlug = createSlug(restaurantName);
                  const nextName = event.target.value;
                  setRestaurantName(nextName);
                  if (
                    !restaurantSlug ||
                    restaurantSlug === previousAutomaticSlug
                  ) {
                    setRestaurantSlug(createSlug(nextName));
                  }
                }}
              />
            </label>
            <label className="font-semibold">
              Identificador de acceso
              <input
                required
                maxLength={80}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                className="mt-1 w-full rounded border p-3 font-mono"
                value={restaurantSlug}
                onChange={(event) =>
                  setRestaurantSlug(createSlug(event.target.value))
                }
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Se utilizará en el campo Organización al iniciar sesión.
              </span>
            </label>
            <label className="font-semibold">
              Nombre del administrador inicial
              <input
                required
                maxLength={120}
                className="mt-1 w-full rounded border p-3"
                value={restaurantAdminName}
                onChange={(event) =>
                  setRestaurantAdminName(event.target.value)
                }
              />
            </label>
            <label className="font-semibold">
              Correo del administrador
              <input
                required
                type="email"
                maxLength={160}
                className="mt-1 w-full rounded border p-3"
                value={restaurantAdminEmail}
                onChange={(event) =>
                  setRestaurantAdminEmail(event.target.value)
                }
              />
            </label>
            <label className="font-semibold">
              País
              <input
                required
                maxLength={100}
                className="mt-1 w-full rounded border p-3"
                value={restaurantCountry}
                onChange={(event) => setRestaurantCountry(event.target.value)}
              />
            </label>
            <label className="font-semibold">
              Provincia, estado o región
              <input
                maxLength={100}
                className="mt-1 w-full rounded border p-3"
                value={restaurantRegion}
                onChange={(event) => setRestaurantRegion(event.target.value)}
              />
            </label>
            <label className="font-semibold">
              Ciudad
              <input
                maxLength={100}
                className="mt-1 w-full rounded border p-3"
                value={restaurantCity}
                onChange={(event) => setRestaurantCity(event.target.value)}
              />
            </label>
            <label className="font-semibold">
              Zona horaria
              <input
                maxLength={100}
                className="mt-1 w-full rounded border p-3 font-mono"
                value={restaurantTimezone}
                onChange={(event) =>
                  setRestaurantTimezone(event.target.value)
                }
              />
            </label>
            <label className="flex items-center gap-3 rounded border p-3 font-semibold md:col-span-2">
              <input
                type="checkbox"
                checked={restaurantEnabled}
                onChange={(event) =>
                  setRestaurantEnabled(event.target.checked)
                }
              />
              Habilitar inmediatamente el módulo de restaurante
            </label>
            <button
              disabled={creatingRestaurant}
              className="rounded bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-50 md:col-span-2"
            >
              {creatingRestaurant
                ? "Creando restaurante…"
                : "Crear restaurante y administrador"}
            </button>
          </form>
          {createdRestaurant && (
            <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
              <p className="font-bold">
                {createdRestaurant.organization.name} fue creado correctamente.
              </p>
              <p className="mt-2">
                Organización: {createdRestaurant.organization.slug}
              </p>
              <p>Correo: {createdRestaurant.administrator.email}</p>
              <p className="mt-2 font-mono text-lg font-bold">
                Contraseña temporal: {createdRestaurant.temporaryPassword}
              </p>
              <p className="mt-2 text-sm">
                Guarde esta contraseña ahora. Se muestra una sola vez y debe
                entregarse al administrador por un medio seguro.
              </p>
            </div>
          )}
        </section>
        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Acceso de restaurantes</h2>
          <p className="mt-1 text-sm text-slate-600">Suspender impide usar las rutas operativas sin eliminar información.</p>
          <div className="mt-4 space-y-3">
            {organizations.map((organization) => (
              <div key={organization.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-4">
                <div>
                  <strong>{organization.name}</strong>
                  <p className="text-sm text-slate-600">{organization._count.users} usuarios · {organization._count.restaurantTables} mesas · {organization._count.restaurantOrders} órdenes</p>
                </div>
                <button
                  className={`rounded px-4 py-2 font-semibold text-white ${organization.restaurantAccessEnabled ? "bg-red-700" : "bg-emerald-700"}`}
                  onClick={() => void toggleAccess(organization)}
                >
                  {organization.restaurantAccessEnabled ? "Suspender" : "Habilitar"}
                </button>
                <button className="rounded border px-4 py-2 font-semibold" onClick={() => void loadUsers(organization.id)}>Credenciales</button>
              </div>
            ))}
          </div>
        </section>
        {selectedOrganization && (
          <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Recuperación de credenciales</h2>
            <p className="mt-1 text-sm text-slate-600">El cambio revoca todas las sesiones existentes. La contraseña temporal se muestra una sola vez.</p>
            {temporaryCredential && <p className="mt-4 rounded bg-amber-50 p-4 font-mono font-bold text-amber-900">{temporaryCredential}</p>}
            <div className="mt-4 space-y-2">
              {organizationUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded border p-3">
                  <span><strong>{user.name}</strong> · {user.email}</span>
                  <button className="rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white" onClick={() => void resetCredential(user)}>Restablecer</button>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Premios globales de AssetTrack</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <input className="min-w-56 flex-1 rounded border p-3" placeholder="Nombre del premio" value={rewardName} onChange={(event) => setRewardName(event.target.value)} />
            <input className="w-32 rounded border p-3" type="number" min="1" value={rewardPoints} onChange={(event) => setRewardPoints(event.target.value)} />
            <button className="rounded bg-indigo-700 px-4 py-2 font-semibold text-white" onClick={() => void createAssetTrackReward()}>Crear premio</button>
          </div>
        </section>
        <p className="mt-6 text-sm text-slate-500">Las métricas son agregadas. No se conserva la identidad de quien escanea códigos QR.</p>
      </div>
    </main>
  );
}
