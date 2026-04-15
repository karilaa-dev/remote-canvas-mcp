import type { CanvasCalendarEvent, CanvasCourse } from "./canvas-types.js";
import { CanvasAPIError } from "./types.js";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type RequestOptions = { params?: Record<string, unknown>; body?: unknown };
type CanvasFetch = typeof fetch;

export interface CanvasClientOptions {
  fetchImpl?: CanvasFetch;
  maxRetries?: number;
  retryDelay?: number;
}

type ActiveCourseSummary = Pick<CanvasCourse, "id" | "name">;
type AssignmentCalendarEvent = CanvasCalendarEvent & {
  assignment?: {
    course_id?: number;
    due_at?: string | null;
    id?: number;
    name?: string;
  };
};

export class CanvasClient {
  private readonly baseURL: string;
  private readonly fetchImpl: CanvasFetch;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly token: string;

  constructor(token: string, domain: string, options: CanvasClientOptions = {}) {
    this.baseURL = `https://${domain}/api/v1`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = token;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
  }

  async request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const response = await this.sendRequest(method, url.toString(), options?.body);
    return this.parseResponse<T>(response);
  }

  async healthCheck() {
    try {
      const user = await this.getUserProfile() as { id: number; name: string };
      return {
        status: "ok" as const,
        timestamp: new Date().toISOString(),
        user: { id: user.id, name: user.name },
      };
    } catch (error) {
      return {
        status: "error" as const,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listCourses(includeEnded = false) {
    const params: Record<string, unknown> = {
      include: ["total_students", "teachers", "term", "course_progress"],
    };
    if (!includeEnded) {
      params.state = ["available"];
    }

    return this.request<CanvasCourse[]>("GET", "/courses", { params });
  }

  async getCourse(courseId: number | string) {
    return this.request<unknown>("GET", `/courses/${courseId}`, {
      params: {
        include: ["total_students", "teachers", "term", "course_progress", "sections", "syllabus_body"],
      },
    });
  }

  async createCourse(args: Record<string, unknown>) {
    const { account_id, ...courseData } = args;
    return this.request<unknown>("POST", `/accounts/${account_id}/courses`, { body: { course: courseData } });
  }

  async updateCourse(args: Record<string, unknown>) {
    const { course_id, ...courseData } = args;
    return this.request<unknown>("PUT", `/courses/${course_id}`, { body: { course: courseData } });
  }

  async listAssignments(courseId: number | string, includeSubmissions = false) {
    const include = ["assignment_group", "rubric", "due_at"];
    if (includeSubmissions) include.push("submission");
    return this.request<unknown[]>("GET", `/courses/${courseId}/assignments`, { params: { include } });
  }

  async getAssignment(courseId: number | string, assignmentId: number | string, includeSubmission = false) {
    const include = ["assignment_group", "rubric"];
    if (includeSubmission) include.push("submission");
    return this.request<unknown>("GET", `/courses/${courseId}/assignments/${assignmentId}`, { params: { include } });
  }

  async createAssignment(args: Record<string, unknown>) {
    const { course_id, ...assignmentData } = args;
    return this.request<unknown>("POST", `/courses/${course_id}/assignments`, { body: { assignment: assignmentData } });
  }

  async updateAssignment(args: Record<string, unknown>) {
    const { course_id, assignment_id, ...assignmentData } = args;
    return this.request<unknown>("PUT", `/courses/${course_id}/assignments/${assignment_id}`, {
      body: { assignment: assignmentData },
    });
  }

  async listAssignmentGroups(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/assignment_groups`, {
      params: { include: ["assignments"] },
    });
  }

  async getSubmission(courseId: number | string, assignmentId: number | string, userId: number | string = "self") {
    return this.request<unknown>("GET", `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`, {
      params: { include: ["submission_comments", "rubric_assessment", "assignment"] },
    });
  }

  async submitAssignment(args: Record<string, unknown>) {
    const { course_id, assignment_id, submission_type, body, url, file_ids } = args as {
      body?: string;
      course_id: number;
      assignment_id: number;
      file_ids?: number[];
      submission_type: string;
      url?: string;
    };
    const submissionData: Record<string, unknown> = { submission_type };
    if (body) submissionData.body = body;
    if (url) submissionData.url = url;
    if (file_ids && file_ids.length > 0) submissionData.file_ids = file_ids;
    return this.request<unknown>("POST", `/courses/${course_id}/assignments/${assignment_id}/submissions`, {
      body: { submission: submissionData },
    });
  }

  async submitGrade(args: Record<string, unknown>) {
    const { course_id, assignment_id, user_id, grade, comment } = args as {
      comment?: string;
      course_id: number;
      assignment_id: number;
      grade: number | string;
      user_id: number;
    };
    return this.request<unknown>("PUT", `/courses/${course_id}/assignments/${assignment_id}/submissions/${user_id}`, {
      body: {
        submission: {
          posted_grade: grade,
          comment: comment ? { text_comment: comment } : undefined,
        },
      },
    });
  }

  async listFiles(courseId: number | string, folderId?: number) {
    const endpoint = folderId ? `/folders/${folderId}/files` : `/courses/${courseId}/files`;
    return this.request<unknown[]>("GET", endpoint);
  }

  async getFile(fileId: number | string) {
    return this.request<unknown>("GET", `/files/${fileId}`);
  }

  async listFolders(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/folders`);
  }

  async listPages(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/pages`);
  }

  async getPage(courseId: number | string, pageUrl: string) {
    return this.request<unknown>("GET", `/courses/${courseId}/pages/${pageUrl}`);
  }

  async listCalendarEvents(startDate?: string, endDate?: string) {
    const params: Record<string, unknown> = { type: "event" };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.request<unknown[]>("GET", "/calendar_events", { params });
  }

  async getUpcomingAssignments(limit = 10) {
    const data = await this.request<Array<Record<string, unknown>>>("GET", "/users/self/upcoming_events", {
      params: { limit },
    });
    return data.filter((event) => event.assignment);
  }

  async listAssignmentsForActiveCourses(startDate: string, endDate: string, limit?: number) {
    const activeCourses = await this.listActiveCourses();
    if (activeCourses.length === 0) {
      return [];
    }

    const courseNamesById = new Map(activeCourses.map((course) => [course.id, course.name]));
    const dedupedEvents = new Map<string, Record<string, unknown>>();

    for (const contextCodes of chunk(activeCourses.map((course) => `course_${course.id}`), 10)) {
      const events = await this.request<AssignmentCalendarEvent[]>("GET", "/calendar_events", {
        params: {
          context_codes: contextCodes,
          end_date: endDate,
          start_date: startDate,
          type: "assignment",
        },
      });

      for (const event of events) {
        const assignment = event.assignment;
        const dueAt = assignment?.due_at;
        if (!assignment?.id || !dueAt) {
          continue;
        }

        const courseId = assignment.course_id ?? event.context_id;
        const key = `${courseId}:${assignment.id}`;
        if (dedupedEvents.has(key)) {
          continue;
        }

        dedupedEvents.set(key, {
          ...event,
          course_id: courseId,
          course_name: courseNamesById.get(courseId) ?? null,
        });
      }
    }

    const sortedEvents = Array.from(dedupedEvents.values()).sort(compareAssignmentEvents);
    return limit === undefined ? sortedEvents : sortedEvents.slice(0, limit);
  }

  async getDashboard() {
    return this.request<unknown>("GET", "/users/self/dashboard");
  }

  async getDashboardCards() {
    return this.request<unknown[]>("GET", "/dashboard/dashboard_cards");
  }

  async getSyllabus(courseId: number | string) {
    const data = await this.request<Record<string, unknown>>("GET", `/courses/${courseId}`, {
      params: { include: ["syllabus_body"] },
    });
    return { course_id: courseId, syllabus_body: data.syllabus_body as string };
  }

  async listConversations() {
    return this.request<unknown[]>("GET", "/conversations");
  }

  async getConversation(conversationId: number | string) {
    return this.request<unknown>("GET", `/conversations/${conversationId}`);
  }

  async createConversation(recipients: string[], body: string, subject?: string) {
    return this.request<unknown>("POST", "/conversations", { body: { recipients, body, subject } });
  }

  async listNotifications() {
    return this.request<unknown[]>("GET", "/users/self/activity_stream");
  }

  async getUserProfile() {
    return this.request<unknown>("GET", "/users/self/profile");
  }

  async updateUserProfile(profileData: Record<string, unknown>) {
    return this.request<unknown>("PUT", "/users/self", { body: { user: profileData } });
  }

  async enrollUser(args: Record<string, unknown>) {
    const { course_id, user_id, role = "StudentEnrollment", enrollment_state = "active" } = args as {
      course_id: number;
      enrollment_state?: string;
      role?: string;
      user_id: number;
    };
    return this.request<unknown>("POST", `/courses/${course_id}/enrollments`, {
      body: { enrollment: { user_id, type: role, enrollment_state } },
    });
  }

  async getCourseGrades(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/enrollments`, {
      params: { include: ["grades", "observed_users"] },
    });
  }

  async getUserGrades() {
    const courses = await this.listCourses(true) as Array<{ id: number }>;
    const allGrades: unknown[] = [];
    for (const course of courses) {
      try {
        const enrollments = await this.request<unknown[]>("GET", `/courses/${course.id}/enrollments`, {
          params: { user_id: "self", include: ["grades"] },
        });
        allGrades.push({ course_id: course.id, enrollments });
      } catch {
        // Skip courses where enrollment lookup fails.
      }
    }
    return allGrades;
  }

  async listModules(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/modules`, { params: { include: ["items"] } });
  }

  async getModule(courseId: number | string, moduleId: number | string) {
    return this.request<unknown>("GET", `/courses/${courseId}/modules/${moduleId}`, {
      params: { include: ["items"] },
    });
  }

  async listModuleItems(courseId: number | string, moduleId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/modules/${moduleId}/items`, {
      params: { include: ["content_details"] },
    });
  }

  async getModuleItem(courseId: number | string, moduleId: number | string, itemId: number | string) {
    return this.request<unknown>("GET", `/courses/${courseId}/modules/${moduleId}/items/${itemId}`, {
      params: { include: ["content_details"] },
    });
  }

  async markModuleItemComplete(courseId: number | string, moduleId: number | string, itemId: number | string) {
    await this.request<void>("PUT", `/courses/${courseId}/modules/${moduleId}/items/${itemId}/done`);
  }

  async listDiscussionTopics(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/discussion_topics`, {
      params: { include: ["assignment"] },
    });
  }

  async getDiscussionTopic(courseId: number | string, topicId: number | string) {
    return this.request<unknown>("GET", `/courses/${courseId}/discussion_topics/${topicId}`, {
      params: { include: ["assignment"] },
    });
  }

  async postToDiscussion(courseId: number | string, topicId: number | string, message: string) {
    return this.request<unknown>("POST", `/courses/${courseId}/discussion_topics/${topicId}/entries`, {
      body: { message },
    });
  }

  async listAnnouncements(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/discussion_topics`, {
      params: { type: "announcement", include: ["assignment"] },
    });
  }

  async listQuizzes(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/quizzes`);
  }

  async getQuiz(courseId: number | string, quizId: number | string) {
    return this.request<unknown>("GET", `/courses/${courseId}/quizzes/${quizId}`);
  }

  async createQuiz(args: Record<string, unknown>) {
    const { course_id, ...quizData } = args;
    return this.request<unknown>("POST", `/courses/${course_id}/quizzes`, { body: { quiz: quizData } });
  }

  async startQuizAttempt(courseId: number | string, quizId: number | string) {
    return this.request<unknown>("POST", `/courses/${courseId}/quizzes/${quizId}/submissions`);
  }

  async listRubrics(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/rubrics`);
  }

  async getRubric(courseId: number | string, rubricId: number | string) {
    return this.request<unknown>("GET", `/courses/${courseId}/rubrics/${rubricId}`);
  }

  async getAccount(accountId: number | string) {
    return this.request<unknown>("GET", `/accounts/${accountId}`);
  }

  async listAccountCourses(args: Record<string, unknown>) {
    const { account_id, ...params } = args;
    return this.request<unknown[]>("GET", `/accounts/${account_id}/courses`, { params });
  }

  async listAccountUsers(args: Record<string, unknown>) {
    const { account_id, ...params } = args;
    return this.request<unknown[]>("GET", `/accounts/${account_id}/users`, { params });
  }

  async createUser(args: Record<string, unknown>) {
    const { account_id, ...userData } = args;
    return this.request<unknown>("POST", `/accounts/${account_id}/users`, { body: userData });
  }

  async listSubAccounts(accountId: number | string) {
    return this.request<unknown[]>("GET", `/accounts/${accountId}/sub_accounts`);
  }

  async getAccountReports(accountId: number | string) {
    return this.request<unknown[]>("GET", `/accounts/${accountId}/reports`);
  }

  async createAccountReport(args: Record<string, unknown>) {
    const { account_id, report, parameters } = args as {
      account_id: number;
      parameters?: Record<string, unknown>;
      report: string;
    };
    return this.request<unknown>("POST", `/accounts/${account_id}/reports/${report}`, {
      body: { parameters: parameters ?? {} },
    });
  }

  private async listActiveCourses(): Promise<ActiveCourseSummary[]> {
    const courses = await this.listCourses(false);
    return courses.map(({ id, name }) => ({ id, name }));
  }

  private buildHeaders(body?: unknown): HeadersInit {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  private buildUrl(pathOrUrl: string, params?: Record<string, unknown>): URL {
    const url = /^https?:\/\//i.test(pathOrUrl)
      ? new URL(pathOrUrl)
      : new URL(`${this.baseURL}${pathOrUrl}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(`${key}[]`, String(item));
          }
          continue;
        }

        url.searchParams.set(key, String(value));
      }
    }

    return url;
  }

  private async createHttpError(response: Response, fallbackMessage?: string): Promise<CanvasAPIError> {
    let errorMessage = fallbackMessage ?? `HTTP ${response.status}`;

    try {
      const errorData = await response.text();
      if (errorData) {
        errorMessage = errorData.length > 200 ? `${errorData.substring(0, 200)}...` : errorData;
      }
    } catch {
      // Ignore response parsing failures and use the fallback message.
    }

    return new CanvasAPIError(`Canvas API Error (${response.status}): ${errorMessage}`, response.status);
  }

  private getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    const links = linkHeader.split(",");
    const nextLink = links.find((link) => link.includes('rel="next"'));
    if (!nextLink) return null;

    const match = nextLink.match(/<(.+?)>/);
    return match ? match[1] : null;
  }

  private getRetryDelay(response: Response | undefined, attempt: number): number {
    const retryAfter = response?.headers.get("Retry-After");
    if (retryAfter) {
      const parsedSeconds = Number.parseFloat(retryAfter);
      if (Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
        return parsedSeconds * 1000;
      }

      const parsedDate = Date.parse(retryAfter);
      if (!Number.isNaN(parsedDate)) {
        return Math.max(0, parsedDate - Date.now());
      }
    }

    return this.retryDelay * Math.pow(2, attempt);
  }

  private async handlePagination(data: unknown[], response: Response): Promise<unknown[]> {
    const allData = [...data];
    let nextUrl = this.getNextPageUrl(response.headers.get("link"));

    while (nextUrl) {
      const nextResponse = await this.sendRequest("GET", nextUrl);
      if (!nextResponse.ok) {
        throw await this.createHttpError(nextResponse, `Pagination failed (HTTP ${nextResponse.status})`);
      }

      let nextData: unknown;
      try {
        nextData = await nextResponse.json();
      } catch (error) {
        throw new CanvasAPIError(
          `Failed to parse paginated response: ${error instanceof Error ? error.message : String(error)}`,
          0,
        );
      }

      if (Array.isArray(nextData)) {
        allData.push(...nextData);
      }

      nextUrl = this.getNextPageUrl(nextResponse.headers.get("link"));
    }

    return allData;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      throw new CanvasAPIError(
        `Failed to parse Canvas response: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }

    if (Array.isArray(data)) {
      return (await this.handlePagination(data, response)) as T;
    }

    return data as T;
  }

  private async sendRequest(method: HttpMethod, url: string, body?: unknown): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: this.buildHeaders(body),
          method,
        });

        if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
          await this.sleep(this.getRetryDelay(response, attempt));
          continue;
        }

        return response;
      } catch (error) {
        if (attempt < this.maxRetries) {
          await this.sleep(this.getRetryDelay(undefined, attempt));
          continue;
        }

        throw new CanvasAPIError(`Network error: ${error instanceof Error ? error.message : String(error)}`, 0);
      }
    }

    throw new CanvasAPIError("Max retries exceeded", 0);
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function compareAssignmentEvents(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftAssignment = asAssignmentRecord(left.assignment);
  const rightAssignment = asAssignmentRecord(right.assignment);

  const dueAtCompare = compareStrings(leftAssignment?.due_at, rightAssignment?.due_at);
  if (dueAtCompare !== 0) {
    return dueAtCompare;
  }

  const courseNameCompare = compareStrings(asOptionalString(left.course_name), asOptionalString(right.course_name));
  if (courseNameCompare !== 0) {
    return courseNameCompare;
  }

  const assignmentNameCompare = compareStrings(leftAssignment?.name, rightAssignment?.name);
  if (assignmentNameCompare !== 0) {
    return assignmentNameCompare;
  }

  return compareNumbers(leftAssignment?.id, rightAssignment?.id);
}

function compareNumbers(left: number | undefined, right: number | undefined): number {
  if (left === right) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }
  return left - right;
}

function compareStrings(left?: string | null, right?: string | null): number {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

function asAssignmentRecord(value: unknown): { due_at?: string | null; id?: number; name?: string } | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return {
    due_at: asOptionalString(record.due_at),
    id: typeof record.id === "number" ? record.id : undefined,
    name: asOptionalString(record.name) ?? undefined,
  };
}

function asOptionalString(value: unknown): string | null | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return null;
  }
  return undefined;
}
