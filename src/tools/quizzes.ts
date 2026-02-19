import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerQuizTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_list_quizzes",
    {
      description: "List all quizzes in a course",
      inputSchema: { course_id: z.number().describe("ID of the course") },
    },
    async ({ course_id }) => {
      try {
        const quizzes = await client.listQuizzes(course_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(quizzes, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_quiz",
    {
      description: "Get details of a specific quiz",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        quiz_id: z.number().describe("ID of the quiz"),
      },
    },
    async ({ course_id, quiz_id }) => {
      try {
        const quiz = await client.getQuiz(course_id, quiz_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(quiz, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_create_quiz",
    {
      description: "Create a new quiz in a course",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        title: z.string().describe("Title of the quiz"),
        quiz_type: z.string().optional().describe("Type of the quiz (e.g., graded)"),
        time_limit: z.number().optional().describe("Time limit in minutes"),
        published: z.boolean().optional().describe("Is the quiz published"),
        description: z.string().optional().describe("Description of the quiz"),
        due_at: z.string().optional().describe("Due date (ISO format)"),
      },
    },
    async ({ course_id, ...quizData }) => {
      try {
        const quiz = await client.createQuiz(course_id, quizData);
        return { content: [{ type: "text" as const, text: JSON.stringify(quiz, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_start_quiz_attempt",
    {
      description: "Start a new quiz attempt",
      inputSchema: {
        course_id: z.number().describe("ID of the course"),
        quiz_id: z.number().describe("ID of the quiz"),
      },
    },
    async ({ course_id, quiz_id }) => {
      try {
        const result = await client.startQuizAttempt(course_id, quiz_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
