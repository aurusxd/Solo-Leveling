// Vitest global setup for the server project: creates a throwaway database, applies the real
// migrations to it with scripts/migrate.js, hands its URL to tests via inject('databaseUrl') and
// drops it afterwards.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
	export interface ProvidedContext {
		databaseUrl: string | null;
	}
}

export default async function setup(project: TestProject) {
	if (existsSync('.env')) process.loadEnvFile('.env');
	const baseUrl = process.env.DATABASE_URL;
	if (!baseUrl) {
		if (process.env.CI) throw new Error('DATABASE_URL is required for integration tests in CI');
		project.provide('databaseUrl', null);
		return;
	}

	const name = `life_rpg_test_${process.pid}_${Date.now()}`;
	const admin = new pg.Client({ connectionString: baseUrl });
	try {
		await admin.connect();
	} catch (cause) {
		throw new Error('Postgres is unreachable at DATABASE_URL; start it with `pnpm db:up`', {
			cause
		});
	}
	await admin.query(`CREATE DATABASE "${name}"`);
	await admin.end();

	const url = new URL(baseUrl);
	url.pathname = `/${name}`;
	execFileSync(process.execPath, ['scripts/migrate.js'], {
		env: { ...process.env, DATABASE_URL: url.toString() },
		stdio: 'pipe'
	});
	project.provide('databaseUrl', url.toString());

	return async () => {
		const client = new pg.Client({ connectionString: baseUrl });
		await client.connect();
		await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
		await client.end();
	};
}
