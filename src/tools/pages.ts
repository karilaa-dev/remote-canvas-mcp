import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerPageTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_pages",
    {
      description: "List pages in a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const pages = await client.listPages(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_page",
    {
      description: "Get content of a specific page",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        page_url: z.string().describe("URL slug of the page"),
      },
    },
    async ({ course_id, page_url }) => {
      try {
        const page = await client.getPage(course_id, page_url);
        return { content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
