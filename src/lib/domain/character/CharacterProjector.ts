import type { CharacterState, LedgerEntry, ProgressionEngine } from '../rules/ProgressionEngine.ts';

/**
 * Folds the ledger into character state. The ledger is the source of truth and the characters
 * table is only a cache of this result, so a rebuild must always reproduce it.
 */
export class CharacterProjector {
	constructor(private readonly engine: ProgressionEngine) {}

	/** Entries in ledger order. A repeated idempotency key counts once, like the unique index. */
	project(entries: Iterable<LedgerEntry>): CharacterState {
		const seen = new Set<string>();
		let state = this.engine.initialState();
		for (const entry of entries) {
			if (seen.has(entry.idempotencyKey)) continue;
			seen.add(entry.idempotencyKey);
			state = this.engine.apply(state, entry);
		}
		return state;
	}
}
