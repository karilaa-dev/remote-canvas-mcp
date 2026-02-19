import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerSubmissionTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_get_submission",
    {
      description: "Get submission details for an assignment",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        assignment_id: z.number().describe("ID of the assignment"),
        user_id: z.number().optional().describe("ID of the user (optional, defaults to self)"),
      },
    },
    async ({ course_id, assignment_id, user_id }) => {
      try {
        const submission = await client.getSubmission(course_id, assignment_id, user_id ?? "self");
        return { content: [{ type: "text" as const, text: JSON.stringify(submission, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_submit_assignment",
    {
      description: "Submit work for an assignment",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        assignment_id: z.number().describe("ID of the assignment"),
        submission_type: z.enum(["online_text_entry", "online_url", "online_upload"]).describe("Type of submission"),
        body: z.string().optional().describe("Text content for text submissions"),
        url: z.string().optional().describe("URL for URL submissions"),
        file_ids: z.array(z.number()).optional().describe("File IDs for file submissions"),
      },
    },
    async (args) => {
      try {
        const submission = await client.submitAssignment(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(submission, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_submit_grade",
    {
      description: "Submit a grade for a student's assignment (teacher only)",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        assignment_id: z.number().describe("ID of the assignment"),
        user_id: z.number().describe("ID of the student"),
        grade: z.union([z.number(), z.string()]).describe("Grade to submit (number or letter grade)"),
        comment: z.string().optional().describe("Optional comment on the submission"),
      },
    },
    async (args) => {
      try {
        const submission = await client.submitGrade(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(submission, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
