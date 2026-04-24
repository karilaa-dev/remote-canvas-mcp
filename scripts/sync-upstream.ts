/**
 * Sync script: generates src/generated/{types.ts, canvas-api.ts, register-tools.ts}
 * from upstream DMontgomery40/mcp-canvas-lms source files.
 *
 * Usage: npx tsx scripts/sync-upstream.ts
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const UPSTREAM_BASE =
  "https://raw.githubusercontent.com/DMontgomery40/mcp-canvas-lms/main/src";

const OUT_DIR = path.resolve(__dirname, "../src/generated");

const MUTATING_TOOL_NAMES = new Set([
  "canvas_create_course",
  "canvas_update_course",
  "canvas_create_assignment",
  "canvas_update_assignment",
  "canvas_submit_assignment",
  "canvas_submit_grade",
  "canvas_create_conversation",
  "canvas_update_user_profile",
  "canvas_enroll_user",
  "canvas_mark_module_item_complete",
  "canvas_post_to_discussion",
  "canvas_create_quiz",
  "canvas_start_quiz_attempt",
  "canvas_create_user",
  "canvas_create_account_report",
]);

const MUTATING_API_METHOD_NAMES = new Set([
  "createCourse",
  "updateCourse",
  "createAssignment",
  "updateAssignment",
  "submitAssignment",
  "submitGrade",
  "createConversation",
  "updateUserProfile",
  "enrollUser",
  "markModuleItemComplete",
  "postToDiscussion",
  "createQuiz",
  "startQuizAttempt",
  "createUser",
  "createAccountReport",
]);

// ---------------------------------------------------------------------------
// 1. Fetch upstream source files
// ---------------------------------------------------------------------------

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}${body ? ` - ${body.substring(0, 200)}` : ""}`);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// 2. Parse RAW_TOOLS from upstream index.ts (regex-based, no TS AST needed)
// ---------------------------------------------------------------------------

interface ToolProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolProperty;
  properties?: Record<string, ToolProperty>;
  required?: string[];
  default?: unknown;
  oneOf?: ToolProperty[];
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, ToolProperty>;
    required: string[];
  };
}

function parseRawTools(source: string): ToolDef[] {
  // Extract the RAW_TOOLS array using bracket matching
  const startMarker = "const RAW_TOOLS";
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) throw new Error("RAW_TOOLS not found in upstream index.ts");

  // Skip past `Tool[] = ` to find the actual array literal `[`
  const eqIdx = source.indexOf("=", startIdx);
  const arrayStart = source.indexOf("[", eqIdx);
  let depth = 0;
  let arrayEnd = -1;
  let inString = false;
  let stringChar = "";
  for (let i = arrayStart; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\" ) { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }
  if (arrayEnd === -1) throw new Error("Could not find end of RAW_TOOLS array");

  let arrayText = source.slice(arrayStart, arrayEnd);

  // Convert from TS object literal syntax to valid JSON:
  // 1. Strip TS line comments (only outside of string literals)
  arrayText = arrayText.replace(/"(?:[^"\\]|\\.)*"|\/\/.*$/gm, (match) =>
    match.startsWith('"') ? match : ""
  );
  // 2. Wrap unquoted keys in quotes
  arrayText = arrayText.replace(
    /([{,]\s*)(\w+)\s*:/g,
    '$1"$2":'
  );
  // 3. Remove trailing commas before } or ]
  arrayText = arrayText.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(arrayText) as ToolDef[];
  } catch (e) {
    const debugPath = path.join(os.tmpdir(), "_debug_raw_tools.json");
    fs.writeFileSync(debugPath, arrayText);
    throw new Error(`Failed to parse RAW_TOOLS as JSON (debug written to ${debugPath}): ${e}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Generate types.ts
// ---------------------------------------------------------------------------

function generateTypes(upstreamTypes: string): string {
  let out = upstreamTypes;

  // Remove branded type declarations (e.g. `export type CourseId = number & { ... };`)
  out = out.replace(/export type \w+Id = number & \{[^}]*\};\n?/g, "");
  // Remove the branded types JSDoc block
  out = out.replace(/\/\*\*\s*\n\s*\* Branded types[^*]*\*\/\n?/g, "");

  // Remove CanvasAPIError class (we define it in src/types.ts)
  out = out.replace(
    /\/\*\*[\s\S]*?\*\/\s*\nexport class CanvasAPIError[\s\S]*?^}\n?/m,
    ""
  );
  // Also catch it without a JSDoc block
  out = out.replace(/export class CanvasAPIError[\s\S]*?^}\n?/m, "");

  // Remove CanvasValidationError (upstream-only)
  out = out.replace(/export class CanvasValidationError[\s\S]*?^}\n?/m, "");

  // Remove upstream-only interfaces/types (multiline, ending with `^}`)
  const removeInterfaces = [
    "MCPServerConfig",
    "CanvasClientConfig",
    "PaginatedResponse",
    "MCPTransportHttpConfig",
    "MCPTransportConfig",
    "CanvasErrorResponse",
  ];
  for (const name of removeInterfaces) {
    // Match interface with optional JSDoc
    const pat = new RegExp(
      `(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*\\n)?export interface ${name}[\\s\\S]*?^}\\n?`,
      "m"
    );
    out = out.replace(pat, "");
  }

  // Remove `export type TransportMode = ...;`
  out = out.replace(/export type TransportMode[\s\S]*?;\n?/m, "");

  // Remove `/**\n * Error types\n */` section header if left empty
  out = out.replace(/\/\*\*\s*\n\s*\* Error types\s*\n\s*\*\/\s*\n/g, "");
  // Remove `/** API Response types */` if empty
  out = out.replace(/\/\*\*\s*\n\s*\* API Response types\s*\n\s*\*\/\s*\n/g, "");

  // Replace `any` with `unknown` in all type positions
  out = out.replace(/\bany\b/g, "unknown");

  // Strip branded ID type references in other interfaces
  out = out.replace(/\bCourseId\b/g, "number");
  out = out.replace(/\bAssignmentId\b/g, "number");
  out = out.replace(/\bUserId\b/g, "number");
  out = out.replace(/\bEnrollmentId\b/g, "number");

  // Collapse multiple blank lines
  out = out.replace(/\n{3,}/g, "\n\n");

  // Add header
  const header = `// AUTO-GENERATED by scripts/sync-upstream.ts — DO NOT EDIT\n\n`;
  return header + out.trim() + "\n";
}

// ---------------------------------------------------------------------------
// 4. Generate canvas-api.ts  (standalone functions calling client.request())
// ---------------------------------------------------------------------------

/**
 * Rather than doing complex AST transforms of upstream Axios methods,
 * we hardcode the mapping from tool name → API call based on the
 * upstream handler switch statement patterns. This is more robust
 * than AST parsing and handles all the edge cases (destructuring,
 * custom params, etc.) that each handler has.
 */

interface ApiMethod {
  name: string;
  signature: string;
  body: string;
}

function buildApiMethods(): ApiMethod[] {
  return [
    // Health
    {
      name: "healthCheck",
      signature: "async healthCheck()",
      body: `try {
      const user = await this.getUserProfile() as { id: number; name: string };
      return { status: "ok" as const, timestamp: new Date().toISOString(), user: { id: user.id, name: user.name } };
    } catch (error) {
      return { status: "error" as const, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
    }`,
    },
    // Courses
    {
      name: "listCourses",
      signature: "async listCourses(includeEnded = false)",
      body: `const params: Record<string, unknown> = {
      include: ["total_students", "teachers", "term", "course_progress"],
    };
    if (!includeEnded) params.state = ["available", "completed"];
    return this.request<unknown[]>("GET", "/courses", { params });`,
    },
    {
      name: "getCourse",
      signature: "async getCourse(courseId: number | string)",
      body: `return this.request<unknown>("GET", \`/courses/\${courseId}\`, {
      params: { include: ["total_students", "teachers", "term", "course_progress", "sections", "syllabus_body"] },
    });`,
    },
    {
      name: "createCourse",
      signature: "async createCourse(args: Record<string, unknown>)",
      body: `const { account_id, ...courseData } = args;
    return this.request<unknown>("POST", \`/accounts/\${account_id}/courses\`, { body: { course: courseData } });`,
    },
    {
      name: "updateCourse",
      signature: "async updateCourse(args: Record<string, unknown>)",
      body: `const { course_id, ...courseData } = args;
    return this.request<unknown>("PUT", \`/courses/\${course_id}\`, { body: { course: courseData } });`,
    },
    // Assignments
    {
      name: "listAssignments",
      signature: "async listAssignments(courseId: number | string, includeSubmissions = false)",
      body: `const include = ["assignment_group", "rubric", "due_at"];
    if (includeSubmissions) include.push("submission");
    return this.request<unknown[]>("GET", \`/courses/\${courseId}/assignments\`, { params: { include } });`,
    },
    {
      name: "getAssignment",
      signature:
        "async getAssignment(courseId: number | string, assignmentId: number | string, includeSubmission = false)",
      body: `const include = ["assignment_group", "rubric"];
    if (includeSubmission) include.push("submission");
    return this.request<unknown>("GET", \`/courses/\${courseId}/assignments/\${assignmentId}\`, { params: { include } });`,
    },
    {
      name: "createAssignment",
      signature: "async createAssignment(args: Record<string, unknown>)",
      body: `const { course_id, ...assignmentData } = args;
    return this.request<unknown>("POST", \`/courses/\${course_id}/assignments\`, { body: { assignment: assignmentData } });`,
    },
    {
      name: "updateAssignment",
      signature: "async updateAssignment(args: Record<string, unknown>)",
      body: `const { course_id, assignment_id, ...assignmentData } = args;
    return this.request<unknown>("PUT", \`/courses/\${course_id}/assignments/\${assignment_id}\`, { body: { assignment: assignmentData } });`,
    },
    // Assignment Groups
    {
      name: "listAssignmentGroups",
      signature: "async listAssignmentGroups(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/assignment_groups\`, {
      params: { include: ["assignments"] },
    });`,
    },
    // Submissions
    {
      name: "getSubmission",
      signature:
        'async getSubmission(courseId: number | string, assignmentId: number | string, userId: number | string = "self")',
      body: `return this.request<unknown>("GET", \`/courses/\${courseId}/assignments/\${assignmentId}/submissions/\${userId}\`, {
      params: { include: ["submission_comments", "rubric_assessment", "assignment"] },
    });`,
    },
    {
      name: "submitAssignment",
      signature: "async submitAssignment(args: Record<string, unknown>)",
      body: `const { course_id, assignment_id, submission_type, body, url, file_ids } = args as {
      course_id: number; assignment_id: number; submission_type: string;
      body?: string; url?: string; file_ids?: number[];
    };
    const submissionData: Record<string, unknown> = { submission_type };
    if (body) submissionData.body = body;
    if (url) submissionData.url = url;
    if (file_ids && file_ids.length > 0) submissionData.file_ids = file_ids;
    return this.request<unknown>("POST", \`/courses/\${course_id}/assignments/\${assignment_id}/submissions\`, {
      body: { submission: submissionData },
    });`,
    },
    {
      name: "submitGrade",
      signature: "async submitGrade(args: Record<string, unknown>)",
      body: `const { course_id, assignment_id, user_id, grade, comment } = args as {
      course_id: number; assignment_id: number; user_id: number;
      grade: number | string; comment?: string;
    };
    return this.request<unknown>("PUT", \`/courses/\${course_id}/assignments/\${assignment_id}/submissions/\${user_id}\`, {
      body: { submission: { posted_grade: grade, comment: comment ? { text_comment: comment } : undefined } },
    });`,
    },
    // Files
    {
      name: "listFiles",
      signature: "async listFiles(courseId: number | string, folderId?: number)",
      body: `const endpoint = folderId ? \`/folders/\${folderId}/files\` : \`/courses/\${courseId}/files\`;
    return this.request<unknown[]>("GET", endpoint);`,
    },
    {
      name: "getFile",
      signature: "async getFile(fileId: number | string)",
      body: `return this.request<unknown>("GET", \`/files/\${fileId}\`);`,
    },
    {
      name: "listFolders",
      signature: "async listFolders(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/folders\`);`,
    },
    // Pages
    {
      name: "listPages",
      signature: "async listPages(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/pages\`);`,
    },
    {
      name: "getPage",
      signature: "async getPage(courseId: number | string, pageUrl: string)",
      body: `return this.request<unknown>("GET", \`/courses/\${courseId}/pages/\${pageUrl}\`);`,
    },
    // Calendar
    {
      name: "listCalendarEvents",
      signature: "async listCalendarEvents(startDate?: string, endDate?: string)",
      body: `const params: Record<string, unknown> = { type: "event", all_events: true };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.request<unknown[]>("GET", "/calendar_events", { params });`,
    },
    {
      name: "getUpcomingAssignments",
      signature: "async getUpcomingAssignments(limit = 10)",
      body: `const data = await this.request<Array<Record<string, unknown>>>("GET", "/users/self/upcoming_events", { params: { limit } });
    return data.filter((event) => event.assignment);`,
    },
    // Dashboard
    {
      name: "getDashboard",
      signature: "async getDashboard()",
      body: `return this.request<unknown>("GET", "/users/self/dashboard");`,
    },
    {
      name: "getDashboardCards",
      signature: "async getDashboardCards()",
      body: `return this.request<unknown[]>("GET", "/dashboard/dashboard_cards");`,
    },
    // Syllabus
    {
      name: "getSyllabus",
      signature: "async getSyllabus(courseId: number | string)",
      body: `const data = await this.request<Record<string, unknown>>("GET", \`/courses/\${courseId}\`, {
      params: { include: ["syllabus_body"] },
    });
    return { course_id: courseId, syllabus_body: data.syllabus_body as string };`,
    },
    // Conversations
    {
      name: "listConversations",
      signature: "async listConversations()",
      body: `return this.request<unknown[]>("GET", "/conversations");`,
    },
    {
      name: "getConversation",
      signature: "async getConversation(conversationId: number | string)",
      body: `return this.request<unknown>("GET", \`/conversations/\${conversationId}\`);`,
    },
    {
      name: "createConversation",
      signature: "async createConversation(recipients: string[], body: string, subject?: string)",
      body: `return this.request<unknown>("POST", "/conversations", { body: { recipients, body, subject } });`,
    },
    // Notifications
    {
      name: "listNotifications",
      signature: "async listNotifications()",
      body: `return this.request<unknown[]>("GET", "/users/self/activity_stream");`,
    },
    // Users
    {
      name: "getUserProfile",
      signature: "async getUserProfile()",
      body: `return this.request<unknown>("GET", "/users/self/profile");`,
    },
    {
      name: "updateUserProfile",
      signature: "async updateUserProfile(profileData: Record<string, unknown>)",
      body: `return this.request<unknown>("PUT", "/users/self", { body: { user: profileData } });`,
    },
    {
      name: "enrollUser",
      signature: "async enrollUser(args: Record<string, unknown>)",
      body: `const { course_id, user_id, role = "StudentEnrollment", enrollment_state = "active" } = args as {
      course_id: number; user_id: number; role?: string; enrollment_state?: string;
    };
    return this.request<unknown>("POST", \`/courses/\${course_id}/enrollments\`, {
      body: { enrollment: { user_id, type: role, enrollment_state } },
    });`,
    },
    // Grades
    {
      name: "getCourseGrades",
      signature: "async getCourseGrades(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/enrollments\`, {
      params: { include: ["grades", "observed_users"] },
    });`,
    },
    {
      name: "getUserGrades",
      signature: "async getUserGrades()",
      body: `const courses = await this.listCourses() as Array<{ id: number }>;
    const allGrades: unknown[] = [];
    for (const course of courses) {
      try {
        const enrollments = await this.request<unknown[]>("GET", \`/courses/\${course.id}/enrollments\`, {
          params: { user_id: "self", include: ["grades"] },
        });
        allGrades.push({ course_id: course.id, enrollments });
      } catch {
        // Skip courses where enrollment lookup fails
      }
    }
    return allGrades;`,
    },
    // Modules
    {
      name: "listModules",
      signature: "async listModules(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/modules\`, { params: { include: ["items"] } });`,
    },
    {
      name: "getModule",
      signature: "async getModule(courseId: number | string, moduleId: number | string)",
      body: `return this.request<unknown>("GET", \`/courses/\${courseId}/modules/\${moduleId}\`, {
      params: { include: ["items"] },
    });`,
    },
    {
      name: "listModuleItems",
      signature: "async listModuleItems(courseId: number | string, moduleId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/modules/\${moduleId}/items\`, {
      params: { include: ["content_details"] },
    });`,
    },
    {
      name: "getModuleItem",
      signature:
        "async getModuleItem(courseId: number | string, moduleId: number | string, itemId: number | string)",
      body: `return this.request<unknown>("GET", \`/courses/\${courseId}/modules/\${moduleId}/items/\${itemId}\`, {
      params: { include: ["content_details"] },
    });`,
    },
    {
      name: "markModuleItemComplete",
      signature:
        "async markModuleItemComplete(courseId: number | string, moduleId: number | string, itemId: number | string)",
      body: `await this.request<void>("PUT", \`/courses/\${courseId}/modules/\${moduleId}/items/\${itemId}/done\`);`,
    },
    // Discussions
    {
      name: "listDiscussionTopics",
      signature: "async listDiscussionTopics(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/discussion_topics\`, {
      params: { include: ["assignment"] },
    });`,
    },
    {
      name: "getDiscussionTopic",
      signature: "async getDiscussionTopic(courseId: number | string, topicId: number | string)",
      body: `return this.request<unknown>("GET", \`/courses/\${courseId}/discussion_topics/\${topicId}\`, {
      params: { include: ["assignment"] },
    });`,
    },
    {
      name: "postToDiscussion",
      signature: "async postToDiscussion(courseId: number | string, topicId: number | string, message: string)",
      body: `return this.request<unknown>("POST", \`/courses/\${courseId}/discussion_topics/\${topicId}/entries\`, {
      body: { message },
    });`,
    },
    // Announcements
    {
      name: "listAnnouncements",
      signature: "async listAnnouncements(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/discussion_topics\`, {
      params: { type: "announcement", include: ["assignment"] },
    });`,
    },
    // Quizzes
    {
      name: "listQuizzes",
      signature: "async listQuizzes(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/quizzes\`);`,
    },
    {
      name: "getQuiz",
      signature: "async getQuiz(courseId: number | string, quizId: number | string)",
      body: `return this.request<unknown>("GET", \`/courses/\${courseId}/quizzes/\${quizId}\`);`,
    },
    {
      name: "createQuiz",
      signature: "async createQuiz(args: Record<string, unknown>)",
      body: `const { course_id, ...quizData } = args;
    return this.request<unknown>("POST", \`/courses/\${course_id}/quizzes\`, { body: { quiz: quizData } });`,
    },
    {
      name: "startQuizAttempt",
      signature: "async startQuizAttempt(courseId: number | string, quizId: number | string)",
      body: `return this.request<unknown>("POST", \`/courses/\${courseId}/quizzes/\${quizId}/submissions\`);`,
    },
    // Rubrics
    {
      name: "listRubrics",
      signature: "async listRubrics(courseId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/courses/\${courseId}/rubrics\`);`,
    },
    {
      name: "getRubric",
      signature: "async getRubric(courseId: number | string, rubricId: number | string)",
      body: `return this.request<unknown>("GET", \`/courses/\${courseId}/rubrics/\${rubricId}\`);`,
    },
    // Accounts
    {
      name: "getAccount",
      signature: "async getAccount(accountId: number | string)",
      body: `return this.request<unknown>("GET", \`/accounts/\${accountId}\`);`,
    },
    {
      name: "listAccountCourses",
      signature: "async listAccountCourses(args: Record<string, unknown>)",
      body: `const { account_id, ...params } = args;
    return this.request<unknown[]>("GET", \`/accounts/\${account_id}/courses\`, { params });`,
    },
    {
      name: "listAccountUsers",
      signature: "async listAccountUsers(args: Record<string, unknown>)",
      body: `const { account_id, ...params } = args;
    return this.request<unknown[]>("GET", \`/accounts/\${account_id}/users\`, { params });`,
    },
    {
      name: "createUser",
      signature: "async createUser(args: Record<string, unknown>)",
      body: `const { account_id, ...userData } = args;
    return this.request<unknown>("POST", \`/accounts/\${account_id}/users\`, { body: userData });`,
    },
    {
      name: "listSubAccounts",
      signature: "async listSubAccounts(accountId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/accounts/\${accountId}/sub_accounts\`);`,
    },
    // Account Reports
    {
      name: "getAccountReports",
      signature: "async getAccountReports(accountId: number | string)",
      body: `return this.request<unknown[]>("GET", \`/accounts/\${accountId}/reports\`);`,
    },
    {
      name: "createAccountReport",
      signature: "async createAccountReport(args: Record<string, unknown>)",
      body: `const { account_id, report, parameters } = args as {
      account_id: number; report: string; parameters?: Record<string, unknown>;
    };
    return this.request<unknown>("POST", \`/accounts/\${account_id}/reports/\${report}\`, {
      body: { parameters: parameters || {} },
    });`,
    },
  ];
}

function generateCanvasApi(methods: ApiMethod[]): string {
  const readOnlyMethods = methods.filter((method) => !MUTATING_API_METHOD_NAMES.has(method.name));
  const lines: string[] = [
    `// AUTO-GENERATED by scripts/sync-upstream.ts — DO NOT EDIT`,
    ``,
    `import type { CanvasClient } from "../canvas-client.js";`,
    ``,
    `// Extend CanvasClient prototype with read-only API methods`,
    `export function installApiMethods(Client: typeof CanvasClient): void {`,
    `  const proto = Client.prototype;`,
    ``,
  ];

  for (const m of readOnlyMethods) {
    // Convert "async methodName(params)" → "async function(params)"
    const funcSig = m.signature.replace(/^async\s+\w+/, "async function");
    lines.push(`  proto.${m.name} = ${funcSig} {`);
    // Normalize body indentation: compute common indent from lines 2+ (line 1 follows backtick)
    const bodyLines = m.body.split("\n");
    const tailLines = bodyLines.slice(1).filter((l) => l.trim().length > 0);
    const minIndent = tailLines.length > 0
      ? tailLines.reduce((min, l) => Math.min(min, (l.match(/^(\s*)/)?.[1].length ?? 0)), Infinity)
      : 0;
    for (const line of bodyLines) {
      const stripped = minIndent > 0 ? line.replace(new RegExp(`^ {0,${minIndent}}`), "") : line;
      lines.push(stripped.length > 0 ? `    ${stripped}` : "");
    }
    lines.push(`  };`);
    lines.push(``);
  }

  lines.push(`}`);
  lines.push(``);

  // Generate declaration merging for type safety
  lines.push(`// Declaration merging so callers get full type info`);
  lines.push(`declare module "../canvas-client.js" {`);
  lines.push(`  interface CanvasClient {`);
  for (const m of readOnlyMethods) {
    // Convert "async methodName(params)" → "methodName(params): Promise<unknown>"
    let sig = m.signature.replace(/^async\s+/, "");
    // Strip default values from typed params: `param: Type = value` → `param?: Type`
    sig = sig.replace(/(\w+)(:\s*[^=,)]+?)\s*=\s*[^,)]+/g, "$1?$2");
    // Strip default values from untyped params: `param = false` → `param?: boolean`, etc.
    sig = sig.replace(/(\w+)\s*=\s*false/g, "$1?: boolean");
    sig = sig.replace(/(\w+)\s*=\s*true/g, "$1?: boolean");
    sig = sig.replace(/(\w+)\s*=\s*\d+/g, "$1?: number");
    sig = sig.replace(/(\w+)\s*=\s*"[^"]*"/g, "$1?: string");
    lines.push(`    ${sig}: Promise<unknown>;`);
  }
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 5. Generate register-tools.ts
// ---------------------------------------------------------------------------

function jsonSchemaPropertyToZod(
  propName: string,
  prop: ToolProperty,
  required: boolean
): string {
  let zodExpr: string;

  // Handle oneOf (e.g., grade: number | string)
  if (prop.oneOf) {
    const parts = prop.oneOf.map((p) => typeToZod(p));
    zodExpr = `z.union([${parts.join(", ")}])`;
  } else if (prop.type === "object" && prop.properties) {
    // Nested object schema
    const nested = Object.entries(prop.properties).map(([k, v]) => {
      const isReq = prop.required?.includes(k) ?? false;
      return `${k}: ${jsonSchemaPropertyToZod(k, v, isReq)}`;
    });
    zodExpr = `z.object({ ${nested.join(", ")} })`;
  } else {
    zodExpr = typeToZod(prop);
  }

  if (prop.description) {
    zodExpr += `.describe(${JSON.stringify(prop.description)})`;
  }

  if (!required) {
    zodExpr += `.optional()`;
  }

  return zodExpr;
}

function typeToZod(prop: ToolProperty): string {
  switch (prop.type) {
    case "string":
      if (prop.enum) {
        return `z.enum([${prop.enum.map((e) => JSON.stringify(e)).join(", ")}])`;
      }
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "array":
      if (prop.items) {
        return `z.array(${typeToZod(prop.items)})`;
      }
      return "z.array(z.unknown())";
    case "object":
      return "z.record(z.string(), z.unknown())";
    default:
      return "z.unknown()";
  }
}

/** Map tool name → client method name and call expression */
function toolToMethodCall(
  toolName: string,
  tool: ToolDef
): { methodCall: string; needsArgs: boolean } {
  // Strip canvas_ prefix, convert snake_case to camelCase
  const stripped = toolName.replace(/^canvas_/, "");
  const camel = stripped.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  // Special-case handlers that match upstream switch exactly
  switch (toolName) {
    case "canvas_health_check":
      return { methodCall: "client.healthCheck()", needsArgs: false };
    case "canvas_list_courses":
      return { methodCall: "client.listCourses(args.include_ended ?? false)", needsArgs: true };
    case "canvas_get_course":
      return { methodCall: "client.getCourse(args.course_id)", needsArgs: true };
    case "canvas_create_course":
    case "canvas_update_course":
    case "canvas_create_assignment":
    case "canvas_update_assignment":
    case "canvas_submit_assignment":
    case "canvas_submit_grade":
    case "canvas_enroll_user":
    case "canvas_list_account_courses":
    case "canvas_list_account_users":
    case "canvas_create_user":
    case "canvas_create_account_report":
      return { methodCall: `client.${camel}(args)`, needsArgs: true };
    case "canvas_list_assignments":
      return {
        methodCall: "client.listAssignments(args.course_id, args.include_submissions ?? false)",
        needsArgs: true,
      };
    case "canvas_get_assignment":
      return {
        methodCall:
          "client.getAssignment(args.course_id, args.assignment_id, args.include_submission ?? false)",
        needsArgs: true,
      };
    case "canvas_list_assignment_groups":
      return { methodCall: "client.listAssignmentGroups(args.course_id)", needsArgs: true };
    case "canvas_get_submission":
      return {
        methodCall: 'client.getSubmission(args.course_id, args.assignment_id, args.user_id ?? "self")',
        needsArgs: true,
      };
    case "canvas_list_files":
      return { methodCall: "client.listFiles(args.course_id, args.folder_id)", needsArgs: true };
    case "canvas_get_file":
      return { methodCall: "client.getFile(args.file_id)", needsArgs: true };
    case "canvas_list_folders":
      return { methodCall: "client.listFolders(args.course_id)", needsArgs: true };
    case "canvas_list_pages":
      return { methodCall: "client.listPages(args.course_id)", needsArgs: true };
    case "canvas_get_page":
      return { methodCall: "client.getPage(args.course_id, args.page_url)", needsArgs: true };
    case "canvas_list_calendar_events":
      return { methodCall: "client.listCalendarEvents(args.start_date, args.end_date)", needsArgs: true };
    case "canvas_get_upcoming_assignments":
      return { methodCall: "client.getUpcomingAssignments(args.limit ?? 10)", needsArgs: true };
    case "canvas_get_dashboard":
      return { methodCall: "client.getDashboard()", needsArgs: false };
    case "canvas_get_dashboard_cards":
      return { methodCall: "client.getDashboardCards()", needsArgs: false };
    case "canvas_get_course_grades":
      return { methodCall: "client.getCourseGrades(args.course_id)", needsArgs: true };
    case "canvas_get_user_grades":
      return { methodCall: "client.getUserGrades()", needsArgs: false };
    case "canvas_get_user_profile":
      return { methodCall: "client.getUserProfile()", needsArgs: false };
    case "canvas_update_user_profile":
      return { methodCall: "client.updateUserProfile(args)", needsArgs: true };
    case "canvas_list_modules":
      return { methodCall: "client.listModules(args.course_id)", needsArgs: true };
    case "canvas_get_module":
      return { methodCall: "client.getModule(args.course_id, args.module_id)", needsArgs: true };
    case "canvas_list_module_items":
      return { methodCall: "client.listModuleItems(args.course_id, args.module_id)", needsArgs: true };
    case "canvas_get_module_item":
      return {
        methodCall: "client.getModuleItem(args.course_id, args.module_id, args.item_id)",
        needsArgs: true,
      };
    case "canvas_mark_module_item_complete":
      return {
        methodCall: "client.markModuleItemComplete(args.course_id, args.module_id, args.item_id)",
        needsArgs: true,
      };
    case "canvas_list_discussion_topics":
      return { methodCall: "client.listDiscussionTopics(args.course_id)", needsArgs: true };
    case "canvas_get_discussion_topic":
      return { methodCall: "client.getDiscussionTopic(args.course_id, args.topic_id)", needsArgs: true };
    case "canvas_post_to_discussion":
      return {
        methodCall: "client.postToDiscussion(args.course_id, args.topic_id, args.message)",
        needsArgs: true,
      };
    case "canvas_list_announcements":
      return { methodCall: "client.listAnnouncements(args.course_id)", needsArgs: true };
    case "canvas_list_quizzes":
      return { methodCall: "client.listQuizzes(args.course_id)", needsArgs: true };
    case "canvas_get_quiz":
      return { methodCall: "client.getQuiz(args.course_id, args.quiz_id)", needsArgs: true };
    case "canvas_create_quiz":
      return { methodCall: `client.${camel}(args)`, needsArgs: true };
    case "canvas_start_quiz_attempt":
      return { methodCall: "client.startQuizAttempt(args.course_id, args.quiz_id)", needsArgs: true };
    case "canvas_list_rubrics":
      return { methodCall: "client.listRubrics(args.course_id)", needsArgs: true };
    case "canvas_get_rubric":
      return { methodCall: "client.getRubric(args.course_id, args.rubric_id)", needsArgs: true };
    case "canvas_list_conversations":
      return { methodCall: "client.listConversations()", needsArgs: false };
    case "canvas_get_conversation":
      return { methodCall: "client.getConversation(args.conversation_id)", needsArgs: true };
    case "canvas_create_conversation":
      return {
        methodCall: "client.createConversation(args.recipients, args.body, args.subject)",
        needsArgs: true,
      };
    case "canvas_list_notifications":
      return { methodCall: "client.listNotifications()", needsArgs: false };
    case "canvas_get_syllabus":
      return { methodCall: "client.getSyllabus(args.course_id)", needsArgs: true };
    case "canvas_get_account":
      return { methodCall: "client.getAccount(args.account_id)", needsArgs: true };
    case "canvas_list_sub_accounts":
      return { methodCall: "client.listSubAccounts(args.account_id)", needsArgs: true };
    case "canvas_get_account_reports":
      return { methodCall: "client.getAccountReports(args.account_id)", needsArgs: true };
    default:
      // Fallback: pass all args
      return { methodCall: `client.${camel}(args)`, needsArgs: true };
  }
}

function generateToolRegistration(tools: ToolDef[]): string {
  const readOnlyTools = tools.filter((tool) => !MUTATING_TOOL_NAMES.has(tool.name));

  const lines: string[] = [
    `// AUTO-GENERATED by scripts/sync-upstream.ts — DO NOT EDIT`,
    ``,
    `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";`,
    `import { z } from "zod";`,
    `import type { CanvasClient } from "../canvas-client.js";`,
    `import { CanvasAPIError } from "../types.js";`,
    `import { normalizeTimezone } from "../utils.js";`,
    ``,
    `type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };`,
    `type RegisterToolsOptions = { timezone?: string };`,
    ``,
    `const ISO_DATE_TIME_PATTERN = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$/;`,
    `function ok(data: unknown, formatter: Intl.DateTimeFormat): ToolResult {`,
    `  return { content: [{ type: "text", text: JSON.stringify(addLocalizedDateFields(data, formatter), null, 2) }] };`,
    `}`,
    ``,
    `function fail(error: unknown): ToolResult {`,
    `  let text: string;`,
    `  if (error instanceof CanvasAPIError) {`,
    `    text = \`Canvas API Error (HTTP \${error.statusCode}): \${error.message}\`;`,
    `  } else if (error instanceof Error) {`,
    `    text = \`Error: \${error.message}\`;`,
    `  } else {`,
    `    text = \`Error: \${String(error)}\`;`,
    `  }`,
    `  return { content: [{ type: "text", text }], isError: true };`,
    `}`,
    ``,
    `function addLocalizedDateFields(data: unknown, formatter: Intl.DateTimeFormat): unknown {`,
    `  if (Array.isArray(data)) return data.map((item) => addLocalizedDateFields(item, formatter));`,
    `  if (!data || typeof data !== "object") return data;`,
    ``,
    `  const record = data as Record<string, unknown>;`,
    `  const localized: Record<string, unknown> = {};`,
    `  for (const [key, value] of Object.entries(record)) {`,
    `    localized[key] = addLocalizedDateFields(value, formatter);`,
    `    const localKey = \`\${key}_local\`;`,
    `    const localValue = typeof value === "string" ? formatLocalDate(value, formatter) : null;`,
    `    if (localValue && !Object.prototype.hasOwnProperty.call(record, localKey)) {`,
    `      localized[localKey] = localValue;`,
    `    }`,
    `  }`,
    `  return localized;`,
    `}`,
    ``,
    `function formatLocalDate(value: string, formatter: Intl.DateTimeFormat): string | null {`,
    `  if (!ISO_DATE_TIME_PATTERN.test(value)) return null;`,
    `  const date = new Date(value);`,
    `  if (Number.isNaN(date.getTime())) return null;`,
    `  return formatter.format(date);`,
    `}`,
    ``,
    `function toolAnnotations(_toolName?: string) {`,
    `  return { readOnlyHint: true };`,
    `}`,
    ``,
    `export function registerAllTools(server: McpServer, client: CanvasClient, options: RegisterToolsOptions = {}): void {`,
    `  const timezone = normalizeTimezone(options.timezone);`,
    `  const formatter = new Intl.DateTimeFormat("en-US", {`,
    `    day: "numeric",`,
    `    hour: "numeric",`,
    `    minute: "2-digit",`,
    `    month: "short",`,
    `    timeZoneName: "short",`,
    `    timeZone: timezone,`,
    `    year: "numeric",`,
    `  });`,
  ];

  for (const tool of readOnlyTools) {
    const props = tool.inputSchema.properties;
    const required = tool.inputSchema.required ?? [];
    const { methodCall, needsArgs } = toolToMethodCall(tool.name, tool);

    // Build Zod schema object entries
    const schemaEntries: string[] = [];
    for (const [propName, propDef] of Object.entries(props)) {
      const isRequired = required.includes(propName);
      schemaEntries.push(
        `        ${propName}: ${jsonSchemaPropertyToZod(propName, propDef, isRequired)},`
      );
    }

    const schemaObj =
      schemaEntries.length > 0
        ? `{\n${schemaEntries.join("\n")}\n      }`
        : "{}";

    const argsParam = needsArgs ? "args" : "";

    lines.push(`  server.registerTool(`);
    lines.push(`    ${JSON.stringify(tool.name)},`);
    lines.push(`    {`);
    lines.push(`      description: ${JSON.stringify(tool.description)},`);
    lines.push(`      inputSchema: ${schemaObj},`);
    lines.push(`      annotations: toolAnnotations(${JSON.stringify(tool.name)}),`);
    lines.push(`    },`);
    lines.push(`    async (${argsParam}) => {`);
    lines.push(`      try {`);

    // Special case for markModuleItemComplete which returns void
    if (tool.name === "canvas_mark_module_item_complete") {
      lines.push(`        await ${methodCall};`);
      lines.push(`        return ok({ status: "ok" }, formatter);`);
    } else {
      lines.push(`        return ok(await ${methodCall}, formatter);`);
    }

    lines.push(`      } catch (error) {`);
    lines.push(`        return fail(error);`);
    lines.push(`      }`);
    lines.push(`    },`);
    lines.push(`  );`);
    lines.push(``);
  }

  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 6. Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching upstream sources...");
  const [indexSource, typesSource] = await Promise.all([
    fetchText(`${UPSTREAM_BASE}/index.ts`),
    fetchText(`${UPSTREAM_BASE}/types.ts`),
  ]);

  console.log("Parsing RAW_TOOLS...");
  const tools = parseRawTools(indexSource);
  console.log(`  Found ${tools.length} tools`);

  console.log("Generating types...");
  const typesOut = generateTypes(typesSource);

  console.log("Generating canvas-api...");
  const apiMethods = buildApiMethods();
  const apiOut = generateCanvasApi(apiMethods);

  console.log("Generating tool registrations...");
  const toolsOut = generateToolRegistration(tools);

  // Ensure output dir exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Write all files — if any write fails, report what succeeded
  const filesToWrite = [
    ["types.ts", typesOut],
    ["canvas-api.ts", apiOut],
    ["register-tools.ts", toolsOut],
  ] as const;
  const written: string[] = [];
  for (const [name, content] of filesToWrite) {
    fs.writeFileSync(path.join(OUT_DIR, name), content);
    written.push(name);
  }

  console.log(`\nGenerated ${tools.length} tools into src/generated/`);
  console.log("  - types.ts");
  console.log("  - canvas-api.ts");
  console.log("  - register-tools.ts");
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
