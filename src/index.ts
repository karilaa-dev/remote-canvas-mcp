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

export default new OAuthProvider({
  apiHandlers: {
    "/mcp": CanvasLmsMcp.serve("/mcp"),
    "/actions/api/": CanvasActionsApi,
  },
  // Hono's fetch signature is compatible but structurally different from ExportedHandler
  defaultHandler: AuthHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["canvas.read"],
});
