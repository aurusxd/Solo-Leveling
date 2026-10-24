import { expect, test } from '@playwright/test';

test('home page renders', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('health endpoint answers for the deploy check', async ({ request }) => {
	const res = await request.get('/api/health');
	expect(res.status()).toBe(200);
	expect(await res.json()).toEqual({ ok: true });
});
