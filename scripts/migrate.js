// Applies drizzle/ migrations. Plain JavaScript so the production image runs it without dev
// dependencies: `node scripts/migrate.js` (deploy) or `pnpm db:migrate` (dev and CI).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) {
	process.stderr.write('DATABASE_URL is not set\n');
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
	await migrate(drizzle(pool), {
		migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url))
	});
	process.stdout.write('migrations applied\n');
} finally {
	await pool.end();
}
