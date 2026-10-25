import { describe, expect, it } from 'vitest';
import { FixedClock } from '#lib/domain/clock.ts';
import { SECURITY } from './config.ts';
import { FixedWindowRateLimiter } from './rateLimit.ts';

describe('FixedWindowRateLimiter', () => {
	const make = () => {
		const clock = new FixedClock('2026-10-25T12:00:00Z');
		return { clock, limiter: new FixedWindowRateLimiter(clock, SECURITY.authRateLimit) };
	};

	it('allows 10 sign-in requests a minute per key, then refuses', () => {
		const { limiter } = make();
		const results = Array.from({ length: 11 }, () => limiter.hit('1.2.3.4'));
		expect(results.slice(0, 10).every(Boolean)).toBe(true);
		expect(results[10]).toBe(false);
	});

	it('starts a fresh window after a minute', () => {
		const { clock, limiter } = make();
		for (let i = 0; i < 11; i++) limiter.hit('k');
		clock.advance(59_999);
		expect(limiter.hit('k')).toBe(false);
		clock.advance(1);
		expect(limiter.hit('k')).toBe(true);
	});

	it('counts keys independently', () => {
		const { limiter } = make();
		for (let i = 0; i < 11; i++) limiter.hit('a');
		expect(limiter.hit('b')).toBe(true);
	});
});
