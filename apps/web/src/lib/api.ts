import { getSessionValue, setSessionValue, removeSessionValue } from "@/lib/session";
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

let refreshPromise: Promise<string | null> | null = null;

async function performRefresh() {
  const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error("No fue posible renovar la sesión. Reintente cuando haya conexión.");
  }

  const data = await response.json();

  if (!data.accessToken) {
    return null;
  }

  setSessionValue('assettrack_token', data.accessToken);

  return data.accessToken as string;
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function authenticatedFetch(
  input: string,
  init: RequestInit = {},
) {
  const token = getSessionValue('assettrack_token');

  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
    cache: init.cache ?? 'no-store',
  });

  if (response.status !== 401) {
    return response;
  }

  // Another request may already have renewed the token while this one
  // was waiting for its response after the browser resumed.
  const latestToken = getSessionValue('assettrack_token');
  const newToken = latestToken && latestToken !== token
    ? latestToken
    : await refreshAccessToken();

  if (!newToken) {
    removeSessionValue('assettrack_token');
    removeSessionValue('assettrack_user');
    return response;
  }

  headers.set('Authorization', `Bearer ${newToken}`);

  response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
    cache: init.cache ?? 'no-store',
  });

  return response;
}
