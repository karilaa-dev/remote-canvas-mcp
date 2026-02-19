import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerConversationTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_conversations",
    { description: "List user's conversations" },
    async () => {
      try {
        const conversations = await client.listConversations();
        return { content: [{ type: "text" as const, text: JSON.stringify(conversations, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_conversation",
    {
      description: "Get details of a specific conversation",
      inputSchema: { conversation_id: z.number().describe("ID of the conversation") },
    },
    async ({ conversation_id }) => {
      try {
        const conversation = await client.getConversation(conversation_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(conversation, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_create_conversation",
    {
      description: "Create a new conversation",
      inputSchema: {
        recipients: z.array(z.string()).describe("Recipient user IDs or email addresses"),
        body: z.string().describe("Message body"),
        subject: z.string().optional().describe("Message subject"),
      },
    },
    async ({ recipients, body, subject }) => {
      try {
        const conversation = await client.createConversation(recipients, body, subject);
        return { content: [{ type: "text" as const, text: JSON.stringify(conversation, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_list_notifications",
    { description: "List user's notifications" },
    async () => {
      try {
        const notifications = await client.listNotifications();
        return { content: [{ type: "text" as const, text: JSON.stringify(notifications, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
