import { json } from '@sveltejs/kit';
import { container } from '#lib/server/container.ts';
import { endpoint, readJson } from '#lib/server/http.ts';
import { TelegramAuthInput, type OkResponse } from '#lib/types/index.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = endpoint(async ({ request, cookies }) => {
	const { initData } = await readJson(request, TelegramAuthInput);
	const { auth, sessions } = container();
	const started = await auth.signInWithTelegram(initData);
	cookies.set(sessions.cookieName, started.token, sessions.cookieOptions(started.expiresAt));
	return json({ ok: true } satisfies OkResponse);
});
