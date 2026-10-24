// Source: tech.md section 6. Change the contract there first, then here, then `pnpm db:generate`.
import {
	pgTable,
	pgEnum,
	uuid,
	bigint,
	text,
	integer,
	boolean,
	real,
	timestamp,
	date,
	jsonb,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';

export const statEnum = pgEnum('stat', [
	'strength',
	'hp',
	'agility',
	'intelligence',
	'stamina',
	'discipline',
	'perception'
]);
export const questStatusEnum = pgEnum('quest_status', [
	'active',
	'completed',
	'failed',
	'proposed',
	'dismissed'
]);
export const questTypeEnum = pgEnum('quest_type', [
	'exercise',
	'learning',
	'project',
	'habit',
	'other',
	'boss'
]);
export const onboardingPhaseEnum = pgEnum('onboarding_phase', [
	'questionnaire',
	'calibration',
	'active'
]);
export const createdByEnum = pgEnum('created_by', ['user', 'system', 'ai']);
export const eventKindEnum = pgEnum('event_kind', [
	'quest_completed',
	'quest_failed',
	'exercise_logged',
	'purchase',
	'adjustment'
]);
export const eventSourceEnum = pgEnum('event_source', ['manual', 'cv', 'system', 'ai']);
export const verificationEnum = pgEnum('verification', ['measured', 'self_reported', 'system']);

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	telegramId: bigint('telegram_id', { mode: 'bigint' }).notNull().unique(),
	username: text('username'),
	firstName: text('first_name').notNull(),
	languageCode: text('language_code'),
	// 'free' | 'pro', changed by hand until billing exists
	plan: text('plan').notNull().default('free'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Cache of the character state. The source of truth is progress_events.
export const characters = pgTable('characters', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	level: integer('level').notNull().default(1),
	xpTotal: integer('xp_total').notNull().default(0),
	gold: integer('gold').notNull().default(0),
	statPoints: jsonb('stat_points').$type<Record<string, number>>().notNull().default({}),
	// cache of ArchetypeClassifier
	archetype: text('archetype').notNull().default('novice'),
	// cache of DifficultyController, per stat area
	difficulty: jsonb('difficulty')
		.$type<Record<string, { level: number; changedAt: string }>>()
		.notNull()
		.default({}),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Append-only ledger. Every award or charge is a row here.
export const progressEvents = pgTable(
	'progress_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		idempotencyKey: text('idempotency_key').notNull(),
		kind: eventKindEnum('kind').notNull(),
		source: eventSourceEnum('source').notNull(),
		verification: verificationEnum('verification').notNull(),
		xpDelta: integer('xp_delta').notNull().default(0),
		goldDelta: integer('gold_delta').notNull().default(0),
		statDeltas: jsonb('stat_deltas').$type<Record<string, number>>().notNull().default({}),
		refType: text('ref_type'),
		refId: uuid('ref_id'),
		payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('progress_events_user_idem_uq').on(t.userId, t.idempotencyKey),
		index('progress_events_user_created_idx').on(t.userId, t.createdAt)
	]
);

export const quests = pgTable(
	'quests',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		type: questTypeEnum('type').notNull(),
		status: questStatusEnum('status').notNull().default('active'),
		// QuestCriteria (zod)
		criteria: jsonb('criteria').$type<unknown>().notNull(),
		// Reward (zod)
		reward: jsonb('reward').$type<unknown>().notNull(),
		// Penalty (zod), null means RulesConfig defaults
		penalty: jsonb('penalty').$type<unknown>(),
		deadlineAt: timestamp('deadline_at', { withTimezone: true }),
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
		createdBy: createdByEnum('created_by').notNull().default('user'),
		// key from QuestTemplateCatalog, null for hand-made quests
		templateKey: text('template_key'),
		// user's local date, for planner quests
		planDate: date('plan_date'),
		// 1..10, snapshot at creation
		difficulty: integer('difficulty').notNull().default(1),
		// for bosses: start of progress counting
		startedAt: timestamp('started_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('quests_user_status_idx').on(t.userId, t.status),
		index('quests_deadline_idx').on(t.status, t.deadlineAt),
		// the planner never creates duplicates
		uniqueIndex('quests_plan_uq').on(t.userId, t.templateKey, t.planDate)
	]
);

export const onboardingProfiles = pgTable('onboarding_profiles', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	phase: onboardingPhaseEnum('phase').notNull().default('questionnaire'),
	// OnboardingAnswers (zod)
	answers: jsonb('answers').$type<unknown>(),
	calibrationStartedAt: timestamp('calibration_started_at', { withTimezone: true }),
	activatedAt: timestamp('activated_at', { withTimezone: true })
});

export const goals = pgTable(
	'goals',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		stat: statEnum('stat').notNull(),
		title: text('title').notNull(),
		weeklyTargetPoints: integer('weekly_target_points').notNull(),
		// 1..3, higher is more important
		priority: integer('priority').notNull().default(2),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('goals_user_stat_uq').on(t.userId, t.stat)]
);

// Cache of SignalAnalyzer. Reproducible from the ledger, never the source of truth.
export const signalSnapshots = pgTable(
	'signal_snapshots',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		windowDays: integer('window_days').notNull(),
		// SignalReport (zod)
		report: jsonb('report').$type<unknown>().notNull(),
		computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('signal_snapshots_user_idx').on(t.userId, t.computedAt)]
);

export const shopItems = pgTable('shop_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	description: text('description').notNull().default(''),
	price: integer('price').notNull(),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const purchases = pgTable('purchases', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	itemId: uuid('item_id')
		.notNull()
		.references(() => shopItems.id),
	// snapshot at purchase time
	itemTitle: text('item_title').notNull(),
	// price snapshot
	price: integer('price').notNull(),
	eventId: uuid('event_id')
		.notNull()
		.references(() => progressEvents.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const exerciseSessions = pgTable(
	'exercise_sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		clientSessionId: uuid('client_session_id').notNull(),
		exercise: text('exercise').notNull(),
		reps: integer('reps').notNull(),
		durationSec: integer('duration_sec').notNull(),
		avgConfidence: real('avg_confidence').notNull(),
		verification: verificationEnum('verification').notNull(),
		eventId: uuid('event_id').references(() => progressEvents.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('exercise_sessions_user_client_uq').on(t.userId, t.clientSessionId)]
);

export const userSettings = pgTable('user_settings', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	timezone: text('timezone').notNull().default('UTC'),
	locale: text('locale').notNull().default('ru'),
	notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
	cameraConsent: boolean('camera_consent').notNull().default(false),
	cameraConsentAt: timestamp('camera_consent_at', { withTimezone: true })
});
