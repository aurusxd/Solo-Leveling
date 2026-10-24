import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Reward } from '#lib/types/index.ts';
import {
	ProgressionEngine,
	type CharacterState,
	type ResolvableQuest
} from './ProgressionEngine.ts';
import { DEFAULT_RULES } from './RulesConfig.ts';

const engine = new ProgressionEngine(DEFAULT_RULES);
const DEADLINE = new Date('2026-10-24T20:59:59Z');

const quest = (
	reward: Partial<Reward> = {},
	extra: Partial<ResolvableQuest> = {}
): ResolvableQuest => ({
	reward: { xp: 40, gold: 10, stats: { strength: 2 }, ...reward },
	penalty: null,
	deadlineAt: DEADLINE,
	...extra
});

const state = (xpTotal: number, gold = 0): CharacterState => ({
	level: engine.levels.levelFor(xpTotal),
	xpTotal,
	gold,
	statPoints: {}
});

describe('questCompleted', () => {
	it('awards the reward and the on-time discipline bonus', () => {
		const delta = engine.questCompleted(quest(), new Date('2026-10-24T10:00:00Z'));
		expect(delta).toEqual({
			xpDelta: 40,
			goldDelta: 10,
			statDeltas: { strength: 2, discipline: 1 }
		});
	});

	it('gives the bonus to quests without a deadline', () => {
		const delta = engine.questCompleted(quest({}, { deadlineAt: null }), DEADLINE);
		expect(delta.statDeltas.discipline).toBe(1);
	});

	it('adds the bonus to discipline the reward already grants', () => {
		const delta = engine.questCompleted(quest({ stats: { discipline: 2 } }), DEADLINE);
		expect(delta.statDeltas).toEqual({ discipline: 3 });
	});

	it('withholds the bonus when late', () => {
		const late = new Date(DEADLINE.getTime() + 1);
		expect(engine.questCompleted(quest(), late).statDeltas).toEqual({ strength: 2 });
	});
});

describe('questFailed', () => {
	it('takes xpRatio of the reward XP and one discipline, never gold', () => {
		const delta = engine.questFailed(state(250, 70), quest({ xp: 40 }));
		expect(delta).toEqual({ xpDelta: -20, goldDelta: 0, statDeltas: { discipline: -1 } });
	});

	it('stops at the start of the current level', () => {
		// level 2 starts at 100 XP
		expect(engine.questFailed(state(110), quest({ xp: 100 })).xpDelta).toBe(-10);
		expect(engine.questFailed(state(100), quest({ xp: 100 })).xpDelta).toBe(0);
		expect(engine.questFailed(state(0), quest({ xp: 100 })).xpDelta).toBe(0);
	});

	it("uses the quest's own penalty over the defaults", () => {
		const own = quest({ xp: 40 }, { penalty: { xpRatio: 1, statDeltas: { hp: -2 } } });
		expect(engine.questFailed(state(500), own)).toEqual({
			xpDelta: -40,
			goldDelta: 0,
			statDeltas: { hp: -2 }
		});
		const ratioOnly = quest({ xp: 40 }, { penalty: { xpRatio: 0.25 } });
		expect(engine.questFailed(state(500), ratioOnly)).toMatchObject({
			xpDelta: -10,
			statDeltas: { discipline: -1 }
		});
	});
});

describe('apply', () => {
	it('adds deltas and recomputes the level', () => {
		const next = engine.apply(state(90, 5), { xpDelta: 20, goldDelta: 3, statDeltas: { hp: 1 } });
		expect(next).toEqual({ level: 2, xpTotal: 110, gold: 8, statPoints: { hp: 1 } });
	});

	it('refuses to go below zero XP or Gold', () => {
		expect(() => engine.apply(state(5), { xpDelta: -6, goldDelta: 0, statDeltas: {} })).toThrow(
			RangeError
		);
		expect(() => engine.apply(state(5, 1), { xpDelta: 0, goldDelta: -2, statDeltas: {} })).toThrow(
			RangeError
		);
	});
});

const action = fc.record({
	completed: fc.boolean(),
	onTime: fc.boolean(),
	reward: fc.record({
		xp: fc.integer({ min: 0, max: 10_000 }),
		gold: fc.integer({ min: 0, max: 10_000 }),
		stats: fc.dictionary(
			fc.constantFrom('strength', 'hp', 'discipline'),
			fc.integer({ min: 0, max: 100 })
		)
	})
});

describe('properties over any quest history', () => {
	it('never lowers the level, and totals equal the sum of events', () => {
		fc.assert(
			fc.property(fc.array(action, { maxLength: 60 }), (actions) => {
				let s = engine.initialState();
				let xpSum = 0;
				let goldSum = 0;
				for (const a of actions) {
					const q = quest(a.reward);
					const at = a.onTime ? DEADLINE : new Date(DEADLINE.getTime() + 1000);
					const delta = a.completed ? engine.questCompleted(q, at) : engine.questFailed(s, q);
					const next = engine.apply(s, delta);
					expect(next.level).toBeGreaterThanOrEqual(s.level);
					xpSum += delta.xpDelta;
					goldSum += delta.goldDelta;
					s = next;
				}
				expect(s.xpTotal).toBe(xpSum);
				expect(s.gold).toBe(goldSum);
				expect(s.level).toBe(engine.levels.levelFor(s.xpTotal));
			})
		);
	});
});
