import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasActionsApi } from "./actions-api.js";
import { CanvasClient } from "./canvas-client.js";
import { getCanvasCredentials } from "./credential-store.js";
import { AuthHandler } from "./auth-handler.js";
import { registerAllTools } from "./generated/register-tools.js";
import type { Props } from "./utils.js";

export class CanvasLmsMcp extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "canvas-lms-mcp",
    version: "1.0.0",
  });

  async init() {
    const login = this.props?.login;
    const credentials = login
      ? await getCanvasCredentials(this.env.OAUTH_KV, login, this.env.COOKIE_ENCRYPTION_KEY)
      : null;

    if (credentials) {
      const client = new CanvasClient(credentials.canvasApiToken, credentials.canvasDomain);
      registerAllTools(this.server, client, {
        timezone: this.props?.timezone ?? credentials.timezone,
      });
    }
  }
}

const INTERNAL_TOKEN_ENDPOINT = "/_oauth/internal-token";

const oauthProvider = new OAuthProvider({
  apiHandlers: {
    "/mcp": CanvasLmsMcp.serve("/mcp"),
    "/actions/api/": CanvasActionsApi,
  },
  // Hono's fetch signature is compatible but structurally different from ExportedHandler
  defaultHandler: AuthHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: INTERNAL_TOKEN_ENDPOINT,
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["canvas.read"],
});

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function publicOAuthMetadata(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const response = await oauthProvider.fetch(request, env, ctx);
  const metadata = await response.json<Record<string, unknown>>();
  const origin = new URL(request.url).origin;
  metadata.token_endpoint = `${origin}/token`;
  metadata.revocation_endpoint = `${origin}/token`;
  return jsonResponse(metadata, { headers: response.headers, status: response.status, statusText: response.statusText });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return publicOAuthMetadata(request, env, ctx);
    }
    if (url.pathname === INTERNAL_TOKEN_ENDPOINT) {
      return AuthHandler.fetch(request, env as Env & { OAUTH_PROVIDER: never }, ctx);
    }
    return oauthProvider.fetch(request, env, ctx);
  },
};
