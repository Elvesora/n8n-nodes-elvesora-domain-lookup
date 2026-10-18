'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ElvesoraApi } = require('../dist/credentials/ElvesoraApi.credentials.js');
const { resolveElvesoraBaseUrl } = require('../dist/nodes/ElvesoraDomainLookup/baseUrl.js');

test('credential protects the API key and authenticates with a bearer token', async () => {
	const credential = new ElvesoraApi();
	const apiKey = credential.properties.find((property) => property.name === 'apiKey');

	assert.equal(credential.name, 'elvesoraApi');
	assert.equal(apiKey.typeOptions.password, true);
	assert.equal(apiKey.required, true);
	const options = await credential.authenticate(
		{ apiKey: 'test-secret' },
		{ method: 'POST', url: 'https://prospecting.elvesora.com/api/prospecting/company' },
	);
	assert.equal(options.headers.Authorization, 'Bearer test-secret');
});

test('credential test uses the authenticated non-billable ping endpoint', () => {
	const credential = new ElvesoraApi();

	assert.deepEqual(credential.test.request, {
		url: '/prospecting/ping',
		method: 'GET',
		sendCredentialsOnCrossOriginRedirect: false,
		headers: { Accept: 'application/json' },
	});
});

test('credential ping uses the configured base URL with the same redirect guard', async () => {
	const credential = new ElvesoraApi();
	const baseUrl = credential.properties.find((property) => property.name === 'baseUrl');
	assert.equal(baseUrl.default, 'https://prospecting.elvesora.com/api');
	assert.notEqual(baseUrl.required, true);

	for (const [configured, expected] of [
		[undefined, 'https://prospecting.elvesora.com/api'],
		['', 'https://prospecting.elvesora.com/api'],
		['http://127.0.0.1:8000/api/', 'http://127.0.0.1:8000/api'],
		['https://api.example.test/custom/api///', 'https://api.example.test/custom/api'],
	]) {
		const request = await credential.authenticate(
			{ apiKey: 'test-secret', baseUrl: configured },
			credential.test.request,
		);
		assert.equal(request.url, `${expected}/prospecting/ping`);
		assert.equal(request.method, 'GET');
		assert.equal(request.headers.Authorization, 'Bearer test-secret');
		assert.equal(request.headers.Accept, 'application/json');
		assert.equal(request.sendCredentialsOnCrossOriginRedirect, false);
	}
});

test('base URL accepts HTTPS and loopback HTTP without changing the API prefix', () => {
	for (const value of [undefined, null, '', '   ']) {
		assert.equal(resolveElvesoraBaseUrl(value), 'https://prospecting.elvesora.com/api');
	}
	for (const value of [
		'https://api.example.test/api',
		'https://api.example.test:8443/custom/api',
		'http://localhost:8000/api',
		'http://127.0.0.1:8000/api',
		'http://127.0.0.2:8000/api',
		'http://[::1]:8000/api',
	]) {
		assert.equal(resolveElvesoraBaseUrl(` ${value}/// `), value);
	}
});

test('invalid base URLs fail before credential authentication can send a request', async () => {
	const credential = new ElvesoraApi();
	for (const value of [
		false,
		42,
		{},
		'/api',
		'//api.example.test/api',
		'https:api.example.test/api',
		'https:///api.example.test/api',
		'ftp://api.example.test/api',
		'javascript:alert(1)',
		'http://api.example.test/api',
		'http://192.168.1.10/api',
		'http://localhost.example.test/api',
		'http://127.0.0.1.example.test/api',
		'https://user:password@api.example.test/api',
		'https://@api.example.test/api',
		'https://api.example.test/api?key=secret',
		'https://api.example.test/api?',
		'https://api.example.test/api#fragment',
		'https://api.example.test/api#',
		'https://api.example.test:65536/api',
		'https://api.example.test:0/api',
		'https://api.example.test:abc/api',
		'https://api.example.test\\other/api',
		'https://api.example.test/a\npi',
	]) {
		assert.throws(() => resolveElvesoraBaseUrl(value), /Base URL/);
		await assert.rejects(
			() =>
				credential.authenticate({ apiKey: 'test-secret', baseUrl: value }, credential.test.request),
			/Base URL/,
		);
	}
});
