'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type User = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'USER' | 'VIEWER';
  createdAt: string;
  updatedAt: string;
};

export default function UsersPage() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('USER');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function getToken() {
    const token = sessionStorage.getItem('assettrack_token');

    if (!token) {
      router.replace('/');
      return null;
    }

    return token;
  }

  async function loadUsers() {
    const token = getToken();

    if (!token) return;

    try {
      const response = await fetch(
        '${process.env.NEXT_PUBLIC_API_URL}/api/v1/users',
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
        throw new Error('Unable to load users');
      }

      setUsers(await response.json());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load users',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getToken();

    if (!token) return;

    setSaving(true);
    setError('');

    try {
      const response = await fetch(
        '${process.env.NEXT_PUBLIC_API_URL}/api/v1/users',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            email,
            password,
            role,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(', ')
            : data.message ?? 'Unable to create user',
        );
      }

      setName('');
      setEmail('');
      setPassword('');
      setRole('USER');

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create user',
      );
    } finally {
      setSaving(false);
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

            <h1 className="text-2xl font-bold text-slate-900">
              Users
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
            onSubmit={createUser}
            className="rounded-xl bg-white p-6 shadow-sm"
          >
            <h2 className="text-xl font-bold text-slate-900">
              Add user
            </h2>

            <div className="mt-6 space-y-4">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                required
              />

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                required
              />

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Temporary password"
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
                minLength={8}
                required
              />

              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as User['role'])
                }
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
              >
                <option value="USER">User</option>
                <option value="VIEWER">Viewer</option>
                <option value="ADMIN">Admin</option>
                <option value="OWNER">Owner</option>
              </select>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Creating...' : 'Create user'}
              </button>
            </div>
          </form>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Organization users
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
                      <th className="py-3 pr-4">Email</th>
                      <th className="py-3 pr-4">Role</th>
                      <th className="py-3">Created</th>
                    </tr>
                  </thead>

                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b last:border-0"
                      >
                        <td className="py-4 pr-4 font-medium text-slate-900">
                          {user.name}
                        </td>

                        <td className="py-4 pr-4 text-slate-600">
                          {user.email}
                        </td>

                        <td className="py-4 pr-4 text-slate-600">
                          {user.role}
                        </td>

                        <td className="py-4 text-slate-600">
                          {new Date(user.createdAt).toLocaleDateString()}
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

