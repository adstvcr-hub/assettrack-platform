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
