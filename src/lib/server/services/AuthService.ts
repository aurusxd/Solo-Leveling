import { DomainError } from '#lib/domain/errors.ts';
import type { TelegramInitDataVerifier } from '../auth/TelegramInitDataVerifier.ts';
import type { SessionManager, StartedSession } from '../auth/SessionManager.ts';
import type { ActiveSession } from '../repositories/SessionRepository.ts';
import type { TelegramProfile, UserRepository } from '../repositories/UserRepository.ts';

export class AuthService {
	constructor(
		private readonly users: UserRepository,
		private readonly sessions: SessionManager,
		/** Null without BOT_TOKEN (dev): Telegram sign-in is then impossible, only the bypass works. */
		private readonly verifier: TelegramInitDataVerifier | null,
		private readonly devUser: TelegramProfile
	) {}

	/** Signs in from Telegram initData, creating the user on first visit. */
	async signInWithTelegram(initData: string): Promise<StartedSession> {
		if (!this.verifier)
			throw new DomainError('UNAUTHENTICATED', 'Telegram sign-in is not configured');
		const profile = this.verifier.verify(initData);
		const userId = await this.users.ensureFromTelegram(profile);
		return this.sessions.start(userId);
	}

	/** DEV_AUTH_BYPASS only; the config refuses that flag in production. */
	async signInDevUser(): Promise<StartedSession & { userId: string }> {
		const userId = await this.users.ensureFromTelegram(this.devUser);
		return { userId, ...(await this.sessions.start(userId)) };
	}

	resolve(token: string): Promise<ActiveSession | null> {
		return this.sessions.resolve(token);
	}

	signOut(session: ActiveSession): Promise<void> {
		return this.sessions.end(session);
	}
}
