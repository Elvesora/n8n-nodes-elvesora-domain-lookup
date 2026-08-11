'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { foundResponse, noMatchResponse } = require('./fixtures');
const {
	continueOnFailOutput,
	createElvesoraApiError,
	extractApiErrorContext,
	extractRequestId,
	rawLookupResponse,
	simplifyLookupResponse,
	validateAdditionalContext,
	validateCompanyName,
	validateCompletedLookupResponse,
	validateRequestId,
} = require('../dist/nodes/ElvesoraDomainLookup/utils.js');

test('validates and trims request fields before an API call', () => {
	assert.deepEqual(validateCompanyName('  Acme Corporation  '), {
		ok: true,
		value: 'Acme Corporation',
	});
	assert.deepEqual(validateAdditionalContext('  United States  '), {
		ok: true,
		value: 'United States',
	});
	assert.deepEqual(validateAdditionalContext('   '), { ok: true, value: undefined });
	assert.deepEqual(validateRequestId('crm-import-2026-08-11'), {
		ok: true,
		value: 'crm-import-2026-08-11',
	});
});

test('rejects invalid request fields locally', () => {
	assert.equal(validateCompanyName('   ').ok, false);
	assert.equal(validateCompanyName('x'.repeat(255)).ok, true);
	assert.equal(validateCompanyName('x'.repeat(256)).ok, false);
	assert.equal(validateCompanyName('😀'.repeat(255)).ok, true);
	assert.equal(validateCompanyName('😀'.repeat(256)).ok, false);
	assert.equal(validateCompanyName(123).ok, false);
	assert.equal(validateAdditionalContext('x'.repeat(2000)).ok, true);
	assert.equal(validateAdditionalContext('x'.repeat(2001)).ok, false);
	assert.equal(validateAdditionalContext('😀'.repeat(2000)).ok, true);
	assert.equal(validateAdditionalContext('😀'.repeat(2001)).ok, false);
	assert.equal(validateAdditionalContext({}).ok, false);
	assert.equal(validateRequestId('12345678').ok, true);
	assert.equal(validateRequestId('x'.repeat(128)).ok, true);
	assert.equal(validateRequestId('short').ok, false);
	assert.equal(validateRequestId('x'.repeat(129)).ok, false);
	assert.equal(validateRequestId('invalid request id').ok, false);
});

test('accepts the published found and no-match response contracts', () => {
	assert.equal(validateCompletedLookupResponse(foundResponse()).ok, true);
	assert.equal(validateCompletedLookupResponse(noMatchResponse()).ok, true);
	assert.equal(
		validateCompletedLookupResponse(
			foundResponse({
				normalized_company_name: null,
				linkedin_url: null,
				industry: null,
				sub_industry: null,
				sector: null,
				is_live: false,
				cached: true,
				remaining: 0,
			}),
		).ok,
		true,
	);
});

test('accepts every published confidence routing boundary', () => {
	for (const [confidence, confidenceBand, reviewRecommended] of [
		[1, 'low', true],
		[59, 'low', true],
		[60, 'review', true],
		[84, 'review', true],
		[85, 'high', false],
		[100, 'high', false],
	]) {
		const result = validateCompletedLookupResponse(
			foundResponse({
				confidence,
				confidence_band: confidenceBand,
				review_recommended: reviewRecommended,
			}),
		);
		assert.equal(result.ok, true, `confidence ${confidence} should be valid`);
	}
});

test('rejects inconsistent response routing fields', () => {
	assert.equal(
		validateCompletedLookupResponse(foundResponse({ confidence_band: 'low' })).ok,
		false,
	);
	assert.equal(
		validateCompletedLookupResponse(noMatchResponse({ domain: 'guessed.example' })).ok,
		false,
	);
	assert.equal(
		validateCompletedLookupResponse(foundResponse({ review_recommended: true })).ok,
		false,
	);
});

test('rejects malformed or incomplete completed responses', () => {
	const missingMessage = foundResponse();
	delete missingMessage.message;

	for (const [label, response] of [
		['non-object', 'not-json-object'],
		['success false', foundResponse({ success: false })],
		['missing required field', missingMessage],
		['unknown additional field', foundResponse({ future_field: true })],
		['empty company name', foundResponse({ company_name: '' })],
		['empty nullable string', foundResponse({ industry: '' })],
		['invalid nullable metadata', foundResponse({ industry: 42 })],
		['fractional confidence', foundResponse({ confidence: 92.5 })],
		['confidence below zero', foundResponse({ confidence: -1 })],
		['confidence above 100', foundResponse({ confidence: 101 })],
		['invalid band', foundResponse({ confidence_band: 'certain' })],
		['invalid is_live', foundResponse({ is_live: 'yes' })],
		['invalid reasons', foundResponse({ reasons: [42] })],
		['invalid lower reasons', foundResponse({ lower_reasons: 'none' })],
		['found without domain', foundResponse({ domain: null })],
		[
			'found at zero confidence',
			foundResponse({ confidence: 0, confidence_band: 'no_match', review_recommended: true }),
		],
		[
			'no-match with positive confidence',
			noMatchResponse({ confidence: 1, confidence_band: 'low' }),
		],
		['no-match with unexpected message', noMatchResponse({ message: 'Nothing found.' })],
		['negative remaining', foundResponse({ remaining: -1 })],
		['fractional limit', foundResponse({ limit: 100.5 })],
	]) {
		assert.equal(
			validateCompletedLookupResponse(response).ok,
			false,
			`${label} should be rejected`,
		);
	}
});

test('simplified output contains at most ten routing fields', () => {
	const result = validateCompletedLookupResponse(foundResponse());
	assert.equal(result.ok, true);
	const output = simplifyLookupResponse(result.value);

	assert.equal(Object.keys(output).length, 10);
	assert.deepEqual(output, {
		found: true,
		domain: 'acme.com',
		company_name: 'Acme Corporation',
		confidence: 92,
		confidence_band: 'high',
		review_recommended: false,
		is_live: true,
		cached: false,
		remaining: 95,
		limit: 100,
	});
});

test('raw output preserves every response field and adds tracing', () => {
	const response = foundResponse();
	const result = validateCompletedLookupResponse(response);
	assert.equal(result.ok, true);

	assert.deepEqual(rawLookupResponse(result.value, 'req-12345678'), {
		...response,
		request_id: 'req-12345678',
	});
});

test('extracts request IDs case-insensitively', () => {
	assert.equal(extractRequestId({ 'X-Request-Id': 'req-upper-123' }), 'req-upper-123');
	assert.equal(extractRequestId({ 'x-request-id': ['req-array-123'] }), 'req-array-123');
	assert.equal(extractRequestId(undefined), undefined);
});

test('extracts typed error and retry context from HTTP errors', () => {
	const context = extractApiErrorContext({
		message: 'Request failed with status code 429',
		response: {
			statusCode: 429,
			headers: { 'x-request-id': 'req-rate-limit-123' },
			body: {
				success: false,
				message: 'Provider is temporarily rate limited.',
				error_type: 'rate_limited',
				retryable: true,
				retry_after: 60,
			},
		},
	});

	assert.deepEqual(context, {
		statusCode: 429,
		body: {
			success: false,
			message: 'Provider is temporarily rate limited.',
			error_type: 'rate_limited',
			retryable: true,
			retry_after: 60,
		},
		requestId: 'req-rate-limit-123',
		errorType: 'rate_limited',
		retryable: true,
		retryAfter: 60,
		timedOut: false,
		message: 'Provider is temporarily rate limited.',
	});
});

test('extracts context from wrapped node errors and applies retry fallbacks', () => {
	const context = extractApiErrorContext({
		httpCode: '503',
		errorResponse: {
			message: 'Provider unavailable.',
			error_type: 'lookup_unavailable',
			request_id: 'req-wrapped-1234',
		},
	});

	assert.deepEqual(context, {
		statusCode: 503,
		body: {
			message: 'Provider unavailable.',
			error_type: 'lookup_unavailable',
			request_id: 'req-wrapped-1234',
		},
		requestId: 'req-wrapped-1234',
		errorType: 'lookup_unavailable',
		retryable: true,
		retryAfter: undefined,
		timedOut: false,
		message: 'Provider unavailable.',
	});
});

test('classifies timeouts, redacts bearer secrets, and reports uncertain retries', () => {
	const rawError = {
		code: 'ETIMEDOUT',
		message: 'Request timed out with Authorization: Bearer super-secret-value',
		headers: { 'x-request-id': 'req-timeout-1234' },
	};
	const context = extractApiErrorContext(rawError);

	assert.equal(context.timedOut, true);
	assert.equal(context.retryable, true);
	assert.equal(context.requestId, 'req-timeout-1234');
	assert.equal(context.message.includes('super-secret-value'), false);

	const nodeError = createElvesoraApiError(
		{
			id: 'node-id',
			name: 'Elvesora Domain Lookup',
			type: 'n8n-nodes-elvesora-domain-lookup.elvesoraDomainLookup',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		},
		rawError,
		0,
	);
	assert.match(nodeError.message, /timed out/i);
	assert.match(nodeError.description, /credit state may be uncertain/i);
	assert.match(nodeError.description, /req-timeout-1234/);
	assert.equal(JSON.stringify(nodeError).includes('super-secret-value'), false);

	assert.deepEqual(continueOnFailOutput(nodeError), {
		error: context.message,
		status_code: null,
		error_type: null,
		retryable: true,
		retry_after: null,
		request_id: 'req-timeout-1234',
		validation_errors: null,
	});
});

test('redacts secrets recursively from persisted API error bodies', () => {
	const nodeError = createElvesoraApiError(
		{
			id: 'node-id',
			name: 'Elvesora Domain Lookup',
			type: 'n8n-nodes-elvesora-domain-lookup.elvesoraDomainLookup',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		},
		{
			response: {
				status: 400,
				data: {
					message: 'Rejected Bearer body-secret-value',
					details: {
						Authorization: 'Bearer nested-secret-value',
						api_key: 'plain-secret-value',
					},
				},
			},
		},
		0,
	);
	const serializedResponse = JSON.stringify(nodeError.errorResponse);

	assert.equal(serializedResponse.includes('body-secret-value'), false);
	assert.equal(serializedResponse.includes('nested-secret-value'), false);
	assert.equal(serializedResponse.includes('plain-secret-value'), false);
	assert.match(serializedResponse, /REDACTED/);
});
