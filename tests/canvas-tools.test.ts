import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasAPIError } from "../src/types.js";
import { registerAllTools } from "../src/canvas-tools.js";

type RegisteredTool = {
  config: Record<string, unknown>;
  handler: (args?: Record<string, unknown>) => Promise<{
    content: Array<{ text: string; type: "text" }>;
    isError?: boolean;
  }>;
  name: string;
};

function createServerMock() {
  const tools = new Map<string, RegisteredTool>();

  return {
    server: {
      registerTool(name: string, config: Record<string, unknown>, handler: RegisteredTool["handler"]) {
        tools.set(name, { config, handler, name });
      },
    } as unknown as McpServer,
    tools,
  };
}

test("read-only mode keeps legacy reads and the new cross-course assignments tool while hiding mutating tools", () => {
  const { server, tools } = createServerMock();

  registerAllTools(server, {} as never, { readOnly: true });

  assert.ok(tools.has("canvas_list_courses"));
  assert.ok(tools.has("canvas_get_upcoming_assignments"));
  assert.ok(tools.has("canvas_list_assignments_for_active_courses"));
  assert.equal(tools.has("canvas_create_course"), false);
  assert.equal(tools.has("canvas_update_assignment"), false);
  assert.equal(tools.has("canvas_create_user"), false);
});

test("tool annotations preserve read-only and mutating metadata", () => {
  const { server, tools } = createServerMock();

  registerAllTools(server, {} as never, { readOnly: false });

  assert.deepEqual(tools.get("canvas_list_courses")?.config.annotations, { readOnlyHint: true });
  assert.deepEqual(tools.get("canvas_update_course")?.config.annotations, {
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: false,
  });
});

test("canvas_list_assignments_for_active_courses forwards arguments and localizes returned timestamps", async () => {
  const captured: Array<unknown> = [];
  const { server, tools } = createServerMock();

  registerAllTools(
    server,
    {
      async listAssignmentsForActiveCourses(startDate: string, endDate: string, limit?: number) {
        captured.push(startDate, endDate, limit);
        return [
          {
            assignment: { due_at: "2026-04-03T10:00:00Z", id: 100, name: "Essay" },
            course_id: 1,
            course_name: "English",
          },
        ];
      },
    } as never,
    { timezone: "America/Los_Angeles" },
  );

  const result = await tools.get("canvas_list_assignments_for_active_courses")!.handler({
    start_date: "2026-04-01",
    end_date: "2026-04-07",
    limit: 5,
  });

  assert.deepEqual(captured, ["2026-04-01", "2026-04-07", 5]);
  assert.match(result.content[0].text, /"due_at_local":/);
});

test("CanvasAPIError tool results are not double-prefixed", async () => {
  const { server, tools } = createServerMock();

  registerAllTools(
    server,
    {
      async listCourses() {
        throw new CanvasAPIError("Canvas API Error (400): Bad request", 400);
      },
    } as never,
  );

  const result = await tools.get("canvas_list_courses")!.handler({});

  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Canvas API Error (400): Bad request");
});
