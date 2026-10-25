import type { Penalty, Reward } from '#lib/types/index.ts';
import { LevelCurve } from './LevelCurve.ts';
import type { RulesConfig } from './RulesConfig.ts';

export type StatDeltas = Reward['stats'];

/** What one ledger event changes. */
export type ProgressDelta = {
	xpDelta: number;
	goldDelta: number;
	statDeltas: StatDeltas;
};

export type LedgerEntry = ProgressDelta & { idempotencyKey: string };

/** Character state folded from the ledger. Stat points are raw sums; views clamp them at 0. */
export type CharacterState = {
	level: number;
	xpTotal: number;
	gold: number;
	statPoints: StatDeltas;
};

export type ResolvableQuest = {
	reward: Reward;
	penalty: Penalty | null;
	deadlineAt: Date | null;
};

/** Pure progression rules (tech.md section 9): what an event awards and how it changes state. */
export class ProgressionEngine {
	readonly levels: LevelCurve;

	constructor(private readonly rules: RulesConfig) {
		this.levels = new LevelCurve(rules.levelCurve);
	}

	initialState(): CharacterState {
		return { level: 1, xpTotal: 0, gold: this.rules.startingGold, statPoints: {} };
	}

	/** Reward plus the discipline bonus when completed on time or without a deadline. */
	questCompleted(quest: ResolvableQuest, completedAt: Date): ProgressDelta {
		const onTime = quest.deadlineAt === null || completedAt.getTime() <= quest.deadlineAt.getTime();
		const bonus = onTime ? { discipline: this.rules.onTimeDisciplineBonus } : {};
		return {
			xpDelta: quest.reward.xp,
			goldDelta: quest.reward.gold,
			statDeltas: addStats(quest.reward.stats, bonus)
		};
	}

	/**
	 * Loses a share of the quest's XP, never below the start of the current level, so a failure
	 * cannot lower the level. Gold is never taken. The quest's own penalty overrides the defaults.
	 */
	questFailed(state: CharacterState, quest: ResolvableQuest): ProgressDelta {
		const xpRatio = quest.penalty?.xpRatio ?? this.rules.failPenalty.xpRatio;
		const loss = Math.round(quest.reward.xp * xpRatio);
		const floor = this.levels.progress(state.xpTotal).levelStartXp;
		return {
			xpDelta: 0 - Math.min(loss, state.xpTotal - floor),
			goldDelta: 0,
			statDeltas: { ...(quest.penalty?.statDeltas ?? this.rules.failPenalty.statDeltas) }
		};
	}

	apply(state: CharacterState, delta: ProgressDelta): CharacterState {
		const xpTotal = state.xpTotal + delta.xpDelta;
		const gold = state.gold + delta.goldDelta;
		if (xpTotal < 0) throw new RangeError('ledger would make xpTotal negative');
		if (gold < 0) throw new RangeError('ledger would make gold negative');
		return {
			level: this.levels.levelFor(xpTotal),
			xpTotal,
			gold,
			statPoints: addStats(state.statPoints, delta.statDeltas)
		};
	}
}

/** Sums two stat maps and drops zero entries, so equal totals have one representation. */
export function addStats(a: StatDeltas, b: StatDeltas): StatDeltas {
	const out: StatDeltas = { ...a };
	for (const [key, value] of Object.entries(b) as [keyof StatDeltas, number][]) {
		const sum = (out[key] ?? 0) + value;
		if (sum === 0) delete out[key];
		else out[key] = sum;
	}
	return out;
}
