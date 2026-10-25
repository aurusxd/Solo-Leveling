import { describe, expect, it } from 'vitest';
import { FixedClock } from '#lib/domain/clock.ts';
import { loadConfig } from './config.ts';
import { buildContainer } from './container.ts';

// The pool is lazy, so building the graph never connects to this address.
const config = (extra: Record<string, string> = {}) =>
	loadConfig({ DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none', ...extra });

describe('buildContainer', () => {
	it('wires the clock override through', async () => {
		const clock = new FixedClock('2026-10-24T12:00:00Z');
		const c = buildContainer(config(), { clock });
		expect(c.clock.now().toISOString()).toBe('2026-10-24T12:00:00.000Z');
		await c.close();
	});

	it('honours ENTITLEMENTS_ALL without touching the database', async () => {
		const c = buildContainer(config({ ENTITLEMENTS_ALL: 'true' }));
		expect(await c.entitlements.has('00000000-0000-4000-8000-000000000000', 'signals')).toBe(true);
		await c.close();
	});
});
