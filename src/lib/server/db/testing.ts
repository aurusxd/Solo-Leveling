import { inject } from 'vitest';
import { createDatabase, type DatabaseHandle } from './client.ts';

/**
 * Connects to the migrated throwaway database from tests/setup/database.ts. Null when no Postgres
 * is configured locally, so integration suites can skip; CI always provides one.
 */
export function openTestDatabase(): DatabaseHandle | null {
	const url = inject('databaseUrl');
	return url ? createDatabase(url) : null;
}
