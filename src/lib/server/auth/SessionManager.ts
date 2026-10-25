import { createHash, randomBytes } from 'node:crypto';
import type { Clock } from '#lib/domain/clock.ts';
import type { ActiveSession } from '../repositories/SessionRepository.ts';

/** What SessionManager needs from storage; SessionRepository implements it. */
export interface SessionStore {
	create(userId: string, tokenHash: string, expiresAt: Date): Promise<string>;
	findActive(tokenHash: string, now: Date): Promise<ActiveSession | null>;
	delete(userId: string, sessionId: string): Promise<void>;
}

export type StartedSession = { token: string; expiresAt: Date };

export type CookieOptions = {
	path: '/';
	httpOnly: true;
	secure: true;
	sameSite: 'lax';
	expires: Date;
};

// 32 random bytes in base64url, tech.md section 14 (v4).
const TOKEN_BYTES = 32;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** Issues and resolves session tokens. Only the sha256 of a token ever reaches the database. */
export class SessionManager {
	readonly cookieName: string;

	constructor(
		private readonly sessions: SessionStore,
		private readonly clock: Clock,
		private readonly options: { ttlMs: number; production: boolean }
	) {
		// __Host- requires Secure and Path=/ and forbids Domain, which pins the cookie to this origin.
		this.cookieName = options.production ? '__Host-sid' : 'sid';
	}

	cookieOptions(expires: Date): CookieOptions {
		return { path: '/', httpOnly: true, secure: true, sameSite: 'lax', expires };
	}

	async start(userId: string): Promise<StartedSession> {
		const token = randomBytes(TOKEN_BYTES).toString('base64url');
		const expiresAt = new Date(this.clock.now().getTime() + this.options.ttlMs);
		await this.sessions.create(userId, hashToken(token), expiresAt);
		return { token, expiresAt };
	}

	/** Null for unknown, expired or malformed tokens; malformed ones never reach the database. */
	async resolve(token: string): Promise<ActiveSession | null> {
		if (!TOKEN_SHAPE.test(token)) return null;
		return this.sessions.findActive(hashToken(token), this.clock.now());
	}

	async end(session: ActiveSession): Promise<void> {
		await this.sessions.delete(session.userId, session.sessionId);
	}
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}
