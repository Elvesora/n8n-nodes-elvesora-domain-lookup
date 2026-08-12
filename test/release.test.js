'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyReleaseTag } = require('../scripts/verify-release.cjs');

test('release tag must exactly match the package version', () => {
	assert.doesNotThrow(() => verifyReleaseTag('0.1.0', '0.1.0'));
	assert.doesNotThrow(() => verifyReleaseTag('1.2.3-rc.1', '1.2.3-rc.1'));

	assert.throws(() => verifyReleaseTag('0.1.1', '0.1.0'), /does not match package\.json version/);
});

test('release tag rejects v prefixes and non-SemVer tag names', () => {
	for (const tag of ['v0.1.0', 'foo.bar.baz', '01.2.3', '1.2', '']) {
		assert.throws(() => verifyReleaseTag(tag, '0.1.0'));
	}
});
