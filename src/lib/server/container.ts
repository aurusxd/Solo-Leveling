// Manual dependency injection: the only place where implementations are chosen and wired.
import { SystemClock, type Clock } from '#lib/domain/clock.ts';
import { PLAN_FEATURES, type AppConfig } from './config.ts';
import { createDatabase, type DatabaseHandle } from './db/client.ts';
import { UserRepository } from './repositories/UserRepository.ts';
import { PlanEntitlements, type Entitlements } from './services/Entitlements.ts';

export type Container = {
	config: AppConfig;
	clock: Clock;
	database: DatabaseHandle;
	repositories: {
		users: UserRepository;
	};
	entitlements: Entitlements;
	close(): Promise<void>;
};

export type ContainerOverrides = {
	clock?: Clock;
	database?: DatabaseHandle;
};

/** Builds a fresh graph. Tests call this directly with overrides such as a FixedClock. */
export function buildContainer(config: AppConfig, overrides: ContainerOverrides = {}): Container {
	const clock = overrides.clock ?? new SystemClock();
	const database = overrides.database ?? createDatabase(config.databaseUrl);
	const users = new UserRepository(database.db);
	const entitlements = new PlanEntitlements(users, PLAN_FEATURES, config.entitlementsAll);

	return {
		config,
		clock,
		database,
		repositories: { users },
		entitlements,
		close: () => database.close()
	};
}

// The application-wide instance, created once by the server init hook.
let current: Container | undefined;

export function initContainer(config: AppConfig): Container {
	current ??= buildContainer(config);
	return current;
}

export function container(): Container {
	if (!current) throw new Error('container is not initialised; the server init hook builds it');
	return current;
}
