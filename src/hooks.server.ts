import type { ServerInit } from '@sveltejs/kit/hooks';
import { readConfig } from '#lib/server/config.ts';

// Fail fast on startup: a bad environment (including dev flags in production) stops the server
// before it accepts a request.
export const init: ServerInit = () => {
	readConfig();
};
