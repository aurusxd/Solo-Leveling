import { describe, expect, it } from 'vitest';
import { FixedClock, SystemClock } from './clock.ts';

describe('FixedClock', () => {
	it('returns the pinned instant until moved', () => {
		const clock = new FixedClock('2026-10-24T12:00:00Z');
		expect(clock.now().toISOString()).toBe('2026-10-24T12:00:00.000Z');
		expect(clock.now().toISOString()).toBe('2026-10-24T12:00:00.000Z');
	});

	it('moves only through set and advance', () => {
		const clock = new FixedClock(new Date('2026-10-24T00:00:00Z'));
		clock.advance(90_000);
		expect(clock.now().toISOString()).toBe('2026-10-24T00:01:30.000Z');
		clock.set('2027-01-01T00:00:00Z');
		expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
	});

	it('hands out copies, so callers cannot shift its time', () => {
		const clock = new FixedClock('2026-10-24T12:00:00Z');
		clock.now().setUTCFullYear(1999);
		expect(clock.now().getUTCFullYear()).toBe(2026);
	});
});

describe('SystemClock', () => {
	it('reads the real time', () => {
		const before = Date.now();
		const now = new SystemClock().now().getTime();
		expect(now).toBeGreaterThanOrEqual(before);
		expect(now).toBeLessThanOrEqual(Date.now());
	});
});
