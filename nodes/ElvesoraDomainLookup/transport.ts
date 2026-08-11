import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import {
	ELVESORA_API_BASE_URL,
	ELVESORA_LOOKUP_PATH,
	ELVESORA_REQUEST_TIMEOUT_MS,
	type ElvesoraHttpResponse,
} from './types';

export async function elvesoraApiRequest(
	this: IExecuteFunctions,
	body: IDataObject,
	requestId?: string,
): Promise<ElvesoraHttpResponse> {
	const headers: IDataObject = {
		Accept: 'application/json',
		'Content-Type': 'application/json',
	};

	if (requestId) headers['X-Request-Id'] = requestId;

	const options: IHttpRequestOptions = {
		method: 'POST',
		url: `${ELVESORA_API_BASE_URL}${ELVESORA_LOOKUP_PATH}`,
		headers,
		body,
		json: true,
		timeout: ELVESORA_REQUEST_TIMEOUT_MS,
		returnFullResponse: true,
		sendCredentialsOnCrossOriginRedirect: false,
	};

	return (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'elvesoraApi',
		options,
	)) as ElvesoraHttpResponse;
}
