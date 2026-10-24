// Usage: pnpm db:seed [newbie|veteran ...]. Without arguments seeds every profile.
import { existsSync } from 'node:fs';
import { loadConfig } from '../src/lib/server/config.ts';
import { createDatabase } from '../src/lib/server/db/client.ts';
import { SEED_PROFILES, seedDatabase, type SeedProfile } from '../src/lib/server/db/seed.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig(process.env);
if (config.env === 'production') {
	process.stderr.write('refusing to seed a production database\n');
	process.exit(1);
}

const requested = process.argv.slice(2);
const unknown = requested.filter((p) => !(SEED_PROFILES as readonly string[]).includes(p));
if (unknown.length > 0) {
	process.stderr.write(`unknown profiles: ${unknown.join(', ')}\n`);
	process.exit(1);
}
const profiles = requested.length > 0 ? (requested as SeedProfile[]) : SEED_PROFILES;

const handle = createDatabase(config.databaseUrl);
try {
	const result = await seedDatabase(handle.db, { now: new Date(), profiles });
	for (const [profile, seeded] of Object.entries(result)) {
		if (seeded) process.stdout.write(`seeded ${profile}: ${seeded.userId}\n`);
	}
} finally {
	await handle.close();
}
