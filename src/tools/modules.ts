import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerModuleTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_modules",
    {
      description: "List all modules in a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const modules = await client.listModules(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(modules, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_module",
    {
      description: "Get details of a specific module",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        module_id: z.number().describe("ID of the module"),
      },
    },
    async ({ course_id, module_id }) => {
      try {
        const mod = await client.getModule(course_id, module_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(mod, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_list_module_items",
    {
      description: "List all items in a module",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        module_id: z.number().describe("ID of the module"),
      },
    },
    async ({ course_id, module_id }) => {
      try {
        const items = await client.listModuleItems(course_id, module_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_module_item",
    {
      description: "Get details of a specific module item",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        module_id: z.number().describe("ID of the module"),
        item_id: z.number().describe("ID of the module item"),
      },
    },
    async ({ course_id, module_id, item_id }) => {
      try {
        const item = await client.getModuleItem(course_id, module_id, item_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(item, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_mark_module_item_complete",
    {
      description: "Mark a module item as complete",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        module_id: z.number().describe("ID of the module"),
        item_id: z.number().describe("ID of the module item"),
      },
    },
    async ({ course_id, module_id, item_id }) => {
      try {
        await client.markModuleItemComplete(course_id, module_id, item_id);
        return { content: [{ type: "text" as const, text: "Module item marked as complete" }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
