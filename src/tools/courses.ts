import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerCourseTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_courses",
    {
      description: "List all courses for the current user",
      inputSchema: { include_ended: z.boolean().optional().describe("Include ended courses") },
    },
    async ({ include_ended }) => {
      try {
        const courses = await client.listCourses(include_ended ?? false);
        return { content: [{ type: "text" as const, text: JSON.stringify(courses, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_course",
    {
      description: "Get detailed information about a specific course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const course = await client.getCourse(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(course, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_create_course",
    {
      description: "Create a new course in Canvas",
      inputSchema: {
        account_id: z.number().describe("ID of the account to create the course in"),
        name: z.string().describe("Name of the course"),
        course_code: z.string().optional().describe("Course code (e.g., CS101)"),
        start_at: z.string().optional().describe("Course start date (ISO format)"),
        end_at: z.string().optional().describe("Course end date (ISO format)"),
        license: z.string().optional().describe("Course license"),
        is_public: z.boolean().optional().describe("Whether the course is public"),
        public_syllabus: z.boolean().optional().describe("Whether the syllabus is public"),
        open_enrollment: z.boolean().optional().describe("Whether the course has open enrollment"),
        self_enrollment: z.boolean().optional().describe("Whether the course allows self enrollment"),
        term_id: z.number().optional().describe("ID of the enrollment term"),
        hide_final_grades: z.boolean().optional().describe("Whether to hide final grades"),
        apply_assignment_group_weights: z.boolean().optional().describe("Whether to apply assignment group weights"),
        time_zone: z.string().optional().describe("Course time zone"),
        syllabus_body: z.string().optional().describe("Course syllabus content"),
      },
    },
    async (args) => {
      try {
        const course = await client.createCourse(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(course, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_update_course",
    {
      description: "Update an existing course in Canvas",
      inputSchema: {
        course_id: z.number().describe("ID of the course to update"),
        name: z.string().optional().describe("New name for the course"),
        course_code: z.string().optional().describe("New course code"),
        start_at: z.string().optional().describe("New start date (ISO format)"),
        end_at: z.string().optional().describe("New end date (ISO format)"),
        is_public: z.boolean().optional().describe("Whether the course is public"),
        public_syllabus: z.boolean().optional().describe("Whether the syllabus is public"),
        hide_final_grades: z.boolean().optional().describe("Whether to hide final grades"),
        apply_assignment_group_weights: z.boolean().optional().describe("Whether to apply assignment group weights"),
        time_zone: z.string().optional().describe("Course time zone"),
        syllabus_body: z.string().optional().describe("Updated syllabus content"),
      },
    },
    async (args) => {
      try {
        const course = await client.updateCourse(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(course, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
