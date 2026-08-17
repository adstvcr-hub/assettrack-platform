'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Asset = {
  id: string;
  name: string;
  assetTag: string;
  description?: string | null;
  status: string;
  location?: string | null;
};

export default function AssetsPage() {
  const router = useRouter();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [name, setName] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function getToken() {
    const token = sessionStorage.getItem('assettrack_token');

    if (!token) {
      router.replace('/');
      return null;
    }

    return token;
  }

  async function loadAssets() {
    const token = await getToken();

    if (!token) return;

    try {
      const response = await fetch('http://localhost:3000/api/v1/assets', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        sessionStorage.clear();
        router.replace('/');
        return;
      }

      if (!response.ok) {
        throw new Error();
      }

      setAssets(await response.json());
    } catch {
      setError('Unable to load assets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = await getToken();

    if (!token) return;

    setSaving(true);
    setError('');

    try {
      const response = await fetch('http://localhost:3000/api/v1/assets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          assetTag,
          description: description || undefined,
          location: location || undefined,
          status: 'ACTIVE',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(', ')
            : data.message ?? 'Unable to create asset',
        );
      }

      setName('');
      setAssetTag('');
      setDescription('');
      setLocation('');

      await loadAssets();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create asset',
      );
    } finally {
      setSaving(false);
    }
  }

  function openQr(assetId: string) {
    window.open(
      `http://localhost:3000/api/v1/assets/${assetId}/qr/png`,
      '_blank',
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              AssetTrack
            </p>

            <h1 className="text-2xl font-bold text-slate-900">
              Assets
            </h1>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <form
            onSubmit={createAsset}
            className="rounded-xl bg-white p-6 shadow-sm"
          >
            <h2 className="text-xl font-bold text-slate-900">
              Add asset
            </h2>

            <div className="mt-6 space-y-4">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Asset name"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                required
              />

              <input
                value={assetTag}
                onChange={(event) => setAssetTag(event.target.value)}
                placeholder="Asset tag"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                required
              />

              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Location"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
              />

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
                className="min-h-28 w-full rounded-lg border border-slate-300 px-4 py-3"
              />

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Creating...' : 'Create asset'}
              </button>
            </div>
          </form>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Asset inventory
            </h2>

            {loading && (
              <p className="mt-6 text-slate-500">Loading...</p>
            )}

            {error && (
              <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">
                {error}
              </p>
            )}

            {!loading && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Tag</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Location</th>
                      <th className="py-3">QR</th>
                    </tr>
                  </thead>

                <tbody>
  {assets.map((asset) => (
    <tr key={asset.id} className="border-b last:border-0">
      <td className="py-4 pr-4 font-medium">
        <button
          onClick={() => router.push(`/assets/${asset.id}`)}
          className="font-semibold text-slate-900 hover:underline"
        >
          {asset.name}
        </button>
      </td>

      <td className="py-4 pr-4 text-slate-600">
        {asset.assetTag}
      </td>

      <td className="py-4 pr-4 text-slate-600">
        {asset.status}
      </td>

      <td className="py-4 pr-4 text-slate-600">
        {asset.location ?? '—'}
      </td>

      <td className="py-4">
        <button
          onClick={() => openQr(asset.id)}
          className="font-semibold text-slate-900 underline"
        >
          Open QR
        </button>
      </td>
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