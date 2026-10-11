import type { User } from '@/types';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const request = () => fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  });
  let response = await request();
  const authEndpoints = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
  if (response.status === 401 && !authEndpoints.includes(path)) {
    const refreshed = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refreshed.ok) response = await request();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export async function getCurrentUser(): Promise<User> {
  return api<User>('/auth/me');
}
