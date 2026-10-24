import { eq } from 'drizzle-orm';
import { users } from '../db/schema.ts';
import { BaseRepository } from './BaseRepository.ts';

export class UserRepository extends BaseRepository {
	/** Raw `users.plan`, or null when the user does not exist. */
	async getPlan(userId: string): Promise<string | null> {
		const [row] = await this.db
			.select({ plan: users.plan })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		return row?.plan ?? null;
	}
}
