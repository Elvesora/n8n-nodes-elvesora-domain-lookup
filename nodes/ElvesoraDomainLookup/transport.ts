import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
} from 'n8n-workflow';
import { resolveElvesoraBaseUrl } from './baseUrl';
import {
	ELVESORA_LOOKUP_PATH,
	ELVESORA_REQUEST_TIMEOUT_MS,
	type ElvesoraHttpResponse,
} from './types';

export async function elvesoraApiRequest(
	this: IExecuteFunctions,
	body: IDataObject,
	requestId?: string,
): Promise<ElvesoraHttpResponse> {
	const credentials = await this.getCredentials('elvesoraApi');
	let baseUrl: string;
	try {
		baseUrl = resolveElvesoraBaseUrl(credentials.baseUrl);
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error);
	}
	const headers: IDataObject = {
		Accept: 'application/json',
		'Content-Type': 'application/json',
	};

	if (requestId) headers['X-Request-Id'] = requestId;

	const options: IHttpRequestOptions = {
		method: 'POST',
		url: `${baseUrl}${ELVESORA_LOOKUP_PATH}`,
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
