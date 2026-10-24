import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const DEV = {
	NODE_ENV: 'development',
	DATABASE_URL: 'postgres://u:p@localhost:5432/db'
};

const PROD = {
	NODE_ENV: 'production',
	DATABASE_URL: 'postgres://u:p@postgres:5432/db',
	BOT_TOKEN: '123:abc'
};

function issuesOf(source: Record<string, string | undefined>): string[] {
	try {
		loadConfig(source);
	} catch (e) {
		if (e instanceof ConfigError) return e.issues;
		throw e;
	}
	throw new Error('expected ConfigError');
}

describe('loadConfig', () => {
	it('starts without any secrets outside production', () => {
		expect(loadConfig(DEV)).toEqual({
			env: 'development',
			databaseUrl: DEV.DATABASE_URL,
			botToken: null,
			deepseekApiKey: null,
			devAuthBypass: false,
			entitlementsAll: false
		});
	});

	it('treats empty values as unset', () => {
		const config = loadConfig({ ...DEV, BOT_TOKEN: '', DEEPSEEK_API_KEY: '', DEV_AUTH_BYPASS: '' });
		expect(config.botToken).toBeNull();
		expect(config.deepseekApiKey).toBeNull();
		expect(config.devAuthBypass).toBe(false);
	});

	it('defaults NODE_ENV to development', () => {
		expect(loadConfig({ DATABASE_URL: DEV.DATABASE_URL }).env).toBe('development');
	});

	it('enables dev flags only for the literal "true"', () => {
		const config = loadConfig({ ...DEV, DEV_AUTH_BYPASS: 'true', ENTITLEMENTS_ALL: 'true' });
		expect(config.devAuthBypass).toBe(true);
		expect(config.entitlementsAll).toBe(true);
		expect(issuesOf({ ...DEV, DEV_AUTH_BYPASS: '1' })).toEqual([
			expect.stringMatching(/^DEV_AUTH_BYPASS:/)
		]);
	});

	it('accepts a complete production environment', () => {
		const config = loadConfig({ ...PROD, DEEPSEEK_API_KEY: 'sk-test' });
		expect(config.env).toBe('production');
		expect(config.deepseekApiKey).toBe('sk-test');
	});

	it.each(['DEV_AUTH_BYPASS', 'ENTITLEMENTS_ALL'])('refuses %s=true in production', (key) => {
		expect(issuesOf({ ...PROD, [key]: 'true' })).toEqual([`${key}: forbidden in production`]);
	});

	it('requires BOT_TOKEN in production', () => {
		expect(issuesOf({ ...PROD, BOT_TOKEN: undefined })).toEqual([
			'BOT_TOKEN: required in production'
		]);
	});

	it('requires a postgres DATABASE_URL', () => {
		expect(issuesOf({ NODE_ENV: 'test' })).toEqual([expect.stringMatching(/^DATABASE_URL:/)]);
		expect(issuesOf({ ...DEV, DATABASE_URL: 'mysql://u:p@h/db' })).toEqual([
			expect.stringMatching(/^DATABASE_URL:/)
		]);
	});

	it('reports every problem at once', () => {
		const issues = issuesOf({
			...PROD,
			BOT_TOKEN: undefined,
			DEV_AUTH_BYPASS: 'true',
			ENTITLEMENTS_ALL: 'true'
		});
		expect(issues.map((i) => i.split(':')[0]).sort()).toEqual([
			'BOT_TOKEN',
			'DEV_AUTH_BYPASS',
			'ENTITLEMENTS_ALL'
		]);
	});

	it('never echoes variable values in errors', () => {
		const secret = 'super-secret-value-42';
		let message = '';
		try {
			loadConfig({ ...DEV, DATABASE_URL: secret, DEV_AUTH_BYPASS: secret, NODE_ENV: secret });
		} catch (e) {
			message = e instanceof Error ? e.message : '';
		}
		expect(message).toContain('DATABASE_URL');
		expect(message).not.toContain(secret);
	});
});
