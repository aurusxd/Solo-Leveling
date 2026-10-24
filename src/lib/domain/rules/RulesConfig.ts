// Every game number lives here (tech.md sections 9 and 9.1). Logic reads them from an injected
// RulesConfig, so tests can swap the rules and balancing needs no code changes.
import { z } from 'zod';
import { ArchetypeKey, StatKey } from '#lib/types/index.ts';

const ratio = z.number().min(0).max(1);
const positiveInt = z.number().int().min(1);
const statWeights = z.partialRecord(StatKey, z.number().min(0));

export const RulesConfigSchema = z.object({
	// xpForLevel(n) = round(base * n^exponent), n = current level
	levelCurve: z.object({ base: positiveInt, exponent: z.number().positive() }),
	startingGold: z.number().int().min(0),
	failPenalty: z.object({
		xpRatio: ratio,
		statDeltas: z.partialRecord(StatKey, z.number().int().max(0))
	}),
	// +discipline for completing on time (or a quest without a deadline)
	onTimeDisciplineBonus: z.number().int().min(0),
	exercises: z.object({
		pushup: z.object({
			xpPerRep: z.number().int().min(0),
			statPer: z.partialRecord(StatKey, z.object({ perReps: positiveInt, points: positiveInt })),
			maxRepsPerSec: z.number().positive()
		})
	}),
	cv: z.object({ minConfidence: ratio, dailyXpCap: z.number().int().min(0) }),
	// sources per stat, used to compute basis; no source means basis = no_data
	stats: z.partialRecord(StatKey, z.object({ sources: z.array(z.string()) })),
	calibration: z.object({ days: positiveInt }),
	signals: z.object({
		windowDays: positiveInt,
		minSamples: positiveInt,
		minTotalResolved: positiveInt,
		cacheMinutes: positiveInt,
		priorityWeight: z.object({ 1: z.number().min(0), 2: z.number().min(0), 3: z.number().min(0) })
	}),
	difficulty: z.object({
		sampleQuests: positiveInt,
		minSample: positiveInt,
		bandLow: ratio,
		bandHigh: ratio,
		cooldownDays: z.number().int().min(0),
		stepPct: z.number().min(0)
	}),
	plan: z.object({
		localHour: z.number().int().min(0).max(23),
		budgetShare: ratio,
		maxQuests: positiveInt
	}),
	boss: z.object({
		weeks: positiveInt,
		stretch: z.number().min(0),
		minTarget: positiveInt,
		cooldownDays: z.number().int().min(0),
		rewardXpPerPoint: z.number().int().min(0),
		rewardGoldPerPoint: z.number().int().min(0),
		rewardStatPoints: z.number().int().min(0)
	}),
	archetype: z.object({
		windowDays: positiveInt,
		minPoints: z.number().int().min(0),
		hysteresis: ratio,
		catalog: z.partialRecord(ArchetypeKey.exclude(['novice']), statWeights)
	}),
	// stat points per week offered by the questionnaire
	goalPresets: z.object({ light: positiveInt, medium: positiveInt, high: positiveInt })
});

export type RulesConfig = z.infer<typeof RulesConfigSchema>;

export const DEFAULT_RULES: RulesConfig = {
	levelCurve: { base: 100, exponent: 1.5 },
	startingGold: 0,
	failPenalty: { xpRatio: 0.5, statDeltas: { discipline: -1 } },
	onTimeDisciplineBonus: 1,
	exercises: {
		pushup: {
			xpPerRep: 2,
			statPer: { strength: { perReps: 10, points: 1 }, stamina: { perReps: 25, points: 1 } },
			maxRepsPerSec: 1.2
		}
	},
	cv: { minConfidence: 0.6, dailyXpCap: 300 },
	stats: {
		perception: { sources: [] }
	},
	calibration: { days: 7 },
	signals: {
		windowDays: 14,
		minSamples: 5,
		minTotalResolved: 10,
		cacheMinutes: 30,
		priorityWeight: { 1: 0.5, 2: 1, 3: 1.5 }
	},
	difficulty: {
		sampleQuests: 10,
		minSample: 5,
		bandLow: 0.7,
		bandHigh: 0.8,
		cooldownDays: 3,
		stepPct: 0.15
	},
	plan: { localHour: 6, budgetShare: 0.6, maxQuests: 5 },
	boss: {
		weeks: 4,
		stretch: 0.5,
		minTarget: 5,
		cooldownDays: 7,
		rewardXpPerPoint: 10,
		rewardGoldPerPoint: 3,
		rewardStatPoints: 3
	},
	archetype: {
		windowDays: 30,
		minPoints: 20,
		hysteresis: 0.1,
		catalog: {
			athlete: { strength: 1, stamina: 1, agility: 1 },
			scholar: { intelligence: 1, perception: 1 },
			builder: { discipline: 1, intelligence: 0.5 },
			guardian: { hp: 1, discipline: 0.5 }
		}
	},
	goalPresets: { light: 5, medium: 10, high: 20 }
};
