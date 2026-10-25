import { randomInt } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '../db/schema.ts';
import { openTestDatabase } from '../db/testing.ts';
import { UserRepository } from './UserRepository.ts';

const handle = openTestDatabase();

describe.skipIf(!handle)('UserRepository (real Postgres)', () => {
	const { db } = handle!;
	const repo = new UserRepository(db);
	afterAll(() => handle?.close());

	async function newUser(plan: string) {
		const [user] = await db
			.insert(users)
			.values({ telegramId: BigInt(randomInt(1, 2 ** 47)), firstName: 'T', plan })
			.returning();
		if (!user) throw new Error('user not created');
		return user;
	}

	it("returns each user's own plan only", async () => {
		const a = await newUser('free');
		const b = await newUser('pro');
		expect(await repo.getPlan(a.id)).toBe('free');
		expect(await repo.getPlan(b.id)).toBe('pro');
	});

	it('returns null for an unknown user', async () => {
		expect(await repo.getPlan('00000000-0000-4000-8000-000000000000')).toBeNull();
	});

	it('with(tx) joins the transaction and sees its uncommitted rows', async () => {
		const telegramId = BigInt(randomInt(1, 2 ** 47));
		let insideTx: string | null = null;
		let userId = '';

		await db
			.transaction(async (tx) => {
				const [user] = await tx
					.insert(users)
					.values({ telegramId, firstName: 'Tx', plan: 'pro' })
					.returning();
				userId = user!.id;
				const scoped = repo.with(tx);
				expect(scoped).toBeInstanceOf(UserRepository);
				insideTx = await scoped.getPlan(userId);
				tx.rollback();
			})
			.catch(() => undefined);

		expect(insideTx).toBe('pro');
		expect(await repo.getPlan(userId)).toBeNull();
	});
});
