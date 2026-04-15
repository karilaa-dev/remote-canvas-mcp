# Canvas LMS MCP Server (Remote)

A remote [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for [Canvas LMS](https://www.instructure.com/canvas), deployed on Cloudflare Workers. Connect it to Claude (or any MCP client) and interact with your Canvas courses, assignments, grades, and more through natural language.

Originally based on [mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms), now maintained directly in this repository for easier customization and independent tool evolution.

## Features

- **Remote MCP** — runs on Cloudflare Workers, no local install needed
- **Multi-user** — each user provides their own Canvas credentials during the OAuth flow
- **Secure credential storage** — Canvas API tokens are encrypted at rest with AES-256-GCM
- **No external auth required** — users enter Canvas credentials directly, no third-party sign-in needed
- **Timezone-aware results** — users select a timezone during setup and timestamp results include local `_local` companion fields
- **Optional read-only mode** — users can hide Canvas tools that create, update, submit, post, enroll, or otherwise mutate data
- **55 Canvas tools** — courses, assignments, submissions, modules, pages, discussions, quizzes, files, calendar, conversations, rubrics, accounts, and more
- **Cross-course assignment range lookup** — query assignments due within a time range across all active courses
- **Repo-owned Canvas surface** — tools, types, and API methods are maintained directly in this repo

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

## Connecting from Claude

1. Open Claude Desktop or claude.ai
2. Go to **Settings > Integrations > Add MCP Server**
3. Enter your server URL: `https://<your-worker>.workers.dev/mcp`
4. An approval page will open — enter your **Canvas domain** (e.g. `school.instructure.com`) and **Canvas API token**
5. Choose the timezone to use for local timestamp fields, and optionally enable **read-only mode**
6. Click **Approve**
7. Done — Canvas tools are now available in your conversation

### Generating a Canvas API token

1. Log into your Canvas instance
2. Go to **Account > Settings**
3. Scroll to **Approved Integrations** and click **+ New Access Token**
4. Give it a description and click **Generate Token**
5. Copy the token (it won't be shown again)

### Updating credentials

Disconnect and reconnect the MCP server in Claude. The approval page will appear again, letting you update your Canvas credentials, timezone, and read-only preference.

## Connecting from Codex

This repository is also a Codex plugin. The plugin metadata lives in `.codex-plugin/plugin.json`, and `.mcp.json` points Codex at the deployed remote MCP endpoint:

```text
https://remote-canvas-mcp.karilaa-account.workers.dev/mcp
```

Install or load this repository as a local Codex plugin. On first use, Codex will start the same OAuth approval flow as Claude:

1. Approve the MCP connection in the browser.
2. Enter your Canvas domain, such as `school.instructure.com`.
3. Enter your Canvas API token.
4. Choose the timezone to use for local timestamp fields, and optionally enable read-only mode.
5. Return to Codex and use the Canvas tools.

If you deploy your own Worker, update the `url` in `.mcp.json` to your deployed `/mcp` endpoint before installing the plugin.

## Available tools

When read-only mode is enabled during setup, mutating tools are not registered. This hides tools such as `canvas_create_course`, `canvas_update_course`, `canvas_create_assignment`, `canvas_update_assignment`, `canvas_submit_assignment`, `canvas_submit_grade`, `canvas_create_conversation`, `canvas_update_user_profile`, `canvas_enroll_user`, `canvas_mark_module_item_complete`, `canvas_post_to_discussion`, `canvas_create_quiz`, `canvas_start_quiz_attempt`, `canvas_create_user`, and `canvas_create_account_report`.

Timezone-aware results preserve the original Canvas timestamp fields and add localized companion fields with a `_local` suffix. For example, `due_at` remains the raw Canvas ISO timestamp and `due_at_local` is added using the timezone selected during setup.

For cross-course planning, prefer `canvas_list_assignments_for_active_courses`. `canvas_get_upcoming_assignments` is kept for compatibility with Canvas's generic upcoming-events feed.

| Category | Tools |
|----------|-------|
| **Health** | `canvas_health_check` |
| **Courses** | `canvas_list_courses`, `canvas_get_course`, `canvas_create_course`, `canvas_update_course` |
| **Assignments** | `canvas_list_assignments`, `canvas_get_assignment`, `canvas_create_assignment`, `canvas_update_assignment`, `canvas_list_assignment_groups` |
| **Submissions** | `canvas_get_submission`, `canvas_submit_assignment`, `canvas_submit_grade` |
| **Modules** | `canvas_list_modules`, `canvas_get_module`, `canvas_list_module_items`, `canvas_get_module_item`, `canvas_mark_module_item_complete` |
| **Pages** | `canvas_list_pages`, `canvas_get_page` |
| **Discussions** | `canvas_list_discussion_topics`, `canvas_get_discussion_topic`, `canvas_post_to_discussion`, `canvas_list_announcements` |
| **Quizzes** | `canvas_list_quizzes`, `canvas_get_quiz`, `canvas_create_quiz`, `canvas_start_quiz_attempt` |
| **Users** | `canvas_get_user_profile`, `canvas_update_user_profile`, `canvas_enroll_user`, `canvas_get_course_grades`, `canvas_get_user_grades` |
| **Files** | `canvas_list_files`, `canvas_get_file`, `canvas_list_folders` |
| **Calendar** | `canvas_list_calendar_events`, `canvas_get_upcoming_assignments`, `canvas_list_assignments_for_active_courses`, `canvas_get_dashboard`, `canvas_get_dashboard_cards`, `canvas_get_syllabus` |
| **Conversations** | `canvas_list_conversations`, `canvas_get_conversation`, `canvas_create_conversation`, `canvas_list_notifications` |
| **Accounts** | `canvas_get_account`, `canvas_list_account_courses`, `canvas_list_account_users`, `canvas_create_user`, `canvas_list_sub_accounts`, `canvas_get_account_reports`, `canvas_create_account_report` |
| **Rubrics** | `canvas_list_rubrics`, `canvas_get_rubric` |

## Maintaining tools

Canvas types, client methods, and MCP tool registrations now live directly under `src/`:

- **`canvas-types.ts`** — checked-in Canvas entity interfaces
- **`canvas-client.ts`** — HTTP transport, retry, pagination, and Canvas API methods
- **`canvas-tools.ts`** — MCP tool registrations and response formatting

This makes it safe to add repo-specific tools, such as `canvas_list_assignments_for_active_courses`, without depending on an upstream generator.

## How it works

```
User connects MCP server in Claude
  → GET /authorize → Approval page with Canvas credential fields
  → User enters Canvas token + domain, selects timezone/read-only preferences, clicks Approve
  → POST /authorize → Token is encrypted and preferences are stored per-user in KV
  → MCP connects → Server loads credentials from KV → Canvas tools registered for the selected mode
```

## Local development

```bash
printf 'COOKIE_ENCRYPTION_KEY=%s\n' "your-random-secret" > .dev.vars
npm run dev
npm run typecheck
npm test
```

`COOKIE_ENCRYPTION_KEY` can be any sufficiently random string. It is used for cookie signing and Canvas credential encryption during local development as well.

## Project structure

```
src/
  index.ts             ← MCP server entry point
  canvas-client.ts     ← HTTP infrastructure + Canvas API methods
  canvas-tools.ts      ← MCP tool registrations
  canvas-types.ts      ← Canvas entity interfaces snapshot
  types.ts             ← Shared exports + CanvasAPIError
tests/
  canvas-client.test.ts ← Transport and aggregation behavior tests
  canvas-tools.test.ts  ← Tool registration and formatting tests
```

## Tech stack

- [Cloudflare Workers](https://workers.cloudflare.com/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/) — runtime
- [`agents`](https://www.npmjs.com/package/agents) — Cloudflare's MCP server framework (`McpAgent`)
- [`@cloudflare/workers-oauth-provider`](https://www.npmjs.com/package/@cloudflare/workers-oauth-provider) — OAuth 2.1 with Dynamic Client Registration
- [Hono](https://hono.dev/) — lightweight web framework for OAuth routes
- [Zod](https://zod.dev/) — input validation for MCP tool schemas
