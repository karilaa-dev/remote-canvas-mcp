# Canvas LMS MCP Server (Remote)

A remote [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for [Canvas LMS](https://www.instructure.com/canvas), deployed on Cloudflare Workers. Connect it to Claude (or any MCP client) and interact with your Canvas courses, assignments, grades, and more through natural language.

Based on [mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms), ported to run as a remote MCP server with multi-user support. Tools are **auto-synced** from upstream — run `npm run sync` to regenerate.

## Features

- **Remote MCP** — runs on Cloudflare Workers, no local install needed
- **Multi-user** — each user provides their own Canvas credentials during the OAuth flow
- **Secure credential storage** — Canvas API tokens are encrypted at rest with AES-256-GCM
- **No external auth required** — users enter Canvas credentials directly, no third-party sign-in needed
- **Timezone-aware results** — users select a timezone during setup and timestamp results include local `_local` companion fields
- **Read-only Canvas access** — only tools that read Canvas data are exposed
- **39 Canvas tools** — courses, assignments, submissions, modules, pages, discussions, quizzes, files, calendar, conversations, rubrics, accounts, and more
- **Auto-sync from upstream** — tools, types, and API methods are generated from [mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms) with zero manual porting

## Prerequisites

- A [Cloudflare](https://cloudflare.com) account
- A Canvas LMS API token (each user provides their own)
- Node.js and npm

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd remote-canvas-mcp
npm install
```

### 2. Create a KV namespace

```bash
npx wrangler kv namespace create OAUTH_KV
```

Update the `id` in `wrangler.jsonc` under `kv_namespaces` with the returned namespace ID.

### 3. Update `wrangler.jsonc`

Set your `account_id` in the config file (find it in the Cloudflare dashboard).

### 4. Set secrets

```bash
npx wrangler secret put COOKIE_ENCRYPTION_KEY
```

`COOKIE_ENCRYPTION_KEY` can be any random string (e.g. `openssl rand -hex 16`). It is used for cookie signing and credential encryption.

### 5. Deploy

```bash
npm run deploy
```

Your server will be available at `https://<your-worker>.workers.dev/mcp`.

If you use Cloudflare Workers Builds from GitHub, the default deploy command is enough. `npm run deploy` is available for local deploys.

## Connecting from Claude

1. Open Claude Desktop or claude.ai
2. Go to **Settings > Integrations > Add MCP Server**
3. Enter your server URL: `https://<your-worker>.workers.dev/mcp`
4. An approval page will open — enter your **Canvas domain** (e.g. `school.instructure.com`) and **Canvas API token**
5. Choose the timezone to use for local timestamp fields
6. Click **Approve**
7. Done — Canvas tools are now available in your conversation

### Generating a Canvas API token

1. Log into your Canvas instance
2. Go to **Account > Settings**
3. Scroll to **Approved Integrations** and click **+ New Access Token**
4. Give it a description and click **Generate Token**
5. Copy the token (it won't be shown again)

### Updating credentials

Disconnect and reconnect the MCP server in Claude. The approval page will appear again, letting you update your Canvas credentials and timezone.

## Connecting from Codex

This repository is also a Codex plugin. The plugin metadata lives in `.codex-plugin/plugin.json`, and `.mcp.json` points Codex at the deployed remote MCP endpoint:

```text
https://remote-canvas-mcp.karilaa-account.workers.dev/mcp
```

Install or load this repository as a local Codex plugin. On first use, Codex will start the same OAuth approval flow as Claude:

1. Approve the MCP connection in the browser.
2. Enter your Canvas domain, such as `school.instructure.com`.
3. Enter your Canvas API token.
4. Choose the timezone to use for local timestamp fields.
5. Return to Codex and use the Canvas tools.

If you deploy your own Worker, update the `url` in `.mcp.json` to your deployed `/mcp` endpoint before installing the plugin.

## Connecting from a Custom GPT

The same Worker also exposes a GPT Actions REST facade for the ChatGPT Custom GPT editor. The MCP endpoint remains available at `/mcp`; Custom GPT Actions should use the REST API described by:

```text
https://<your-worker>.workers.dev/actions/openapi.json
```

The default schema intentionally does not include an OpenAPI OAuth security scheme because the ChatGPT Actions editor owns OAuth configuration separately. If you need a schema with OAuth security metadata for another OpenAPI client, use `/actions/openapi-oauth.json`.

### One-time OAuth client registration

The easiest path is the browser admin UI:

```text
https://<your-worker>.workers.dev/admin
```

Log in with `ACTIONS_ADMIN_TOKEN`, enter a client name, and click **Create**. The page shows the one-time `client_id`, `client_secret`, schema URL, authorization URL, token URL, scope, token exchange method, and privacy policy URL to paste into ChatGPT. After ChatGPT generates its OAuth callback URL, select the client and paste that callback URL into **Callback URL from ChatGPT**. The server stores both `chat.openai.com` and `chatgpt.com` callback host variants.

You can also create one OAuth client with the admin HTTP API before ChatGPT gives you a callback URL:

```bash
curl -sS https://<your-worker>.workers.dev/admin/oauth-clients \
  -H 'Authorization: Bearer <your-admin-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "Canvas LMS Custom GPT",
    "token_endpoint_auth_method": "client_secret_post"
  }'
```

Save the returned `client_id` and `client_secret`; the secret is shown only in the creation response. Then paste ChatGPT's generated callback URL into the admin UI or update it with the redirect endpoint below.

The dynamic `/register` endpoint also works if you already know the callback URL. Replace `g-YOUR-GPT-ID` after saving the GPT once in ChatGPT:

```bash
curl -sS https://<your-worker>.workers.dev/register \
  -H 'Content-Type: application/json' \
  -d '{
    "client_name": "Canvas LMS Custom GPT",
    "redirect_uris": [
      "https://chat.openai.com/aip/g-YOUR-GPT-ID/oauth/callback",
      "https://chatgpt.com/aip/g-YOUR-GPT-ID/oauth/callback"
    ],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "scope": "canvas.read",
    "token_endpoint_auth_method": "client_secret_post"
  }'
```

Save the returned `client_id` and `client_secret`.

### GPT Actions configuration

In the Custom GPT editor:

1. Add an Action and import the schema from `/actions/openapi.json`.
2. Set authentication to **OAuth**.
3. Use the registered `client_id` and `client_secret`.
4. Set authorization URL to `https://<your-worker>.workers.dev/authorize`.
5. Set token URL to `https://<your-worker>.workers.dev/token`.
6. Set scope to `canvas.read`.
7. Set the privacy policy URL to `https://<your-worker>.workers.dev/privacy`.

When the GPT first uses an action, ChatGPT will start the OAuth flow. The approval page asks the user for their Canvas domain, Canvas API token, and timezone, then stores the Canvas token encrypted in KV.

The Actions API is read-only and available under `/actions/api/*`. It exposes focused endpoints for health, profile, courses, assignments, upcoming assignments, dashboard cards, course grades, modules, pages, and files.

### ChatGPT OAuth hostname

Use the `workers.dev` hostname for ChatGPT Actions:

```
https://<your-worker>.workers.dev
```

Cloudflare zone hostnames have known issues with ChatGPT OAuth token exchange. In testing, ChatGPT can receive an HTML `403` response from Cloudflare for `/token` before the request reaches the Worker, which fails OAuth because ChatGPT expects JSON:

```text
403, message='Attempt to decode JSON with unexpected mimetype: text/html; charset=utf-8', url='https://.../token'
```

For that reason, set the schema URL, authorization URL, token URL, privacy policy URL, and all Actions API URLs to the same `workers.dev` hostname. Do not mix hostnames in the GPT Actions configuration.

### Updating a changing ChatGPT callback URL

If ChatGPT changes the OAuth callback URL after you enter the client ID and secret, update the existing OAuth client instead of registering a new one. First set an admin token:

```bash
npx wrangler secret put ACTIONS_ADMIN_TOKEN
```

Then open the browser admin UI:

```text
https://<your-worker>.workers.dev/admin
```

Log in with `ACTIONS_ADMIN_TOKEN` to create Custom GPT OAuth clients, inspect clients grouped by name, update redirect URIs, and delete one or more selected clients. The UI stores the admin token in browser local storage only. Client secrets are shown only immediately after creating a client.

You can also update the client with the HTTP API:

```bash
curl -sS https://<your-worker>.workers.dev/admin/oauth-clients/<client_id>/redirect-uris \
  -H 'Authorization: Bearer <your-admin-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "redirect_uri": "https://chat.openai.com/aip/g-YOUR-GPT-ID/oauth/callback"
  }'
```

For ChatGPT callbacks, the admin endpoint stores both `chat.openai.com` and `chatgpt.com` callback host variants for the same path. You can inspect the current client registration with:

```bash
curl -sS https://<your-worker>.workers.dev/admin/oauth-clients/<client_id> \
  -H 'Authorization: Bearer <your-admin-token>'
```

## Available tools

Only read-only Canvas tools are registered. Tools that create, update, submit, post, enroll, start attempts, mark items complete, or generate reports are not exposed.

Timezone-aware results preserve the original Canvas timestamp fields and add localized companion fields with a `_local` suffix. For example, `due_at` remains the raw Canvas ISO timestamp and `due_at_local` is added using the timezone selected during setup.

| Category | Tools |
|----------|-------|
| **Health** | `canvas_health_check` |
| **Courses** | `canvas_list_courses`, `canvas_get_course` |
| **Assignments** | `canvas_list_assignments`, `canvas_get_assignment`, `canvas_list_assignment_groups` |
| **Submissions** | `canvas_get_submission` |
| **Modules** | `canvas_list_modules`, `canvas_get_module`, `canvas_list_module_items`, `canvas_get_module_item` |
| **Pages** | `canvas_list_pages`, `canvas_get_page` |
| **Discussions** | `canvas_list_discussion_topics`, `canvas_get_discussion_topic`, `canvas_list_announcements` |
| **Quizzes** | `canvas_list_quizzes`, `canvas_get_quiz` |
| **Users** | `canvas_get_user_profile`, `canvas_get_course_grades`, `canvas_get_user_grades` |
| **Files** | `canvas_list_files`, `canvas_get_file`, `canvas_list_folders` |
| **Calendar** | `canvas_list_calendar_events`, `canvas_get_upcoming_assignments`, `canvas_get_dashboard`, `canvas_get_dashboard_cards`, `canvas_get_syllabus` |
| **Conversations** | `canvas_list_conversations`, `canvas_get_conversation`, `canvas_list_notifications` |
| **Accounts** | `canvas_get_account`, `canvas_list_account_courses`, `canvas_list_account_users`, `canvas_list_sub_accounts`, `canvas_get_account_reports` |
| **Rubrics** | `canvas_list_rubrics`, `canvas_get_rubric` |

## Syncing from upstream

Tools, types, and API methods are auto-generated from the upstream [mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms) project. To pull in the latest changes:

```bash
npm run sync    # regenerate src/generated/ from upstream
npm run deploy  # deploy the updated server
```

The sync script (`scripts/sync-upstream.ts`) fetches the upstream source, parses the tool definitions and client methods, and generates three files under `src/generated/`:

- **`types.ts`** — Canvas entity interfaces
- **`canvas-api.ts`** — fetch-based API methods (transformed from upstream's Axios)
- **`register-tools.ts`** — all MCP tool registrations with Zod schemas

## How it works

```
User connects MCP server in Claude
  → GET /authorize → Approval page with Canvas credential fields
  → User enters Canvas token + domain, selects timezone, clicks Approve
  → POST /authorize → Token is encrypted and timezone preference is stored per-user in KV
  → MCP connects → Server loads credentials from KV → Read-only Canvas tools are registered
```

## Local development

```bash
printf 'COOKIE_ENCRYPTION_KEY=%s\n' "your-random-secret" > .dev.vars
npm run dev
```

`COOKIE_ENCRYPTION_KEY` can be any sufficiently random string. It is used for cookie signing and Canvas credential encryption during local development as well.

## Project structure

```
src/
  index.ts             ← MCP server entry point
  canvas-client.ts     ← HTTP infrastructure (request, pagination, retry)
  types.ts             ← Re-exports generated types + CanvasAPIError
  generated/           ← AUTO-GENERATED by npm run sync
    types.ts           ← Canvas entity interfaces
    canvas-api.ts      ← Client API methods (fetch-based)
    register-tools.ts  ← Read-only tool registrations
scripts/
  sync-upstream.ts     ← Code generation script
```

## Tech stack

- [Cloudflare Workers](https://workers.cloudflare.com/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/) — runtime
- [`agents`](https://www.npmjs.com/package/agents) — Cloudflare's MCP server framework (`McpAgent`)
- [`@cloudflare/workers-oauth-provider`](https://www.npmjs.com/package/@cloudflare/workers-oauth-provider) — OAuth 2.1 with Dynamic Client Registration
- [Hono](https://hono.dev/) — lightweight web framework for OAuth routes
- [Zod](https://zod.dev/) — input validation for MCP tool schemas
