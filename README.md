# n8n-nodes-elvesora-domain-lookup

[![CI](https://github.com/Elvesora/n8n-nodes-elvesora-domain-lookup/actions/workflows/ci.yml/badge.svg)](https://github.com/Elvesora/n8n-nodes-elvesora-domain-lookup/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

This n8n community node resolves a company, brand, or organization name to its likely official website domain using the [Elvesora Company Domain Lookup API](https://www.elvesora.com/docs/domain-lookup). Each result includes confidence routing, review guidance, match reasons, and remaining lookup credits.

## Features

- Resolves one company per incoming n8n item.
- Accepts optional country, industry, location, or product context for ambiguous names.
- Treats a completed no-match as successful workflow output instead of an execution error.
- Provides simplified output for common automations and complete raw API output for advanced workflows.
- Preserves n8n item pairing for multi-item executions.
- Returns the API request ID in raw and error output for support and request tracing.
- Validates input before sending the request, avoiding credit-consuming validation calls for empty or oversized values.
- Uses n8n's encrypted credential storage and authenticated HTTP helper.
- Does not automatically retry requests that could consume another lookup credit.

## Installation

### Verified community-node installation

After n8n verification, instance owners can find **Elvesora Domain Lookup** in the nodes panel and install it there.

### Self-hosted n8n

Before or without n8n verification, an instance owner can install the package from **Settings > Community Nodes** using:

```text
n8n-nodes-elvesora-domain-lookup
```

For queue-mode or command-line installations, install it in the n8n community-node directory and restart every n8n process:

```sh
cd ~/.n8n/nodes
npm install n8n-nodes-elvesora-domain-lookup
```

Community nodes installed directly from npm are available only on self-hosted n8n until n8n approves the package for Cloud and nodes-panel discovery.

## Credentials

1. [Create an Elvesora account](https://www.elvesora.com/signup) or sign in.
2. Open the Domain Lookup **API Integration** page at `https://prospecting.elvesora.com/integrations/api`.
3. Create or copy the team API key.
4. In n8n, create an **Elvesora API** credential and paste the key into the password-protected **API Key** field.
5. Save the credential. n8n verifies it against the authenticated token-check endpoint, which does not consume a lookup credit.

Treat the API key as a secret. Rotate it in Elvesora if it is exposed or no longer needed.

## Node operation

### Lookup Company Domain

| Parameter            | Required | Description                                                                                                                           |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Company Name         | Yes      | Company, brand, or organization name. Maximum 255 characters.                                                                         |
| Additional Context   | No       | Country, industry, location, or product context used to disambiguate similar names. Maximum 2,000 characters.                         |
| Simplify             | No       | Returns the ten most useful routing fields when enabled. Returns the complete API response plus its tracing request ID when disabled. |
| Options > Request ID | No       | Caller-generated tracing identifier using 8–128 letters, numbers, periods, underscores, colons, or hyphens.                           |

The node makes one API request for each incoming item. A workflow containing 100 input items therefore makes up to 100 lookup requests and can consume up to 100 lookup credits.

## Output

### Simplified output

With **Simplify** enabled, the node returns at most ten fields:

```json
{
	"found": true,
	"company_name": "Acme Corporation",
	"domain": "acme.com",
	"confidence": 92,
	"confidence_band": "high",
	"review_recommended": false,
	"is_live": true,
	"cached": false,
	"remaining": 95,
	"limit": 100
}
```

`confidence` is an ordinal routing score, not a calibrated probability:

| Band       | Score  | Review recommendation                            |
| ---------- | ------ | ------------------------------------------------ |
| `high`     | 85–100 | Automatic review is not recommended.             |
| `review`   | 60–84  | Review is recommended.                           |
| `low`      | 1–59   | Review is recommended.                           |
| `no_match` | 0      | Keep the domain blank and review or add context. |

### Raw output

With **Simplify** disabled, the node returns the complete API response plus the response header's `request_id`:

- `success`, `message`
- `company_name`, `normalized_company_name`
- `domain`, `linkedin_url`
- `industry`, `sub_industry`, `sector`
- `confidence`, `confidence_band`, `review_recommended`
- `is_live`, `reasons`, `lower_reasons`
- `cached`, `found`
- `remaining`, `limit`
- `request_id` added by this node from the `X-Request-Id` response header

### Completed no-match

A no-match is a successful HTTP 200 outcome. The node returns `found: false`, `domain: null`, `confidence: 0`, `confidence_band: "no_match"`, and `review_recommended: true`. Do not route a no-match through the workflow's technical-error path.

## Errors, retries, and credits

The node deliberately does not retry automatically. Use n8n workflow error handling when a retry is appropriate and account for the following behavior:

Enabling n8n's node-level **Retry On Fail** starts a new lookup attempt and can consume another credit. The optional request ID is for tracing only; it is not an idempotency key and cannot prevent duplicate billing. If the client times out before receiving a response, the attempt's billing state is uncertain until it is checked with Elvesora support using the request ID.

| Response                       | Meaning                                       | Retry guidance                                                                    | Credit behavior                                           |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 401                            | Missing, invalid, or revoked API key          | Correct the credential; do not retry unchanged.                                   | No lookup is performed.                                   |
| 422                            | Invalid lookup input or dependency validation | Correct the input; do not retry unchanged.                                        | A request that reached validation can consume one credit. |
| 429 `usage_limit`              | Subscription-period allowance exhausted       | Wait for renewal or upgrade; do not retry immediately.                            | No credit is consumed.                                    |
| 429 `rate_limited`             | Lookup provider throttling                    | Retry after the returned `retry_after` delay.                                     | The reservation is released.                              |
| 502/503 with `retryable: true` | Temporary provider or response failure        | Retry after `retry_after` if the workflow accepts another possible credit charge. | A committed attempt can consume one credit.               |
| 200 with `found: false`        | Completed no-match                            | Add context or route to review; it is not a technical error.                      | One credit is consumed.                                   |

When **Continue On Fail** is enabled in n8n, a failed item returns:

```json
{
	"error": "Domain lookup request failed.",
	"status_code": 503,
	"error_type": "lookup_timeout",
	"retryable": true,
	"retry_after": 60,
	"request_id": "7d9df214-0f4d-4c0f-a2ff-e04fda4d09cb",
	"validation_errors": null
}
```

For a `422` response, `validation_errors` contains the API's field-level error arrays. It is `null` for other failures.

## Example workflow

Import [`examples/company-domain-lookup.workflow.json`](examples/company-domain-lookup.workflow.json), choose an **Elvesora API** credential, and execute the workflow. Replace the example company name with an expression such as `{{ $json.company_name }}` when connecting the node to CRM, spreadsheet, or webhook data.

## Data handling

The node sends the company name, optional context, and optional request ID to the Elvesora Domain Lookup API. It does not read environment variables, access the filesystem, execute subprocesses, or send data to unrelated services. n8n encrypts the saved API credential using the n8n instance's credential encryption configuration.

Review the [Elvesora Privacy Policy](https://www.elvesora.com/privacy-policy) and [Terms of Service](https://www.elvesora.com/terms-of-use) before processing customer data.

## Documentation and support

- [Domain Lookup API documentation](https://www.elvesora.com/docs/domain-lookup)
- [OpenAPI 3.1 contract](https://prospecting.elvesora.com/docs/domain-lookup-openapi.yaml)
- [Postman collection](https://prospecting.elvesora.com/docs/elvesora-domain-lookup.postman_collection.json)
- [Product overview](https://www.elvesora.com/products/domain-lookup)
- [Elvesora contact form](https://www.elvesora.com/contact-us)
- [Package issues](https://github.com/Elvesora/n8n-nodes-elvesora-domain-lookup/issues)

Include the n8n version, package version, operation settings with secrets removed, error type, and request ID when reporting a problem.

## Compatibility

- Minimum supported n8n version: 2.34.4
- Runtime smoke-tested with n8n 2.34.4 on Node.js 24.14.0

Earlier n8n versions are not part of this release's tested support range.

## Development

Requirements:

- Node.js 24.x for the tested development and release toolchain (the package runtime declares n8n's Node.js 22.22.0 minimum)
- npm
- Git

```sh
npm install
npm run lint
npm test
npm run pack:dry-run
```

Run a local n8n development instance with the node loaded:

```sh
npm run dev
```

The complete local verification check is:

```sh
npm run check
```

## Release

Releases must be published by the repository's GitHub Actions workflow with npm provenance. The source repository must be public before publishing or submitting the node for n8n verification.

For the first `0.1.0` release, the npm package does not exist yet, so Trusted Publishing cannot be configured. Create a short-lived granular npm token with **Read and write**, **All Packages**, and **Bypass 2FA** enabled, and add it as the repository's `NPM_TOKEN` Actions secret. `All Packages` is required for this bootstrap because the unpublished package cannot yet be selected. After the reviewed `0.1.0` package files are committed and pushed, create and push the exact `0.1.0` Git tag; do not run the interactive release command, because the package already declares `0.1.0`. The tag triggers the GitHub workflow, which performs the npm publish with provenance. Do not publish from a developer machine.

After the workflow publishes `0.1.0`, create a GitHub Release for the existing `0.1.0` tag so the changelog's release link resolves:

```sh
gh release create 0.1.0 --verify-tag --generate-notes
```

After the first package exists, configure npm Trusted Publishing for:

- GitHub owner: `Elvesora`
- Repository: `n8n-nodes-elvesora-domain-lookup`
- Workflow: `publish.yml`
- Environment: leave blank
- Allowed action: `npm publish`

Remove the `NPM_TOKEN` repository secret before the next reviewed release so that release proves the OIDC path. After that OIDC publication succeeds, revoke the bootstrap token in npm and set the package's **Publishing access** to **Require two-factor authentication and disallow tokens**. Future SemVer tags then publish through short-lived GitHub OIDC credentials instead of a long-lived npm token.

After publication, run:

```sh
npx @n8n/scan-community-package n8n-nodes-elvesora-domain-lookup@0.1.0
```

Submit a passing provenance-attested package through the [n8n Creator Portal](https://creators.n8n.io/nodes).

## License

[MIT](LICENSE.md) © 2026 Elvesora
