import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasClient } from "../canvas-client.js";

export function registerHealthTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_health_check",
    { description: "Check the health and connectivity of the Canvas API" },
    async () => {
      try {
        const health = await client.healthCheck();
        return { content: [{ type: "text" as const, text: JSON.stringify(health, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
