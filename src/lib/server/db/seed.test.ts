import { randomInt } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	characters,
	goals,
	onboardingProfiles,
	progressEvents,
	quests,
	shopItems,
	users
} from './schema.ts';
import {
	SEED_TELEGRAM_IDS,
	VETERAN_HISTORY_DAYS,
	VETERAN_WEAK_SPOT,
	seedDatabase,
	type SeedResult
} from './seed.ts';
import { openTestDatabase } from './testing.ts';

const handle = openTestDatabase();
const NOW = new Date('2026-10-24T12:00:00Z');
// Starting QuestTemplateCatalog keys, tech.md 9.1.
const CATALOG_KEYS = [
	'pushups',
	'mobility',
	'cardio',
	'sleep',
	'study',
	'reading',
	'focus',
	'deep_work',
	'mindful'
];

describe.skipIf(!handle)('seedDatabase (real Postgres)', () => {
	const { db } = handle!;
	let seeded: SeedResult;

	beforeAll(async () => {
		seeded = await seedDatabase(db, { now: NOW });
	});
	afterAll(() => handle?.close());

	const userIdOf = (profile: 'newbie' | 'veteran') => {
		const id = seeded[profile]?.userId;
		if (!id) throw new Error(`${profile} not seeded`);
		return id;
	};

	describe('newbie', () => {
		it('starts in the questionnaire with a fresh level 1 character', async () => {
			const userId = userIdOf('newbie');
			const [profile] = await db
				.select()
				.from(onboardingProfiles)
				.where(eq(onboardingProfiles.userId, userId));
			const [character] = await db.select().from(characters).where(eq(characters.userId, userId));
			expect(profile?.phase).toBe('questionnaire');
			expect(character).toMatchObject({ level: 1, xpTotal: 0, gold: 0, statPoints: {} });
		});

		it('has 3 active quests, 2 shop rewards and an empty ledger', async () => {
			const userId = userIdOf('newbie');
			const active = await db
				.select()
				.from(quests)
				.where(and(eq(quests.userId, userId), eq(quests.status, 'active')));
			const items = await db.select().from(shopItems).where(eq(shopItems.userId, userId));
			const events = await db
				.select()
				.from(progressEvents)
				.where(eq(progressEvents.userId, userId));
			expect(active).toHaveLength(3);
			expect(items).toHaveLength(2);
			expect(events).toEqual([]);
		});
	});

	describe('veteran', () => {
		it('has finished calibration and owns 3 goals', async () => {
			const userId = userIdOf('veteran');
			const [profile] = await db
				.select()
				.from(onboardingProfiles)
				.where(eq(onboardingProfiles.userId, userId));
			const owned = await db.select().from(goals).where(eq(goals.userId, userId));
			expect(profile?.phase).toBe('active');
			expect(profile?.activatedAt?.getTime()).toBeLessThanOrEqual(NOW.getTime());
			expect(owned).toHaveLength(3);
		});

		it('has a resolved planner history from the template catalog', async () => {
			const userId = userIdOf('veteran');
			const history = await db.select().from(quests).where(eq(quests.userId, userId));
			const dates = new Set(history.map((q) => q.planDate));

			expect(dates.size).toBe(VETERAN_HISTORY_DAYS);
			for (const q of history) {
				expect(['completed', 'failed']).toContain(q.status);
				expect(CATALOG_KEYS).toContain(q.templateKey);
				expect(q.createdBy).toBe('system');
				expect(q.resolvedAt!.getTime()).toBeLessThan(NOW.getTime());
			}
		});

		it('completes its weak-spot area least often', async () => {
			const userId = userIdOf('veteran');
			const history = await db.select().from(quests).where(eq(quests.userId, userId));
			const rate = (stat: string) => {
				const area = history.filter((q) => {
					const stats = (q.reward as { stats: Record<string, number> }).stats;
					return Object.keys(stats).includes(stat);
				});
				return area.filter((q) => q.status === 'completed').length / area.length;
			};
			const rates = ['strength', 'intelligence', 'discipline'].map((s) => [s, rate(s)] as const);
			const lowest = rates.reduce((min, r) => (r[1] < min[1] ? r : min));
			expect(lowest[0]).toBe(VETERAN_WEAK_SPOT);
		});
	});

	it('re-seeding replaces seed users and leaves other users untouched', async () => {
		const [outsider] = await db
			.insert(users)
			.values({ telegramId: BigInt(randomInt(1, 2 ** 47)), firstName: 'Outsider' })
			.returning();

		const again = await seedDatabase(db, { now: NOW, profiles: ['newbie'] });

		const seedUsers = await db
			.select({ n: count() })
			.from(users)
			.where(eq(users.telegramId, SEED_TELEGRAM_IDS.newbie));
		const stillThere = await db.select().from(users).where(eq(users.id, outsider!.id));
		const veteranKept = await db
			.select()
			.from(users)
			.where(eq(users.telegramId, SEED_TELEGRAM_IDS.veteran));

		expect(again.newbie?.userId).not.toBe(seeded.newbie?.userId);
		expect(seedUsers[0]?.n).toBe(1);
		expect(stillThere).toHaveLength(1);
		expect(veteranKept).toHaveLength(1);
		seeded = { ...seeded, newbie: again.newbie };
	});
});
