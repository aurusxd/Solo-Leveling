import * as privateEnv from '$app/env/private';
import { z } from 'zod';

// Unset and empty variables mean the same thing, so `KEY=` in .env behaves like a missing key.
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const flag = z.preprocess(
	(v) => (v === '' ? undefined : v),
	z
		.enum(['true', 'false'])
		.default('false')
		.transform((v) => v === 'true')
);

export const envSchema = z
	.object({
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
		BOT_TOKEN: optionalString,
		DEEPSEEK_API_KEY: optionalString,
		DEV_AUTH_BYPASS: flag,
		ENTITLEMENTS_ALL: flag
	})
	.superRefine((env, ctx) => {
		if (env.NODE_ENV !== 'production') return;
		if (env.DEV_AUTH_BYPASS) {
			ctx.addIssue({
				code: 'custom',
				path: ['DEV_AUTH_BYPASS'],
				message: 'forbidden in production'
			});
		}
		if (env.ENTITLEMENTS_ALL) {
			ctx.addIssue({
				code: 'custom',
				path: ['ENTITLEMENTS_ALL'],
				message: 'forbidden in production'
			});
		}
		if (!env.BOT_TOKEN) {
			ctx.addIssue({ code: 'custom', path: ['BOT_TOKEN'], message: 'required in production' });
		}
	});

export type AppConfig = {
	env: 'development' | 'test' | 'production';
	databaseUrl: string;
	botToken: string | null;
	/** null selects FakeLlmClient. */
	deepseekApiKey: string | null;
	devAuthBypass: boolean;
	entitlementsAll: boolean;
};

export class ConfigError extends Error {
	constructor(readonly issues: string[]) {
		super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
		this.name = 'ConfigError';
	}
}

/**
 * The only place that interprets environment variables. Error messages name variables,
 * never their values, so a misconfigured secret cannot leak into logs.
 */
export function loadConfig(source: Record<string, string | undefined>): AppConfig {
	const parsed = envSchema.safeParse(source);
	if (!parsed.success) {
		throw new ConfigError(
			parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
		);
	}
	const env = parsed.data;
	return {
		env: env.NODE_ENV,
		databaseUrl: env.DATABASE_URL,
		botToken: env.BOT_TOKEN ?? null,
		deepseekApiKey: env.DEEPSEEK_API_KEY ?? null,
		devAuthBypass: env.DEV_AUTH_BYPASS,
		entitlementsAll: env.ENTITLEMENTS_ALL
	};
}

/** Reads the variables declared in src/env.ts. */
export function readConfig(): AppConfig {
	return loadConfig({
		NODE_ENV: privateEnv.NODE_ENV,
		DATABASE_URL: privateEnv.DATABASE_URL,
		BOT_TOKEN: privateEnv.BOT_TOKEN,
		DEEPSEEK_API_KEY: privateEnv.DEEPSEEK_API_KEY,
		DEV_AUTH_BYPASS: privateEnv.DEV_AUTH_BYPASS,
		ENTITLEMENTS_ALL: privateEnv.ENTITLEMENTS_ALL
	});
}
