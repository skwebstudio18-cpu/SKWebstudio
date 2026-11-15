# Security reporting

For a suspected vulnerability, contact the maintainer using the email published in `config/public-business.mjs`. Do not open a public issue containing exploit details or sensitive records. If GitHub private vulnerability reporting is available on the repository, it is another private reporting option.

Include the affected commit, your local environment, reproducible steps using fictional data, expected and actual behaviour, and the likely impact. Never include working credentials, session cookies, private client documents, or payment details. There is currently no published security-response SLA or supported-release matrix.

Only test your own local checkout and isolated test accounts. Production testing needs the operator's separate permission. The existing tests use local databases and provider stubs; passing them does not certify a production deployment.

## Deployment boundaries

- Keep `.env`, `.data/`, `.netlify/`, private billing configuration, and uploaded documents outside Git.
- Keep server provider credentials out of browser bundles and public build output.
- Production Identity is invite-only and requires email confirmation.
- Payment references must be bank-verified by the administrator before recording receipt of funds.
- WhatsApp delivery stays disabled until server credentials, an approved template, and client consent are configured.
- Preserve tenant isolation, server-side role checks, origin/CSRF checks, AI quotas, and document access checks when changing the code.
