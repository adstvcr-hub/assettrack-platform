'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type ScanEvent = {
  id: string;
  assetId: string;
  userId: string;
  scannedAt: string;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  asset?: {
    id: string;
    name: string;
    assetTag: string;
    location?: string | null;
  };
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export default function ScansPage() {
  const router = useRouter();

  const [scans, setScans] = useState<ScanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [userFilter, setUserFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    const token = sessionStorage.getItem('assettrack_token');

    if (!token) {
      router.replace('/');
      return;
    }

    async function loadScans() {
      try {
        const response = await fetch(
          'http://localhost:3000/api/v1/scan-events',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.status === 401) {
          sessionStorage.clear();
          router.replace('/');
          return;
        }

        if (!response.ok) {
          throw new Error('Unable to load scan history');
        }

        const data = await response.json();
        setScans(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load scan history',
        );
      } finally {
        setLoading(false);
      }
    }

    loadScans();
  }, [router]);

  const assets = useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();

    scans.forEach((scan) => {
      if (scan.asset) {
        unique.set(scan.asset.id, {
          id: scan.asset.id,
          name: scan.asset.name,
        });
      }
    });

    return Array.from(unique.values());
  }, [scans]);

  const users = useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();

    scans.forEach((scan) => {
      if (scan.user) {
        unique.set(scan.user.id, {
          id: scan.user.id,
          name: scan.user.name,
        });
      }
    });

    return Array.from(unique.values());
  }, [scans]);

  const filteredScans = useMemo(() => {
    const term = search.trim().toLowerCase();

    return scans.filter((scan) => {
      const matchesSearch =
        !term ||
        scan.asset?.name.toLowerCase().includes(term) ||
        scan.asset?.assetTag.toLowerCase().includes(term) ||
        scan.user?.name.toLowerCase().includes(term) ||
        scan.user?.email.toLowerCase().includes(term) ||
        scan.notes?.toLowerCase().includes(term);

      const matchesAsset =
        assetFilter === 'ALL' || scan.assetId === assetFilter;

      const matchesUser =
        userFilter === 'ALL' || scan.userId === userFilter;

      const matchesDate =
        !dateFilter ||
        new Date(scan.scannedAt).toLocaleDateString('en-CA') ===
          dateFilter;

      return (
        matchesSearch &&
        matchesAsset &&
        matchesUser &&
        matchesDate
      );
    });
  }, [scans, search, assetFilter, userFilter, dateFilter]);

  function clearFilters() {
    setSearch('');
    setAssetFilter('ALL');
    setUserFilter('ALL');
    setDateFilter('');
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
              Scan History
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
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 md:flex-row">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Recent scans
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {filteredScans.length} of {scans.length} scans
              </p>
            </div>

            <button
              onClick={clearFilters}
              className="self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Clear filters
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes, asset, user..."
              className="rounded-lg border border-slate-300 px-4 py-3"
            />

            <select
              value={assetFilter}
              onChange={(event) => setAssetFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3"
            >
              <option value="ALL">All assets</option>

              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>

            <select
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3"
            >
              <option value="ALL">All users</option>

              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>

          {loading && (
            <p className="mt-8 text-slate-500">
              Loading scan history...
            </p>
          )}

          {error && (
            <p className="mt-8 rounded-lg bg-red-50 p-4 text-red-700">
              {error}
            </p>
          )}

          {!loading && !error && (
            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 pr-4">Asset</th>
                    <th className="py-3 pr-4">Tag</th>
                    <th className="py-3 pr-4">User</th>
                    <th className="py-3">Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredScans.map((scan) => (
                    <tr
                      key={scan.id}
                      className="border-b last:border-0"
                    >
                      <td className="whitespace-nowrap py-4 pr-4 text-slate-600">
                        {new Date(scan.scannedAt).toLocaleString()}
                      </td>

                      <td className="py-4 pr-4 font-medium text-slate-900">
                        {scan.asset?.name ?? 'Unknown asset'}
                      </td>

                      <td className="py-4 pr-4 text-slate-600">
                        {scan.asset?.assetTag ?? '—'}
                      </td>

                      <td className="py-4 pr-4 text-slate-600">
                        {scan.user?.name ?? 'Unknown user'}
                      </td>

                      <td className="py-4 text-slate-600">
                        {scan.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredScans.length === 0 && (
                <p className="py-10 text-center text-slate-500">
                  No scans match the selected filters.
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}