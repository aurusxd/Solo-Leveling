import { describe, expect, it } from 'vitest';
import { rejectUnsafeRequest } from './http.ts';

const url = new URL('https://rpg.example.com/api/auth/telegram');
const request = (method: string, headers: Record<string, string> = {}) =>
	new Request(url, { method, headers });

describe('rejectUnsafeRequest', () => {
	it('lets safe methods through without checks', () => {
		expect(rejectUnsafeRequest(request('GET'), url)).toBeNull();
		expect(rejectUnsafeRequest(request('HEAD'), url)).toBeNull();
	});

	it('compares hosts, so a proxy that hides the scheme does not break it', () => {
		const viaHttp = request('POST', {
			origin: 'http://rpg.example.com',
			'content-type': 'application/json'
		});
		expect(rejectUnsafeRequest(viaHttp, url)).toBeNull();
	});

	it('accepts a same-origin JSON mutation', () => {
		const ok = request('POST', { origin: url.origin, 'content-type': 'application/json' });
		expect(rejectUnsafeRequest(ok, url)).toBeNull();
	});

	it('refuses a mutation from another or no origin', () => {
		const foreign = request('POST', {
			origin: 'https://evil.example',
			'content-type': 'application/json'
		});
		expect(rejectUnsafeRequest(foreign, url)?.code).toBe('FORBIDDEN');
		const none = request('DELETE', { 'content-type': 'application/json' });
		expect(rejectUnsafeRequest(none, url)?.code).toBe('FORBIDDEN');
		const garbage = request('POST', { origin: 'null', 'content-type': 'application/json' });
		expect(rejectUnsafeRequest(garbage, url)?.code).toBe('FORBIDDEN');
		const otherPort = request('POST', {
			origin: 'https://rpg.example.com:8443',
			'content-type': 'application/json'
		});
		expect(rejectUnsafeRequest(otherPort, url)?.code).toBe('FORBIDDEN');
	});

	it('requires JSON on API mutations only', () => {
		const form = request('POST', {
			origin: url.origin,
			'content-type': 'application/x-www-form-urlencoded'
		});
		expect(rejectUnsafeRequest(form, url)?.code).toBe('VALIDATION');
		const page = new URL('https://rpg.example.com/settings');
		const pageForm = new Request(page, {
			method: 'POST',
			headers: { origin: page.origin, 'content-type': 'application/x-www-form-urlencoded' }
		});
		expect(rejectUnsafeRequest(pageForm, page)).toBeNull();
	});
});
