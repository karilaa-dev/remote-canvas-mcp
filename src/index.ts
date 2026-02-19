import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasClient } from "./canvas-client.js";
import { getCanvasCredentials } from "./credential-store.js";
import { AuthHandler } from "./auth-handler.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerAssignmentTools } from "./tools/assignments.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerConversationTools } from "./tools/conversations.js";
import { registerCourseTools } from "./tools/courses.js";
import { registerDiscussionTools } from "./tools/discussions.js";
import { registerFileTools } from "./tools/files.js";
import { registerHealthTools } from "./tools/health.js";
import { registerModuleTools } from "./tools/modules.js";
import { registerPageTools } from "./tools/pages.js";
import { registerQuizTools } from "./tools/quizzes.js";
import { registerRubricTools } from "./tools/rubrics.js";
import { registerSubmissionTools } from "./tools/submissions.js";
import { registerUserTools } from "./tools/users.js";
import type { Props } from "./utils.js";

const canvasToolRegistrations = [
  registerHealthTools,
  registerCourseTools,
  registerAssignmentTools,
  registerSubmissionTools,
  registerModuleTools,
  registerPageTools,
  registerDiscussionTools,
  registerQuizTools,
  registerUserTools,
  registerFileTools,
  registerCalendarTools,
  registerConversationTools,
  registerAccountTools,
  registerRubricTools,
] as const;

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
      for (const register of canvasToolRegistrations) {
        register(this.server, client);
      }
    }
  }
}

export default new OAuthProvider({
  apiHandler: CanvasLmsMcp.serve("/mcp"),
  apiRoute: "/mcp",
  // Hono's fetch signature is compatible but structurally different from ExportedHandler
  defaultHandler: AuthHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
