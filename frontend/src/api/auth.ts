import { apiFetch } from './client';

export async function login(code: string, name: string): Promise<string> {
  const { token } = await apiFetch<{ token: string }>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ code, name }),
  });

  localStorage.setItem('token', token);
  return token;
}

export function logout(): void {
  localStorage.removeItem('token');
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}
