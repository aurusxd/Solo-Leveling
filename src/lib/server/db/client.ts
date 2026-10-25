import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything a repository can run queries on: the pool or an open transaction. */
export type DbExecutor = Database | Transaction;

export type DatabaseHandle = {
	db: Database;
	close(): Promise<void>;
};

/** Opens a pooled connection. Built once in container.ts; scripts and tests open their own. */
export function createDatabase(url: string): DatabaseHandle {
	const pool = new pg.Pool({ connectionString: url });
	return {
		db: drizzle(pool, { schema }),
		close: () => pool.end()
	};
}
