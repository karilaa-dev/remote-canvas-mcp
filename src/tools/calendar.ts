import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerCalendarTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_calendar_events",
    {
      description: "List calendar events",
      inputSchema: {
        start_date: z.string().optional().describe("Start date (ISO format)"),
        end_date: z.string().optional().describe("End date (ISO format)"),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const events = await client.listCalendarEvents(start_date, end_date);
        return { content: [{ type: "text" as const, text: JSON.stringify(events, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_upcoming_assignments",
    {
      description: "Get upcoming assignment due dates",
      inputSchema: { limit: z.number().optional().describe("Maximum number of assignments to return") },
    },
    async ({ limit }) => {
      try {
        const assignments = await client.getUpcomingAssignments(limit ?? 10);
        return { content: [{ type: "text" as const, text: JSON.stringify(assignments, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_dashboard",
    { description: "Get user's dashboard information" },
    async () => {
      try {
        const dashboard = await client.getDashboard();
        return { content: [{ type: "text" as const, text: JSON.stringify(dashboard, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_dashboard_cards",
    { description: "Get dashboard course cards" },
    async () => {
      try {
        const cards = await client.getDashboardCards();
        return { content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_syllabus",
    {
      description: "Get course syllabus",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const syllabus = await client.getSyllabus(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(syllabus, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
