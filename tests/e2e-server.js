// Starts the production build for Playwright. `vite preview` forces NODE_ENV=production, which
// (correctly) rejects dev flags such as DEV_AUTH_BYPASS that e2e relies on, so e2e runs the real
// adapter-node server as NODE_ENV=test instead.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
process.env.PORT = '4173';
// tech.md section 13: e2e signs in through the dev bypass.
process.env.DEV_AUTH_BYPASS = 'true';

// A computed specifier keeps svelte-check from type-checking the generated build output.
await import(new URL('../build/index.js', import.meta.url).href);
