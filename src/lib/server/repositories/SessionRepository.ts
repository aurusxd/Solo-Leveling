import { and, eq, gt } from 'drizzle-orm';
import { sessions } from '../db/schema.ts';
import { BaseRepository } from './BaseRepository.ts';

export type ActiveSession = { sessionId: string; userId: string };

export class SessionRepository extends BaseRepository {
	async create(userId: string, tokenHash: string, expiresAt: Date): Promise<string> {
		const [row] = await this.db
			.insert(sessions)
			.values({ userId, tokenHash, expiresAt })
			.returning({ id: sessions.id });
		if (!row) throw new Error('session insert returned no row');
		return row.id;
	}

	/** Resolves who a cookie belongs to, so it is keyed by the token hash instead of userId. */
	async findActive(tokenHash: string, now: Date): Promise<ActiveSession | null> {
		const [row] = await this.db
			.select({ sessionId: sessions.id, userId: sessions.userId })
			.from(sessions)
			.where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
			.limit(1);
		return row ?? null;
	}

	async delete(userId: string, sessionId: string): Promise<void> {
		await this.db
			.delete(sessions)
			.where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)));
	}
}
