import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Every (app) page needs a signed-in user; the session itself is resolved in hooks.server.ts.
export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return {};
};
