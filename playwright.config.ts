import { defineConfig, devices } from '@playwright/test';

// The app runs as a Telegram Mini App, so e2e runs on a mobile viewport only.
export default defineConfig({
	testDir: 'tests',
	testMatch: '**/*.e2e.ts',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	use: { ...devices['Pixel 7'], trace: 'retain-on-failure' },
	webServer: {
		command: 'pnpm build && pnpm preview --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI
	}
});
