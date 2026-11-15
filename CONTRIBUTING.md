# Contributing to SKTS

SKTS is a business website and client project portal licensed under the [MIT licence](LICENSE). Third-party assets retain their own notices. By contributing, you agree that your contribution is available under the project licence; only submit work you have the right to contribute.

## Discuss a change

Use GitHub issues for reproducible bugs and small, concrete proposals. Explain the expected behaviour, the actual result, and how to reproduce it. Include your Node version and operating system. Remove client details, passwords, tokens, payment information, and private documents from examples and screenshots.

For a suspected vulnerability, follow [SECURITY.md](SECURITY.md) instead of posting details publicly.

## Local setup

Use Node.js 24, matching `.nvmrc`, and the committed npm lockfile:

```sh
npm ci
npm run build
npm test
npm run dev
```

Open `http://localhost:8080/portal/admin/`. The local owner email comes from `config/public-business.mjs`; the setup screen shows the configured address. Create a password used only for this local copy. Local accounts are separate from production Netlify Identity accounts. Local databases and documents are stored in the ignored `.data/` directory.

The document tests queue connections to NetlifyDB's single PGlite backend so transactions cannot interleave across virtual client sessions. They still submit concurrent requests and check every saved version. These fixture tests do not prove row-lock behaviour across separate production PostgreSQL sessions.

No production credentials are needed for the default local checks. Leave WhatsApp sending disabled and use the tests' fictional records. If a local `.env` is needed, copy `.env.example` and keep actual values out of Git. Real AI replies require the Netlify runtime; local development supplies fixed service guidance.

The local server uses port 8080 by default. Set `SKTS_LOCAL_PORT` to another unused port when necessary. Stop the server with Ctrl+C.

## Files to edit

- Public page content: `src/site/template.html` and `src/site/service-details.html`.
- Page generation and redirects: `tools/site-pages.mjs`.
- Portal source: `src/portal/`.
- Server behaviour: `server/`; cloud adapters: `netlify/functions/`.
- Database changes: add a migration under `netlify/database/migrations/`, with local authentication migrations under `server/local/migrations/` where appropriate.
- Tests: `tests/`.

`npm run build` regenerates public pages and the browser bundles in `SKTS-netlify/`. Change the source rather than editing generated output alone, and inspect the resulting diff for unrelated changes.

## Before opening a pull request

1. Keep the change focused and explain the user-visible problem it solves.
2. Run `npm run build` and `npm test` from a clean dependency installation.
3. Add a meaningful regression test for behaviour changes, especially account isolation, invitations, document permissions, payment verification, and AI limits.
4. Describe validation and any environment limitations in the pull request.
5. Check that the diff contains no credentials, local databases, deployment metadata, or real client records.

Do not deploy the production site, send reminders, or change provider settings as part of a contribution. Use local fixtures; discuss any production validation separately with the maintainer.
