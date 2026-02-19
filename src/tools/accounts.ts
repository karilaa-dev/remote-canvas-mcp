import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CanvasClient } from "../canvas-client.js";

export function registerAccountTools(server: McpServer, client: CanvasClient) {
  server.registerTool(
    "canvas_get_account",
    {
      description: "Get account details",
      inputSchema: { account_id: z.number().describe("ID of the account") },
    },
    async ({ account_id }) => {
      try {
        const account = await client.getAccount(account_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(account, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_list_account_courses",
    {
      description: "List courses for an account",
      inputSchema: {
        account_id: z.number().describe("ID of the account"),
        with_enrollments: z.boolean().optional().describe("Include enrollment data"),
        published: z.boolean().optional().describe("Only include published courses"),
        completed: z.boolean().optional().describe("Include completed courses"),
        search_term: z.string().optional().describe("Search term to filter courses"),
        sort: z.enum(["course_name", "sis_course_id", "teacher", "account_name"]).optional().describe("Sort order"),
        order: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
      },
    },
    async (args) => {
      try {
        const courses = await client.listAccountCourses(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(courses, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_list_account_users",
    {
      description: "List users for an account",
      inputSchema: {
        account_id: z.number().describe("ID of the account"),
        search_term: z.string().optional().describe("Search term to filter users"),
        sort: z.enum(["username", "email", "sis_id", "last_login"]).optional().describe("Sort order"),
        order: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
      },
    },
    async (args) => {
      try {
        const users = await client.listAccountUsers(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(users, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_create_user",
    {
      description: "Create a new user in an account",
      inputSchema: {
        account_id: z.number().describe("ID of the account"),
        user: z.object({
          name: z.string().describe("Full name of the user"),
          short_name: z.string().optional().describe("Short name of the user"),
          sortable_name: z.string().optional().describe("Sortable name (Last, First)"),
          time_zone: z.string().optional().describe("User's time zone"),
        }),
        pseudonym: z.object({
          unique_id: z.string().describe("Unique login ID (email or username)"),
          password: z.string().optional().describe("User's password"),
          sis_user_id: z.string().optional().describe("SIS ID for the user"),
          send_confirmation: z.boolean().optional().describe("Send confirmation email"),
        }),
      },
    },
    async (args) => {
      try {
        const user = await client.createUser(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(user, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_list_sub_accounts",
    {
      description: "List sub-accounts for an account",
      inputSchema: { account_id: z.number().describe("ID of the parent account") },
    },
    async ({ account_id }) => {
      try {
        const subAccounts = await client.listSubAccounts(account_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(subAccounts, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_get_account_reports",
    {
      description: "List available reports for an account",
      inputSchema: { account_id: z.number().describe("ID of the account") },
    },
    async ({ account_id }) => {
      try {
        const reports = await client.getAccountReports(account_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(reports, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "canvas_create_account_report",
    {
      description: "Generate a report for an account",
      inputSchema: {
        account_id: z.number().describe("ID of the account"),
        report: z.string().describe("Type of report to generate"),
        parameters: z.record(z.unknown()).optional().describe("Report parameters"),
      },
    },
    async (args) => {
      try {
        const report = await client.createAccountReport(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
