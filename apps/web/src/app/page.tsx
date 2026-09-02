'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { API_URL } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [organizationSlug, setOrganizationSlug] = useState('assettrack-demo');
  const [email, setEmail] = useState('admin@assettrack.local');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
       body: JSON.stringify({
  organizationSlug,
  email,
  password,
}),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message ?? 'Login failed');
        return;
      }

      sessionStorage.setItem('assettrack_token', data.accessToken);
      sessionStorage.setItem('assettrack_user', JSON.stringify(data.user));

      const next =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null;

      router.push(next || '/dashboard');
    } catch {
      setMessage('Unable to connect to AssetTrack API');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            AssetTrack
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Sign in
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Access your organization, assets, users, and scan history.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
  <label
    htmlFor="organizationSlug"
    className="mb-2 block text-sm font-medium text-slate-700"
  >
    Organization
  </label>

  <input
    id="organizationSlug"
    type="text"
    value={organizationSlug}
    onChange={(event) => setOrganizationSlug(event.target.value)}
    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-900"
    required
  />
</div>
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-900"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-slate-900"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {message && (
          <p className="mt-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

