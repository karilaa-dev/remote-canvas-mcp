import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "./canvas-client.js";
import {
  type CanvasCredentials,
  deleteCanvasCredentials,
  getCanvasCredentials,
  storeCanvasCredentials,
} from "./credential-store.js";
import { GitHubHandler } from "./github-handler.js";
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

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function textResult(text: string, isError = false): ToolResult {
  const result: ToolResult = { content: [{ type: "text" as const, text }] };
  if (isError) result.isError = true;
  return result;
}

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

    let credentials: CanvasCredentials | null = null;
    if (login) {
      credentials = await getCanvasCredentials(this.env.OAUTH_KV, login, this.env.COOKIE_ENCRYPTION_KEY);
    }

    this.registerCredentialTools(!!credentials);

    if (credentials) {
      const client = new CanvasClient(credentials.canvasApiToken, credentials.canvasDomain);
      for (const register of canvasToolRegistrations) {
        register(this.server, client);
      }
    }
  }

  private registerCredentialTools(hasCredentials: boolean) {
    this.server.registerTool(
      "canvas_setup_credentials",
      {
        description: hasCredentials
          ? "Update your Canvas LMS API credentials. After updating, the server will reinitialize with the new credentials."
          : "Set up your Canvas LMS credentials. You must call this tool before any Canvas tools become available. Provide your Canvas API token and domain.",
        inputSchema: {
          canvas_api_token: z.string().describe("Your Canvas API access token"),
          canvas_domain: z.string().describe("Your Canvas instance domain (e.g. school.instructure.com)"),
        },
      },
      async ({ canvas_api_token, canvas_domain }) => {
        const testClient = new CanvasClient(canvas_api_token, canvas_domain);
        try {
          await testClient.healthCheck();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return textResult(`Invalid credentials — Canvas API returned an error: ${message}`, true);
        }

        const login = this.props?.login;
        if (login) {
          await storeCanvasCredentials(
            this.env.OAUTH_KV,
            login,
            { canvasApiToken: canvas_api_token, canvasDomain: canvas_domain },
            this.env.COOKIE_ENCRYPTION_KEY,
          );
        }

        await this.reinitializeServer();

        return textResult(`Canvas credentials saved and verified. Connected to ${canvas_domain}. All Canvas tools are now available.`);
      },
    );

    this.server.registerTool(
      "canvas_clear_credentials",
      {
        description: "Remove your stored Canvas LMS credentials from the server.",
      },
      async () => {
        const login = this.props?.login;
        if (!login) {
          return textResult("No user identity available to clear credentials for.", true);
        }

        await deleteCanvasCredentials(this.env.OAUTH_KV, login);
        await this.reinitializeServer();
        return textResult("Canvas credentials removed. Use canvas_setup_credentials to connect again.");
      },
    );
  }
}

export default new OAuthProvider({
  apiHandler: CanvasLmsMcp.serve("/mcp"),
  apiRoute: "/mcp",
  defaultHandler: GitHubHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
