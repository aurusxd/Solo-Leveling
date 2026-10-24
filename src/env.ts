import { defineEnvVars } from '@sveltejs/kit/env';

// SvelteKit loads these (from .env in dev and preview, from the process at runtime) and exposes
// them through $app/env/private. Validation lives in src/lib/server/config.ts so every rule,
// including cross-variable ones, is in one place; here each value passes through as a raw string.
const raw = (description: string) => ({
	description,
	schema: (value: string | undefined) => value
});

export const variables = defineEnvVars({
	NODE_ENV: raw('development | test | production'),
	DATABASE_URL: raw('Postgres connection URL'),
	BOT_TOKEN: raw('Telegram bot token, required in production'),
	DEEPSEEK_API_KEY: raw('DeepSeek API key; unset selects FakeLlmClient'),
	DEV_AUTH_BYPASS: raw('Dev-only sign-in bypass, forbidden in production'),
	ENTITLEMENTS_ALL: raw('Dev-only switch that enables all paid features, forbidden in production')
});
