// Ledger idempotency key formats, tech.md section 6. One place so every writer builds them alike.
export const idempotencyKey = {
	questCompleted: (questId: string) => `quest-completed:${questId}`,
	questFailed: (questId: string) => `quest-failed:${questId}`,
	exercise: (clientSessionId: string) => `exercise:${clientSessionId}`,
	purchase: (clientRequestId: string) => `purchase:${clientRequestId}`,
	source: (sourceKey: string, externalId: string) => `source:${sourceKey}:${externalId}`
};
