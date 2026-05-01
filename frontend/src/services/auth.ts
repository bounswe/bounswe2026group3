import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../constants/theme';

let _access = '';
let _refresh = '';

function isWeb(): boolean { return Platform.OS === 'web'; }

export async function hydrateTokens(): Promise<void> {
  if (isWeb()) {
    _access = localStorage.getItem('am_access') || '';
    _refresh = localStorage.getItem('am_refresh') || '';
  } else {
    _access = (await SecureStore.getItemAsync('am_access')) ?? '';
    _refresh = (await SecureStore.getItemAsync('am_refresh')) ?? '';
  }
}

export function getAccessToken(): string { return _access; }
export function getRefreshToken(): string { return _refresh; }

export function setTokens(access: string, refresh: string): void {
  _access = access;
  _refresh = refresh;
  if (isWeb()) {
    localStorage.setItem('am_access', access);
    localStorage.setItem('am_refresh', refresh);
  } else {
    SecureStore.setItemAsync('am_access', access);
    SecureStore.setItemAsync('am_refresh', refresh);
  }
}

export function clearTokens(): void {
  _access = '';
  _refresh = '';
  if (isWeb()) {
    localStorage.removeItem('am_access');
    localStorage.removeItem('am_refresh');
  } else {
    SecureStore.deleteItemAsync('am_access');
    SecureStore.deleteItemAsync('am_refresh');
  }
}

export function isLoggedIn(): boolean { return !!_access; }

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getAccessToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export interface RegisterPayload { email: string; fullName: string; password: string; birthDate?: string; }
export interface RegisterResponse { userId: string; email: string; fullName: string; status: string; trustScore: number; accessToken: string; refreshToken: string; createdAt: string; }
export interface LoginPayload { email: string; password: string; }
export interface LoginResponse { access: string; refresh: string; }
export type UserRole = 'USER' | 'TRUSTED_CONTRIBUTOR' | 'ADMIN' | string;
export interface UserProfile { userId: string; email: string; fullName: string; status: string; trustScore: number; role: UserRole; createdAt: string; notificationsEnabled?: boolean; }

export function parseDRFError(data: any): string {
  if (!data) return 'Something went wrong.';
  if (data.detail) return data.detail;
  if (typeof data === 'string') return data;
  const msgs: string[] = [];
  for (const [, errors] of Object.entries(data)) {
    const arr = Array.isArray(errors) ? errors : [errors];
    arr.forEach((e: any) => msgs.push(String(e)));
  }
  return msgs.join(' ') || 'Something went wrong.';
}

export async function register(payload: RegisterPayload) {
  const res = await fetch(`${API_BASE}/api/auth/register/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function login(payload: LoginPayload) {
  const res = await fetch(`${API_BASE}/api/auth/login/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function getMe() {
  const res = await fetch(`${API_BASE}/api/auth/users/me`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    data.trustScore = data.trustScore ?? data.reputationPoints ?? 0;
    data.status = data.status ?? data.accountStatus ?? 'ACTIVE';
    data.role = data.role ?? 'USER';
  }
  return { ok: res.ok, status: res.status, data };
}

export async function updateMe(payload: { fullName: string }) {
  const res = await fetch(`${API_BASE}/api/auth/users/me`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function patchMe(payload: Partial<{ fullName: string; notificationsEnabled: boolean }>) {
  const res = await fetch(`${API_BASE}/api/auth/users/me`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function requestPasswordReset(email: string) {
  const res = await fetch(`${API_BASE}/api/auth/password-reset/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function confirmPasswordReset(token: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/password-reset/confirm/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
