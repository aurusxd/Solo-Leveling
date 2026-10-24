import type { DomainErrorCode } from '#lib/types/index.ts';

export class DomainError extends Error {
	constructor(
		readonly code: DomainErrorCode,
		message: string = code
	) {
		super(message);
		this.name = 'DomainError';
	}
}
