import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { elvesoraApiRequest } from './transport';
import {
	continueOnFailOutput,
	createElvesoraApiError,
	extractRequestId,
	rawLookupResponse,
	simplifyLookupResponse,
	validateAdditionalContext,
	validateCompanyName,
	validateCompletedLookupResponse,
	validateRequestId,
} from './utils';

export class ElvesoraDomainLookup implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Elvesora Domain Lookup',
		name: 'elvesoraDomainLookup',
		icon: {
			light: 'file:../../icons/elvesora.svg',
			dark: 'file:../../icons/elvesora.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Resolve company names to likely official domains using Elvesora',
		usableAsTool: true,
		defaults: {
			name: 'Elvesora Domain Lookup',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'elvesoraApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Lookup Company Domain',
						value: 'lookupDomain',
						action: 'Lookup company domain',
						description: 'Resolve a company name to its likely official website domain',
					},
				],
				default: 'lookupDomain',
			},
			{
				displayName: 'Company Name',
				name: 'companyName',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. Acme Corporation',
				description: 'Company, brand, or organization name to resolve (maximum 255 characters)',
			},
			{
				displayName: 'Additional Context',
				name: 'additionalContext',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				placeholder: 'e.g. United States, industrial manufacturing',
				description:
					'Optional country, industry, location, or product context used to disambiguate similar names (maximum 2,000 characters)',
			},
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description:
					'Whether to return a simplified version of the response instead of the raw data',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Request ID',
						name: 'requestId',
						type: 'string',
						default: '',
						placeholder: 'e.g. crm-import-2026-08-11',
						description:
							'Optional tracing ID containing 8 to 128 letters, numbers, periods, underscores, colons, or hyphens',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		if (operation !== 'lookupDomain') {
			throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`);
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			let requestIdForError: string | undefined;
			try {
				const companyName = validateCompanyName(this.getNodeParameter('companyName', itemIndex));
				if (!companyName.ok) {
					throw new NodeOperationError(this.getNode(), companyName.message, { itemIndex });
				}

				const additionalContext = validateAdditionalContext(
					this.getNodeParameter('additionalContext', itemIndex, ''),
				);
				if (!additionalContext.ok) {
					throw new NodeOperationError(this.getNode(), additionalContext.message, { itemIndex });
				}

				const nodeOptions = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
				const requestId = validateRequestId(nodeOptions.requestId);
				if (!requestId.ok) {
					throw new NodeOperationError(this.getNode(), requestId.message, { itemIndex });
				}
				requestIdForError = requestId.value;

				const body: IDataObject = {
					company_name: companyName.value,
				};
				if (additionalContext.value) body.additional_context = additionalContext.value;

				const response = await elvesoraApiRequest.call(this, body, requestId.value);
				const responseRequestId = extractRequestId(response.headers);
				const completedResponse = validateCompletedLookupResponse(response.body);
				if (!completedResponse.ok) {
					throw Object.assign(new Error(completedResponse.message), {
						response: {
							statusCode: 502,
							headers: response.headers,
							body: {
								message: completedResponse.message,
								error_type: 'lookup_invalid_response',
								retryable: true,
								retry_after: 60,
								...(responseRequestId ? { request_id: responseRequestId } : {}),
							},
						},
					});
				}

				const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
				const json = simplify
					? simplifyLookupResponse(completedResponse.value)
					: rawLookupResponse(completedResponse.value, responseRequestId);

				returnData.push({
					json,
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				const nodeError =
					error instanceof NodeOperationError
						? error
						: createElvesoraApiError(this.getNode(), error, itemIndex, requestIdForError);

				if (!this.continueOnFail()) throw nodeError;

				returnData.push({
					json: continueOnFailOutput(nodeError),
					pairedItem: { item: itemIndex },
				});
			}
		}

		return [returnData];
	}
}
