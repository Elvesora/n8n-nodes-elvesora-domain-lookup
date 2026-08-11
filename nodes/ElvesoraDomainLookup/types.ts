import type { IDataObject } from 'n8n-workflow';

export const ELVESORA_API_BASE_URL = 'https://prospecting.elvesora.com/api';
export const ELVESORA_LOOKUP_PATH = '/prospecting/company';
export const ELVESORA_REQUEST_TIMEOUT_MS = 100_000;
export const MAX_COMPANY_NAME_LENGTH = 255;
export const MAX_ADDITIONAL_CONTEXT_LENGTH = 2_000;
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;

export type ConfidenceBand = 'high' | 'review' | 'low' | 'no_match';

export interface CompletedLookupResponse extends IDataObject {
	success: true;
	message: string;
	company_name: string;
	normalized_company_name: string | null;
	domain: string | null;
	linkedin_url: string | null;
	industry: string | null;
	sub_industry: string | null;
	sector: string | null;
	confidence: number;
	confidence_band: ConfidenceBand;
	review_recommended: boolean;
	is_live: boolean | null;
	reasons: string[];
	lower_reasons: string[];
	cached: boolean;
	found: boolean;
	remaining: number;
	limit: number;
}

export interface ElvesoraHttpResponse {
	body: unknown;
	headers?: unknown;
	statusCode?: number;
}

export interface ApiErrorContext {
	statusCode?: number;
	body?: IDataObject;
	requestId?: string;
	errorType?: string;
	retryable?: boolean;
	retryAfter?: number;
	timedOut: boolean;
	message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };
