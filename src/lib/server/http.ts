import { json } from '@sveltejs/kit';
import { ZodError, type z } from 'zod';
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

/** Wraps an endpoint so expected failures become ErrorBody responses. */
export function endpoint<E>(handler: (event: E) => Response | Promise<Response>) {
	return async (event: E): Promise<Response> => {
		try {
			return await handler(event);
		} catch (error) {
			return toErrorResponse(error);
		}
	};
}

/** The signed-in user or UNAUTHENTICATED; every authenticated endpoint starts here. */
export function requireUser(locals: App.Locals): { id: string } {
	if (!locals.user) throw new DomainError('UNAUTHENTICATED', 'sign in first');
	return locals.user;
}

/** Parses a JSON body against a contract schema; malformed JSON is a VALIDATION error too. */
export async function readJson<S extends z.ZodType>(
	request: Request,
	schema: S
): Promise<z.output<S>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new DomainError('VALIDATION', 'body must be JSON');
	}
	return schema.parse(body);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for every state-changing request (tech.md section 14): the Origin host must equal the
 * Host the request was sent to, and the JSON API only accepts JSON. Hosts are compared rather than
 * full origins because adapter-node no longer knows the public scheme at runtime (SvelteKit 3).
 * Returns the error to send, or null to let the request on.
 */
export function rejectUnsafeRequest(request: Request, url: URL): DomainError | null {
	if (SAFE_METHODS.has(request.method)) return null;
	if (originHost(request.headers.get('origin')) !== url.host) {
		return new DomainError('FORBIDDEN', 'cross-origin request');
	}
	const contentType = request.headers.get('content-type') ?? '';
	if (url.pathname.startsWith('/api/') && !contentType.startsWith('application/json')) {
		return new DomainError('VALIDATION', 'Content-Type must be application/json');
	}
	return null;
}

function originHost(origin: string | null): string | null {
	if (!origin) return null;
	try {
		return new URL(origin).host;
	} catch {
		return null;
	}
}
