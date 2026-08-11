# Contributing

Thank you for helping improve the Elvesora Domain Lookup node.

## Before opening a change

1. Search existing issues and pull requests.
2. Open an issue for behavior changes or additions that affect the public node contract.
3. Never include API keys, customer data, or production response bodies containing private information.

## Development workflow

Use Node.js 24.x, matching the CI and release jobs.

```sh
npm install
npm run check
```

Use TypeScript, preserve one-input-item-to-one-output-item pairing, and use n8n's credential-aware HTTP helper. Node runtime code must not access environment variables or the filesystem and must not add external runtime dependencies.

Every behavior change should include focused tests and documentation. Pull requests must pass formatting, linting, build, tests, and package dry-run checks.

## Commit and release policy

Use focused commits. Maintainers publish releases from GitHub Actions with npm provenance; contributors must not publish package forks under the official package name.
