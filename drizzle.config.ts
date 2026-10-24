import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	strict: true,
	// Only `db:studio` connects; `db:generate` works offline from the schema.
	dbCredentials: { url: process.env.DATABASE_URL ?? '' }
});
