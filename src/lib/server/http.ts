import { json } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { DomainError } from '#lib/domain/errors.ts';
import type { DomainErrorCode, ErrorBody } from '#lib/types/index.ts';

// The single DomainError -> HTTP mapping (tech.md section 7).
export const HTTP_STATUS: Record<DomainErrorCode, number> = {
	VALIDATION: 400,
	UNAUTHENTICATED: 401,
	FORBIDDEN: 403,
	ENTITLEMENT_REQUIRED: 403,
	NOT_FOUND: 404,
	INVALID_TRANSITION: 409,
	INSUFFICIENT_FUNDS: 409,
	CRITERIA_MISMATCH: 409,
	ALREADY_ONBOARDED: 409,
	CV_REJECTED: 422,
	RATE_LIMITED: 429
};

/**
 * Turns expected failures into an ErrorBody response. Anything else is rethrown so SvelteKit's
 * handleError deals with it as a 500 without leaking internals.
 */
export function toErrorResponse(error: unknown): Response {
	if (error instanceof DomainError) {
		return json({ code: error.code, message: error.message } satisfies ErrorBody, {
			status: HTTP_STATUS[error.code]
		});
	}
	if (error instanceof ZodError) {
		const message = error.issues
			.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
			.join('; ');
		return json({ code: 'VALIDATION', message } satisfies ErrorBody, {
			status: HTTP_STATUS.VALIDATION
		});
	}
	throw error;
}
