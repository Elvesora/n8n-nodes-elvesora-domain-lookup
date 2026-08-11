import { NodeApiError, type IDataObject, type INode, type JsonObject } from 'n8n-workflow';
import {
	type ApiErrorContext,
	type CompletedLookupResponse,
	MAX_ADDITIONAL_CONTEXT_LENGTH,
	MAX_COMPANY_NAME_LENGTH,
	REQUEST_ID_PATTERN,
	type ValidationResult,
} from './types';

const CONFIDENCE_BANDS = new Set(['high', 'review', 'low', 'no_match']);
const COMPLETED_RESPONSE_FIELDS = new Set([
	'success',
	'message',
	'company_name',
	'normalized_company_name',
	'domain',
	'linkedin_url',
	'industry',
	'sub_industry',
	'sector',
	'confidence',
	'confidence_band',
	'review_recommended',
	'is_live',
	'reasons',
	'lower_reasons',
	'cached',
	'found',
	'remaining',
	'limit',
]);
const RETRYABLE_STATUS_CODES = new Set([408, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
	'ECONNABORTED',
	'ECONNREFUSED',
	'ECONNRESET',
	'EAI_AGAIN',
	'ENOTFOUND',
	'ESOCKETTIMEDOUT',
	'ETIMEDOUT',
	'UND_ERR_BODY_TIMEOUT',
	'UND_ERR_CONNECT_TIMEOUT',
	'UND_ERR_HEADERS_TIMEOUT',
]);
const TIMEOUT_NETWORK_CODES = new Set([
	'ECONNABORTED',
	'ESOCKETTIMEDOUT',
	'ETIMEDOUT',
	'UND_ERR_BODY_TIMEOUT',
	'UND_ERR_CONNECT_TIMEOUT',
	'UND_ERR_HEADERS_TIMEOUT',
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function parseJsonObject(value: unknown): IDataObject | undefined {
	const record = asRecord(value);
	if (record) return record as IDataObject;

	if (typeof value !== 'string') return undefined;

	try {
		return asRecord(JSON.parse(value)) as IDataObject | undefined;
	} catch {
		return undefined;
	}
}

function isNullableString(value: unknown): value is string | null {
	return value === null || (typeof value === 'string' && value.length > 0);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function unicodeLength(value: string): number {
	return Array.from(value).length;
}

function sanitizeErrorMessage(value: string): string {
	return value
		.replace(/(\bAuthorization["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s,;"']+/gi, '$1[REDACTED]')
		.replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]');
}

function sanitizeJsonValue(value: unknown): unknown {
	if (typeof value === 'string') return sanitizeErrorMessage(value);
	if (Array.isArray(value)) return value.map((entry) => sanitizeJsonValue(entry));

	const record = asRecord(value);
	if (!record) return value;

	return Object.fromEntries(
		Object.entries(record).map(([key, entry]) => [
			key,
			/^(?:authorization|api[_-]?key)$/i.test(key) ? '[REDACTED]' : sanitizeJsonValue(entry),
		]),
	);
}

function validationErrors(context: ApiErrorContext): IDataObject | undefined {
	const errors = asRecord(context.body?.errors);
	return errors ? (sanitizeJsonValue(errors) as IDataObject) : undefined;
}

function expectedConfidenceBand(confidence: number): CompletedLookupResponse['confidence_band'] {
	if (confidence >= 85) return 'high';
	if (confidence >= 60) return 'review';
	if (confidence >= 1) return 'low';
	return 'no_match';
}

export function validateCompanyName(value: unknown): ValidationResult<string> {
	if (typeof value !== 'string') {
		return { ok: false, message: 'Company Name must be a string.' };
	}

	const companyName = value.trim();
	if (companyName.length === 0) {
		return { ok: false, message: 'Company Name cannot be empty.' };
	}

	if (unicodeLength(companyName) > MAX_COMPANY_NAME_LENGTH) {
		return {
			ok: false,
			message: `Company Name cannot exceed ${MAX_COMPANY_NAME_LENGTH} characters.`,
		};
	}

	return { ok: true, value: companyName };
}

export function validateAdditionalContext(value: unknown): ValidationResult<string | undefined> {
	if (value === undefined || value === null || value === '') {
		return { ok: true, value: undefined };
	}

	if (typeof value !== 'string') {
		return { ok: false, message: 'Additional Context must be a string.' };
	}

	const additionalContext = value.trim();
	if (additionalContext.length === 0) {
		return { ok: true, value: undefined };
	}

	if (unicodeLength(additionalContext) > MAX_ADDITIONAL_CONTEXT_LENGTH) {
		return {
			ok: false,
			message: `Additional Context cannot exceed ${MAX_ADDITIONAL_CONTEXT_LENGTH} characters.`,
		};
	}

	return { ok: true, value: additionalContext };
}

export function validateRequestId(value: unknown): ValidationResult<string | undefined> {
	if (value === undefined || value === null || value === '') {
		return { ok: true, value: undefined };
	}

	if (typeof value !== 'string') {
		return { ok: false, message: 'Request ID must be a string.' };
	}

	const requestId = value.trim();
	if (!REQUEST_ID_PATTERN.test(requestId)) {
		return {
			ok: false,
			message:
				'Request ID must contain 8 to 128 letters, numbers, periods, underscores, colons, or hyphens.',
		};
	}

	return { ok: true, value: requestId };
}

export function validateCompletedLookupResponse(
	value: unknown,
): ValidationResult<CompletedLookupResponse> {
	const response = asRecord(value);
	if (!response) {
		return { ok: false, message: 'The response body is not a JSON object.' };
	}

	const unexpectedFields = Object.keys(response).filter(
		(field) => !COMPLETED_RESPONSE_FIELDS.has(field),
	);
	if (
		unexpectedFields.length > 0 ||
		Object.keys(response).length !== COMPLETED_RESPONSE_FIELDS.size
	) {
		return {
			ok: false,
			message: 'The completed response fields do not match the published API contract.',
		};
	}

	if (response.success !== true) {
		return { ok: false, message: 'The completed response does not set success to true.' };
	}

	if (typeof response.message !== 'string' || response.message.length === 0) {
		return { ok: false, message: 'The completed response is missing message.' };
	}

	if (typeof response.company_name !== 'string' || response.company_name.length === 0) {
		return { ok: false, message: 'The completed response is missing company_name.' };
	}

	for (const field of [
		'normalized_company_name',
		'domain',
		'linkedin_url',
		'industry',
		'sub_industry',
		'sector',
	] as const) {
		if (!isNullableString(response[field])) {
			return { ok: false, message: `The completed response has an invalid ${field}.` };
		}
	}

	if (
		typeof response.confidence !== 'number' ||
		!Number.isInteger(response.confidence) ||
		response.confidence < 0 ||
		response.confidence > 100
	) {
		return { ok: false, message: 'The completed response has an invalid confidence.' };
	}

	if (
		typeof response.confidence_band !== 'string' ||
		!CONFIDENCE_BANDS.has(response.confidence_band)
	) {
		return { ok: false, message: 'The completed response has an invalid confidence_band.' };
	}

	if (response.confidence_band !== expectedConfidenceBand(response.confidence)) {
		return {
			ok: false,
			message: 'The completed response confidence and confidence_band do not agree.',
		};
	}

	if (typeof response.review_recommended !== 'boolean') {
		return { ok: false, message: 'The completed response has an invalid review_recommended.' };
	}

	if (response.review_recommended !== (response.confidence_band !== 'high')) {
		return {
			ok: false,
			message: 'The completed response confidence_band and review_recommended do not agree.',
		};
	}

	if (response.is_live !== null && typeof response.is_live !== 'boolean') {
		return { ok: false, message: 'The completed response has an invalid is_live.' };
	}

	if (!isStringArray(response.reasons) || !isStringArray(response.lower_reasons)) {
		return { ok: false, message: 'The completed response has invalid match reasons.' };
	}

	if (typeof response.cached !== 'boolean' || typeof response.found !== 'boolean') {
		return { ok: false, message: 'The completed response has invalid outcome flags.' };
	}

	if (response.found) {
		if (typeof response.domain !== 'string' || response.domain.length === 0) {
			return { ok: false, message: 'A found response must include a domain.' };
		}
		if (response.confidence === 0 || response.confidence_band === 'no_match') {
			return { ok: false, message: 'A found response must include a positive confidence.' };
		}
	} else if (
		response.domain !== null ||
		response.confidence !== 0 ||
		response.confidence_band !== 'no_match' ||
		response.message !== 'No domain found for this company.'
	) {
		return {
			ok: false,
			message:
				'A no-match response must have the published message, a null domain, and no_match confidence routing.',
		};
	}

	for (const field of ['remaining', 'limit'] as const) {
		if (
			typeof response[field] !== 'number' ||
			!Number.isInteger(response[field]) ||
			response[field] < 0
		) {
			return { ok: false, message: `The completed response has an invalid ${field}.` };
		}
	}

	return { ok: true, value: response as CompletedLookupResponse };
}

export function extractRequestId(headers: unknown): string | undefined {
	const headerRecord = asRecord(headers);
	if (!headerRecord) return undefined;

	const entry = Object.entries(headerRecord).find(
		([key]) => key.toLowerCase() === 'x-request-id',
	)?.[1];

	if (Array.isArray(entry)) {
		const first = entry[0];
		return typeof first === 'string' && first.length > 0 ? first : undefined;
	}

	return typeof entry === 'string' && entry.length > 0 ? entry : undefined;
}

export function simplifyLookupResponse(response: CompletedLookupResponse): IDataObject {
	return {
		found: response.found,
		domain: response.domain,
		company_name: response.company_name,
		confidence: response.confidence,
		confidence_band: response.confidence_band,
		review_recommended: response.review_recommended,
		is_live: response.is_live,
		cached: response.cached,
		remaining: response.remaining,
		limit: response.limit,
	};
}

export function rawLookupResponse(
	response: CompletedLookupResponse,
	requestId?: string,
): IDataObject {
	return {
		...response,
		request_id: requestId ?? null,
	};
}

export function extractApiErrorContext(error: unknown): ApiErrorContext {
	const errorRecord = asRecord(error);
	const causeRecord = asRecord(errorRecord?.cause);
	const errorResponseRecord = asRecord(errorRecord?.errorResponse);
	const wrappedResponseRecord = asRecord(errorResponseRecord?.response);
	const errorContextRecord = asRecord(errorRecord?.context);
	const responseRecord = asRecord(errorRecord?.response) ?? asRecord(causeRecord?.response);
	const body =
		parseJsonObject(responseRecord?.body) ??
		parseJsonObject(responseRecord?.data) ??
		parseJsonObject(wrappedResponseRecord?.body) ??
		parseJsonObject(wrappedResponseRecord?.data) ??
		parseJsonObject(errorContextRecord?.data) ??
		parseJsonObject(errorResponseRecord) ??
		parseJsonObject(errorRecord?.body) ??
		parseJsonObject(causeRecord?.body);
	const headers =
		responseRecord?.headers ??
		wrappedResponseRecord?.headers ??
		errorRecord?.headers ??
		causeRecord?.headers;

	const statusCandidates = [
		responseRecord?.statusCode,
		responseRecord?.status,
		wrappedResponseRecord?.statusCode,
		wrappedResponseRecord?.status,
		errorRecord?.statusCode,
		errorRecord?.httpCode,
		causeRecord?.statusCode,
	];
	const statusCode = statusCandidates
		.map((status) => (typeof status === 'string' ? Number.parseInt(status, 10) : status))
		.find(
			(status): status is number =>
				typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599,
		);

	const networkCode = [errorRecord?.code, causeRecord?.code]
		.find((code): code is string => typeof code === 'string')
		?.toUpperCase();
	const rawMessage =
		(typeof body?.message === 'string' && body.message) ||
		(typeof errorRecord?.message === 'string' && errorRecord.message) ||
		'Domain lookup request failed.';
	const timedOut =
		(networkCode !== undefined && TIMEOUT_NETWORK_CODES.has(networkCode)) ||
		(statusCode === undefined && /\b(?:timed?\s*out|timeout)\b/i.test(rawMessage));
	const explicitRetryable = typeof body?.retryable === 'boolean' ? body.retryable : undefined;
	const retryable =
		explicitRetryable ??
		(timedOut ||
			(statusCode !== undefined && RETRYABLE_STATUS_CODES.has(statusCode)) ||
			(networkCode !== undefined && RETRYABLE_NETWORK_CODES.has(networkCode)));

	const requestIdFromBody =
		typeof body?.request_id === 'string' && body.request_id.length > 0
			? body.request_id
			: undefined;

	return {
		statusCode,
		body,
		requestId: extractRequestId(headers) ?? requestIdFromBody,
		errorType: typeof body?.error_type === 'string' ? body.error_type : undefined,
		retryable,
		retryAfter:
			typeof body?.retry_after === 'number' &&
			Number.isInteger(body.retry_after) &&
			body.retry_after >= 1 &&
			body.retry_after <= 300
				? body.retry_after
				: undefined,
		timedOut,
		message: sanitizeErrorMessage(rawMessage),
	};
}

function apiErrorPresentation(context: ApiErrorContext): {
	message: string;
	description: string;
} {
	if (context.timedOut) {
		return {
			message: 'Elvesora Domain Lookup timed out',
			description:
				'The client did not receive a completed response. The lookup credit state may be uncertain, so check the request with Elvesora support before retrying.',
		};
	}

	if (context.statusCode === 401) {
		return {
			message: 'Elvesora authentication failed',
			description: 'Check that the API key is active and belongs to the intended Elvesora team.',
		};
	}

	if (context.statusCode === 422) {
		const errors = validationErrors(context);
		const errorDetails = errors ? ` Validation errors: ${JSON.stringify(errors)}.` : '';
		return {
			message: 'Elvesora rejected the lookup input',
			description: `${context.message}${errorDetails} A validation response that reached the lookup endpoint may consume one lookup credit.`,
		};
	}

	if (context.statusCode === 429 && context.errorType === 'usage_limit') {
		return {
			message: 'Elvesora lookup credit limit reached',
			description: 'Wait for the subscription period to renew or upgrade the Elvesora plan.',
		};
	}

	if (context.statusCode === 429 && context.errorType === 'rate_limited') {
		const delay = context.retryAfter ? ` Retry after ${context.retryAfter} seconds.` : '';
		return {
			message: 'Elvesora provider is temporarily rate limited',
			description: `${context.message}${delay} This provider-throttled request did not consume a lookup credit.`,
		};
	}

	if (context.errorType === 'lookup_invalid_response') {
		return {
			message: 'Elvesora returned an unexpected response',
			description:
				'The lookup response did not match the published API contract. Contact Elvesora support before retrying.',
		};
	}

	if (context.retryable) {
		const delay = context.retryAfter ? ` Retry after ${context.retryAfter} seconds.` : '';
		return {
			message: 'Elvesora Domain Lookup is temporarily unavailable',
			description: `${context.message}${delay} A retry can consume another lookup credit.`,
		};
	}

	return {
		message: 'Elvesora Domain Lookup request failed',
		description: context.message,
	};
}

export function createElvesoraApiError(
	node: INode,
	error: unknown,
	itemIndex: number,
	fallbackRequestId?: string,
): NodeApiError {
	const context = extractApiErrorContext(error);
	const presentation = apiErrorPresentation(context);
	const requestId = context.requestId ?? fallbackRequestId;
	const sanitizedBody = sanitizeJsonValue(
		context.body ?? { message: context.message },
	) as JsonObject;
	const errorResponse = {
		...sanitizedBody,
		...(context.errorType ? { error_type: context.errorType } : {}),
		...(typeof context.retryable === 'boolean' ? { retryable: context.retryable } : {}),
		...(context.retryAfter ? { retry_after: context.retryAfter } : {}),
		...(requestId ? { request_id: requestId } : {}),
	} as JsonObject;
	const requestIdDescription = requestId ? ` Request ID: ${requestId}.` : '';

	return new NodeApiError(node, errorResponse, {
		message: presentation.message,
		description: `${presentation.description}${requestIdDescription}`,
		httpCode: context.statusCode ? String(context.statusCode) : undefined,
		itemIndex,
	});
}

export function continueOnFailOutput(error: unknown): IDataObject {
	const context = extractApiErrorContext(error);
	const errors = validationErrors(context);

	return {
		error: context.message,
		status_code: context.statusCode ?? null,
		error_type: context.errorType ?? null,
		retryable: context.retryable ?? false,
		retry_after: context.retryAfter ?? null,
		request_id: context.requestId ?? null,
		validation_errors: errors ?? null,
	};
}
