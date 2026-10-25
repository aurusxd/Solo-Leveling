import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ProgressionEngine, addStats, type LedgerEntry } from '../rules/ProgressionEngine.ts';
import { DEFAULT_RULES } from '../rules/RulesConfig.ts';
import { CharacterProjector } from './CharacterProjector.ts';

const engine = new ProgressionEngine(DEFAULT_RULES);
const projector = new CharacterProjector(engine);

// Ledgers that only award, so any order is a valid ledger.
const awardingLedger = fc.uniqueArray(
	fc.record({
		idempotencyKey: fc.uuid().map((id) => `quest-completed:${id}`),
		xpDelta: fc.integer({ min: 0, max: 5_000 }),
		goldDelta: fc.integer({ min: 0, max: 5_000 }),
		statDeltas: fc.dictionary(
			fc.constantFrom('strength', 'agility', 'discipline'),
			fc.integer({ min: -3, max: 10 })
		)
	}),
	{ selector: (e) => e.idempotencyKey, maxLength: 40 }
);

const sum = (entries: LedgerEntry[]) => ({
	xpTotal: entries.reduce((n, e) => n + e.xpDelta, 0),
	gold: entries.reduce((n, e) => n + e.goldDelta, 0),
	statPoints: entries.reduce((s, e) => addStats(s, e.statDeltas), {})
});

describe('CharacterProjector', () => {
	it('projects an empty ledger to a fresh level 1 character', () => {
		expect(projector.project([])).toEqual({ level: 1, xpTotal: 0, gold: 0, statPoints: {} });
	});

	it('balance equals the sum of events', () => {
		fc.assert(
			fc.property(awardingLedger, (ledger) => {
				const state = projector.project(ledger);
				expect(state).toMatchObject(sum(ledger));
				expect(state.level).toBe(engine.levels.levelFor(state.xpTotal));
			})
		);
	});

	it('a repeated event does not change the result', () => {
		fc.assert(
			fc.property(awardingLedger, fc.array(fc.nat()), (ledger, picks) => {
				const repeats = ledger.length === 0 ? [] : picks.map((i) => ledger[i % ledger.length]!);
				expect(projector.project([...ledger, ...repeats])).toEqual(projector.project(ledger));
			})
		);
	});

	it('event order does not change the result', () => {
		fc.assert(
			fc.property(
				awardingLedger.chain((ledger) =>
					fc.tuple(fc.constant(ledger), fc.shuffledSubarray(ledger, { minLength: ledger.length }))
				),
				([ledger, shuffled]) => {
					expect(projector.project(shuffled)).toEqual(projector.project(ledger));
				}
			)
		);
	});

	it('replaying the engine step by step matches the projection', () => {
		fc.assert(
			fc.property(awardingLedger, (ledger) => {
				let state = engine.initialState();
				for (const entry of ledger) state = engine.apply(state, entry);
				expect(projector.project(ledger)).toEqual(state);
			})
		);
	});
});
