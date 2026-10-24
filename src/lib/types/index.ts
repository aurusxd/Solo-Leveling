// Contracts from tech.md sections 7 and 9.2. Change tech.md first; types are inferred, never
// written by hand.
import { z } from 'zod';

export const StatKey = z.enum([
	'strength',
	'hp',
	'agility',
	'intelligence',
	'stamina',
	'discipline',
	'perception'
]);
export type StatKey = z.infer<typeof StatKey>;

export const ArchetypeKey = z.enum(['novice', 'athlete', 'scholar', 'builder', 'guardian']);
export type ArchetypeKey = z.infer<typeof ArchetypeKey>;
export const Phase = z.enum(['questionnaire', 'calibration', 'active']);
export type Phase = z.infer<typeof Phase>;
export const TimeWindow = z.enum(['morning', 'day', 'evening', 'night']);
export type TimeWindow = z.infer<typeof TimeWindow>;

// Extended append-only.
export const ExerciseKey = z.enum(['pushup']);
export type ExerciseKey = z.infer<typeof ExerciseKey>;

export const Verification = z.enum(['measured', 'self_reported', 'system']);
export type Verification = z.infer<typeof Verification>;
export const EventSource = z.enum(['manual', 'cv', 'system', 'ai']);
export type EventSource = z.infer<typeof EventSource>;

export const Reward = z.object({
	xp: z.number().int().min(0).max(10_000),
	gold: z.number().int().min(0).max(10_000),
	stats: z.partialRecord(StatKey, z.number().int().min(0).max(100)).default({})
});
export type Reward = z.infer<typeof Reward>;

export const Penalty = z.object({
	xpRatio: z.number().min(0).max(1).optional(),
	statDeltas: z.partialRecord(StatKey, z.number().int().min(-100).max(0)).optional()
});
export type Penalty = z.infer<typeof Penalty>;

export const QuestCriteria = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('manual') }),
	z.object({
		kind: z.literal('reps'),
		exercise: ExerciseKey,
		target: z.number().int().min(1).max(1000)
	}),
	// Boss: gain N points of a stat over a period (progress is counted from the ledger).
	z.object({
		kind: z.literal('stat_points'),
		stat: StatKey,
		target: z.number().int().min(1).max(10_000)
	})
]);
export type QuestCriteria = z.infer<typeof QuestCriteria>;

export const QuestType = z.enum(['exercise', 'learning', 'project', 'habit', 'other', 'boss']);
export type QuestType = z.infer<typeof QuestType>;
export const QuestStatus = z.enum(['active', 'completed', 'failed', 'proposed', 'dismissed']);
export type QuestStatus = z.infer<typeof QuestStatus>;

export const CreateQuestInput = z.object({
	title: z.string().trim().min(1).max(120),
	description: z.string().trim().max(1000).default(''),
	type: QuestType,
	criteria: QuestCriteria,
	reward: Reward,
	penalty: Penalty.nullable().default(null),
	deadlineAt: z.iso.datetime().nullable().default(null)
});
export type CreateQuestInput = z.infer<typeof CreateQuestInput>;

export const QuestView = z.object({
	id: z.uuid(),
	title: z.string(),
	description: z.string(),
	type: QuestType,
	status: QuestStatus,
	criteria: QuestCriteria,
	reward: Reward,
	penalty: Penalty.nullable(),
	deadlineAt: z.iso.datetime().nullable(),
	resolvedAt: z.iso.datetime().nullable(),
	difficulty: z.number().int().min(1).max(10),
	startedAt: z.iso.datetime().nullable(),
	progress: z.object({ current: z.number().int(), target: z.number().int() }).nullable()
});
export type QuestView = z.infer<typeof QuestView>;

// basis: how far the stat value can be trusted
export const StatBasis = z.enum(['measured', 'estimated', 'mixed', 'no_data']);
export type StatBasis = z.infer<typeof StatBasis>;
export const StatView = z.object({
	key: StatKey,
	value: z.number().int().min(0),
	basis: StatBasis
});
export type StatView = z.infer<typeof StatView>;

export const CharacterView = z.object({
	level: z.number().int().min(1),
	xpTotal: z.number().int().min(0),
	xpIntoLevel: z.number().int().min(0),
	xpForNextLevel: z.number().int().min(1),
	gold: z.number().int().min(0),
	stats: z.array(StatView),
	activeQuests: z.array(QuestView),
	activity: z.object({
		questsCompleted7d: z.number().int(),
		repsTotal7d: z.number().int(),
		streakDays: z.number().int()
	}),
	phase: Phase,
	archetype: ArchetypeKey,
	// null without calibration, without data or without the `signals` feature
	weakSpot: StatKey.nullable()
});
export type CharacterView = z.infer<typeof CharacterView>;

export const ExerciseSessionInput = z.object({
	clientSessionId: z.uuid(),
	exercise: ExerciseKey,
	reps: z.number().int().min(0).max(1000),
	durationSec: z.number().int().min(1).max(3600),
	avgConfidence: z.number().min(0).max(1)
});
export type ExerciseSessionInput = z.infer<typeof ExerciseSessionInput>;

export const CreateShopItemInput = z.object({
	title: z.string().trim().min(1).max(80),
	description: z.string().trim().max(500).default(''),
	price: z.number().int().min(1).max(1_000_000)
});
export type CreateShopItemInput = z.infer<typeof CreateShopItemInput>;
export const PurchaseInput = z.object({ itemId: z.uuid(), clientRequestId: z.uuid() });
export type PurchaseInput = z.infer<typeof PurchaseInput>;

export const SettingsView = z.object({
	timezone: z.string(),
	locale: z.enum(['ru', 'en']),
	notificationsEnabled: z.boolean(),
	cameraConsent: z.boolean()
});
export type SettingsView = z.infer<typeof SettingsView>;
export const UpdateSettingsInput = SettingsView.partial();
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;

export const GoalInput = z.object({
	stat: StatKey,
	title: z.string().trim().min(1).max(80),
	// stat points per week
	weeklyTargetPoints: z.number().int().min(1).max(200),
	priority: z.number().int().min(1).max(3).default(2)
});
export type GoalInput = z.infer<typeof GoalInput>;
export const GoalView = GoalInput.extend({ id: z.uuid() });
export type GoalView = z.infer<typeof GoalView>;

export const OnboardingAnswers = z.object({
	goals: z.array(GoalInput).min(1).max(3),
	// minutes per day the user is ready to spend
	dailyMinutes: z.number().int().min(15).max(480),
	preferredWindow: TimeWindow,
	// IANA
	timezone: z.string()
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswers>;

export const StatSignal = z.object({
	stat: StatKey,
	// resolved quests of the area within the window
	sampleSize: z.number().int().min(0),
	completionRate: z.number().min(0).max(1).nullable(),
	points7d: z.number().int(),
	pointsPrev7d: z.number().int(),
	// points7d - pointsPrev7d
	trend: z.number().int(),
	activeDays: z.number().int().min(0),
	streakDays: z.number().int().min(0),
	bestWindow: TimeWindow.nullable(),
	// null when the area has no goal
	goalGap: z.number().min(0).max(1).nullable(),
	confidence: z.enum(['low', 'ok'])
});
export type StatSignal = z.infer<typeof StatSignal>;
export const SignalReport = z.object({
	ready: z.boolean(),
	computedAt: z.iso.datetime(),
	windowDays: z.number().int(),
	stats: z.array(StatSignal),
	weakSpot: StatKey.nullable()
});
export type SignalReport = z.infer<typeof SignalReport>;

export const ErrorBody = z.object({ code: z.string(), message: z.string() });
export type ErrorBody = z.infer<typeof ErrorBody>;

// DomainError codes; their HTTP statuses are mapped in one module (src/lib/server/http.ts).
export const DomainErrorCode = z.enum([
	'VALIDATION',
	'UNAUTHENTICATED',
	'FORBIDDEN',
	'ENTITLEMENT_REQUIRED',
	'NOT_FOUND',
	'INVALID_TRANSITION',
	'INSUFFICIENT_FUNDS',
	'CRITERIA_MISMATCH',
	'ALREADY_ONBOARDED',
	'CV_REJECTED',
	'RATE_LIMITED'
]);
export type DomainErrorCode = z.infer<typeof DomainErrorCode>;

// Plans and paid features, tech.md 9.2.
export const PlanKey = z.enum(['free', 'pro']);
export type PlanKey = z.infer<typeof PlanKey>;
export const FeatureKey = z.enum([
	'signals',
	'adaptive_difficulty',
	'auto_boss',
	'integrations',
	'ai_explain',
	'camera'
]);
export type FeatureKey = z.infer<typeof FeatureKey>;
