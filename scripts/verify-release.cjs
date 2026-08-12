'use strict';

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function verifyReleaseTag(tag, version) {
	if (!tag) {
		throw new Error('A release tag is required.');
	}

	if (!SEMVER_PATTERN.test(tag)) {
		throw new Error(`Release tag "${tag}" is not an exact SemVer version without a v prefix.`);
	}

	if (!SEMVER_PATTERN.test(version)) {
		throw new Error(`package.json version "${version}" is not a valid SemVer version.`);
	}

	if (tag !== version) {
		throw new Error(`Release tag "${tag}" does not match package.json version "${version}".`);
	}
}

if (require.main === module) {
	const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
	const tag = process.argv[2] || process.env.GITHUB_REF_NAME;

	try {
		verifyReleaseTag(tag, packageJson.version);
		process.stdout.write(
			`Verified release tag ${tag} matches package version ${packageJson.version}.\n`,
		);
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exit(1);
	}
}

module.exports = { verifyReleaseTag };
