import { DomainError } from '#lib/domain/errors.ts';
import { PlanKey, type FeatureKey } from '#lib/types/index.ts';
import type { PlanFeatures } from '../config.ts';

/** Paid-feature checks (tech.md 9.2). Enforced on the server; the UI only hides what is locked. */
export interface Entitlements {
	has(userId: string, feature: FeatureKey): Promise<boolean>;
	/** Throws ENTITLEMENT_REQUIRED when the user's plan lacks the feature. */
	require(userId: string, feature: FeatureKey): Promise<void>;
}

export interface UserPlanReader {
	getPlan(userId: string): Promise<string | null>;
}

export class PlanEntitlements implements Entitlements {
	constructor(
		private readonly users: UserPlanReader,
		private readonly planFeatures: PlanFeatures,
		/** ENTITLEMENTS_ALL, dev only; config refuses it in production. */
		private readonly grantAll: boolean
	) {}

	async has(userId: string, feature: FeatureKey): Promise<boolean> {
		if (this.grantAll) return true;
		const raw = await this.users.getPlan(userId);
		if (raw === null) return false;
		// An unknown plan value grants nothing rather than failing the request.
		const plan = PlanKey.catch('free').parse(raw);
		return this.planFeatures[plan].includes(feature);
	}

	async require(userId: string, feature: FeatureKey): Promise<void> {
		if (!(await this.has(userId, feature))) {
			throw new DomainError('ENTITLEMENT_REQUIRED', `feature "${feature}" is not in your plan`);
		}
	}
}
