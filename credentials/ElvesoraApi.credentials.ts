import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

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
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://prospecting.elvesora.com/api',
			url: '/prospecting/ping',
			method: 'GET',
			sendCredentialsOnCrossOriginRedirect: false,
			headers: {
				Accept: 'application/json',
			},
		},
	};
}
