'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { NodeApiError } = require('n8n-workflow');
const { foundResponse, noMatchResponse } = require('./fixtures');
const {
	ElvesoraDomainLookup,
} = require('../dist/nodes/ElvesoraDomainLookup/ElvesoraDomainLookup.node.js');

function executionContext(itemParameters, responses, continueOnFail = false, credentials = {}) {
	const calls = [];
	const inputItems = itemParameters.map((_, index) => ({ json: { index } }));
	let responseIndex = 0;
	const context = {
		getInputData: () => inputItems,
		getNodeParameter: (name, itemIndex, fallback) => {
			const parameters = itemParameters[itemIndex] ?? itemParameters[0] ?? {};
			return Object.hasOwn(parameters, name) ? parameters[name] : fallback;
		},
		getNode: () => nodeDefinition(),
		getCredentials: async () => credentials,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credentialType, options) => {
				calls.push({ credentialType, options });
				const response = responses[responseIndex++];
				if (response instanceof Error || response?.reject) {
					throw response.error ?? response;
				}
				return response;
			},
		},
	};

	return { context, calls, inputItems };
}

function nodeDefinition() {
	return {
		id: 'node-id',
		name: 'Elvesora Domain Lookup',
		type: 'n8n-nodes-elvesora-domain-lookup.elvesoraDomainLookup',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
}

function parameters(overrides = {}) {
	return {
		operation: 'lookupDomain',
		companyName: 'Acme Corporation',
		additionalContext: '',
		simplify: true,
		options: {},
		...overrides,
	};
}

function httpError(statusCode, body, requestId = 'req-error-1234') {
	return {
		message: `Request failed with status code ${statusCode}`,
		response: {
			statusCode,
			headers: { 'x-request-id': requestId },
			body,
		},
	};
}

function n8nWrappedHttpError(statusCode, body, requestId = 'req-wrapped-1234') {
	class AxiosError extends Error {}
	const error = Object.assign(new AxiosError(`Request failed with status code ${statusCode}`), {
		response: {
			status: statusCode,
			headers: { 'x-request-id': requestId },
			data: body,
		},
	});

	return new NodeApiError(nodeDefinition(), error);
}

test('declares current n8n tool and simplified-output compatibility', () => {
	const node = new ElvesoraDomainLookup();
	const simplify = node.description.properties.find((property) => property.name === 'simplify');

	assert.equal(node.description.usableAsTool, true);
	assert.equal(simplify.type, 'boolean');
	assert.equal(simplify.default, true);
});

test('processes every input item with credentials and preserves pairing', async () => {
	const { context, calls, inputItems } = executionContext(
		[
			parameters({
				companyName: '  Acme Corporation  ',
				additionalContext: '  United States  ',
				options: { requestId: 'crm-import-1234' },
			}),
			parameters({ companyName: 'Unknown Company' }),
		],
		[
			{
				statusCode: 200,
				headers: { 'x-request-id': 'req-found-1234' },
				body: foundResponse(),
			},
			{
				statusCode: 200,
				headers: { 'x-request-id': 'req-no-match-1234' },
				body: noMatchResponse(),
			},
		],
	);

	const node = new ElvesoraDomainLookup();
	const [output] = await node.execute.call(context);

	assert.equal(calls.length, 2);
	assert.equal(calls[0].credentialType, 'elvesoraApi');
	assert.equal(calls[0].options.method, 'POST');
	assert.equal(calls[0].options.url, 'https://prospecting.elvesora.com/api/prospecting/company');
	assert.equal(calls[0].options.timeout, 100000);
	assert.equal(calls[0].options.returnFullResponse, true);
	assert.equal(calls[0].options.sendCredentialsOnCrossOriginRedirect, false);
	assert.equal(calls[0].options.json, true);
	assert.equal(calls[0].options.headers.Accept, 'application/json');
	assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
	assert.deepEqual(calls[0].options.body, {
		company_name: 'Acme Corporation',
		additional_context: 'United States',
	});
	assert.equal(calls[0].options.headers['X-Request-Id'], 'crm-import-1234');
	assert.deepEqual(calls[1].options.body, { company_name: 'Unknown Company' });
	assert.equal(Object.hasOwn(calls[1].options.headers, 'X-Request-Id'), false);
	assert.deepEqual(inputItems, [{ json: { index: 0 } }, { json: { index: 1 } }]);

	assert.equal(output[0].pairedItem.item, 0);
	assert.equal(output[0].json.domain, 'acme.com');
	assert.equal(output[0].json.limit, 100);
	assert.equal(Object.keys(output[0].json).length, 10);
	assert.equal(Object.hasOwn(output[0].json, 'request_id'), false);
	assert.equal(output[1].pairedItem.item, 1);
	assert.equal(output[1].json.found, false);
	assert.equal(output[1].json.domain, null);
});

test('raw mode returns the complete response plus the request ID', async () => {
	const responseBody = foundResponse();
	const { context } = executionContext(
		[parameters({ simplify: false })],
		[{ statusCode: 200, headers: { 'x-request-id': 'req-raw-123456' }, body: responseBody }],
	);

	const node = new ElvesoraDomainLookup();
	const [output] = await node.execute.call(context);

	assert.deepEqual(output[0].json, { ...responseBody, request_id: 'req-raw-123456' });
});

test('lookup uses the configured API base URL and keeps authenticated redirect protection', async () => {
	for (const baseUrl of ['http://127.0.0.1:8000/api', 'https://api.example.test/custom/api']) {
		const { context, calls } = executionContext(
			[parameters()],
			[{ statusCode: 200, headers: {}, body: foundResponse() }],
			false,
			{ baseUrl: `${baseUrl}/` },
		);
		const node = new ElvesoraDomainLookup();
		const [output] = await node.execute.call(context);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].options.url, `${baseUrl}/prospecting/company`);
		assert.equal(calls[0].credentialType, 'elvesoraApi');
		assert.equal(calls[0].options.sendCredentialsOnCrossOriginRedirect, false);
		assert.equal(output[0].json.domain, 'acme.com');
	}
});

test('invalid credential base URL is rejected before the HTTP helper is called', async () => {
	const { context, calls } = executionContext([parameters()], [], false, {
		baseUrl: 'http://api.example.test/api',
	});
	const node = new ElvesoraDomainLookup();
	await assert.rejects(() => node.execute.call(context), /Base URL/);
	assert.equal(calls.length, 0);
});

test('rejects every local input failure before making a billable request', async () => {
	for (const invalidParameters of [
		{ companyName: '   ' },
		{ companyName: '😀'.repeat(256) },
		{ additionalContext: '😀'.repeat(2001) },
		{ options: { requestId: 'invalid request id' } },
	]) {
		const { context, calls } = executionContext([parameters(invalidParameters)], []);
		const node = new ElvesoraDomainLookup();

		await assert.rejects(() => node.execute.call(context));
		assert.equal(calls.length, 0);
	}
});

test('rejects a malformed completed response', async () => {
	const { context } = executionContext(
		[parameters()],
		[
			{
				statusCode: 200,
				headers: { 'x-request-id': 'req-malformed-1234' },
				body: foundResponse({ confidence_band: 'low' }),
			},
		],
	);
	const node = new ElvesoraDomainLookup();

	await assert.rejects(
		() => node.execute.call(context),
		(error) => {
			assert.match(error.message, /unexpected response/i);
			assert.match(error.description, /req-malformed-1234/);
			assert.equal(error.httpCode, '502');
			return true;
		},
	);
});

test('returns typed contract-corruption context with Continue On Fail', async () => {
	const { context } = executionContext(
		[parameters()],
		[
			{
				statusCode: 200,
				headers: { 'x-request-id': 'req-contract-1234' },
				body: foundResponse({ reasons: 'invalid' }),
			},
		],
		true,
	);
	const node = new ElvesoraDomainLookup();

	const [output] = await node.execute.call(context);
	assert.deepEqual(output[0].json, {
		error: 'The completed response has invalid match reasons.',
		status_code: 502,
		error_type: 'lookup_invalid_response',
		retryable: true,
		retry_after: 60,
		request_id: 'req-contract-1234',
		validation_errors: null,
	});
});

test('returns typed error context when Continue On Fail is enabled', async () => {
	const error = n8nWrappedHttpError(
		429,
		{
			success: false,
			message: 'Request limit exceeded. Please upgrade your plan.',
			error_type: 'usage_limit',
			retryable: false,
			remaining: 0,
			limit: 100,
		},
		'req-limit-123456',
	);
	const { context } = executionContext([parameters()], [{ reject: true, error }], true);
	const node = new ElvesoraDomainLookup();

	const [output] = await node.execute.call(context);
	assert.deepEqual(output[0].json, {
		error: 'Request limit exceeded. Please upgrade your plan.',
		status_code: 429,
		error_type: 'usage_limit',
		retryable: false,
		retry_after: null,
		request_id: 'req-limit-123456',
		validation_errors: null,
	});
});

test('surfaces both typed and Laravel validation envelopes', async () => {
	for (const body of [
		{
			message: 'The company name field is required.',
			errors: { company_name: ['The company name field is required.'] },
		},
		{
			success: false,
			message: 'The additional context is too long.',
			errors: {
				additional_context: ['The additional context may not be greater than 2000 characters.'],
			},
			response_code: 422,
			error_type: 'validation_error',
			retryable: false,
		},
	]) {
		const { context } = executionContext(
			[parameters()],
			[{ reject: true, error: n8nWrappedHttpError(422, body) }],
			true,
		);
		const node = new ElvesoraDomainLookup();
		const [output] = await node.execute.call(context);

		assert.deepEqual(output[0].json.validation_errors, body.errors);
		assert.equal(output[0].json.status_code, 422);
	}
});

test('rewraps n8n HTTP helper errors with Elvesora credit-aware guidance', async () => {
	const error = n8nWrappedHttpError(
		503,
		{
			message: 'The lookup provider is temporarily unavailable.',
			error_type: 'lookup_unavailable',
			retryable: true,
			retry_after: 60,
		},
		'req-helper-1234',
	);
	const { context, calls } = executionContext([parameters()], [{ reject: true, error }]);
	const node = new ElvesoraDomainLookup();

	await assert.rejects(
		() => node.execute.call(context),
		(nodeError) => {
			assert.equal(nodeError.message, 'Elvesora Domain Lookup is temporarily unavailable');
			assert.match(nodeError.description, /another lookup credit/i);
			assert.match(nodeError.description, /req-helper-1234/);
			assert.equal(nodeError.httpCode, '503');
			return true;
		},
	);
	assert.equal(calls.length, 1);
});

test('preserves typed API failure semantics without retrying', async () => {
	for (const failure of [
		{
			label: 'unauthorized',
			error: httpError(401, { message: 'Unauthorized' }),
			expected: { status: 401, type: null, retryable: false, retryAfter: null },
		},
		{
			label: 'validation',
			error: httpError(422, {
				message: 'The company name is invalid.',
				errors: { company_name: ['Invalid.'] },
			}),
			expected: { status: 422, type: null, retryable: false, retryAfter: null },
		},
		{
			label: 'provider rate limit',
			error: httpError(429, {
				message: 'Provider throttled the lookup.',
				error_type: 'rate_limited',
				retryable: true,
				retry_after: 45,
			}),
			expected: { status: 429, type: 'rate_limited', retryable: true, retryAfter: 45 },
		},
		{
			label: 'invalid upstream response',
			error: httpError(502, {
				message: 'Lookup provider returned an invalid response.',
				error_type: 'lookup_invalid_response',
				retryable: true,
				retry_after: 60,
			}),
			expected: { status: 502, type: 'lookup_invalid_response', retryable: true, retryAfter: 60 },
		},
		{
			label: 'provider unavailable',
			error: httpError(
				503,
				JSON.stringify({
					message: 'Lookup provider is unavailable.',
					error_type: 'lookup_unavailable',
					retryable: true,
					retry_after: 60,
				}),
			),
			expected: { status: 503, type: 'lookup_unavailable', retryable: true, retryAfter: 60 },
		},
		{
			label: 'provider lookup timeout response',
			error: httpError(503, {
				message: 'Domain lookup is taking longer than expected. Please retry shortly.',
				error_type: 'lookup_timeout',
				retryable: true,
				retry_after: 60,
			}),
			expected: { status: 503, type: 'lookup_timeout', retryable: true, retryAfter: 60 },
		},
		{
			label: 'provider connection failure response',
			error: httpError(503, {
				message: 'Domain lookup provider could not be reached. Please retry shortly.',
				error_type: 'lookup_connection_failed',
				retryable: true,
				retry_after: 60,
			}),
			expected: {
				status: 503,
				type: 'lookup_connection_failed',
				retryable: true,
				retryAfter: 60,
			},
		},
		{
			label: 'provider upstream HTTP failure response',
			error: httpError(503, {
				message: 'Domain lookup provider returned a temporary HTTP error.',
				error_type: 'upstream_http_error',
				retryable: true,
				retry_after: 60,
			}),
			expected: { status: 503, type: 'upstream_http_error', retryable: true, retryAfter: 60 },
		},
		{
			label: 'network connection reset',
			error: Object.assign(new Error('Connection reset by peer'), { code: 'ECONNRESET' }),
			expected: { status: null, type: null, retryable: true, retryAfter: null },
		},
		{
			label: 'generic server failure',
			error: httpError(500, 'not-json'),
			expected: { status: 500, type: null, retryable: true, retryAfter: null },
		},
	]) {
		const { context, calls } = executionContext(
			[parameters()],
			[{ reject: true, error: failure.error }],
			true,
		);
		const node = new ElvesoraDomainLookup();
		const [output] = await node.execute.call(context);

		assert.equal(calls.length, 1, `${failure.label} must not retry automatically`);
		assert.equal(output[0].json.status_code, failure.expected.status, failure.label);
		assert.equal(output[0].json.error_type, failure.expected.type, failure.label);
		assert.equal(output[0].json.retryable, failure.expected.retryable, failure.label);
		assert.equal(output[0].json.retry_after, failure.expected.retryAfter, failure.label);
		assert.equal(output[0].pairedItem.item, 0, failure.label);
	}
});

test('Continue On Fail processes later items and skips HTTP for local failures', async () => {
	const { context, calls } = executionContext(
		[parameters({ companyName: '   ' }), parameters({ companyName: 'Acme Corporation' })],
		[{ statusCode: 200, headers: {}, body: foundResponse() }],
		true,
	);
	const node = new ElvesoraDomainLookup();
	const [output] = await node.execute.call(context);

	assert.equal(calls.length, 1);
	assert.match(output[0].json.error, /cannot be empty/i);
	assert.equal(output[0].pairedItem.item, 0);
	assert.equal(output[1].json.domain, 'acme.com');
	assert.equal(output[1].pairedItem.item, 1);
});

test('a transport timeout is returned as uncertain and is never retried automatically', async () => {
	const timeoutError = Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' });
	const { context, calls } = executionContext(
		[parameters({ options: { requestId: 'req-timeout-caller-1234' } })],
		[{ reject: true, error: timeoutError }],
		true,
	);
	const node = new ElvesoraDomainLookup();
	const [output] = await node.execute.call(context);

	assert.equal(calls.length, 1);
	assert.equal(output[0].json.status_code, null);
	assert.equal(output[0].json.retryable, true);
	assert.equal(output[0].json.request_id, 'req-timeout-caller-1234');
	assert.match(output[0].json.error, /timed out/i);
});
