export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

let refreshPromise: Promise<string | null> | null = null;

async function performRefresh() {
  const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (!data.accessToken) {
    return null;
  }

  sessionStorage.setItem('assettrack_token', data.accessToken);

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
  const token = sessionStorage.getItem('assettrack_token');

  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status !== 401) {
    return response;
  }

  const newToken = await refreshAccessToken();

  if (!newToken) {
    sessionStorage.removeItem('assettrack_token');
    sessionStorage.removeItem('assettrack_user');
    return response;
  }

  headers.set('Authorization', `Bearer ${newToken}`);

  response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });

  return response;
}