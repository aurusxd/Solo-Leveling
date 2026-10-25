import { createHmac, randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { FixedClock } from '#lib/domain/clock.ts';
import { DomainError } from '#lib/domain/errors.ts';
import { SessionManager } from '../auth/SessionManager.ts';
import { TelegramInitDataVerifier } from '../auth/TelegramInitDataVerifier.ts';
import { DEV_USER, SECURITY } from '../config.ts';
import { characters, onboardingProfiles, sessions, userSettings, users } from '../db/schema.ts';
import { openTestDatabase } from '../db/testing.ts';
import { SessionRepository } from '../repositories/SessionRepository.ts';
import { UserRepository } from '../repositories/UserRepository.ts';
import { AuthService } from './AuthService.ts';

const BOT_TOKEN = '777:integration-test-token';
const handle = openTestDatabase();

function initDataFor(telegramId: number, nowSec: number, firstName = 'Player'): string {
	const fields: Record<string, string> = {
		auth_date: String(nowSec),
		user: JSON.stringify({ id: telegramId, first_name: firstName })
	};
	const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
	const check = Object.keys(fields)
		.sort()
		.map((k) => `${k}=${fields[k]}`)
		.join('\n');
	const hash = createHmac('sha256', secret).update(check).digest('hex');
	return new URLSearchParams({ ...fields, hash }).toString();
}

const codeOf = async (p: Promise<unknown>) => {
	const e = await p.catch((error: unknown) => error);
	return e instanceof DomainError ? e.code : e;
};

describe.skipIf(!handle)('AuthService (real Postgres)', () => {
	const { db } = handle!;
	const clock = new FixedClock('2026-10-25T12:00:00Z');
	const nowSec = () => Math.floor(clock.now().getTime() / 1000);
	const usersRepo = new UserRepository(db);
	const manager = new SessionManager(new SessionRepository(db), clock, {
		ttlMs: SECURITY.sessionTtlMs,
		production: false
	});
	const verifier = new TelegramInitDataVerifier(BOT_TOKEN, clock);
	const auth = new AuthService(usersRepo, manager, verifier, DEV_USER);
	afterAll(() => handle?.close());

	const freshId = () => randomInt(1, 2 ** 40);
	const userByTelegram = async (id: number) =>
		(
			await db
				.select()
				.from(users)
				.where(eq(users.telegramId, BigInt(id)))
		)[0];

	it('creates a new player with a level 1 character in the questionnaire phase', async () => {
		const id = freshId();
		const started = await auth.signInWithTelegram(initDataFor(id, nowSec()));
		const session = await auth.resolve(started.token);
		const user = await userByTelegram(id);

		expect(session?.userId).toBe(user?.id);
		const [character] = await db.select().from(characters).where(eq(characters.userId, user!.id));
		const [profile] = await db
			.select()
			.from(onboardingProfiles)
			.where(eq(onboardingProfiles.userId, user!.id));
		const [settings] = await db
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, user!.id));
		expect(character).toMatchObject({
			level: 1,
			xpTotal: 0,
			gold: 0,
			statPoints: {},
			archetype: 'novice'
		});
		expect(profile?.phase).toBe('questionnaire');
		expect(settings?.timezone).toBe('UTC');
	});

	it('signing in again reuses the player and refreshes the name', async () => {
		const id = freshId();
		await auth.signInWithTelegram(initDataFor(id, nowSec(), 'Old'));
		await auth.signInWithTelegram(initDataFor(id, nowSec(), 'New'));

		const rows = await db
			.select()
			.from(users)
			.where(eq(users.telegramId, BigInt(id)));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.firstName).toBe('New');
		const chars = await db.select().from(characters).where(eq(characters.userId, rows[0]!.id));
		expect(chars).toHaveLength(1);
	});

	it('concurrent first sign-ins create exactly one player', async () => {
		const id = freshId();
		await Promise.all(
			Array.from({ length: 5 }, () =>
				usersRepo.ensureFromTelegram({
					telegramId: BigInt(id),
					firstName: 'Racer',
					username: null,
					languageCode: null
				})
			)
		);
		expect(
			await db
				.select()
				.from(users)
				.where(eq(users.telegramId, BigInt(id)))
		).toHaveLength(1);
	});

	it('stores only the token hash', async () => {
		const started = await auth.signInWithTelegram(initDataFor(freshId(), nowSec()));
		const stored = await db.select().from(sessions);
		expect(stored.some((s) => s.tokenHash === started.token)).toBe(false);
	});

	it('rejects forged or stale init data without creating anyone', async () => {
		const id = freshId();
		const forged = initDataFor(id, nowSec()).replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);
		expect(await codeOf(auth.signInWithTelegram(forged))).toBe('UNAUTHENTICATED');
		expect(await codeOf(auth.signInWithTelegram(initDataFor(id, nowSec() - 3601)))).toBe(
			'UNAUTHENTICATED'
		);
		expect(await userByTelegram(id)).toBeUndefined();
	});

	it('refuses Telegram sign-in when no bot token is configured', async () => {
		const noBot = new AuthService(usersRepo, manager, null, DEV_USER);
		expect(await codeOf(noBot.signInWithTelegram(initDataFor(freshId(), nowSec())))).toBe(
			'UNAUTHENTICATED'
		);
	});

	it('a session expires after 30 days and ends on sign-out', async () => {
		const started = await auth.signInWithTelegram(initDataFor(freshId(), nowSec()));
		const session = await auth.resolve(started.token);
		expect(session).not.toBeNull();

		clock.advance(SECURITY.sessionTtlMs);
		expect(await auth.resolve(started.token)).toBeNull();
		clock.advance(-SECURITY.sessionTtlMs);

		await auth.signOut(session!);
		expect(await auth.resolve(started.token)).toBeNull();
	});

	it("one player's token never resolves to another player", async () => {
		const a = await auth.signInWithTelegram(initDataFor(freshId(), nowSec()));
		const b = await auth.signInWithTelegram(initDataFor(freshId(), nowSec()));
		const [sa, sb] = [await auth.resolve(a.token), await auth.resolve(b.token)];
		expect(sa?.userId).not.toBe(sb?.userId);

		await auth.signOut({ sessionId: sb!.sessionId, userId: sa!.userId });
		expect(await auth.resolve(b.token)).not.toBeNull();
	});

	it('the dev bypass signs in as one fixed dev user', async () => {
		const first = await auth.signInDevUser();
		const second = await auth.signInDevUser();
		expect(second.userId).toBe(first.userId);
		const dev = await db.select().from(users).where(eq(users.telegramId, DEV_USER.telegramId));
		expect(dev).toHaveLength(1);
		expect(dev[0]?.firstName).toBe('Dev');
	});
});
