import type { RulesConfig } from './RulesConfig.ts';

export type LevelProgress = {
	level: number;
	/** XP earned since the current level started. */
	xpIntoLevel: number;
	/** XP needed to go from the current level to the next one. */
	xpForNextLevel: number;
	/** Total XP at which the current level started; a penalty never takes xpTotal below it. */
	levelStartXp: number;
};

export class LevelCurve {
	constructor(private readonly curve: RulesConfig['levelCurve']) {}

	/** XP needed to go from level n to n + 1. */
	xpForLevel(n: number): number {
		if (!Number.isInteger(n) || n < 1)
			throw new RangeError(`level must be a positive integer: ${n}`);
		return Math.round(this.curve.base * n ** this.curve.exponent);
	}

	/** Level is the largest n whose thresholds below it add up to at most xpTotal. */
	progress(xpTotal: number): LevelProgress {
		if (!Number.isInteger(xpTotal) || xpTotal < 0) {
			throw new RangeError(`xpTotal must be a non-negative integer: ${xpTotal}`);
		}
		let level = 1;
		let levelStartXp = 0;
		let next = this.xpForLevel(level);
		while (levelStartXp + next <= xpTotal) {
			levelStartXp += next;
			level += 1;
			next = this.xpForLevel(level);
		}
		return { level, xpIntoLevel: xpTotal - levelStartXp, xpForNextLevel: next, levelStartXp };
	}

	levelFor(xpTotal: number): number {
		return this.progress(xpTotal).level;
	}
}
