import type { ActiveSession } from '#lib/server/repositories/SessionRepository.ts';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Set by hooks.server.ts from the session cookie (or the dev bypass). */
			user: { id: string } | null;
			session: ActiveSession | null;
		}
	}
}

export {};
