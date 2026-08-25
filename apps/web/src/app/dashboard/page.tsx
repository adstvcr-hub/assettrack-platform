'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type Asset = {
  id: string;
  name: string;
  assetTag: string;
  status: string;
  location?: string | null;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ScanEvent = {
  id: string;
  scannedAt: string;
  notes?: string | null;
  asset?: {
    name: string;
    assetTag: string;
  };
  user?: {
    name: string;
  } | null;
};

export default function DashboardPage() {
  const router = useRouter();

  const [userName, setUserName] = useState('');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [scans, setScans] = useState<ScanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = sessionStorage.getItem('assettrack_token');
    const storedUser = sessionStorage.getItem('assettrack_user');

    if (!token || !storedUser) {
      router.replace('/');
      return;
    }

    try {
      const user = JSON.parse(storedUser);
      setUserName(user.name);
    } catch {
      sessionStorage.clear();
      router.replace('/');
      return;
    }

    async function loadDashboard() {
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [
          organizationResponse,
          assetsResponse,
          usersResponse,
          scansResponse,
        ] = await Promise.all([
          fetch('${process.env.NEXT_PUBLIC_API_URL}/api/v1/organizations/me', { headers }),
          fetch('${process.env.NEXT_PUBLIC_API_URL}/api/v1/assets', { headers }),
          fetch('${process.env.NEXT_PUBLIC_API_URL}/api/v1/users', { headers }),
          fetch('${process.env.NEXT_PUBLIC_API_URL}/api/v1/scan-events', { headers }),
        ]);

        if (
          organizationResponse.status === 401 ||
          assetsResponse.status === 401 ||
          usersResponse.status === 401 ||
          scansResponse.status === 401
        ) {
          sessionStorage.clear();
          router.replace('/');
          return;
        }

        if (
          !organizationResponse.ok ||
          !assetsResponse.ok ||
          !usersResponse.ok ||
          !scansResponse.ok
        ) {
          throw new Error('Failed to load dashboard data');
        }

        setOrganization(await organizationResponse.json());
        setAssets(await assetsResponse.json());
        setUsers(await usersResponse.json());
        setScans(await scansResponse.json());
      } catch {
        setError('Unable to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [router]);

  function logout() {
    sessionStorage.removeItem('assettrack_token');
    sessionStorage.removeItem('assettrack_user');
    router.replace('/');
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
              {organization?.name ?? 'Dashboard'}
            </h1>
          </div>

          <button
            onClick={logout}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <h2 className="text-3xl font-bold text-slate-900">
          Welcome, {userName}
        </h2>

        <p className="mt-2 text-slate-600">
          Manage your assets, users, and recent scan activity.
        </p>

        {loading && (
          <p className="mt-6 text-slate-600">Loading dashboard...</p>
        )}

        {error && (
          <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Assets</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {assets.length}
                </p>
              </div>

              <div className="rounded-xl bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Users</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {users.length}
                </p>
              </div>

              <div className="rounded-xl bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Scans</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {scans.length}
                </p>
              </div>
            </div>

            <div className="mt-10 rounded-xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  Assets
                </h3>

                <button
                  onClick={() => router.push('/assets')}
                  className="text-sm font-semibold text-slate-700 hover:text-slate-950"
                >
                  View all
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Tag</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3">Location</th>
                    </tr>
                  </thead>

                  <tbody>
                    {assets.map((asset) => (
                      <tr key={asset.id} className="border-b last:border-0">
                        <td className="py-4 pr-4 font-medium text-slate-900">
                          {asset.name}
                        </td>
                        <td className="py-4 pr-4 text-slate-600">
                          {asset.assetTag}
                        </td>
                        <td className="py-4 pr-4 text-slate-600">
                          {asset.status}
                        </td>
                        <td className="py-4 text-slate-600">
                          {asset.location ?? 'â€”'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

                      <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  Users
                </h3>

                <button
                  onClick={() => router.push('/users')}
                  className="text-sm font-semibold text-slate-700 hover:text-slate-950"
                >
                  View all
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Email</th>
                      <th className="py-3">Role</th>
                    </tr>
                  </thead>

                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="py-4 pr-4 font-medium text-slate-900">
                          {user.name}
                        </td>
                        <td className="py-4 pr-4 text-slate-600">
                          {user.email}
                        </td>
                        <td className="py-4 text-slate-600">
                          {user.role}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
           <h3 className="text-xl font-bold text-slate-900">
    Recent scans
  </h3>

  <button
    onClick={() => router.push('/scans')}
    className="text-sm font-semibold text-slate-700 hover:text-slate-950"
  >
    View all
  </button>
</div>
                  <div className="space-y-4">
    {scans.slice(0, 10).map((scan) => (
      <div
        key={scan.id}
        className="flex flex-col justify-between gap-2 border-b pb-4 last:border-0 md:flex-row"
      >
        <div>
          <p className="font-medium text-slate-900">
            {scan.asset?.name ?? 'Unknown asset'}
          </p>

          <p className="text-sm text-slate-500">
            {scan.user?.name ?? 'Unknown user'}
            {scan.notes ? ` Â· ${scan.notes}` : ''}
          </p>
        </div>

        <p className="text-sm text-slate-500">
          {new Date(scan.scannedAt).toLocaleString()}
        </p>
      </div>
    ))}
  </div>
</div>
          </>
        )}
      </section>
    </main>
  );
}

