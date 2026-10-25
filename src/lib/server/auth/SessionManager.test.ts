import { describe, expect, it } from 'vitest';
import { FixedClock } from '#lib/domain/clock.ts';
import { SECURITY } from '../config.ts';
import { SessionManager, hashToken, type SessionStore } from './SessionManager.ts';

// Only the shape SessionManager uses; it records calls and validates what it is given.
class FakeSessions implements SessionStore {
	readonly rows: { userId: string; tokenHash: string; expiresAt: Date }[] = [];
	lookups = 0;
	async create(userId: string, tokenHash: string, expiresAt: Date) {
		if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error('fake: token hash must be sha256 hex');
		this.rows.push({ userId, tokenHash, expiresAt });
		return 'session-1';
	}
	async findActive() {
		this.lookups += 1;
		return null;
	}
	async delete() {}
}

const make = (production: boolean) => {
	const repo = new FakeSessions();
	const clock = new FixedClock('2026-10-25T12:00:00Z');
	const manager = new SessionManager(repo, clock, {
		ttlMs: SECURITY.sessionTtlMs,
		production
	});
	return { repo, manager };
};

describe('SessionManager', () => {
	it('names the cookie __Host-sid in production and sid elsewhere', () => {
		expect(make(true).manager.cookieName).toBe('__Host-sid');
		expect(make(false).manager.cookieName).toBe('sid');
	});

	it('sets HttpOnly, Secure, SameSite=Lax, Path=/ cookies', () => {
		const expires = new Date('2026-11-24T12:00:00Z');
		expect(make(true).manager.cookieOptions(expires)).toEqual({
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			expires
		});
	});

	it('issues a 32-byte token, stores only its hash, expires in 30 days', async () => {
		const { repo, manager } = make(false);
		const started = await manager.start('user-1');

		expect(Buffer.from(started.token, 'base64url')).toHaveLength(32);
		expect(repo.rows).toEqual([
			{ userId: 'user-1', tokenHash: hashToken(started.token), expiresAt: started.expiresAt }
		]);
		expect(repo.rows[0]?.tokenHash).not.toContain(started.token);
		expect(started.expiresAt.toISOString()).toBe('2026-11-24T12:00:00.000Z');
	});

	it('issues a different token every time', async () => {
		const { manager } = make(false);
		const tokens = await Promise.all(Array.from({ length: 20 }, () => manager.start('u')));
		expect(new Set(tokens.map((t) => t.token)).size).toBe(20);
	});

	it('does not query the database for malformed tokens', async () => {
		const { repo, manager } = make(false);
		expect(await manager.resolve('')).toBeNull();
		expect(await manager.resolve('not a token')).toBeNull();
		expect(await manager.resolve('a'.repeat(44))).toBeNull();
		expect(repo.lookups).toBe(0);
	});
});
