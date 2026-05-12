import { test, expect, type Page } from '@playwright/test';
import {
  BOUN_CENTER,
  createReport,
  registerUser,
  seedAuth,
} from './helpers/api';

// ── E2E smoke suite (issue #178) ────────────────────────────────────────────
// Covers the core user flows so integration bugs (CORS, routing, auth) surface
// in CI rather than during the demo. Runs against a deployed environment via
// PLAYWRIGHT_BASE_URL / PLAYWRIGHT_API_URL (see playwright.config.ts).
//
// React-Native-Web note: TouchableOpacity renders as a <div> with no button
// role, and screen headers often repeat the button's label, so we locate
// tappable controls by visible text and disambiguate with .last().

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8081';

// 1×1 transparent PNG — enough for expo-image-picker's web file reader.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function tapByText(page: Page, text: string) {
  // Last match = the button (headers/subtitles with the same label come first).
  return page.getByText(text, { exact: true }).last().click();
}

test.describe('AccessMap smoke', () => {
  test('register → login → view map → submit report', async ({ page, context }) => {
    // Report form's "Current Location" mode reads navigator.geolocation.
    await context.grantPermissions(['geolocation'], { origin: BASE_URL });
    await context.setGeolocation({ latitude: BOUN_CENTER.lat, longitude: BOUN_CENTER.lng });

    const email = `e2e+ui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'E2ePassw0rd!';

    // ── Register via the UI ──
    await page.goto('/auth/register');
    await page.getByPlaceholder('your@email.com').fill(email);
    await page.getByPlaceholder('Ahmet Yılmaz').fill('E2E Tester');
    await page.getByPlaceholder('YYYY-MM-DD').fill('2000-01-01');
    await page.getByPlaceholder('Min 8 chars').fill(password);
    await page.getByPlaceholder('Re-enter').fill(password);
    await tapByText(page, 'Create Account');

    // Registration signs the user in and lands on the map tab.
    await expect(page).toHaveURL(/\/tabs(\/index)?(\?|#|$)/, { timeout: 30_000 });

    // ── View map ──
    await expect(page.getByPlaceholder('Search for a location')).toBeVisible({ timeout: 20_000 });

    // ── Submit a report ──
    await page.goto('/tabs/report');
    // Default location mode is "Current Location"; wait out the geolocation fetch.
    await expect(page.getByText('Detecting your location…')).toHaveCount(0, { timeout: 20_000 });

    await tapByText(page, 'Broken Ramp');
    await page
      .getByPlaceholder('Describe the obstacle — size, severity, how it affects accessibility…')
      .fill('E2E smoke: broken ramp near campus gate, no alternative accessible route.');

    // A photo is required. expo-image-picker (web) opens a native file dialog.
    const chooserPromise = page.waitForEvent('filechooser');
    await tapByText(page, 'Gallery');
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'obstacle.png', mimeType: 'image/png', buffer: PNG_1PX });
    // Thumbnail replaces the "No photo added yet" placeholder once decoded.
    await expect(page.getByText('No photo added yet')).toHaveCount(0, { timeout: 15_000 });

    await tapByText(page, 'Submit Report');
    await expect(page.getByText('Report Received!')).toBeVisible({ timeout: 30_000 });
  });

  test('login → request route between two campus points', async ({ page }) => {
    const user = await registerUser('route');

    // ── Login via the UI ──
    await page.goto('/auth/login');
    await page.getByPlaceholder('your@email.com').fill(user.email);
    await page.getByPlaceholder('Enter password').fill(user.password);
    await tapByText(page, 'Sign In');

    await expect(page).toHaveURL(/\/tabs(\/index)?(\?|#|$)/, { timeout: 30_000 });

    // ── Request a route between two campus points ──
    // Pick a destination from the map search (this also opens the route panel),
    // then a start point, then calculate. Search hits the backend geocoder and
    // falls back to Nominatim — adjust the terms if the deployed geocoder
    // indexes campus places under different names.
    const search = page.getByPlaceholder('Search for a location');
    await expect(search).toBeVisible({ timeout: 20_000 });
    await search.fill('Bebek, Istanbul');
    await page.getByText(/Bebek/i).first().click({ timeout: 20_000 });

    await tapByText(page, 'Plan Route');

    const origin = page.getByPlaceholder('Origin — search or drop pin');
    await expect(origin).toBeVisible({ timeout: 10_000 });
    await origin.fill('Etiler, Istanbul');
    await page.getByText(/Etiler/i).first().click({ timeout: 20_000 });

    await tapByText(page, 'Get Route');

    // Route summary panel shows Distance / Est. time once a route comes back.
    await expect(page.getByText('Est. time')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Distance')).toBeVisible();
  });

  test('upvote a report → count increments', async ({ page }) => {
    // Author and report come from the API; the upvoter cannot be the owner.
    const author = await registerUser('author');
    const reportId = await createReport(author.access, {
      description: 'E2E smoke fixture — upvote target',
    });
    const voter = await registerUser('voter');

    await seedAuth(page, voter, BASE_URL);
    await page.goto(`/report/${reportId}`);

    const upvoteBtn = page.getByTestId('upvote-button');
    const upvoteCount = page.getByTestId('upvote-count');
    await expect(upvoteBtn).toBeVisible({ timeout: 20_000 });

    const readCount = async () =>
      parseInt((await upvoteCount.textContent())?.match(/\d+/)?.[0] ?? '0', 10);

    const before = await readCount();
    await upvoteBtn.click();

    await expect.poll(readCount, { timeout: 15_000 }).toBe(before + 1);
  });
});
