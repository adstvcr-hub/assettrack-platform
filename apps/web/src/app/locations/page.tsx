"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LocationType =
  | "PLANT"
  | "WAREHOUSE"
  | "BRANCH"
  | "CLIENT_SITE"
  | "PROJECT_SITE"
  | "SERVICE_SITE"
  | "OTHER";

type OrganizationLocation = {
  id: string;
  organizationId: string;
  name: string;
  type: LocationType;
  country: string;
  region?: string | null;
  city?: string | null;
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  timezone?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CurrentUser = {
  role: "OWNER" | "ADMIN" | "USER" | "VIEWER";
};

export default function LocationsPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [editingLocation, setEditingLocation] =
    useState<OrganizationLocation | null>(null);

  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<LocationType>("OTHER");
  const [editCountry, setEditCountry] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("OTHER");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdatedLocation, setLastUpdatedLocation] =
    useState<OrganizationLocation | null>(null);

  function getToken() {
    const token = sessionStorage.getItem("assettrack_token");

    if (!token) {
      router.replace("/?next=/locations");
      return null;
    }

    return token;
  }

  async function loadLocations() {
    const token = getToken();

    if (!token) return;

    setLoading(true);

    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/organization-locations`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status === 401) {
        sessionStorage.clear();
        router.replace("/?next=/locations");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load organization locations");
      }

      const data = await response.json();

      setLocations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load organization locations",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedUser = sessionStorage.getItem("assettrack_user");

    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch {
        sessionStorage.removeItem("assettrack_user");
      }
    }

    loadLocations();
  }, []);

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/organization-locations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            type,
            country: country.trim(),
            region: region.trim() || undefined,
            city: city.trim() || undefined,
            address: address.trim() || undefined,
            timezone: timezone.trim() || undefined,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "Unable to create location"),
        );
      }

      setName("");
      setType("OTHER");
      setCountry("");
      setRegion("");
      setCity("");
      setAddress("");
      setTimezone("");

      setMessage(`Location "${data.name}" created successfully.`);

      await loadLocations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create location",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleLocation(location: OrganizationLocation) {
    const token = getToken();

    if (!token) return;

    setError("");
    setMessage("");

    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/organization-locations/${location.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            active: !location.active,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "Unable to update location"),
        );
      }

      setMessage(
        data.active
          ? `Location "${data.name}" activated.`
          : `Location "${data.name}" deactivated.`,
      );

      await loadLocations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update location",
      );
    }
  }
  function startEdit(location: OrganizationLocation) {
    setEditingLocation(location);
    setEditName(location.name);
    setEditType(location.type);
    setEditCountry(location.country);
    setEditRegion(location.region ?? "");
    setEditCity(location.city ?? "");
    setEditAddress(location.address ?? "");
    setEditTimezone(location.timezone ?? "");

    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingLocation(null);
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingLocation) return;

    const token = getToken();

    if (!token) return;

    setSaving(true);
    setError("");
    setMessage("");
    setLastUpdatedLocation(editingLocation);

    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/organization-locations/${editingLocation.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: editName.trim(),
            type: editType,
            country: editCountry.trim(),
            region: editRegion.trim() || undefined,
            city: editCity.trim() || undefined,
            address: editAddress.trim() || undefined,
            timezone: editTimezone.trim() || undefined,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "Unable to update location"),
        );
      }

      setEditingLocation(null);
      setMessage(`Location "${data.name}" updated successfully.`);

      await loadLocations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update location",
      );
    } finally {
      setSaving(false);
    }
  }
  async function undoLastLocationUpdate() {
    if (!lastUpdatedLocation) return;

    const token = getToken();

    if (!token) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/v1/organization-locations/${lastUpdatedLocation.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: lastUpdatedLocation.name,
            type: lastUpdatedLocation.type,
            country: lastUpdatedLocation.country,
            region: lastUpdatedLocation.region ?? undefined,
            city: lastUpdatedLocation.city ?? undefined,
            address: lastUpdatedLocation.address ?? undefined,
            timezone: lastUpdatedLocation.timezone ?? undefined,
            active: lastUpdatedLocation.active,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "Unable to undo location update"),
        );
      }

      setLastUpdatedLocation(null);
      setMessage(`Changes to "${data.name}" were undone.`);

      await loadLocations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to undo location update",
      );
    } finally {
      setSaving(false);
    }
  }
  const canManageLocations =
    currentUser?.role === "OWNER" || currentUser?.role === "ADMIN";

  function formatType(value: LocationType) {
    return value
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
              AssetTrack
            </p>

            <h1 className="text-2xl font-bold text-white">
              Organization Locations
            </h1>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        {message && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-950 p-4 text-emerald-300">
            <span>{message}</span>

            {lastUpdatedLocation && (
              <button
                type="button"
                onClick={undoLastLocationUpdate}
                disabled={saving}
                className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-900 disabled:opacity-60"
              >
                {saving ? "Undoing..." : "Undo"}
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="mb-6 rounded-lg bg-red-950 p-4 text-red-300">{error}</p>
        )}

        {editingLocation && canManageLocations && (
          <div className="mb-8 rounded-xl bg-white p-6 text-slate-900 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Edit location</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Update the selected organization location.
                </p>
              </div>

              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>

            <form
              onSubmit={saveLocation}
              className="mt-6 grid gap-4 md:grid-cols-2"
            >
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="Location name"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                required
              />

              <select
                value={editType}
                onChange={(event) =>
                  setEditType(event.target.value as LocationType)
                }
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
              >
                <option value="PLANT">Plant</option>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="BRANCH">Branch</option>
                <option value="CLIENT_SITE">Client site</option>
                <option value="PROJECT_SITE">Project site</option>
                <option value="SERVICE_SITE">Service site</option>
                <option value="OTHER">Other</option>
              </select>

              <input
                value={editCountry}
                onChange={(event) => setEditCountry(event.target.value)}
                placeholder="Country"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                required
              />

              <input
                value={editRegion}
                onChange={(event) => setEditRegion(event.target.value)}
                placeholder="Province / State / Region"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
              />

              <input
                value={editCity}
                onChange={(event) => setEditCity(event.target.value)}
                placeholder="City / Locality"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
              />

              <input
                value={editAddress}
                onChange={(event) => setEditAddress(event.target.value)}
                placeholder="Address"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
              />

              <input
                value={editTimezone}
                onChange={(event) => setEditTimezone(event.target.value)}
                placeholder="Timezone, e.g. America/Costa_Rica"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 md:col-span-2"
              />

              <div className="md:col-span-2 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>

                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          {canManageLocations && (
            <form
              onSubmit={createLocation}
              className="rounded-xl bg-white p-6 text-slate-900 shadow-sm"
            >
              <h2 className="text-xl font-bold">Add location</h2>

              <p className="mt-2 text-sm text-slate-500">
                Register a plant, warehouse, branch, client site or other
                operating location.
              </p>

              <div className="mt-6 space-y-4">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Location name"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  required
                />

                <select
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as LocationType)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                >
                  <option value="PLANT">Plant</option>
                  <option value="WAREHOUSE">Warehouse</option>
                  <option value="BRANCH">Branch</option>
                  <option value="CLIENT_SITE">Client site</option>
                  <option value="PROJECT_SITE">Project site</option>
                  <option value="SERVICE_SITE">Service site</option>
                  <option value="OTHER">Other</option>
                </select>

                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="Country"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  required
                />

                <input
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  placeholder="Province / State / Region"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />

                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="City / Locality"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />

                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Address (optional)"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />

                <input
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="Timezone, e.g. America/Costa_Rica"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Creating..." : "Create location"}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-xl bg-white p-6 text-slate-900 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Registered locations</h2>

                <p className="mt-1 text-sm text-slate-500">
                  Locations available to your organization.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {locations.length} total
              </span>
            </div>

            {loading && <p className="mt-6 text-slate-500">Loading...</p>}

            {!loading && locations.length === 0 && (
              <p className="mt-6 rounded-lg bg-slate-50 p-4 text-slate-500">
                No organization locations have been registered yet.
              </p>
            )}

            {!loading && locations.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Type</th>
                      <th className="py-3 pr-4">Location</th>
                      <th className="py-3 pr-4">Timezone</th>
                      <th className="py-3 pr-4">Status</th>
                      {canManageLocations && <th className="py-3">Action</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {locations.map((location) => (
                      <tr key={location.id} className="border-b last:border-0">
                        <td className="py-4 pr-4 font-medium text-slate-900">
                          {location.name}
                        </td>

                        <td className="py-4 pr-4 text-slate-600">
                          {formatType(location.type)}
                        </td>

                        <td className="py-4 pr-4 text-slate-600">
                          {[location.city, location.region, location.country]
                            .filter(Boolean)
                            .join(", ")}
                        </td>

                        <td className="py-4 pr-4 text-slate-600">
                          {location.timezone || "—"}
                        </td>

                        <td className="py-4 pr-4">
                          <span
                            className={
                              location.active
                                ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500"
                            }
                          >
                            {location.active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {canManageLocations && (
                          <td className="py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(location)}
                                className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleLocation(location)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                {location.active ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
