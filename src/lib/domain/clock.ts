/** The only source of "now" for the domain and services, so every test can pin time. */
export interface Clock {
	now(): Date;
}

export class SystemClock implements Clock {
	now(): Date {
		return new Date();
	}
}

export class FixedClock implements Clock {
	#ms: number;

	constructor(start: Date | string) {
		this.#ms = new Date(start).getTime();
	}

	now(): Date {
		return new Date(this.#ms);
	}

	set(to: Date | string): void {
		this.#ms = new Date(to).getTime();
	}

	advance(ms: number): void {
		this.#ms += ms;
	}
}
