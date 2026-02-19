# Canvas LMS MCP Server (Remote)

A remote [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for [Canvas LMS](https://www.instructure.com/canvas), deployed on Cloudflare Workers. Connect it to Claude (or any MCP client) and interact with your Canvas courses, assignments, grades, and more through natural language.

Based on [mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms), ported to run as a remote MCP server with multi-user support.

## Features

- **Remote MCP** — runs on Cloudflare Workers, no local install needed
- **Multi-user** — each user provides their own Canvas credentials during the OAuth flow
- **Secure credential storage** — Canvas API tokens are encrypted at rest with AES-256-GCM
- **GitHub OAuth** — users authenticate via GitHub; credentials are tied to their GitHub identity
- **50+ Canvas tools** — courses, assignments, submissions, modules, pages, discussions, quizzes, files, calendar, conversations, rubrics, and more

## Prerequisites

- A [Cloudflare](https://cloudflare.com) account
- A [GitHub OAuth App](https://github.com/settings/developers) (for user authentication)
- A Canvas LMS API token (each user provides their own)
- Node.js and npm

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd remote-canvas-mcp
npm install
```

### 2. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set the **Authorization callback URL** to `https://<your-worker>.workers.dev/callback`
4. Note the **Client ID** and **Client Secret**

### 3. Create a KV namespace

```bash
npx wrangler kv namespace create OAUTH_KV
```

Update the `id` in `wrangler.jsonc` under `kv_namespaces` with the returned namespace ID.

### 4. Update `wrangler.jsonc`

Set your `account_id` in the config file (find it in the Cloudflare dashboard).

### 5. Set secrets

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY
```

`COOKIE_ENCRYPTION_KEY` can be any random string (e.g. `openssl rand -hex 16`). It is used for cookie signing and credential encryption.

### 6. Deploy

```bash
npm run deploy
```

Your server will be available at `https://<your-worker>.workers.dev/mcp`.

## Connecting from Claude

1. Open Claude Desktop or claude.ai
2. Go to **Settings > Integrations > Add MCP Server**
3. Enter your server URL: `https://<your-worker>.workers.dev/mcp`
4. An approval page will open — enter your **Canvas domain** (e.g. `school.instructure.com`) and **Canvas API token**
5. Click **Approve**, then sign in with GitHub
6. Done — all Canvas tools are now available in your conversation

### Generating a Canvas API token

1. Log into your Canvas instance
2. Go to **Account > Settings**
3. Scroll to **Approved Integrations** and click **+ New Access Token**
4. Give it a description and click **Generate Token**
5. Copy the token (it won't be shown again)

### Updating credentials

Disconnect and reconnect the MCP server in Claude. The approval page will appear again, letting you enter new credentials.

## Available tools

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
| **Calendar** | `canvas_list_calendar_events`, `canvas_get_upcoming_assignments`, `canvas_get_dashboard`, `canvas_get_dashboard_cards`, `canvas_get_syllabus` |
| **Conversations** | `canvas_list_conversations`, `canvas_get_conversation`, `canvas_create_conversation`, `canvas_list_notifications` |
| **Accounts** | `canvas_get_account`, `canvas_list_account_courses`, `canvas_list_account_users`, `canvas_create_user`, `canvas_list_sub_accounts`, `canvas_get_account_reports`, `canvas_create_account_report` |
| **Rubrics** | `canvas_list_rubrics`, `canvas_get_rubric` |

Additionally, `canvas_setup_credentials` and `canvas_clear_credentials` are always available as fallback tools for managing credentials directly through the MCP conversation.

## How it works

```
User connects MCP server in Claude
  → GET /authorize → Approval page with Canvas credential fields
  → User enters Canvas token + domain, clicks Approve
  → POST /authorize → Credentials stored temporarily in KV, redirect to GitHub OAuth
  → GitHub OAuth → User signs in
  → GET /callback → Credentials encrypted (AES-256-GCM) and stored per-user in KV
  → MCP connects → Server loads credentials from KV → All Canvas tools available
```

## Local development

```bash
cp .dev.vars.example .dev.vars
# Fill in GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, COOKIE_ENCRYPTION_KEY
npm run dev
```

## Tech stack

- [Cloudflare Workers](https://workers.cloudflare.com/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/) — runtime
- [`agents`](https://www.npmjs.com/package/agents) — Cloudflare's MCP server framework (`McpAgent`)
- [`@cloudflare/workers-oauth-provider`](https://www.npmjs.com/package/@cloudflare/workers-oauth-provider) — OAuth 2.1 with Dynamic Client Registration
- [Hono](https://hono.dev/) — lightweight web framework for OAuth routes
- [Zod](https://zod.dev/) — input validation for MCP tool schemas
