import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonSchema = Record<string, unknown>;

interface Parameter {
  name: string;
  in: "path" | "query";
  required?: boolean;
  description: string;
  schema: JsonSchema;
  style?: "form";
  explode?: boolean;
}

interface OperationDefinition {
  operationId: string;
  summary: string;
  description: string;
  parameters?: Parameter[];
}

interface CliOptions {
  out?: string;
  server?: string;
}

const jsonResponse = {
  description: "Canvas API JSON response.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/CanvasData" },
    },
  },
};

const errorResponse = {
  description: "Canvas API error response.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/CanvasError" },
    },
  },
};

const positiveIntegerSchema = { type: "integer", minimum: 1 };
const stringSchema = { type: "string" };

function pathParam(name: string, description: string, schema: JsonSchema = positiveIntegerSchema): Parameter {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema,
  };
}

function queryParam(name: string, description: string, schema: JsonSchema): Parameter {
  return {
    name,
    in: "query",
    description,
    schema,
  };
}

function queryArrayParam(name: string, description: string, items: JsonSchema, defaults?: unknown[]): Parameter {
  return {
    name,
    in: "query",
    description,
    schema: {
      type: "array",
      items,
      ...(defaults ? { default: defaults } : {}),
    },
    style: "form",
    explode: true,
  };
}

const courseIdParam = pathParam("course_id", "Canvas course ID.");
const assignmentIdParam = pathParam("assignment_id", "Canvas assignment ID.");
const moduleIdParam = pathParam("module_id", "Canvas module ID.");
const itemIdParam = pathParam("item_id", "Canvas module item ID.");
const topicIdParam = pathParam("topic_id", "Canvas discussion topic ID.");
const quizIdParam = pathParam("quiz_id", "Canvas quiz ID.");
const fileIdParam = pathParam("file_id", "Canvas file ID.");
const folderIdParam = pathParam("folder_id", "Canvas folder ID.");
const conversationIdParam = pathParam("conversation_id", "Canvas conversation ID.");
const pageUrlParam = pathParam("page_url", "Canvas page URL slug.", stringSchema);
const userIdParam = pathParam("user_id", "Canvas user ID, or use \"self\" for the current user.", {
  type: "string",
  default: "self",
});

const courseIncludeParam = queryArrayParam(
  "include[]",
  "Canvas course include fields used by the project.",
  {
    type: "string",
    enum: ["total_students", "teachers", "term", "course_progress", "sections", "syllabus_body"],
  },
  ["total_students", "teachers", "term", "course_progress"],
);

const assignmentIncludeParam = queryArrayParam(
  "include[]",
  "Canvas assignment include fields. Add submission to include the current user's submission data.",
  {
    type: "string",
    enum: ["assignment_group", "rubric", "due_at", "submission"],
  },
  ["assignment_group", "rubric", "due_at"],
);

const moduleIncludeParam = queryArrayParam(
  "include[]",
  "Canvas module include fields used by the project.",
  { type: "string", enum: ["items"] },
  ["items"],
);

const moduleItemIncludeParam = queryArrayParam(
  "include[]",
  "Canvas module item include fields used by the project.",
  { type: "string", enum: ["content_details"] },
  ["content_details"],
);

const discussionIncludeParam = queryArrayParam(
  "include[]",
  "Canvas discussion include fields used by the project.",
  { type: "string", enum: ["assignment"] },
  ["assignment"],
);

const submissionIncludeParam = queryArrayParam(
  "include[]",
  "Canvas submission include fields used by the project.",
  { type: "string", enum: ["submission_comments", "rubric_assessment", "assignment"] },
  ["submission_comments", "rubric_assessment", "assignment"],
);

const gradeIncludeParam = queryArrayParam(
  "include[]",
  "Canvas enrollment include fields used for grade lookup.",
  { type: "string", enum: ["grades", "observed_users"] },
  ["grades", "observed_users"],
);

function operation(definition: OperationDefinition) {
  return {
    get: {
      operationId: definition.operationId,
      summary: definition.summary,
      description: definition.description,
      parameters: definition.parameters ?? [],
      responses: {
        "200": jsonResponse,
        "400": errorResponse,
        "401": errorResponse,
        "403": errorResponse,
        "404": errorResponse,
        "429": errorResponse,
        "500": errorResponse,
      },
      "x-openai-isConsequential": false,
    },
  };
}

function directCanvasPaths() {
  return {
    "/api/v1/users/self/profile": operation({
      operationId: "getCanvasUserProfile",
      summary: "Get Canvas user profile",
      description:
        "Get the current user's Canvas profile. This also verifies that the Canvas API token can reach Canvas.",
    }),
    "/api/v1/courses": operation({
      operationId: "listCourses",
      summary: "List courses",
      description:
        "List Canvas courses for the current user. The default state filter mirrors the project's active/completed course lookup.",
      parameters: [
        queryArrayParam(
          "state[]",
          "Canvas course states to include. Omit this parameter only when you intentionally want Canvas defaults.",
          { type: "string", enum: ["available", "completed", "unpublished", "deleted"] },
          ["available", "completed"],
        ),
        courseIncludeParam,
      ],
    }),
    "/api/v1/courses/{course_id}": operation({
      operationId: "getCourse",
      summary: "Get course",
      description:
        "Get details for one Canvas course. Include syllabus_body when you want the course syllabus.",
      parameters: [
        courseIdParam,
        queryArrayParam(
          "include[]",
          "Canvas course include fields. The project uses syllabus_body for the syllabus helper.",
          {
            type: "string",
            enum: ["total_students", "teachers", "term", "course_progress", "sections", "syllabus_body"],
          },
          ["total_students", "teachers", "term", "course_progress", "sections", "syllabus_body"],
        ),
      ],
    }),
    "/api/v1/courses/{course_id}/assignments": operation({
      operationId: "listAssignments",
      summary: "List assignments",
      description: "List assignments for one Canvas course.",
      parameters: [courseIdParam, assignmentIncludeParam],
    }),
    "/api/v1/courses/{course_id}/assignments/{assignment_id}": operation({
      operationId: "getAssignment",
      summary: "Get assignment",
      description: "Get details for one Canvas assignment.",
      parameters: [
        courseIdParam,
        assignmentIdParam,
        queryArrayParam(
          "include[]",
          "Canvas assignment include fields. Add submission to include the current user's submission data.",
          { type: "string", enum: ["assignment_group", "rubric", "submission"] },
          ["assignment_group", "rubric"],
        ),
      ],
    }),
    "/api/v1/courses/{course_id}/assignment_groups": operation({
      operationId: "listAssignmentGroups",
      summary: "List assignment groups",
      description: "List assignment groups for one Canvas course.",
      parameters: [
        courseIdParam,
        queryArrayParam(
          "include[]",
          "Canvas assignment group include fields used by the project.",
          { type: "string", enum: ["assignments"] },
          ["assignments"],
        ),
      ],
    }),
    "/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/{user_id}": operation({
      operationId: "getSubmission",
      summary: "Get assignment submission",
      description: "Get submission details for one assignment. Use user_id self for the current user.",
      parameters: [courseIdParam, assignmentIdParam, userIdParam, submissionIncludeParam],
    }),
    "/api/v1/courses/{course_id}/files": operation({
      operationId: "listCourseFiles",
      summary: "List course files",
      description: "List files for one Canvas course.",
      parameters: [courseIdParam],
    }),
    "/api/v1/folders/{folder_id}/files": operation({
      operationId: "listFolderFiles",
      summary: "List folder files",
      description: "List files in one Canvas folder. This covers the project's folder-backed file listing mode.",
      parameters: [folderIdParam],
    }),
    "/api/v1/files/{file_id}": operation({
      operationId: "getFile",
      summary: "Get file",
      description: "Get information about one Canvas file.",
      parameters: [fileIdParam],
    }),
    "/api/v1/courses/{course_id}/folders": operation({
      operationId: "listFolders",
      summary: "List course folders",
      description: "List folders for one Canvas course.",
      parameters: [courseIdParam],
    }),
    "/api/v1/courses/{course_id}/pages": operation({
      operationId: "listPages",
      summary: "List pages",
      description: "List wiki pages for one Canvas course.",
      parameters: [courseIdParam],
    }),
    "/api/v1/courses/{course_id}/pages/{page_url}": operation({
      operationId: "getPage",
      summary: "Get page",
      description: "Get one Canvas course page by its page URL slug.",
      parameters: [courseIdParam, pageUrlParam],
    }),
    "/api/v1/calendar_events": operation({
      operationId: "listCalendarEvents",
      summary: "List calendar events",
      description: "List Canvas calendar events.",
      parameters: [
        queryParam("type", "Canvas calendar event type. The project uses event.", {
          type: "string",
          enum: ["event", "assignment"],
          default: "event",
        }),
        queryParam("all_events", "When true, include all visible events.", {
          type: "boolean",
          default: true,
        }),
        queryParam("start_date", "Start date in ISO 8601 format.", stringSchema),
        queryParam("end_date", "End date in ISO 8601 format.", stringSchema),
      ],
    }),
    "/api/v1/users/self/upcoming_events": operation({
      operationId: "getUpcomingAssignments",
      summary: "Get upcoming assignments",
      description:
        "Get upcoming Canvas events. The project filters this response to assignment events; use it for upcoming assignment due dates.",
      parameters: [
        queryParam("limit", "Maximum number of upcoming events to return.", {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 10,
        }),
      ],
    }),
    "/api/v1/users/self/dashboard": operation({
      operationId: "getDashboard",
      summary: "Get dashboard",
      description: "Get the current user's Canvas dashboard.",
    }),
    "/api/v1/dashboard/dashboard_cards": operation({
      operationId: "getDashboardCards",
      summary: "Get dashboard cards",
      description: "Get Canvas dashboard cards for active courses.",
    }),
    "/api/v1/conversations": operation({
      operationId: "listConversations",
      summary: "List conversations",
      description: "List the current user's Canvas conversations.",
    }),
    "/api/v1/conversations/{conversation_id}": operation({
      operationId: "getConversation",
      summary: "Get conversation",
      description: "Get details for one Canvas conversation.",
      parameters: [conversationIdParam],
    }),
    "/api/v1/users/self/activity_stream": operation({
      operationId: "listNotifications",
      summary: "List notifications",
      description: "List the current user's Canvas activity stream notifications.",
    }),
    "/api/v1/courses/{course_id}/enrollments": operation({
      operationId: "getCourseGrades",
      summary: "Get course grades",
      description: "Get enrollment and grade data for one Canvas course.",
      parameters: [courseIdParam, gradeIncludeParam],
    }),
    "/api/v1/courses/{course_id}/modules": operation({
      operationId: "listModules",
      summary: "List modules",
      description: "List modules for one Canvas course.",
      parameters: [courseIdParam, moduleIncludeParam],
    }),
    "/api/v1/courses/{course_id}/modules/{module_id}": operation({
      operationId: "getModule",
      summary: "Get module",
      description: "Get details for one Canvas module.",
      parameters: [courseIdParam, moduleIdParam, moduleIncludeParam],
    }),
    "/api/v1/courses/{course_id}/modules/{module_id}/items": operation({
      operationId: "listModuleItems",
      summary: "List module items",
      description: "List items inside one Canvas module.",
      parameters: [courseIdParam, moduleIdParam, moduleItemIncludeParam],
    }),
    "/api/v1/courses/{course_id}/modules/{module_id}/items/{item_id}": operation({
      operationId: "getModuleItem",
      summary: "Get module item",
      description: "Get details for one Canvas module item.",
      parameters: [courseIdParam, moduleIdParam, itemIdParam, moduleItemIncludeParam],
    }),
    "/api/v1/courses/{course_id}/discussion_topics": operation({
      operationId: "listDiscussionTopics",
      summary: "List discussion topics or announcements",
      description:
        "List discussion topics for one Canvas course. Set type to announcement to list announcements, matching the project's announcements helper.",
      parameters: [
        courseIdParam,
        queryParam("type", "Optional Canvas discussion topic type filter.", {
          type: "string",
          enum: ["announcement"],
        }),
        discussionIncludeParam,
      ],
    }),
    "/api/v1/courses/{course_id}/discussion_topics/{topic_id}": operation({
      operationId: "getDiscussionTopic",
      summary: "Get discussion topic",
      description: "Get details for one Canvas discussion topic.",
      parameters: [courseIdParam, topicIdParam, discussionIncludeParam],
    }),
    "/api/v1/courses/{course_id}/quizzes": operation({
      operationId: "listQuizzes",
      summary: "List quizzes",
      description: "List quizzes for one Canvas course.",
      parameters: [courseIdParam],
    }),
    "/api/v1/courses/{course_id}/quizzes/{quiz_id}": operation({
      operationId: "getQuiz",
      summary: "Get quiz",
      description: "Get details for one Canvas quiz.",
      parameters: [courseIdParam, quizIdParam],
    }),
    "/api/v1/courses/{course_id}/rubrics": operation({
      operationId: "listRubrics",
      summary: "List rubrics",
      description: "List rubrics for one Canvas course.",
      parameters: [courseIdParam],
    }),
  };
}

export function getDirectCanvasOpenApiDocument(server: string) {
  const baseUrl = normalizeServer(server);

  return {
    openapi: "3.1.0",
    info: {
      title: "Direct Canvas LMS API",
      description:
        "Read-only direct Canvas LMS REST API schema for a private Custom GPT using API key Bearer authentication.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    security: [{ canvasBearer: [] }],
    paths: directCanvasPaths(),
    components: {
      securitySchemes: {
        canvasBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Canvas API token",
          description: "Paste your Canvas access token into GPT Action API key Bearer authentication.",
        },
      },
      schemas: {
        CanvasData: {
          description: "Canvas LMS response data. The shape varies by endpoint and may be an object or array.",
        },
        CanvasError: {
          description: "Canvas LMS error response. Canvas error shapes vary by endpoint and institution.",
        },
      },
    },
  };
}

function normalizeServer(server: string): string {
  const trimmed = server.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("--server is required, for example --server https://school.instructure.com");
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("--server must be an HTTP or HTTPS URL");
  }

  return trimmed;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--server") {
      options.server = readArgValue(argv, index, "--server");
      index += 1;
      continue;
    }
    if (arg.startsWith("--server=")) {
      options.server = arg.slice("--server=".length);
      continue;
    }
    if (arg === "--out") {
      options.out = readArgValue(argv, index, "--out");
      index += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readArgValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printUsage(): void {
  console.log(`Usage: npm run generate:direct-openapi -- --server https://school.instructure.com [--out canvas-openapi.json]

Generates an OpenAPI 3.1 JSON schema for a private Custom GPT that calls Canvas directly.
Configure the GPT Action auth as API key Bearer and paste your Canvas API token.`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.server) {
    printUsage();
    throw new Error("--server is required");
  }

  const document = getDirectCanvasOpenApiDocument(options.server);
  const json = `${JSON.stringify(document, null, 2)}\n`;

  if (options.out) {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, json, "utf8");
    return;
  }

  process.stdout.write(json);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
