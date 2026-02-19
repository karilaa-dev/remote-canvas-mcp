import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerRubricTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_rubrics",
    {
      description: "List rubrics for a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const rubrics = await client.listRubrics(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(rubrics, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_rubric",
    {
      description: "Get details of a specific rubric",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        rubric_id: z.number().describe("ID of the rubric"),
      },
    },
    async ({ course_id, rubric_id }) => {
      try {
        const rubric = await client.getRubric(course_id, rubric_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(rubric, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
