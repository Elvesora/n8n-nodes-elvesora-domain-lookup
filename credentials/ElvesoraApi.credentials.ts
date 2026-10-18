import type {
	IAuthenticate,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';
import { resolveElvesoraBaseUrl } from '../nodes/ElvesoraDomainLookup/baseUrl';
import { ELVESORA_API_BASE_URL } from '../nodes/ElvesoraDomainLookup/types';

export class ElvesoraApi implements ICredentialType {
	name = 'elvesoraApi';

	displayName = 'Elvesora API';

	icon: Icon = {
		light: 'file:../icons/elvesora.svg',
		dark: 'file:../icons/elvesora.dark.svg',
	};

	documentationUrl = 'https://www.elvesora.com/docs/domain-lookup';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Team API key created in the Elvesora Domain Lookup API settings',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: ELVESORA_API_BASE_URL,
			description:
				'API base URL including /api. Use HTTPS, or a loopback HTTP URL for local development.',
		},
	];

	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		const baseUrl = resolveElvesoraBaseUrl(credentials.baseUrl);
		return {
			...requestOptions,
			url: requestOptions.url.startsWith('/')
				? `${baseUrl}${requestOptions.url}`
				: requestOptions.url,
			headers: {
				...requestOptions.headers,
				Authorization: `Bearer ${credentials.apiKey}`,
			},
		};
	};

	test: ICredentialTestRequest = {
		request: {
			url: '/prospecting/ping',
			method: 'GET',
			sendCredentialsOnCrossOriginRedirect: false,
			headers: {
				Accept: 'application/json',
			},
		},
	};
}
