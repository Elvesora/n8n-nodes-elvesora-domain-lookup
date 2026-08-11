# Security Policy

## Supported versions

Security fixes are applied to the latest published release. Upgrade to the latest version before reporting a problem that may already be resolved.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or exposed credential. Email `support@elvesora.com` with:

- the affected package version;
- the impact and reproduction steps;
- relevant logs with credentials and customer data removed; and
- a safe way to contact you.

Elvesora will acknowledge the report, investigate it privately, and coordinate disclosure and remediation when appropriate.

Immediately revoke and regenerate any API key that may have been exposed.

## Release integrity

Official releases are published only by the repository's GitHub Actions workflow with npm provenance. The published package declares no runtime dependencies, and its package verifier rejects bundled `node_modules`, tests, CI workflow files, and build caches. Development and peer-toolchain advisories are monitored separately through Dependabot and upstream n8n releases.
