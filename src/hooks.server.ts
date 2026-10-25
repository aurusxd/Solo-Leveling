import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { DomainError } from '#lib/domain/errors.ts';
import { readConfig } from '#lib/server/config.ts';
import { container, initContainer } from '#lib/server/container.ts';
import { rejectUnsafeRequest, toErrorResponse } from '#lib/server/http.ts';

// Fail fast on startup: a bad environment (including dev flags in production) stops the server
// before it accepts a request. The database pool connects lazily on the first query.
export const init: ServerInit = async () => {
	initContainer(await readConfig());
};

// The deploy healthcheck must not depend on the database or create sessions.
const SESSIONLESS = new Set(['/api/health']);

export const handle: Handle = async ({ event, resolve }) => {
	const c = container();
	event.locals.user = null;
	event.locals.session = null;

	const unsafe = rejectUnsafeRequest(event.request, event.url);
	if (unsafe) return toErrorResponse(unsafe);

	if (
		event.url.pathname.startsWith('/api/auth/') &&
		!c.rateLimits.auth.hit(event.getClientAddress())
	) {
		return toErrorResponse(new DomainError('RATE_LIMITED', 'too many sign-in attempts'));
	}

	if (!SESSIONLESS.has(event.url.pathname)) {
		const token = event.cookies.get(c.sessions.cookieName);
		let session = token ? await c.auth.resolve(token) : null;
		if (!session && c.config.devAuthBypass) {
			const started = await c.auth.signInDevUser();
			event.cookies.set(
				c.sessions.cookieName,
				started.token,
				c.sessions.cookieOptions(started.expiresAt)
			);
			session = await c.auth.resolve(started.token);
		}
		event.locals.session = session;
		event.locals.user = session ? { id: session.userId } : null;
	}

	return resolve(event);
};
