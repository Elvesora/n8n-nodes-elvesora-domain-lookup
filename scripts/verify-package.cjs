'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const npmExecPath = process.env.npm_execpath;
const command = npmExecPath || (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = npmExecPath
	? [npmExecPath, 'pack', '--dry-run', '--json']
	: ['pack', '--dry-run', '--json'];
const executable = npmExecPath ? process.execPath : command;
const result = spawnSync(executable, args, {
	cwd: process.cwd(),
	encoding: 'utf8',
	env: process.env,
	shell: false,
});

if (result.status !== 0) {
	process.stderr.write(result.stderr || result.stdout || 'npm pack failed.\n');
	process.exit(result.status ?? 1);
}

let packResult;
try {
	[packResult] = JSON.parse(result.stdout);
} catch {
	process.stderr.write(`Could not parse npm pack output:\n${result.stdout}\n${result.stderr}`);
	process.exit(1);
}

assert.ok(packResult, 'npm pack returned no package result.');
const packedFiles = new Set(packResult.files.map(({ path }) => path.replaceAll('\\', '/')));
const requiredFiles = new Set([
	'LICENSE.md',
	'README.md',
	'package.json',
	'examples/company-domain-lookup.workflow.json',
	'dist/icons/elvesora.svg',
	'dist/icons/elvesora.dark.svg',
	'dist/nodes/ElvesoraDomainLookup/ElvesoraDomainLookup.node.json',
	'dist/nodes/ElvesoraDomainLookup/transport.js',
	'dist/nodes/ElvesoraDomainLookup/types.js',
	'dist/nodes/ElvesoraDomainLookup/utils.js',
	...packageJson.n8n.credentials,
	...packageJson.n8n.nodes,
]);
const missingFiles = [...requiredFiles].filter((file) => !packedFiles.has(file));
assert.deepEqual(missingFiles, [], `Package is missing required files: ${missingFiles.join(', ')}`);

const forbiddenFiles = [...packedFiles].filter(
	(path) =>
		path.startsWith('test/') ||
		path.startsWith('node_modules/') ||
		path.startsWith('.github/') ||
		path.endsWith('.tsbuildinfo'),
);
assert.deepEqual(
	forbiddenFiles,
	[],
	`Package contains development-only files: ${forbiddenFiles.join(', ')}`,
);

process.stdout.write(
	`Verified ${packResult.filename}: ${packResult.entryCount} files, ${packResult.size} bytes.\n`,
);
