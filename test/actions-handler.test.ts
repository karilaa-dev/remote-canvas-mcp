import assert from "node:assert/strict";
import test from "node:test";
import { CanvasAPIError } from "../src/types.js";
import { handleCanvasActionsRequest, type CanvasActionsClient } from "../src/actions-handler.js";

const env = {
  COOKIE_ENCRYPTION_KEY: "test-secret",
  OAUTH_KV: {},
} as unknown as Pick<Env, "COOKIE_ENCRYPTION_KEY" | "OAUTH_KV">;

function createRequest(path: string): Request {
  return new Request(`https://canvas-actions.example${path}`);
}

function createClient(overrides: Partial<CanvasActionsClient> = {}): CanvasActionsClient {
  const base: CanvasActionsClient = {
    healthCheck: async () => ({ status: "ok", timestamp: "2026-04-24T10:00:00Z" }),
    getUserProfile: async () => ({ id: 1, name: "Test User" }),
    listCourses: async (includeEnded) => ({ includeEnded }),
    getCourse: async (courseId) => ({ courseId }),
    listAssignments: async (courseId, includeSubmissions) => ({ courseId, includeSubmissions }),
    getAssignment: async (courseId, assignmentId, includeSubmission) => ({
      assignmentId,
      courseId,
      includeSubmission,
    }),
    getUpcomingAssignments: async (limit) => ({ limit }),
    getDashboard: async () => ({ dashboard: true }),
    getDashboardCards: async () => [{ id: 1 }],
    getCourseGrades: async (courseId) => ({ courseId, grades: [] }),
    listModules: async (courseId) => ({ courseId, modules: [] }),
    listModuleItems: async (courseId, moduleId) => ({ courseId, moduleId, items: [] }),
    listPages: async (courseId) => ({ courseId, pages: [] }),
    getPage: async (courseId, pageUrl) => ({ courseId, pageUrl }),
    listFiles: async (courseId) => ({ courseId, files: [] }),
  };
  return { ...base, ...overrides };
}

async function requestAction(
  path: string,
  client: CanvasActionsClient = createClient(),
): Promise<Response> {
  return handleCanvasActionsRequest(createRequest(path), env, { login: "user-1", timezone: "America/Los_Angeles" }, {
    getCredentials: async () => ({
      canvasApiToken: "canvas-token",
      canvasDomain: "school.instructure.com",
      timezone: "America/Los_Angeles",
    }),
    createClient: () => client,
  });
}

test("routes focused Actions API requests to the Canvas client", async () => {
  const response = await requestAction("/actions/api/courses/42/assignments?include_submissions=true");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { courseId: 42, includeSubmissions: true });
});

test("adds localized companion fields to ISO date strings", async () => {
  const response = await requestAction("/actions/api/health");
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.timestamp, "2026-04-24T10:00:00Z");
  assert.equal(typeof body.timestamp_local, "string");
  assert.match(String(body.timestamp_local), /2026/);
});

test("returns 400 for invalid query parameters", async () => {
  const response = await requestAction("/actions/api/upcoming-assignments?limit=abc");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "invalid_query",
    message: "limit must be an integer from 1 to 100.",
    status: 400,
  });
});

test("returns 401 when OAuth props do not include a Canvas user", async () => {
  const response = await handleCanvasActionsRequest(createRequest("/actions/api/profile"), env, undefined, {
    createClient: () => createClient(),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json() as { error: string }).error, "missing_user");
});

test("maps Canvas API failures to structured JSON errors", async () => {
  const response = await requestAction("/actions/api/profile", createClient({
    getUserProfile: async () => {
      throw new CanvasAPIError("Canvas API Error (403): forbidden", 403);
    },
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "canvas_api_error",
    message: "Canvas API Error (403): forbidden",
    status: 403,
  });
});
