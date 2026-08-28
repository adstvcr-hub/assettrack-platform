"use client";
import { API_URL } from "@/lib/api";
import { FormEvent, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Asset = {
  id: string;
  name: string;
  assetTag: string;
  description?: string | null;
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "RETIRED";
  location?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ScanEvent = {
  id: string;
  assetId: string;
  scannedAt: string;
  notes?: string | null;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [scans, setScans] = useState<ScanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Asset["status"]>("ACTIVE");

  useEffect(() => {
    const token = sessionStorage.getItem("assettrack_token");

    if (!token) {
      router.replace("/");
      return;
    }

    async function loadAsset() {
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [assetResponse, scansResponse] = await Promise.all([
          fetch(`${API_URL}/api/v1/assets/${id}`, {
            headers,
          }),
          fetch(`${API_URL}/api/v1/scan-events`, {
            headers,
          }),
        ]);

        if (assetResponse.status === 401 || scansResponse.status === 401) {
          sessionStorage.clear();
          router.replace("/");
          return;
        }

        if (assetResponse.status === 404) {
          setError("Asset not found");
          return;
        }

        if (!assetResponse.ok || !scansResponse.ok) {
          throw new Error("Unable to load asset");
        }

        const assetData: Asset = await assetResponse.json();
        const scansData: ScanEvent[] = await scansResponse.json();

        setAsset(assetData);
        setName(assetData.name);
        setAssetTag(assetData.assetTag);
        setLocation(assetData.location ?? "");
        setDescription(assetData.description ?? "");
        setStatus(assetData.status);

        setScans(scansData.filter((scan) => scan.assetId === assetData.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load asset");
      } finally {
        setLoading(false);
      }
    }

    loadAsset();
  }, [id, router]);

  async function updateAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = sessionStorage.getItem("assettrack_token");

    if (!token) {
      router.replace("/");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/api/v1/assets/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          assetTag,
          location: location || undefined,
          description: description || undefined,
          status,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        sessionStorage.clear();
        router.replace("/");
        return;
      }

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(", ")
            : (data.message ?? "Unable to update asset"),
        );
      }

      setAsset(data);
      setMessage("Asset updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update asset");
    } finally {
      setSaving(false);
    }
  }

async function openQr() {
  const token = sessionStorage.getItem('assettrack_token');

  if (!token) {
    return;
  }

  const qrWindow = window.open('', '_blank');

  try {
    const response = await fetch(
      `${API_URL}/api/v1/assets/${id}/qr/png`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to load QR code');
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    if (qrWindow) {
      qrWindow.location.href = blobUrl;
    }

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 60000);
  } catch (error) {
    qrWindow?.close();
    throw error;
  }
}

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              AssetTrack
            </p>

            <h1 className="text-2xl font-bold text-slate-900">Asset Details</h1>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/assets")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Assets
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Dashboard
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        {loading && <p className="text-slate-500">Loading asset...</p>}

        {error && (
          <p className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>
        )}

        {message && (
          <p className="mb-6 rounded-lg bg-green-50 p-4 text-green-700">
            {message}
          </p>
        )}

        {!loading && asset && (
          <>
            <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
              <form
                onSubmit={updateAsset}
                className="rounded-xl bg-white p-6 shadow-sm"
              >
                <h2 className="text-xl font-bold text-slate-900">Edit asset</h2>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Name
                    </label>

                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Asset tag
                    </label>

                    <input
                      value={assetTag}
                      onChange={(event) => setAssetTag(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Location
                    </label>

                    <input
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Status
                    </label>

                    <select
                      value={status}
                      onChange={(event) =>
                        setStatus(event.target.value as Asset["status"])
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="RETIRED">Retired</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Description
                  </label>

                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-32 w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-6 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </form>

              <div className="space-y-6">
                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <p className="text-sm font-semibold text-slate-500">
                    {asset.assetTag}
                  </p>

                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    {asset.name}
                  </h2>

                  <p className="mt-4 text-sm text-slate-500">Current status</p>

                  <p className="mt-1 font-semibold text-slate-900">
                    {asset.status}
                  </p>

                  <p className="mt-4 text-sm text-slate-500">Location</p>

                  <p className="mt-1 text-slate-900">{asset.location ?? "—"}</p>
                </div>

                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-900">QR Code</h3>

                  <button
                    onClick={openQr}
                    className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white"
                  >
                    Open QR
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Scan history
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {scans.length} scan{scans.length === 1 ? "" : "s"}
                  </p>
                </div>

                <button
                  onClick={() => router.push("/scans")}
                  className="text-sm font-semibold text-slate-700"
                >
                  All scans
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Date</th>
                      <th className="py-3 pr-4">User</th>
                      <th className="py-3">Notes</th>
                    </tr>
                  </thead>

                  <tbody>
                    {scans.map((scan) => (
                      <tr key={scan.id} className="border-b last:border-0">
                        <td className="whitespace-nowrap py-4 pr-4 text-slate-600">
                          {new Date(scan.scannedAt).toLocaleString()}
                        </td>

                        <td className="py-4 pr-4 text-slate-600">
                          {scan.user?.name ?? "Unknown user"}
                        </td>

                        <td className="py-4 text-slate-600">
                          {scan.notes ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
