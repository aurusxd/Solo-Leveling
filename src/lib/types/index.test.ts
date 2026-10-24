import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	CharacterView,
	CreateQuestInput,
	ExerciseSessionInput,
	OnboardingAnswers,
	QuestCriteria,
	Reward
} from './index.ts';

describe('Reward', () => {
	it('accepts any whole amount within limits and defaults stats to {}', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 10_000 }),
				fc.integer({ min: 0, max: 10_000 }),
				(xp, gold) => {
					expect(Reward.parse({ xp, gold })).toEqual({ xp, gold, stats: {} });
				}
			)
		);
	});

	it('rejects fractional, negative and oversized amounts', () => {
		expect(Reward.safeParse({ xp: 1.5, gold: 0 }).success).toBe(false);
		expect(Reward.safeParse({ xp: -1, gold: 0 }).success).toBe(false);
		expect(Reward.safeParse({ xp: 0, gold: 10_001 }).success).toBe(false);
		expect(Reward.safeParse({ xp: 0, gold: 0, stats: { charisma: 1 } }).success).toBe(false);
	});
});

describe('QuestCriteria', () => {
	it('distinguishes the kinds', () => {
		expect(QuestCriteria.parse({ kind: 'manual' })).toEqual({ kind: 'manual' });
		expect(QuestCriteria.parse({ kind: 'reps', exercise: 'pushup', target: 10 }).kind).toBe('reps');
		expect(QuestCriteria.safeParse({ kind: 'reps', exercise: 'squat', target: 10 }).success).toBe(
			false
		);
		expect(QuestCriteria.safeParse({ kind: 'stat_points', stat: 'hp', target: 0 }).success).toBe(
			false
		);
	});
});

describe('CreateQuestInput', () => {
	it('trims the title and fills defaults', () => {
		const parsed = CreateQuestInput.parse({
			title: '  Read  ',
			type: 'learning',
			criteria: { kind: 'manual' },
			reward: { xp: 10, gold: 1 }
		});
		expect(parsed).toMatchObject({
			title: 'Read',
			description: '',
			penalty: null,
			deadlineAt: null,
			reward: { stats: {} }
		});
	});

	it('rejects a blank title', () => {
		const input = {
			title: '   ',
			type: 'other',
			criteria: { kind: 'manual' },
			reward: { xp: 0, gold: 0 }
		};
		expect(CreateQuestInput.safeParse(input).success).toBe(false);
	});
});

describe('OnboardingAnswers', () => {
	const goal = { stat: 'strength', title: 'Lift', weeklyTargetPoints: 10 };
	const base = { dailyMinutes: 60, preferredWindow: 'evening', timezone: 'UTC' };

	it('takes 1 to 3 goals', () => {
		expect(OnboardingAnswers.safeParse({ ...base, goals: [] }).success).toBe(false);
		expect(OnboardingAnswers.parse({ ...base, goals: [goal] }).goals[0]?.priority).toBe(2);
		expect(OnboardingAnswers.safeParse({ ...base, goals: [goal, goal, goal, goal] }).success).toBe(
			false
		);
	});
});

describe('ExerciseSessionInput', () => {
	it('requires a uuid session id and bounded numbers', () => {
		const ok = {
			clientSessionId: '0b5a3f4e-8c1d-4c6e-9b1a-2f3d4e5f6a7b',
			exercise: 'pushup',
			reps: 12,
			durationSec: 30,
			avgConfidence: 0.8
		};
		expect(ExerciseSessionInput.safeParse(ok).success).toBe(true);
		expect(ExerciseSessionInput.safeParse({ ...ok, clientSessionId: 'abc' }).success).toBe(false);
		expect(ExerciseSessionInput.safeParse({ ...ok, avgConfidence: 1.1 }).success).toBe(false);
		expect(ExerciseSessionInput.safeParse({ ...ok, durationSec: 0 }).success).toBe(false);
	});
});

describe('CharacterView', () => {
	it('never allows a level below 1 or a zero-size level', () => {
		const view = {
			level: 1,
			xpTotal: 0,
			xpIntoLevel: 0,
			xpForNextLevel: 100,
			gold: 0,
			stats: [{ key: 'perception', value: 0, basis: 'no_data' }],
			activeQuests: [],
			activity: { questsCompleted7d: 0, repsTotal7d: 0, streakDays: 0 },
			phase: 'questionnaire',
			archetype: 'novice',
			weakSpot: null
		};
		expect(CharacterView.safeParse(view).success).toBe(true);
		expect(CharacterView.safeParse({ ...view, level: 0 }).success).toBe(false);
		expect(CharacterView.safeParse({ ...view, xpForNextLevel: 0 }).success).toBe(false);
	});
});
