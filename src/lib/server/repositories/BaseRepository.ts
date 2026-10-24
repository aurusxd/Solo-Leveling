import type { DbExecutor } from '../db/client.ts';

/**
 * Base for all repositories, the only place SQL lives. Every public method takes the userId it
 * acts for and filters by it, so one user can never reach another user's rows.
 */
export abstract class BaseRepository {
	constructor(protected readonly db: DbExecutor) {}

	/** The same repository running on `executor`, so a service can join several in one transaction. */
	with(executor: DbExecutor): this {
		const Repository = this.constructor as new (db: DbExecutor) => this;
		return new Repository(executor);
	}
}
