import { ELVESORA_API_BASE_URL } from './types';

export function resolveElvesoraBaseUrl(value: unknown): string {
	if (value === undefined || value === null || value === '') return ELVESORA_API_BASE_URL;
	if (typeof value !== 'string') throw new Error('Base URL must be a URL string.');

	const input = value.trim();
	if (input === '') return ELVESORA_API_BASE_URL;
	if (!/^https?:\/\/[^/?#]+/i.test(input) || /[\s\\?#]/.test(input)) {
		throw new Error('Base URL must be an absolute HTTP or HTTPS URL without a query or fragment.');
	}

	if (!URL.canParse(input)) {
		throw new Error('Base URL must contain a valid host and port.');
	}
	const url = new URL(input);

	const authority = input.slice(input.indexOf('://') + 3).split('/')[0];
	if (authority.includes('@') || url.username || url.password) {
		throw new Error('Base URL must not contain a username or password.');
	}
	if (url.port && Number(url.port) < 1) {
		throw new Error('Base URL must contain a port between 1 and 65535.');
	}

	const loopback =
		url.hostname === 'localhost' ||
		url.hostname === '[::1]' ||
		/^127(?:\.\d{1,3}){3}$/.test(url.hostname);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
		throw new Error('Base URL must use HTTPS, except HTTP is allowed for loopback hosts.');
	}

	return url.toString().replace(/\/+$/, '');
}
