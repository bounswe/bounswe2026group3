import type { Page } from '@playwright/test';

// Direct backend calls used to set up test fixtures (accounts, reports) without
// driving the UI for every precondition. Mirrors src/services/auth.ts and
// src/api/reports.ts.

// `||` not `??`: CI passes the var through as "" when the repo variable is unset.
export const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8000';

// Boğaziçi University campus — the app centres its map here.
export const BOUN_CENTER = { lat: 41.0847, lng: 29.0503 };

// 1×1 transparent PNG, raw base64 (no data-URI prefix) — matches what the app
// sends (PhotoEntry.b64 from expo-image-picker). Backend only checks it's a
// non-empty string, but a real PNG keeps things honest.
const PNG_1PX_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export interface Tokens {
  access: string;
  refresh: string;
}

export interface TestUser extends Tokens {
  email: string;
  password: string;
  fullName: string;
}

function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function postJson(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

/** Register a fresh account and return its credentials + tokens. */
export async function registerUser(prefix = 'e2e'): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const password = 'E2ePassw0rd!';
  const fullName = 'E2E Tester';
  const data = await postJson('/api/auth/register/', {
    email,
    password,
    fullName,
    birthDate: '2000-01-01',
  });
  // RegisterResponse: { ..., accessToken, refreshToken }
  let access: string = data.accessToken ?? data.access ?? '';
  let refresh: string = data.refreshToken ?? data.refresh ?? '';
  if (!access) {
    // Some backends only issue tokens on login — fall back to that.
    const login = await postJson('/api/auth/login/', { email, password });
    access = login.access;
    refresh = login.refresh;
  }
  return { email, password, fullName, access, refresh };
}

/** Log in and return tokens. */
export async function loginUser(email: string, password: string): Promise<Tokens> {
  const data = await postJson('/api/auth/login/', { email, password });
  return { access: data.access, refresh: data.refresh };
}

/** Create a report via the API and return its id. */
export async function createReport(
  token: string,
  overrides: Partial<{ category: string; description: string; lat: number; lng: number }> = {},
): Promise<string> {
  const data = await postJson(
    '/api/reports/',
    {
      location: {
        lat: overrides.lat ?? BOUN_CENTER.lat,
        lng: overrides.lng ?? BOUN_CENTER.lng,
      },
      context: 'OUTDOOR',
      category: overrides.category ?? 'BROKEN_RAMP',
      description: overrides.description ?? 'E2E smoke fixture report',
      photos: [PNG_1PX_B64],
      violations: [],
    },
    token,
  );
  const id = data.reportId ?? data.id ?? data.report_id;
  if (!id) throw new Error(`Report created but no id in response: ${JSON.stringify(data)}`);
  return String(id);
}

/**
 * Seed auth tokens into the web app's storage so a page loads already signed in.
 * The web build keeps tokens in localStorage under `am_access` / `am_refresh`
 * (see src/services/auth.ts). Must be called before navigating to an app route.
 */
export async function seedAuth(page: Page, tokens: Tokens, baseURL: string): Promise<void> {
  await page.addInitScript(
    ([access, refresh]) => {
      window.localStorage.setItem('am_access', access);
      window.localStorage.setItem('am_refresh', refresh);
    },
    [tokens.access, tokens.refresh],
  );
  // Touch the origin once so localStorage is scoped correctly on first real nav.
  await page.goto(baseURL);
}
