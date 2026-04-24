const API_PREFIX = "/actions/api";

type JsonSchema = Record<string, unknown>;
type Parameter = {
  name: string;
  in: "path" | "query";
  required?: boolean;
  description: string;
  schema: JsonSchema;
};

const courseIdParam: Parameter = {
  name: "course_id",
  in: "path",
  required: true,
  description: "Canvas course ID.",
  schema: { type: "integer" },
};

const assignmentIdParam: Parameter = {
  name: "assignment_id",
  in: "path",
  required: true,
  description: "Canvas assignment ID.",
  schema: { type: "integer" },
};

const moduleIdParam: Parameter = {
  name: "module_id",
  in: "path",
  required: true,
  description: "Canvas module ID.",
  schema: { type: "integer" },
};

const pageUrlParam: Parameter = {
  name: "page_url",
  in: "path",
  required: true,
  description: "Canvas page URL identifier. Use the page url slug from Canvas.",
  schema: { type: "string" },
};

const includeEndedParam: Parameter = {
  name: "include_ended",
  in: "query",
  description: "When true, include ended Canvas courses.",
  schema: { type: "boolean", default: false },
};

const includeSubmissionsParam: Parameter = {
  name: "include_submissions",
  in: "query",
  description: "When true, include current user's assignment submission data.",
  schema: { type: "boolean", default: false },
};

const includeSubmissionParam: Parameter = {
  name: "include_submission",
  in: "query",
  description: "When true, include current user's submission data.",
  schema: { type: "boolean", default: false },
};

const limitParam: Parameter = {
  name: "limit",
  in: "query",
  description: "Maximum number of upcoming assignments to return, from 1 to 100.",
  schema: { type: "integer", minimum: 1, maximum: 100, default: 10 },
};

const jsonResponse = {
  description: "Canvas data returned as JSON.",
  content: {
    "application/json": {
      schema: {
        oneOf: [
          { type: "object", additionalProperties: true },
          { type: "array", items: { type: "object", additionalProperties: true } },
        ],
      },
    },
  },
};

const errorResponse = {
  description: "Structured error response.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
};

function actionOperation(summary: string, description: string, parameters: Parameter[] = []) {
  return {
    get: {
      operationId: summary
        .replace(/[^A-Za-z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
        .replace(/^[A-Z]/, (char: string) => char.toLowerCase()),
      summary,
      description,
      parameters,
      responses: {
        "200": jsonResponse,
        "400": errorResponse,
        "401": errorResponse,
        "404": errorResponse,
        "500": errorResponse,
      },
      security: [{ canvasOAuth: ["canvas.read"] }],
      "x-openai-isConsequential": false,
    },
  };
}

export function getActionsOpenApiDocument(origin: string) {
  const baseUrl = origin.replace(/\/+$/, "");

  return {
    openapi: "3.1.0",
    info: {
      title: "Canvas LMS GPT Actions API",
      description: "Read-only Canvas LMS access for a Custom GPT.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    paths: {
      [`${API_PREFIX}/health`]: actionOperation(
        "getCanvasHealth",
        "Check whether the connected Canvas credentials can reach Canvas.",
      ),
      [`${API_PREFIX}/profile`]: actionOperation(
        "getCanvasProfile",
        "Get the current user's Canvas profile.",
      ),
      [`${API_PREFIX}/courses`]: actionOperation(
        "listCanvasCourses",
        "List Canvas courses available to the current user.",
        [includeEndedParam],
      ),
      [`${API_PREFIX}/courses/{course_id}`]: actionOperation(
        "getCanvasCourse",
        "Get details for one Canvas course.",
        [courseIdParam],
      ),
      [`${API_PREFIX}/courses/{course_id}/assignments`]: actionOperation(
        "listCanvasAssignments",
        "List assignments for one Canvas course.",
        [courseIdParam, includeSubmissionsParam],
      ),
      [`${API_PREFIX}/courses/{course_id}/assignments/{assignment_id}`]: actionOperation(
        "getCanvasAssignment",
        "Get details for one Canvas assignment.",
        [courseIdParam, assignmentIdParam, includeSubmissionParam],
      ),
      [`${API_PREFIX}/upcoming-assignments`]: actionOperation(
        "getCanvasUpcomingAssignments",
        "Get upcoming Canvas assignment due dates.",
        [limitParam],
      ),
      [`${API_PREFIX}/dashboard`]: actionOperation(
        "getCanvasDashboard",
        "Get the current user's Canvas dashboard.",
      ),
      [`${API_PREFIX}/dashboard-cards`]: actionOperation(
        "getCanvasDashboardCards",
        "Get Canvas dashboard cards for active courses.",
      ),
      [`${API_PREFIX}/courses/{course_id}/grades`]: actionOperation(
        "getCanvasCourseGrades",
        "Get enrollment and grade data for one Canvas course.",
        [courseIdParam],
      ),
      [`${API_PREFIX}/courses/{course_id}/modules`]: actionOperation(
        "listCanvasModules",
        "List modules for one Canvas course.",
        [courseIdParam],
      ),
      [`${API_PREFIX}/courses/{course_id}/modules/{module_id}/items`]: actionOperation(
        "listCanvasModuleItems",
        "List items inside one Canvas module.",
        [courseIdParam, moduleIdParam],
      ),
      [`${API_PREFIX}/courses/{course_id}/pages`]: actionOperation(
        "listCanvasPages",
        "List wiki pages for one Canvas course.",
        [courseIdParam],
      ),
      [`${API_PREFIX}/courses/{course_id}/pages/{page_url}`]: actionOperation(
        "getCanvasPage",
        "Get one Canvas course page by its page URL slug.",
        [courseIdParam, pageUrlParam],
      ),
      [`${API_PREFIX}/courses/{course_id}/files`]: actionOperation(
        "listCanvasFiles",
        "List files for one Canvas course.",
        [courseIdParam],
      ),
    },
    components: {
      securitySchemes: {
        canvasOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${baseUrl}/authorize`,
              tokenUrl: `${baseUrl}/token`,
              scopes: {
                "canvas.read": "Read Canvas LMS data for the authorized user.",
              },
            },
          },
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          additionalProperties: false,
          properties: {
            error: { type: "string" },
            message: { type: "string" },
            status: { type: "integer" },
          },
          required: ["error", "message", "status"],
        },
      },
    },
  };
}
