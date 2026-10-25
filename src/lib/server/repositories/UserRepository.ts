import { eq, sql } from 'drizzle-orm';
import { characters, onboardingProfiles, userSettings, users } from '../db/schema.ts';
import { BaseRepository } from './BaseRepository.ts';

export type TelegramProfile = {
	telegramId: bigint;
	firstName: string;
	username: string | null;
	languageCode: string | null;
};

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

	/**
	 * Identity lookup for sign-in, so it is keyed by Telegram id instead of userId. Creates the user
	 * on first sign-in with a level 1 character, default settings and the questionnaire phase;
	 * later sign-ins refresh the Telegram names. Safe to run concurrently for the same id.
	 */
	async ensureFromTelegram(profile: TelegramProfile): Promise<string> {
		return this.db.transaction(async (tx) => {
			const [user] = await tx
				.insert(users)
				.values(profile)
				.onConflictDoUpdate({
					target: users.telegramId,
					set: {
						firstName: sql`excluded.first_name`,
						username: sql`excluded.username`,
						languageCode: sql`excluded.language_code`
					}
				})
				.returning({ id: users.id });
			if (!user) throw new Error('user upsert returned no row');

			await tx.insert(characters).values({ userId: user.id }).onConflictDoNothing();
			await tx.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
			await tx.insert(onboardingProfiles).values({ userId: user.id }).onConflictDoNothing();
			return user.id;
		});
	}
}
