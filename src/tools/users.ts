import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerUserTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_get_user_profile",
    { description: "Get current user's profile" },
    async () => {
      try {
        const profile = await client.getUserProfile();
        return { content: [{ type: "text" as const, text: JSON.stringify(profile, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_update_user_profile",
    {
      description: "Update current user's profile",
      inputSchema: {
        name: z.string().optional().describe("User's name"),
        short_name: z.string().optional().describe("User's short name"),
        bio: z.string().optional().describe("User's bio"),
        title: z.string().optional().describe("User's title"),
        time_zone: z.string().optional().describe("User's time zone"),
      },
    },
    async (profileData) => {
      try {
        const profile = await client.updateUserProfile(profileData);
        return { content: [{ type: "text" as const, text: JSON.stringify(profile, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_enroll_user",
    {
      description: "Enroll a user in a course",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        user_id: z.number().describe("ID of the user to enroll"),
        role: z.string().optional().describe("Role for the enrollment (StudentEnrollment, TeacherEnrollment, etc.)"),
        enrollment_state: z.string().optional().describe("State of the enrollment (active, invited, etc.)"),
      },
    },
    async (args) => {
      try {
        const enrollment = await client.enrollUser(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(enrollment, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_course_grades",
    {
      description: "Get grades for a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const grades = await client.getCourseGrades(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(grades, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_user_grades",
    { description: "Get all grades for the current user" },
    async () => {
      try {
        const grades = await client.getUserGrades();
        return { content: [{ type: "text" as const, text: JSON.stringify(grades, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
