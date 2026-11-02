# SKTS website and project portal

Source for the SKTS public website and its authenticated Admin and Client project workspaces.

- Public website: https://lighthearted-shortbread-30a0d3.netlify.app/
- Admin sign-in: https://lighthearted-shortbread-30a0d3.netlify.app/portal/admin/
- Client sign-in: https://lighthearted-shortbread-30a0d3.netlify.app/portal/client/
- Source repository: https://github.com/skwebstudio18-cpu/SKWebstudio

## Features

The public website includes service enquiries and manual UPI payment references handled by Netlify Forms. The project portal includes private client invitations, service milestones, weighted progress charts, budgets, bank-verified payments, document versions and reviews, delivery acceptance, and printable project reports.

The public **Ask SKTS** assistant provides fixed service information and optional streamed AI guidance through Netlify AI Gateway and the official OpenAI SDK. Service cards, fixed price answers and AI grounding share `SKTS-netlify/services.mjs`. AI has no tools and cannot access project records, change accounts, verify payments or submit enquiries. Its quote button opens the normal enquiry form for the visitor to complete.

AI currently uses `gpt-6-luna`, checked against Netlify's provider catalogue on 2 November 2026. Usage consumes existing Netlify credits; no plan upgrade or recharge setting is changed. Persistent transactional limits allow at most 20 provider requests per India day across the site and five per network, plus eight HTTP requests per minute per network/domain. Input, history and output are bounded; automatic SDK retries are disabled. Failed provider attempts still consume an allowance. Set `SKTS_AI_ENABLED=false` in the Functions environment and redeploy to disable AI replies; fixed service guidance remains available.

No chat transcripts or raw IP addresses are stored by this application. Only daily counters with hashed network addresses are stored; old counters are cleared on subsequent requests. Visitors see a processing notice before sending messages, and the privacy notice explains Netlify/OpenAI processing. Chat text stays in page memory until cleared or reloaded. Local `npm run dev` provides service guidance without an AI gateway; real AI needs Netlify compute with its runtime credentials.

Admin and Client login pages and dashboards have distinct visual themes. The server verifies the account role for every protected operation; selecting an Admin entry URL never grants a role. Customers can access only their own records.

The Meta WhatsApp reminder integration is prepared but disabled until server credentials, an approved message template and client consent are configured. A submitted payment reference never marks money as received without admin bank verification.

## Local development

Use Node.js 24.

```powershell
npm ci
npm run build
npm test
npm run dev
```

Open http://localhost:8080/portal/admin/ to set up the local owner account. Local accounts and records stay on the local computer and are separate from production. The local server binds to loopback only. Stop it with Ctrl+C.

The 98 tests cover authentication, account isolation, invitations, documents, service progress, payments, delivery acceptance, reminders, AI request validation, stream failures and concurrent daily AI quotas. Tests use isolated fixtures and fake credentials.

## Deployment

The Netlify build command is `npm run build`, the publish directory is `SKTS-netlify`, and the function directory is `netlify/functions`. Production uses Netlify Identity, Functions, Database and private Blobs storage. Keep Identity invite-only with email confirmation required.

Use the authenticated Netlify CLI for the existing project. Run the build before publishing:

```powershell
npm run build
npx netlify deploy --prod --context production
```

The SQL migrations under `netlify/database/migrations` deploy through the Netlify build. Do not deploy only the static folder when changing the backend. A Git push currently does not trigger a Netlify deploy; continuous deployment is not configured.

## Private configuration and records

`.env.example` lists required environment variable names without credentials. Set actual server secrets privately in the local environment or Netlify's environment variable settings. Never put provider credentials in browser bundles.

`config/business.example.mjs` is an optional invoice-settings template. Copy it to the ignored `config/business.mjs` for private billing details. The invoice feature is a later stage.

The Git repository excludes local databases, uploaded client documents, secrets, deployment metadata, backup/release archives, private operational notes and verification screenshots. Production records live in the database and private object storage, not in this repository.
