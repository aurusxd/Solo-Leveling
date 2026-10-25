import { createHmac } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '#lib/domain/clock.ts';
import { DomainError } from '#lib/domain/errors.ts';
import { TelegramInitDataVerifier } from './TelegramInitDataVerifier.ts';

const BOT_TOKEN = '123456:TEST-token-not-real';
const NOW_SEC = Date.UTC(2026, 9, 25, 12, 0, 0) / 1000;
const clock = new FixedClock(new Date(NOW_SEC * 1000));
const verifier = new TelegramInitDataVerifier(BOT_TOKEN, clock);

const USER = { id: 424242, first_name: 'Sung', username: 'jinwoo', language_code: 'ru' };

/** Signs fields the way Telegram does, independently of the code under test. */
function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
	const secret = createHmac('sha256', 'WebAppData').update(token).digest();
	const check = Object.keys(fields)
		.sort()
		.map((k) => `${k}=${fields[k]}`)
		.join('\n');
	const hash = createHmac('sha256', secret).update(check).digest('hex');
	return new URLSearchParams({ ...fields, hash }).toString();
}

const fields = (overrides: Record<string, string> = {}) => ({
	auth_date: String(NOW_SEC - 60),
	query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
	user: JSON.stringify(USER),
	...overrides
});

const rejects = (initData: string) => {
	let error: unknown;
	try {
		verifier.verify(initData);
	} catch (e) {
		error = e;
	}
	expect(error).toBeInstanceOf(DomainError);
	expect((error as DomainError).code).toBe('UNAUTHENTICATED');
};

describe('TelegramInitDataVerifier', () => {
	it('accepts correctly signed, fresh data and returns the user', () => {
		expect(verifier.verify(sign(fields()))).toEqual({
			telegramId: 424242n,
			firstName: 'Sung',
			username: 'jinwoo',
			languageCode: 'ru'
		});
	});

	it('accepts data exactly one hour old', () => {
		expect(() =>
			verifier.verify(sign(fields({ auth_date: String(NOW_SEC - 3600) })))
		).not.toThrow();
	});

	it('rejects data older than one hour', () => {
		rejects(sign(fields({ auth_date: String(NOW_SEC - 3601) })));
	});

	it('rejects data signed with another bot token', () => {
		rejects(sign(fields(), '999:other'));
	});

	it('rejects a tampered field', () => {
		const signed = new URLSearchParams(sign(fields()));
		signed.set('user', JSON.stringify({ ...USER, id: 1 }));
		rejects(signed.toString());
	});

	it('rejects a missing, short or non-hex hash', () => {
		const signed = new URLSearchParams(sign(fields()));
		const without = new URLSearchParams(signed);
		without.delete('hash');
		rejects(without.toString());
		signed.set('hash', 'abc');
		rejects(signed.toString());
		signed.set('hash', 'z'.repeat(64));
		rejects(signed.toString());
	});

	it('rejects signed data without a valid user or auth_date', () => {
		rejects(sign(fields({ user: 'not json' })));
		rejects(sign(fields({ user: JSON.stringify({ id: 1 }) })));
		rejects(sign({ user: JSON.stringify(USER) }));
		rejects(sign(fields({ auth_date: 'yesterday' })));
	});

	it('rejects garbage', () => {
		rejects('');
		rejects('hash=');
		rejects('%%%');
	});

	it('changing any signed value breaks the signature', () => {
		const signed = sign(fields());
		const keys = ['auth_date', 'query_id', 'user'] as const;
		fc.assert(
			fc.property(fc.constantFrom(...keys), fc.string({ minLength: 1 }), (key, suffix) => {
				const params = new URLSearchParams(signed);
				params.set(key, params.get(key)! + suffix);
				rejects(params.toString());
			})
		);
	});
});
