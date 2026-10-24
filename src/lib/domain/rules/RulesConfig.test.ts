import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, RulesConfigSchema } from './RulesConfig.ts';

describe('RulesConfig', () => {
	it('accepts the defaults from the spec', () => {
		expect(RulesConfigSchema.parse(DEFAULT_RULES)).toEqual(DEFAULT_RULES);
	});

	it('rejects rules that would break invariants', () => {
		const with_ = (patch: object) => RulesConfigSchema.safeParse({ ...DEFAULT_RULES, ...patch });
		expect(with_({ levelCurve: { base: 0, exponent: 1.5 } }).success).toBe(false);
		expect(with_({ levelCurve: { base: 100, exponent: 0 } }).success).toBe(false);
		expect(with_({ failPenalty: { xpRatio: 1.5, statDeltas: {} } }).success).toBe(false);
		// a fail penalty must never award stats
		expect(with_({ failPenalty: { xpRatio: 0.5, statDeltas: { discipline: 1 } } }).success).toBe(
			false
		);
		expect(with_({ startingGold: -1 }).success).toBe(false);
	});
});
