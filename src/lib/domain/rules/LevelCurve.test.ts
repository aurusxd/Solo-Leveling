import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LevelCurve } from './LevelCurve.ts';
import { DEFAULT_RULES } from './RulesConfig.ts';

const curve = new LevelCurve(DEFAULT_RULES.levelCurve);
const xp = fc.integer({ min: 0, max: 10_000_000 });

describe('LevelCurve', () => {
	it('follows round(base * n^exponent) with the default rules', () => {
		expect(curve.xpForLevel(1)).toBe(100);
		expect(curve.xpForLevel(2)).toBe(283);
		expect(curve.xpForLevel(3)).toBe(520);
	});

	it('starts at level 1 and levels up exactly at the summed thresholds', () => {
		expect(curve.progress(0)).toEqual({
			level: 1,
			xpIntoLevel: 0,
			xpForNextLevel: 100,
			levelStartXp: 0
		});
		expect(curve.levelFor(99)).toBe(1);
		expect(curve.progress(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNextLevel: 283 });
		expect(curve.levelFor(382)).toBe(2);
		expect(curve.levelFor(383)).toBe(3);
	});

	it('xpForLevel is strictly increasing', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 5_000 }), (n) => {
				expect(curve.xpForLevel(n + 1)).toBeGreaterThan(curve.xpForLevel(n));
			})
		);
	});

	it('xpIntoLevel stays below xpForNextLevel and adds up to xpTotal', () => {
		fc.assert(
			fc.property(xp, (total) => {
				const p = curve.progress(total);
				expect(p.xpIntoLevel).toBeGreaterThanOrEqual(0);
				expect(p.xpIntoLevel).toBeLessThan(p.xpForNextLevel);
				expect(p.levelStartXp + p.xpIntoLevel).toBe(total);
			})
		);
	});

	it('more XP never means a lower level', () => {
		fc.assert(
			fc.property(xp, xp, (a, b) => {
				const [lo, hi] = a <= b ? [a, b] : [b, a];
				expect(curve.levelFor(hi)).toBeGreaterThanOrEqual(curve.levelFor(lo));
			})
		);
	});

	it('rejects invalid input', () => {
		expect(() => curve.xpForLevel(0)).toThrow(RangeError);
		expect(() => curve.xpForLevel(1.5)).toThrow(RangeError);
		expect(() => curve.progress(-1)).toThrow(RangeError);
	});
});
