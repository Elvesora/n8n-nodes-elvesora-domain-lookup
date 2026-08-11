'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ElvesoraApi } = require('../dist/credentials/ElvesoraApi.credentials.js');

test('credential protects the API key and authenticates with a bearer token', () => {
	const credential = new ElvesoraApi();
	const apiKey = credential.properties.find((property) => property.name === 'apiKey');

	assert.equal(credential.name, 'elvesoraApi');
	assert.equal(apiKey.typeOptions.password, true);
	assert.equal(apiKey.required, true);
	assert.equal(
		credential.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiKey}}',
	);
});

test('credential test uses the authenticated non-billable ping endpoint', () => {
	const credential = new ElvesoraApi();

	assert.deepEqual(credential.test.request, {
		baseURL: 'https://prospecting.elvesora.com/api',
		url: '/prospecting/ping',
		method: 'GET',
		sendCredentialsOnCrossOriginRedirect: false,
		headers: { Accept: 'application/json' },
	});
});
