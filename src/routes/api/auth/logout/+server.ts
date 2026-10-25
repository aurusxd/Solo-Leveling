import { json } from '@sveltejs/kit';
import { DomainError } from '#lib/domain/errors.ts';
import { container } from '#lib/server/container.ts';
import { endpoint } from '#lib/server/http.ts';
import type { OkResponse } from '#lib/types/index.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = endpoint(async ({ locals, cookies }) => {
	if (!locals.session) throw new DomainError('UNAUTHENTICATED', 'sign in first');
	const { auth, sessions } = container();
	await auth.signOut(locals.session);
	cookies.delete(sessions.cookieName, { path: '/' });
	return json({ ok: true } satisfies OkResponse);
});
