import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerAssignmentTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_assignments",
    {
      description: "List assignments for a course",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        include_submissions: z.boolean().optional().describe("Include submission data"),
      },
    },
    async ({ course_id, include_submissions }) => {
      try {
        const assignments = await client.listAssignments(course_id, include_submissions ?? false);
        return { content: [{ type: "text" as const, text: JSON.stringify(assignments, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_assignment",
    {
      description: "Get detailed information about a specific assignment",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        assignment_id: z.number().describe("ID of the assignment"),
        include_submission: z.boolean().optional().describe("Include user's submission data"),
      },
    },
    async ({ course_id, assignment_id, include_submission }) => {
      try {
        const assignment = await client.getAssignment(course_id, assignment_id, include_submission ?? false);
        return { content: [{ type: "text" as const, text: JSON.stringify(assignment, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_create_assignment",
    {
      description: "Create a new assignment in a Canvas course",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        name: z.string().describe("Name of the assignment"),
        description: z.string().optional().describe("Assignment description/instructions"),
        due_at: z.string().optional().describe("Due date (ISO format)"),
        points_possible: z.number().optional().describe("Maximum points possible"),
        submission_types: z.array(z.string()).optional().describe("Allowed submission types"),
        allowed_extensions: z.array(z.string()).optional().describe("Allowed file extensions for submissions"),
        published: z.boolean().optional().describe("Whether the assignment is published"),
      },
    },
    async (args) => {
      try {
        const assignment = await client.createAssignment(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(assignment, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_update_assignment",
    {
      description: "Update an existing assignment",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        assignment_id: z.number().describe("ID of the assignment to update"),
        name: z.string().optional().describe("New name for the assignment"),
        description: z.string().optional().describe("New assignment description"),
        due_at: z.string().optional().describe("New due date (ISO format)"),
        points_possible: z.number().optional().describe("New maximum points"),
        published: z.boolean().optional().describe("Whether the assignment is published"),
      },
    },
    async (args) => {
      try {
        const assignment = await client.updateAssignment(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(assignment, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_list_assignment_groups",
    {
      description: "List assignment groups for a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const groups = await client.listAssignmentGroups(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
