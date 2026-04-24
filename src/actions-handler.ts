import { CanvasClient } from "./canvas-client.js";
import { getCanvasCredentials, type CanvasCredentials } from "./credential-store.js";
import { CanvasAPIError } from "./types.js";
import { DEFAULT_TIMEZONE, normalizeTimezone, type Props } from "./utils.js";

const API_PREFIX = "/actions/api";
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

type CanvasActionsEnv = Pick<Env, "COOKIE_ENCRYPTION_KEY" | "OAUTH_KV">;

export interface CanvasActionsClient {
  healthCheck(): Promise<unknown>;
  getUserProfile(): Promise<unknown>;
  listCourses(includeEnded?: boolean): Promise<unknown>;
  getCourse(courseId: number | string): Promise<unknown>;
  listAssignments(courseId: number | string, includeSubmissions?: boolean): Promise<unknown>;
  getAssignment(courseId: number | string, assignmentId: number | string, includeSubmission?: boolean): Promise<unknown>;
  getUpcomingAssignments(limit?: number): Promise<unknown>;
  getDashboard(): Promise<unknown>;
  getDashboardCards(): Promise<unknown>;
  getCourseGrades(courseId: number | string): Promise<unknown>;
  listModules(courseId: number | string): Promise<unknown>;
  listModuleItems(courseId: number | string, moduleId: number | string): Promise<unknown>;
  listPages(courseId: number | string): Promise<unknown>;
  getPage(courseId: number | string, pageUrl: string): Promise<unknown>;
  listFiles(courseId: number | string): Promise<unknown>;
}

export interface CanvasActionsDependencies {
  getCredentials?: (
    kv: KVNamespace,
    userId: string,
    encryptionKey: string,
  ) => Promise<CanvasCredentials | null>;
  createClient?: (credentials: CanvasCredentials) => CanvasActionsClient;
}

type RouteHandler = (client: CanvasActionsClient, url: URL, segments: string[]) => Promise<unknown>;

interface ActionRoute {
  pattern: string[];
  handler: RouteHandler;
}

class ActionRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ActionRequestError";
  }
}

const routes: ActionRoute[] = [
  {
    pattern: ["health"],
    handler: (client) => client.healthCheck(),
  },
  {
    pattern: ["profile"],
    handler: (client) => client.getUserProfile(),
  },
  {
    pattern: ["courses"],
    handler: (client, url) => client.listCourses(readBoolean(url, "include_ended", false)),
  },
  {
    pattern: ["courses", ":course_id"],
    handler: (client, _url, segments) => client.getCourse(readPositiveIntegerPath(segments[1], "course_id")),
  },
  {
    pattern: ["courses", ":course_id", "assignments"],
    handler: (client, url, segments) =>
      client.listAssignments(
        readPositiveIntegerPath(segments[1], "course_id"),
        readBoolean(url, "include_submissions", false),
      ),
  },
  {
    pattern: ["courses", ":course_id", "assignments", ":assignment_id"],
    handler: (client, url, segments) =>
      client.getAssignment(
        readPositiveIntegerPath(segments[1], "course_id"),
        readPositiveIntegerPath(segments[3], "assignment_id"),
        readBoolean(url, "include_submission", false),
      ),
  },
  {
    pattern: ["upcoming-assignments"],
    handler: (client, url) => client.getUpcomingAssignments(readLimit(url)),
  },
  {
    pattern: ["dashboard"],
    handler: (client) => client.getDashboard(),
  },
  {
    pattern: ["dashboard-cards"],
    handler: (client) => client.getDashboardCards(),
  },
  {
    pattern: ["courses", ":course_id", "grades"],
    handler: (client, _url, segments) => client.getCourseGrades(readPositiveIntegerPath(segments[1], "course_id")),
  },
  {
    pattern: ["courses", ":course_id", "modules"],
    handler: (client, _url, segments) => client.listModules(readPositiveIntegerPath(segments[1], "course_id")),
  },
  {
    pattern: ["courses", ":course_id", "modules", ":module_id", "items"],
    handler: (client, _url, segments) =>
      client.listModuleItems(
        readPositiveIntegerPath(segments[1], "course_id"),
        readPositiveIntegerPath(segments[3], "module_id"),
      ),
  },
  {
    pattern: ["courses", ":course_id", "pages"],
    handler: (client, _url, segments) => client.listPages(readPositiveIntegerPath(segments[1], "course_id")),
  },
  {
    pattern: ["courses", ":course_id", "pages", ":page_url"],
    handler: (client, _url, segments) =>
      client.getPage(readPositiveIntegerPath(segments[1], "course_id"), decodePathValue(segments[3], "page_url")),
  },
  {
    pattern: ["courses", ":course_id", "files"],
    handler: (client, _url, segments) => client.listFiles(readPositiveIntegerPath(segments[1], "course_id")),
  },
];

export async function handleCanvasActionsRequest(
  request: Request,
  env: CanvasActionsEnv,
  props: Props | undefined,
  dependencies: CanvasActionsDependencies = {},
): Promise<Response> {
  try {
    if (request.method !== "GET") {
      return jsonError(405, "method_not_allowed", "Only GET requests are supported by the Canvas Actions API.");
    }

    const url = new URL(request.url);
    const segments = getActionSegments(url.pathname);
    const route = routes.find((candidate) => routeMatches(candidate.pattern, segments));
    if (!route) {
      return jsonError(404, "not_found", "No Canvas Actions API endpoint matched this request.");
    }

    const credentials = await loadCredentials(env, props, dependencies);
    const client = dependencies.createClient?.(credentials) ?? new CanvasClient(
      credentials.canvasApiToken,
      credentials.canvasDomain,
    );

    const result = await route.handler(client, url, segments);
    const data = addLocalizedDateFields(result, createFormatter(props?.timezone ?? credentials.timezone));
    return jsonResponse({ data });
  } catch (error) {
    return errorToResponse(error);
  }
}

async function loadCredentials(
  env: CanvasActionsEnv,
  props: Props | undefined,
  dependencies: CanvasActionsDependencies,
): Promise<CanvasCredentials> {
  const userId = props?.login;
  if (!userId) {
    throw new ActionRequestError(401, "missing_user", "The OAuth token is missing Canvas user context.");
  }

  const credentials = await (dependencies.getCredentials ?? getCanvasCredentials)(
    env.OAUTH_KV,
    userId,
    env.COOKIE_ENCRYPTION_KEY,
  );
  if (!credentials) {
    throw new ActionRequestError(
      401,
      "credentials_not_found",
      "Canvas credentials were not found or could not be decrypted. Reconnect the GPT Action.",
    );
  }

  return credentials;
}

function getActionSegments(pathname: string): string[] {
  if (!pathname.startsWith(API_PREFIX)) return [];
  return pathname
    .slice(API_PREFIX.length)
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

function routeMatches(pattern: string[], segments: string[]): boolean {
  return pattern.length === segments.length
    && pattern.every((part, index) => part.startsWith(":") || part === segments[index]);
}

function readBoolean(url: URL, name: string, fallback: boolean): boolean {
  const value = url.searchParams.get(name);
  if (value === null || value === "") return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new ActionRequestError(400, "invalid_query", `${name} must be true or false.`);
}

function readLimit(url: URL): number {
  const value = url.searchParams.get("limit");
  if (value === null || value === "") return 10;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new ActionRequestError(400, "invalid_query", "limit must be an integer from 1 to 100.");
  }
  return parsed;
}

function readPositiveIntegerPath(value: string | undefined, name: string): number {
  const decoded = decodePathValue(value, name);
  const parsed = Number(decoded);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ActionRequestError(400, "invalid_path", `${name} must be a positive integer.`);
  }
  return parsed;
}

function decodePathValue(value: string | undefined, name: string): string {
  if (!value) throw new ActionRequestError(400, "invalid_path", `${name} is required.`);
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ActionRequestError(400, "invalid_path", `${name} is not valid URL encoding.`);
  }
}

function createFormatter(timezone: string | null | undefined): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short",
    timeZone: normalizeTimezone(timezone) || DEFAULT_TIMEZONE,
    year: "numeric",
  });
}

export function addLocalizedDateFields(data: unknown, formatter: Intl.DateTimeFormat): unknown {
  if (Array.isArray(data)) return data.map((item) => addLocalizedDateFields(item, formatter));
  if (!data || typeof data !== "object") return data;

  const record = data as Record<string, unknown>;
  const localized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    localized[key] = addLocalizedDateFields(value, formatter);
    const localKey = `${key}_local`;
    const localValue = typeof value === "string" ? formatLocalDate(value, formatter) : null;
    if (localValue && !Object.prototype.hasOwnProperty.call(record, localKey)) {
      localized[localKey] = localValue;
    }
  }
  return localized;
}

function formatLocalDate(value: string, formatter: Intl.DateTimeFormat): string | null {
  if (!ISO_DATE_TIME_PATTERN.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatter.format(date);
}

function errorToResponse(error: unknown): Response {
  if (error instanceof ActionRequestError) {
    return jsonError(error.status, error.code, error.message);
  }

  if (error instanceof CanvasAPIError) {
    const statusCode = error.statusCode ?? 0;
    const status = statusCode > 0 ? statusCode : 502;
    return jsonError(status, "canvas_api_error", error.message);
  }

  if (error instanceof Error) {
    return jsonError(500, "internal_error", error.message);
  }

  return jsonError(500, "internal_error", String(error));
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function jsonError(status: number, error: string, message: string): Response {
  return jsonResponse({ error, message, status }, status);
}
