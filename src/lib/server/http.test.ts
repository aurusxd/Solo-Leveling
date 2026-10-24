import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DomainError } from '#lib/domain/errors.ts';
import { DomainErrorCode, ErrorBody } from '#lib/types/index.ts';
import { HTTP_STATUS, toErrorResponse } from './http.ts';

// tech.md section 7, copied as data so the test checks the contract, not the implementation.
const SPEC: Array<[DomainErrorCode, number]> = [
	['VALIDATION', 400],
	['UNAUTHENTICATED', 401],
	['FORBIDDEN', 403],
	['ENTITLEMENT_REQUIRED', 403],
	['NOT_FOUND', 404],
	['INVALID_TRANSITION', 409],
	['INSUFFICIENT_FUNDS', 409],
	['CRITERIA_MISMATCH', 409],
	['ALREADY_ONBOARDED', 409],
	['CV_REJECTED', 422],
	['RATE_LIMITED', 429]
];

describe('toErrorResponse', () => {
	it('covers every DomainError code from the spec', () => {
		expect(SPEC.map(([code]) => code).sort()).toEqual([...DomainErrorCode.options].sort());
		expect(Object.keys(HTTP_STATUS).sort()).toEqual([...DomainErrorCode.options].sort());
	});

	it.each(SPEC)('maps %s to %i with an ErrorBody', async (code, status) => {
		const res = toErrorResponse(new DomainError(code, 'details'));
		expect(res.status).toBe(status);
		expect(ErrorBody.parse(await res.json())).toEqual({ code, message: 'details' });
	});

	it('uses the code as message when none is given', async () => {
		const res = toErrorResponse(new DomainError('NOT_FOUND'));
		expect(await res.json()).toEqual({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
	});

	it('reports zod failures as VALIDATION 400 with the failing path', async () => {
		const result = z.object({ title: z.string().min(1) }).safeParse({ title: '' });
		if (result.success) throw new Error('expected a validation failure');

		const res = toErrorResponse(result.error);
		const body = ErrorBody.parse(await res.json());

		expect(res.status).toBe(400);
		expect(body.code).toBe('VALIDATION');
		expect(body.message).toContain('title');
	});

	it('rethrows unexpected errors for the framework to handle as 500', () => {
		const boom = new Error('db down');
		expect(() => toErrorResponse(boom)).toThrow(boom);
	});
});
