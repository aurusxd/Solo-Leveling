import type { ServerInit } from '@sveltejs/kit/hooks';
import { readConfig } from '#lib/server/config.ts';
import { initContainer } from '#lib/server/container.ts';

// Fail fast on startup: a bad environment (including dev flags in production) stops the server
// before it accepts a request. The database pool connects lazily on the first query.
export const init: ServerInit = async () => {
	initContainer(await readConfig());
};
