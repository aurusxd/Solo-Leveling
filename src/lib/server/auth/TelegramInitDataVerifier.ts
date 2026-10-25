import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Clock } from '#lib/domain/clock.ts';
import { DomainError } from '#lib/domain/errors.ts';

// The `user` field of Telegram WebApp initData. External format, so it is parsed defensively.
const TelegramUser = z.object({
	id: z.number().int().positive(),
	first_name: z.string().min(1),
	last_name: z.string().optional(),
	username: z.string().optional(),
	language_code: z.string().optional()
});

export type VerifiedTelegramUser = {
	telegramId: bigint;
	firstName: string;
	username: string | null;
	languageCode: string | null;
};

const ONE_HOUR_SEC = 60 * 60;

/**
 * Checks Telegram WebApp initData (tech.md section 14): HMAC-SHA256 over the sorted data-check
 * string with key HMAC-SHA256("WebAppData", BOT_TOKEN), constant-time comparison, auth_date at
 * most one hour old. Any failure is UNAUTHENTICATED, without saying which check failed.
 */
export class TelegramInitDataVerifier {
	readonly #secretKey: Buffer;

	constructor(
		botToken: string,
		private readonly clock: Clock,
		private readonly maxAgeSec: number = ONE_HOUR_SEC
	) {
		this.#secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
	}

	verify(initData: string): VerifiedTelegramUser {
		const params = new URLSearchParams(initData);
		const hash = params.get('hash');
		if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw unauthenticated();

		const dataCheckString = [...params.entries()]
			.filter(([key]) => key !== 'hash')
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, value]) => `${key}=${value}`)
			.join('\n');
		const expected = createHmac('sha256', this.#secretKey).update(dataCheckString).digest();
		if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw unauthenticated();

		const authDate = Number(params.get('auth_date'));
		const ageSec = this.clock.now().getTime() / 1000 - authDate;
		if (!Number.isInteger(authDate) || ageSec > this.maxAgeSec) throw unauthenticated();

		const user = TelegramUser.safeParse(parseJson(params.get('user')));
		if (!user.success) throw unauthenticated();
		return {
			telegramId: BigInt(user.data.id),
			firstName: user.data.first_name,
			username: user.data.username ?? null,
			languageCode: user.data.language_code ?? null
		};
	}
}

function parseJson(value: string | null): unknown {
	if (value === null) return undefined;
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

const unauthenticated = () => new DomainError('UNAUTHENTICATED', 'invalid Telegram init data');
