import { CanvasAPIError } from "./types.js";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export class CanvasClient {
  private baseURL: string;
  private token: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(token: string, domain: string, options?: { maxRetries?: number; retryDelay?: number }) {
    this.baseURL = `https://${domain}/api/v1`;
    this.token = token;
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelay = options?.retryDelay ?? 1000;
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    options?: { params?: Record<string, unknown>; body?: unknown }
  ): Promise<T> {
    const url = new URL(`${this.baseURL}${path}`);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(`${key}[]`, String(v));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
        });

        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.maxRetries) {
            await this.sleep(this.retryDelay * Math.pow(2, attempt));
            continue;
          }
        }

        if (!response.ok) {
          let errorMessage: string;
          try {
            const errorData = await response.text();
            errorMessage = errorData.length > 200 ? errorData.substring(0, 200) + "..." : errorData;
          } catch {
            errorMessage = `HTTP ${response.status}`;
          }
          throw new CanvasAPIError(`Canvas API Error (${response.status}): ${errorMessage}`, response.status);
        }

        if (response.status === 204) {
          return undefined as T;
        }

        const data = await response.json();

        if (Array.isArray(data)) {
          return (await this.handlePagination(data, response)) as T;
        }

        return data as T;
      } catch (error) {
        if (error instanceof CanvasAPIError) throw error;
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
          continue;
        }
        throw new CanvasAPIError(`Network error: ${error instanceof Error ? error.message : String(error)}`, 0);
      }
    }

    throw new CanvasAPIError("Max retries exceeded", 0);
  }

  async healthCheck() {
    try {
      const user = await this.getUserProfile() as { id: number; name: string };
      return { status: "ok" as const, timestamp: new Date().toISOString(), user: { id: user.id, name: user.name } };
    } catch (error) {
      return { status: "error" as const, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
    }
  }

  async listCourses(includeEnded = false) {
    const params: Record<string, unknown> = {
      include: ["total_students", "teachers", "term", "course_progress"],
    };
    if (!includeEnded) params.state = ["available", "completed"];
    return this.request<unknown[]>("GET", "/courses", { params });
  }

  async getCourse(courseId: number | string) {
    return this.request<unknown>("GET", `/courses/${courseId}`, {
      params: { include: ["total_students", "teachers", "term", "course_progress", "sections", "syllabus_body"] },
    });
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
    const params: Record<string, unknown> = { type: "event", all_events: true };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.request<unknown[]>("GET", "/calendar_events", { params });
  }

  async getUpcomingAssignments(limit = 10) {
    const data = await this.request<Array<Record<string, unknown>>>("GET", "/users/self/upcoming_events", { params: { limit } });
    return data.filter((event) => event.assignment);
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

  async listNotifications() {
    return this.request<unknown[]>("GET", "/users/self/activity_stream");
  }

  async getUserProfile() {
    return this.request<unknown>("GET", "/users/self/profile");
  }

  async getCourseGrades(courseId: number | string) {
    return this.request<unknown[]>("GET", `/courses/${courseId}/enrollments`, {
      params: { include: ["grades", "observed_users"] },
    });
  }

  async getUserGrades() {
    const courses = await this.listCourses() as Array<{ id: number }>;
    const allGrades: unknown[] = [];
    for (const course of courses) {
      try {
        const enrollments = await this.request<unknown[]>("GET", `/courses/${course.id}/enrollments`, {
          params: { user_id: "self", include: ["grades"] },
        });
        allGrades.push({ course_id: course.id, enrollments });
      } catch {
        // Skip courses where enrollment lookup fails
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

  async listSubAccounts(accountId: number | string) {
    return this.request<unknown[]>("GET", `/accounts/${accountId}/sub_accounts`);
  }

  async getAccountReports(accountId: number | string) {
    return this.request<unknown[]>("GET", `/accounts/${accountId}/reports`);
  }

  private async handlePagination(data: unknown[], response: Response): Promise<unknown[]> {
    const allData = [...data];
    let nextUrl = this.getNextPageUrl(response.headers.get("link"));

    while (nextUrl) {
      const nextResponse = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!nextResponse.ok) {
        throw new CanvasAPIError(
          `Pagination failed (HTTP ${nextResponse.status})`,
          nextResponse.status
        );
      }

      let nextData: unknown;
      try {
        nextData = await nextResponse.json();
      } catch (e) {
        throw new CanvasAPIError(
          `Failed to parse paginated response: ${e instanceof Error ? e.message : String(e)}`,
          0
        );
      }

      if (Array.isArray(nextData)) {
        allData.push(...nextData);
      }
      nextUrl = this.getNextPageUrl(nextResponse.headers.get("link"));
    }

    return allData;
  }

  private getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    const links = linkHeader.split(",");
    const nextLink = links.find((link) => link.includes('rel="next"'));
    if (!nextLink) return null;
    const match = nextLink.match(/<(.+?)>/);
    return match ? match[1] : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
