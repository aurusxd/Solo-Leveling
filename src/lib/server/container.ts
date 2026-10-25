// Manual dependency injection: the only place where implementations are chosen and wired.
import { CharacterProjector } from '#lib/domain/character/CharacterProjector.ts';
import { SystemClock, type Clock } from '#lib/domain/clock.ts';
import { ProgressionEngine } from '#lib/domain/rules/ProgressionEngine.ts';
import {
	DEFAULT_RULES,
	RulesConfigSchema,
	type RulesConfig
} from '#lib/domain/rules/RulesConfig.ts';
import { SessionManager } from './auth/SessionManager.ts';
import { TelegramInitDataVerifier } from './auth/TelegramInitDataVerifier.ts';
import { DEV_USER, PLAN_FEATURES, SECURITY, type AppConfig } from './config.ts';
import { createDatabase, type DatabaseHandle } from './db/client.ts';
import { FixedWindowRateLimiter } from './rateLimit.ts';
import { SessionRepository } from './repositories/SessionRepository.ts';
import { UserRepository } from './repositories/UserRepository.ts';
import { AuthService } from './services/AuthService.ts';
import { PlanEntitlements, type Entitlements } from './services/Entitlements.ts';

export type Container = {
	config: AppConfig;
	clock: Clock;
	rules: RulesConfig;
	progression: ProgressionEngine;
	projector: CharacterProjector;
	database: DatabaseHandle;
	repositories: {
		users: UserRepository;
		sessions: SessionRepository;
	};
	sessions: SessionManager;
	auth: AuthService;
	entitlements: Entitlements;
	rateLimits: {
		auth: FixedWindowRateLimiter;
	};
	close(): Promise<void>;
};

export type ContainerOverrides = {
	clock?: Clock;
	rules?: RulesConfig;
	database?: DatabaseHandle;
};

/** Builds a fresh graph. Tests call this directly with overrides such as a FixedClock. */
export function buildContainer(config: AppConfig, overrides: ContainerOverrides = {}): Container {
	const clock = overrides.clock ?? new SystemClock();
	// Validated on startup so a bad rules edit fails fast instead of mid-request.
	const rules = RulesConfigSchema.parse(overrides.rules ?? DEFAULT_RULES);
	const progression = new ProgressionEngine(rules);
	const projector = new CharacterProjector(progression);
	const database = overrides.database ?? createDatabase(config.databaseUrl);
	const users = new UserRepository(database.db);
	const sessionRepository = new SessionRepository(database.db);
	const sessions = new SessionManager(sessionRepository, clock, {
		ttlMs: SECURITY.sessionTtlMs,
		production: config.env === 'production'
	});
	const verifier = config.botToken ? new TelegramInitDataVerifier(config.botToken, clock) : null;
	const auth = new AuthService(users, sessions, verifier, DEV_USER);
	const entitlements = new PlanEntitlements(users, PLAN_FEATURES, config.entitlementsAll);

	return {
		config,
		clock,
		rules,
		progression,
		projector,
		database,
		repositories: { users, sessions: sessionRepository },
		sessions,
		auth,
		entitlements,
		rateLimits: { auth: new FixedWindowRateLimiter(clock, SECURITY.authRateLimit) },
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
