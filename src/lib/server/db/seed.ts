import { eq, inArray } from 'drizzle-orm';
import { idempotencyKey } from '#lib/domain/idempotency.ts';
import { ProgressionEngine } from '#lib/domain/rules/ProgressionEngine.ts';
import { DEFAULT_RULES, type RulesConfig } from '#lib/domain/rules/RulesConfig.ts';
import { Penalty, QuestCriteria, Reward } from '#lib/types/index.ts';
import type { Database, Transaction as Tx } from './client.ts';
import {
	characters,
	goals,
	onboardingProfiles,
	progressEvents,
	quests,
	shopItems,
	userSettings,
	users
} from './schema.ts';

export const SEED_PROFILES = ['newbie', 'veteran'] as const;
export type SeedProfile = (typeof SEED_PROFILES)[number];

// Real Telegram ids are positive, so negative ids can never collide with a real account.
export const SEED_TELEGRAM_IDS: Record<SeedProfile, bigint> = {
	newbie: -1n,
	veteran: -2n
};

/** Days of planner history for `veteran`, ending yesterday. */
export const VETERAN_HISTORY_DAYS = 30;

/**
 * Expected weak spot of `veteran` for golden tests: strength has the highest goal priority and the
 * lowest completion rate (about one day in three).
 */
export const VETERAN_WEAK_SPOT = 'strength';

type SeedOptions = { now: Date; profiles?: readonly SeedProfile[]; rules?: RulesConfig };
export type SeedResult = Record<SeedProfile, { userId: string } | null>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Recreates the requested seed users from scratch. Re-running replaces them and leaves every other
 * user, including seed profiles that were not requested, alone.
 *
 * The veteran ledger is derived from its resolved quests by ProgressionEngine, so the seed never
 * restates progression rules and its characters cache equals the projection of its ledger.
 */
export async function seedDatabase(db: Database, options: SeedOptions): Promise<SeedResult> {
	const profiles = options.profiles ?? SEED_PROFILES;
	const engine = new ProgressionEngine(options.rules ?? DEFAULT_RULES);
	return db.transaction(async (tx) => {
		await tx.delete(users).where(
			inArray(
				users.telegramId,
				profiles.map((p) => SEED_TELEGRAM_IDS[p])
			)
		);
		return {
			newbie: profiles.includes('newbie') ? await seedNewbie(tx, options.now) : null,
			veteran: profiles.includes('veteran') ? await seedVeteran(tx, options.now, engine) : null
		};
	});
}

async function createUser(
	tx: Tx,
	profile: SeedProfile,
	fields: { firstName: string; plan: 'free' | 'pro' }
): Promise<string> {
	const [user] = await tx
		.insert(users)
		.values({
			telegramId: SEED_TELEGRAM_IDS[profile],
			username: `seed_${profile}`,
			firstName: fields.firstName,
			languageCode: 'ru',
			plan: fields.plan
		})
		.returning({ id: users.id });
	if (!user) throw new Error(`seed: failed to create ${profile}`);
	await tx.insert(characters).values({ userId: user.id });
	await tx.insert(userSettings).values({ userId: user.id, timezone: 'UTC' });
	return user.id;
}

async function seedNewbie(tx: Tx, now: Date): Promise<{ userId: string }> {
	const userId = await createUser(tx, 'newbie', { firstName: 'Newbie', plan: 'free' });
	await tx.insert(onboardingProfiles).values({ userId, phase: 'questionnaire' });
	await tx.insert(quests).values([
		{
			userId,
			title: 'Morning push-ups',
			type: 'exercise',
			criteria: { kind: 'reps', exercise: 'pushup', target: 20 },
			reward: { xp: 40, gold: 10, stats: { strength: 2 } }
		},
		{
			userId,
			title: 'Read 15 pages',
			type: 'learning',
			criteria: { kind: 'manual' },
			reward: { xp: 20, gold: 5, stats: { intelligence: 1 } },
			deadlineAt: new Date(now.getTime() + DAY_MS)
		},
		{
			userId,
			title: 'Plan tomorrow',
			type: 'habit',
			criteria: { kind: 'manual' },
			reward: { xp: 10, gold: 5, stats: { discipline: 1 } }
		}
	]);
	await tx.insert(shopItems).values([
		{ userId, title: 'Episode of a series', price: 30 },
		{ userId, title: 'Coffee out', description: 'A coffee in a cafe', price: 50 }
	]);
	return { userId };
}

type VeteranTemplate = {
	key: string;
	stat: 'strength' | 'intelligence' | 'discipline';
	title: string;
	type: 'exercise' | 'learning' | 'habit';
	criteria: Record<string, unknown>;
	reward: { xp: number; gold: number; stats: Record<string, number> };
	completedOn: (daysAgo: number) => boolean;
};

// Keys match the starting QuestTemplateCatalog (tech.md 9.1).
const VETERAN_TEMPLATES: VeteranTemplate[] = [
	{
		key: 'pushups',
		stat: 'strength',
		title: 'Push-ups',
		type: 'exercise',
		criteria: { kind: 'reps', exercise: 'pushup', target: 10 },
		reward: { xp: 20, gold: 5, stats: { strength: 1 } },
		completedOn: (d) => d % 3 === 0
	},
	{
		key: 'study',
		stat: 'intelligence',
		title: '30 minutes of study',
		type: 'learning',
		criteria: { kind: 'manual' },
		reward: { xp: 30, gold: 8, stats: { intelligence: 1 } },
		completedOn: (d) => d % 7 !== 0
	},
	{
		key: 'focus',
		stat: 'discipline',
		title: 'Main task before noon',
		type: 'habit',
		criteria: { kind: 'manual' },
		reward: { xp: 25, gold: 6, stats: { discipline: 1 } },
		completedOn: (d) => d % 10 !== 0
	}
];

const VETERAN_GOALS = [
	{ stat: 'strength', title: 'Get stronger', weeklyTargetPoints: 10, priority: 3 },
	{ stat: 'intelligence', title: 'Study every day', weeklyTargetPoints: 10, priority: 2 },
	{ stat: 'discipline', title: 'Keep focus', weeklyTargetPoints: 5, priority: 1 }
] as const;

async function seedVeteran(
	tx: Tx,
	now: Date,
	engine: ProgressionEngine
): Promise<{ userId: string }> {
	const userId = await createUser(tx, 'veteran', { firstName: 'Veteran', plan: 'pro' });
	const today = startOfUtcDay(now);
	const calibrationStartedAt = new Date(today.getTime() - (VETERAN_HISTORY_DAYS + 7) * DAY_MS);

	await tx.insert(onboardingProfiles).values({
		userId,
		phase: 'active',
		answers: {
			goals: VETERAN_GOALS,
			dailyMinutes: 60,
			preferredWindow: 'evening',
			timezone: 'UTC'
		},
		calibrationStartedAt,
		activatedAt: new Date(calibrationStartedAt.getTime() + 7 * DAY_MS)
	});
	await tx.insert(goals).values(VETERAN_GOALS.map((g) => ({ userId, ...g })));

	const history = [];
	for (let daysAgo = 1; daysAgo <= VETERAN_HISTORY_DAYS; daysAgo++) {
		const day = new Date(today.getTime() - daysAgo * DAY_MS);
		const deadlineAt = new Date(day.getTime() + DAY_MS - 1);
		for (const t of VETERAN_TEMPLATES) {
			const completed = t.completedOn(daysAgo);
			history.push({
				userId,
				title: t.title,
				type: t.type,
				status: completed ? ('completed' as const) : ('failed' as const),
				criteria: t.criteria,
				reward: t.reward,
				createdBy: 'system' as const,
				templateKey: t.key,
				planDate: day.toISOString().slice(0, 10),
				difficulty: 1,
				createdAt: new Date(day.getTime() + 6 * 60 * 60 * 1000),
				deadlineAt,
				// Completions land in the evening window; failures resolve at the deadline sweep.
				resolvedAt: completed ? new Date(day.getTime() + 19 * 60 * 60 * 1000) : deadlineAt
			});
		}
	}
	const resolved = await tx.insert(quests).values(history).returning();
	await writeLedger(tx, userId, resolved, engine, now);
	return { userId };
}

/** Replays resolved quests in order through the engine, then caches the resulting character. */
async function writeLedger(
	tx: Tx,
	userId: string,
	resolved: (typeof quests.$inferSelect)[],
	engine: ProgressionEngine,
	now: Date
): Promise<void> {
	const ordered = [...resolved].sort((a, b) => a.resolvedAt!.getTime() - b.resolvedAt!.getTime());
	let state = engine.initialState();
	const events: (typeof progressEvents.$inferInsert)[] = [];

	for (const q of ordered) {
		const quest = {
			reward: Reward.parse(q.reward),
			penalty: q.penalty == null ? null : Penalty.parse(q.penalty),
			deadlineAt: q.deadlineAt
		};
		const completed = q.status === 'completed';
		const delta = completed
			? engine.questCompleted(quest, q.resolvedAt!)
			: engine.questFailed(state, quest);
		state = engine.apply(state, delta);
		// Rep quests are confirmed by the camera; manual ones are the user's word.
		const measured = QuestCriteria.parse(q.criteria).kind === 'reps';
		events.push({
			userId,
			idempotencyKey: completed
				? idempotencyKey.questCompleted(q.id)
				: idempotencyKey.questFailed(q.id),
			kind: completed ? 'quest_completed' : 'quest_failed',
			source: completed ? (measured ? 'cv' : 'manual') : 'system',
			verification: completed ? (measured ? 'measured' : 'self_reported') : 'system',
			...delta,
			refType: 'quest',
			refId: q.id,
			createdAt: q.resolvedAt!
		});
	}

	await tx.insert(progressEvents).values(events);
	await tx
		.update(characters)
		.set({
			level: state.level,
			xpTotal: state.xpTotal,
			gold: state.gold,
			statPoints: state.statPoints,
			updatedAt: now
		})
		.where(eq(characters.userId, userId));
}

function startOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
