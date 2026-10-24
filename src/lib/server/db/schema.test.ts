import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { characters, goals, progressEvents, quests, users } from './schema.ts';
import { openTestDatabase } from './testing.ts';

const handle = openTestDatabase();

describe.skipIf(!handle)('schema constraints (real Postgres)', () => {
	const { db } = handle!;
	afterAll(() => handle?.close());

	async function newUser() {
		const [user] = await db
			.insert(users)
			.values({ telegramId: BigInt(randomInt(1, 2 ** 47)), firstName: 'Test' })
			.returning();
		if (!user) throw new Error('user not created');
		return user;
	}

	function event(userId: string, idempotencyKey: string) {
		return {
			userId,
			idempotencyKey,
			kind: 'quest_completed' as const,
			source: 'manual' as const,
			verification: 'self_reported' as const,
			xpDelta: 10
		};
	}

	it('stores one ledger row per idempotency key and user', async () => {
		const user = await newUser();
		const key = 'quest-completed:00000000-0000-0000-0000-000000000001';

		await db.insert(progressEvents).values(event(user.id, key));
		const retry = await db
			.insert(progressEvents)
			.values(event(user.id, key))
			.onConflictDoNothing()
			.returning();

		expect(retry).toEqual([]);
		await expect(db.insert(progressEvents).values(event(user.id, key))).rejects.toMatchObject({
			cause: { code: '23505' }
		});
		const rows = await db.select().from(progressEvents).where(eq(progressEvents.userId, user.id));
		expect(rows).toHaveLength(1);
	});

	it('allows the same idempotency key for different users', async () => {
		const [a, b] = [await newUser(), await newUser()];
		await db.insert(progressEvents).values([event(a.id, 'k'), event(b.id, 'k')]);
		const rows = await db
			.select()
			.from(progressEvents)
			.where(eq(progressEvents.idempotencyKey, 'k'));
		expect(rows.map((r) => r.userId).sort()).toEqual([a.id, b.id].sort());
	});

	it('rejects a second planner quest for the same template and day', async () => {
		const user = await newUser();
		const planned = {
			userId: user.id,
			title: 'Push-ups',
			type: 'exercise' as const,
			criteria: { kind: 'manual' },
			reward: { xp: 1, gold: 0, stats: {} },
			templateKey: 'pushups',
			planDate: '2026-10-01'
		};
		await db.insert(quests).values(planned);
		await expect(db.insert(quests).values(planned)).rejects.toMatchObject({
			cause: { code: '23505' }
		});
		await db.insert(quests).values({ ...planned, planDate: '2026-10-02' });
	});

	it('allows any number of hand-made quests without template or date', async () => {
		const user = await newUser();
		const manual = {
			userId: user.id,
			title: 'Same title',
			type: 'other' as const,
			criteria: { kind: 'manual' },
			reward: { xp: 1, gold: 0, stats: {} }
		};
		await db.insert(quests).values([manual, manual, manual]);
		const rows = await db.select().from(quests).where(eq(quests.userId, user.id));
		expect(rows).toHaveLength(3);
	});

	it('keeps one goal per stat for a user', async () => {
		const user = await newUser();
		const goal = { userId: user.id, stat: 'strength' as const, title: 'g', weeklyTargetPoints: 5 };
		await db.insert(goals).values(goal);
		await expect(db.insert(goals).values(goal)).rejects.toMatchObject({ cause: { code: '23505' } });
	});

	it('rejects a duplicate telegram id', async () => {
		const user = await newUser();
		await expect(
			db.insert(users).values({ telegramId: user.telegramId, firstName: 'Twin' })
		).rejects.toMatchObject({ cause: { code: '23505' } });
	});

	it('removes a user together with their data', async () => {
		const user = await newUser();
		await db.insert(characters).values({ userId: user.id });
		await db.insert(progressEvents).values(event(user.id, 'cascade'));
		await db.insert(quests).values({
			userId: user.id,
			title: 'q',
			type: 'other',
			criteria: { kind: 'manual' },
			reward: { xp: 1, gold: 0, stats: {} }
		});

		await db.delete(users).where(eq(users.id, user.id));

		expect(await db.select().from(characters).where(eq(characters.userId, user.id))).toEqual([]);
		expect(
			await db.select().from(progressEvents).where(eq(progressEvents.userId, user.id))
		).toEqual([]);
		expect(await db.select().from(quests).where(eq(quests.userId, user.id))).toEqual([]);
	});

	it('creates a character with level 1 and empty stats by default', async () => {
		const user = await newUser();
		const [character] = await db.insert(characters).values({ userId: user.id }).returning();
		expect(character).toMatchObject({
			level: 1,
			xpTotal: 0,
			gold: 0,
			statPoints: {},
			archetype: 'novice',
			difficulty: {}
		});
	});
});
