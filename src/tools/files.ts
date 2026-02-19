import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerFileTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_files",
    {
      description: "List files in a course or folder",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        folder_id: z.number().optional().describe("ID of the folder (optional)"),
      },
    },
    async ({ course_id, folder_id }) => {
      try {
        const files = await client.listFiles(course_id, folder_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(files, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_file",
    {
      description: "Get information about a specific file",
      inputSchema: { file_id: z.number().describe("ID of the file") },
    },
    async ({ file_id }) => {
      try {
        const file = await client.getFile(file_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(file, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_list_folders",
    {
      description: "List folders in a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const folders = await client.listFolders(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(folders, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
