import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DomainError } from '#lib/domain/errors.ts';
import { FeatureKey } from '#lib/types/index.ts';
import { PLAN_FEATURES } from '../config.ts';
import { HTTP_STATUS } from '../http.ts';
import { PlanEntitlements, type UserPlanReader } from './Entitlements.ts';

const FREE = '11111111-1111-4111-8111-111111111111';
const PRO = '22222222-2222-4222-8222-222222222222';
const ODD = '33333333-3333-4333-8333-333333333333';
const MISSING = '44444444-4444-4444-8444-444444444444';

// A fake that validates its input like the real repository contract expects.
class FakePlans implements UserPlanReader {
	readonly calls: string[] = [];
	constructor(private readonly plans: Record<string, string>) {}
	async getPlan(userId: string) {
		this.calls.push(z.uuid().parse(userId));
		return this.plans[userId] ?? null;
	}
}

const plans = () => new FakePlans({ [FREE]: 'free', [PRO]: 'pro', [ODD]: 'platinum' });

describe('PlanEntitlements', () => {
	it.each(FeatureKey.options)('free lacks %s, pro has it', async (feature) => {
		const entitlements = new PlanEntitlements(plans(), PLAN_FEATURES, false);
		expect(await entitlements.has(FREE, feature)).toBe(false);
		expect(await entitlements.has(PRO, feature)).toBe(true);
	});

	it('grants nothing for an unknown plan value or a missing user', async () => {
		const entitlements = new PlanEntitlements(plans(), PLAN_FEATURES, false);
		expect(await entitlements.has(ODD, 'signals')).toBe(false);
		expect(await entitlements.has(MISSING, 'signals')).toBe(false);
	});

	it('grants everything with ENTITLEMENTS_ALL without reading the plan', async () => {
		const reader = plans();
		const entitlements = new PlanEntitlements(reader, PLAN_FEATURES, true);
		expect(await entitlements.has(FREE, 'camera')).toBe(true);
		expect(reader.calls).toEqual([]);
	});

	it('require throws ENTITLEMENT_REQUIRED, which maps to 403', async () => {
		const entitlements = new PlanEntitlements(plans(), PLAN_FEATURES, false);
		await expect(entitlements.require(PRO, 'auto_boss')).resolves.toBeUndefined();

		const error = await entitlements.require(FREE, 'auto_boss').catch((e: unknown) => e);
		expect(error).toBeInstanceOf(DomainError);
		expect((error as DomainError).code).toBe('ENTITLEMENT_REQUIRED');
		expect(HTTP_STATUS[(error as DomainError).code]).toBe(403);
	});
});
