import type { Clock } from '#lib/domain/clock.ts';

// Past this many tracked keys, expired windows are swept so memory stays bounded.
const SWEEP_THRESHOLD = 10_000;

/** In-memory fixed window per key; enough for a single instance (tech.md section 14). */
export class FixedWindowRateLimiter {
	readonly #windows = new Map<string, { start: number; count: number }>();

	constructor(
		private readonly clock: Clock,
		private readonly options: { limit: number; windowMs: number }
	) {}

	/** Counts one request for `key`; false once the key is over its limit for this window. */
	hit(key: string): boolean {
		const now = this.clock.now().getTime();
		const current = this.#windows.get(key);
		if (!current || now - current.start >= this.options.windowMs) {
			if (this.#windows.size >= SWEEP_THRESHOLD) this.#sweep(now);
			this.#windows.set(key, { start: now, count: 1 });
			return true;
		}
		current.count += 1;
		return current.count <= this.options.limit;
	}

	#sweep(now: number): void {
		for (const [key, window] of this.#windows) {
			if (now - window.start >= this.options.windowMs) this.#windows.delete(key);
		}
	}
}
