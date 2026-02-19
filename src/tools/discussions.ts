import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerDiscussionTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_discussion_topics",
    {
      description: "List all discussion topics in a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const topics = await client.listDiscussionTopics(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(topics, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_discussion_topic",
    {
      description: "Get details of a specific discussion topic",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        topic_id: z.number().describe("ID of the discussion topic"),
      },
    },
    async ({ course_id, topic_id }) => {
      try {
        const topic = await client.getDiscussionTopic(course_id, topic_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(topic, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_post_to_discussion",
    {
      description: "Post a message to a discussion topic",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        topic_id: z.number().describe("ID of the discussion topic"),
        message: z.string().describe("Message content"),
      },
    },
    async ({ course_id, topic_id, message }) => {
      try {
        const result = await client.postToDiscussion(course_id, topic_id, message);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_list_announcements",
    {
      description: "List all announcements in a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const announcements = await client.listAnnouncements(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(announcements, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
