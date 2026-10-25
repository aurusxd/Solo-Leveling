import { expect, test } from '@playwright/test';

// The e2e server runs with DEV_AUTH_BYPASS, so pages sign in as the dev user automatically.
const ORIGIN = 'http://localhost:4173';
const json = { origin: ORIGIN, 'content-type': 'application/json' };

test('a signed-in visitor of /login lands on the home page', async ({ page }) => {
	await page.goto('/login');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('forged init data is rejected with 401 and an ErrorBody', async ({ request }) => {
	const res = await request.post('/api/auth/telegram', {
		headers: json,
		data: { initData: `auth_date=1&user=%7B%7D&hash=${'0'.repeat(64)}` }
	});
	expect(res.status()).toBe(401);
	expect(await res.json()).toEqual({ code: 'UNAUTHENTICATED', message: expect.any(String) });
});

test('a malformed body is a VALIDATION error', async ({ request }) => {
	const res = await request.post('/api/auth/telegram', { headers: json, data: { initData: '' } });
	expect(res.status()).toBe(400);
	expect((await res.json()).code).toBe('VALIDATION');
});

test('cross-origin mutations are refused', async ({ request }) => {
	const res = await request.post('/api/auth/telegram', {
		headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
		data: { initData: 'x' }
	});
	expect(res.status()).toBe(403);
	expect((await res.json()).code).toBe('FORBIDDEN');
});

test('logout ends the session and clears the cookie', async ({ request }) => {
	await request.get('/');
	const res = await request.post('/api/auth/logout', { headers: json });
	expect(res.status()).toBe(200);
	expect(await res.json()).toEqual({ ok: true });
	expect(res.headers()['set-cookie']).toMatch(/sid=;/);
});
