import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+layout.server.ts';

type LoadEvent = Parameters<typeof load>[0];
const eventWith = (user: App.Locals['user']) => ({ locals: { user, session: null } }) as LoadEvent;

describe('(app) guard', () => {
	it('sends a visitor without a session to /login', () => {
		let thrown: unknown;
		try {
			load(eventWith(null));
		} catch (e) {
			thrown = e;
		}
		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ status: 303, location: '/login' });
	});

	it('lets a signed-in user through', () => {
		expect(load(eventWith({ id: 'user-1' }))).toEqual({});
	});
});
