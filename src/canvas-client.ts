import {
  CanvasAPIError,
  CanvasCourse,
  CanvasAssignment,
  CanvasSubmission,
  CanvasUser,
  CanvasEnrollment,
  CanvasUserProfile,
  CanvasDiscussionTopic,
  CanvasModule,
  CanvasModuleItem,
  CanvasQuiz,
  CanvasAnnouncement,
  CanvasPage,
  CanvasCalendarEvent,
  CanvasRubric,
  CanvasAssignmentGroup,
  CanvasConversation,
  CanvasNotification,
  CanvasFile,
  CanvasSyllabus,
  CanvasDashboard,
  CanvasAssignmentSubmission,
  CanvasAccount,
  CanvasAccountReport,
  CreateCourseArgs,
  UpdateCourseArgs,
  CreateAssignmentArgs,
  UpdateAssignmentArgs,
  SubmitGradeArgs,
  EnrollUserArgs,
  SubmitAssignmentArgs,
  FileUploadArgs,
  CreateUserArgs,
  ListAccountCoursesArgs,
  ListAccountUsersArgs,
  CreateReportArgs,
} from "./types.js";

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

  private async request<T>(
    method: string,
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

        // Handle 204 No Content
        if (response.status === 204) {
          return undefined as T;
        }

        const data = await response.json();

        // Handle pagination for array responses
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

  private async handlePagination(data: unknown[], response: Response): Promise<unknown[]> {
    let allData = [...data];
    let nextUrl = this.getNextPageUrl(response.headers.get("link"));

    while (nextUrl) {
      const nextResponse = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });
      const nextData = await nextResponse.json();
      if (Array.isArray(nextData)) {
        allData = [...allData, ...nextData];
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

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string; user?: { id: number; name: string } }> {
    try {
      const user = await this.getUserProfile();
      return { status: "ok", timestamp: new Date().toISOString(), user: { id: user.id, name: user.name } };
    } catch {
      return { status: "error", timestamp: new Date().toISOString() };
    }
  }

  // Courses
  async listCourses(includeEnded = false): Promise<CanvasCourse[]> {
    const params: Record<string, unknown> = {
      include: ["total_students", "teachers", "term", "course_progress"],
    };
    if (!includeEnded) params.state = ["available", "completed"];
    return this.request<CanvasCourse[]>("GET", "/courses", { params });
  }

  async getCourse(courseId: number): Promise<CanvasCourse> {
    return this.request<CanvasCourse>("GET", `/courses/${courseId}`, {
      params: { include: ["total_students", "teachers", "term", "course_progress", "sections", "syllabus_body"] },
    });
  }

  async createCourse(args: CreateCourseArgs): Promise<CanvasCourse> {
    const { account_id, ...courseData } = args;
    return this.request<CanvasCourse>("POST", `/accounts/${account_id}/courses`, { body: { course: courseData } });
  }

  async updateCourse(args: UpdateCourseArgs): Promise<CanvasCourse> {
    const { course_id, ...courseData } = args;
    return this.request<CanvasCourse>("PUT", `/courses/${course_id}`, { body: { course: courseData } });
  }

  // Assignments
  async listAssignments(courseId: number, includeSubmissions = false): Promise<CanvasAssignment[]> {
    const include = ["assignment_group", "rubric", "due_at"];
    if (includeSubmissions) include.push("submission");
    return this.request<CanvasAssignment[]>("GET", `/courses/${courseId}/assignments`, { params: { include } });
  }

  async getAssignment(courseId: number, assignmentId: number, includeSubmission = false): Promise<CanvasAssignment> {
    const include = ["assignment_group", "rubric"];
    if (includeSubmission) include.push("submission");
    return this.request<CanvasAssignment>("GET", `/courses/${courseId}/assignments/${assignmentId}`, {
      params: { include },
    });
  }

  async createAssignment(args: CreateAssignmentArgs): Promise<CanvasAssignment> {
    const { course_id, ...assignmentData } = args;
    return this.request<CanvasAssignment>("POST", `/courses/${course_id}/assignments`, {
      body: { assignment: assignmentData },
    });
  }

  async updateAssignment(args: UpdateAssignmentArgs): Promise<CanvasAssignment> {
    const { course_id, assignment_id, ...assignmentData } = args;
    return this.request<CanvasAssignment>("PUT", `/courses/${course_id}/assignments/${assignment_id}`, {
      body: { assignment: assignmentData },
    });
  }

  // Assignment Groups
  async listAssignmentGroups(courseId: number): Promise<CanvasAssignmentGroup[]> {
    return this.request<CanvasAssignmentGroup[]>("GET", `/courses/${courseId}/assignment_groups`, {
      params: { include: ["assignments"] },
    });
  }

  // Submissions
  async getSubmission(courseId: number, assignmentId: number, userId: number | "self" = "self"): Promise<CanvasSubmission> {
    return this.request<CanvasSubmission>(
      "GET",
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      { params: { include: ["submission_comments", "rubric_assessment", "assignment"] } }
    );
  }

  async submitGrade(args: SubmitGradeArgs): Promise<CanvasSubmission> {
    const { course_id, assignment_id, user_id, grade, comment } = args;
    return this.request<CanvasSubmission>(
      "PUT",
      `/courses/${course_id}/assignments/${assignment_id}/submissions/${user_id}`,
      {
        body: {
          submission: {
            posted_grade: grade,
            comment: comment ? { text_comment: comment } : undefined,
          },
        },
      }
    );
  }

  async submitAssignment(args: SubmitAssignmentArgs): Promise<CanvasAssignmentSubmission> {
    const { course_id, assignment_id, submission_type, body, url, file_ids } = args;
    const submissionData: Record<string, unknown> = { submission_type };
    if (body) submissionData.body = body;
    if (url) submissionData.url = url;
    if (file_ids && file_ids.length > 0) submissionData.file_ids = file_ids;
    return this.request<CanvasAssignmentSubmission>(
      "POST",
      `/courses/${course_id}/assignments/${assignment_id}/submissions`,
      { body: { submission: submissionData } }
    );
  }

  // Files
  async listFiles(courseId: number, folderId?: number): Promise<CanvasFile[]> {
    const endpoint = folderId ? `/folders/${folderId}/files` : `/courses/${courseId}/files`;
    return this.request<CanvasFile[]>("GET", endpoint);
  }

  async getFile(fileId: number): Promise<CanvasFile> {
    return this.request<CanvasFile>("GET", `/files/${fileId}`);
  }

  async listFolders(courseId: number): Promise<unknown[]> {
    return this.request<unknown[]>("GET", `/courses/${courseId}/folders`);
  }

  // Pages
  async listPages(courseId: number): Promise<CanvasPage[]> {
    return this.request<CanvasPage[]>("GET", `/courses/${courseId}/pages`);
  }

  async getPage(courseId: number, pageUrl: string): Promise<CanvasPage> {
    return this.request<CanvasPage>("GET", `/courses/${courseId}/pages/${pageUrl}`);
  }

  // Calendar
  async listCalendarEvents(startDate?: string, endDate?: string): Promise<CanvasCalendarEvent[]> {
    const params: Record<string, unknown> = { type: "event", all_events: true };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.request<CanvasCalendarEvent[]>("GET", "/calendar_events", { params });
  }

  async getUpcomingAssignments(limit = 10): Promise<unknown[]> {
    const data = await this.request<unknown[]>("GET", "/users/self/upcoming_events", { params: { limit } });
    return (data as Array<Record<string, unknown>>).filter((event) => event.assignment);
  }

  // Rubrics
  async listRubrics(courseId: number): Promise<CanvasRubric[]> {
    return this.request<CanvasRubric[]>("GET", `/courses/${courseId}/rubrics`);
  }

  async getRubric(courseId: number, rubricId: number): Promise<CanvasRubric> {
    return this.request<CanvasRubric>("GET", `/courses/${courseId}/rubrics/${rubricId}`);
  }

  // Dashboard
  async getDashboard(): Promise<CanvasDashboard> {
    return this.request<CanvasDashboard>("GET", "/users/self/dashboard");
  }

  async getDashboardCards(): Promise<unknown[]> {
    return this.request<unknown[]>("GET", "/dashboard/dashboard_cards");
  }

  // Syllabus
  async getSyllabus(courseId: number): Promise<CanvasSyllabus> {
    const data = await this.request<Record<string, unknown>>("GET", `/courses/${courseId}`, {
      params: { include: ["syllabus_body"] },
    });
    return { course_id: courseId, syllabus_body: data.syllabus_body as string };
  }

  // Conversations
  async listConversations(): Promise<CanvasConversation[]> {
    return this.request<CanvasConversation[]>("GET", "/conversations");
  }

  async getConversation(conversationId: number): Promise<CanvasConversation> {
    return this.request<CanvasConversation>("GET", `/conversations/${conversationId}`);
  }

  async createConversation(recipients: string[], body: string, subject?: string): Promise<CanvasConversation> {
    return this.request<CanvasConversation>("POST", "/conversations", { body: { recipients, body, subject } });
  }

  // Notifications
  async listNotifications(): Promise<CanvasNotification[]> {
    return this.request<CanvasNotification[]>("GET", "/users/self/activity_stream");
  }

  // Users
  async getUserProfile(): Promise<CanvasUserProfile> {
    return this.request<CanvasUserProfile>("GET", "/users/self/profile");
  }

  async updateUserProfile(profileData: Partial<CanvasUserProfile>): Promise<CanvasUserProfile> {
    return this.request<CanvasUserProfile>("PUT", "/users/self", { body: { user: profileData } });
  }

  async enrollUser(args: EnrollUserArgs): Promise<CanvasEnrollment> {
    const { course_id, user_id, role = "StudentEnrollment", enrollment_state = "active" } = args;
    return this.request<CanvasEnrollment>("POST", `/courses/${course_id}/enrollments`, {
      body: { enrollment: { user_id, type: role, enrollment_state } },
    });
  }

  // Grades
  async getCourseGrades(courseId: number): Promise<CanvasEnrollment[]> {
    return this.request<CanvasEnrollment[]>("GET", `/courses/${courseId}/enrollments`, {
      params: { include: ["grades", "observed_users"] },
    });
  }

  async getUserGrades(): Promise<unknown> {
    return this.request<unknown>("GET", "/users/self/grades");
  }

  // Modules
  async listModules(courseId: number): Promise<CanvasModule[]> {
    return this.request<CanvasModule[]>("GET", `/courses/${courseId}/modules`, { params: { include: ["items"] } });
  }

  async getModule(courseId: number, moduleId: number): Promise<CanvasModule> {
    return this.request<CanvasModule>("GET", `/courses/${courseId}/modules/${moduleId}`, {
      params: { include: ["items"] },
    });
  }

  async listModuleItems(courseId: number, moduleId: number): Promise<CanvasModuleItem[]> {
    return this.request<CanvasModuleItem[]>("GET", `/courses/${courseId}/modules/${moduleId}/items`, {
      params: { include: ["content_details"] },
    });
  }

  async getModuleItem(courseId: number, moduleId: number, itemId: number): Promise<CanvasModuleItem> {
    return this.request<CanvasModuleItem>("GET", `/courses/${courseId}/modules/${moduleId}/items/${itemId}`, {
      params: { include: ["content_details"] },
    });
  }

  async markModuleItemComplete(courseId: number, moduleId: number, itemId: number): Promise<void> {
    await this.request<void>("PUT", `/courses/${courseId}/modules/${moduleId}/items/${itemId}/done`);
  }

  // Discussion Topics
  async listDiscussionTopics(courseId: number): Promise<CanvasDiscussionTopic[]> {
    return this.request<CanvasDiscussionTopic[]>("GET", `/courses/${courseId}/discussion_topics`, {
      params: { include: ["assignment"] },
    });
  }

  async getDiscussionTopic(courseId: number, topicId: number): Promise<CanvasDiscussionTopic> {
    return this.request<CanvasDiscussionTopic>("GET", `/courses/${courseId}/discussion_topics/${topicId}`, {
      params: { include: ["assignment"] },
    });
  }

  async postToDiscussion(courseId: number, topicId: number, message: string): Promise<unknown> {
    return this.request<unknown>("POST", `/courses/${courseId}/discussion_topics/${topicId}/entries`, {
      body: { message },
    });
  }

  // Announcements
  async listAnnouncements(courseId: number | string): Promise<CanvasAnnouncement[]> {
    return this.request<CanvasAnnouncement[]>("GET", `/courses/${courseId}/discussion_topics`, {
      params: { type: "announcement", include: ["assignment"] },
    });
  }

  // Quizzes
  async listQuizzes(courseId: number | string): Promise<CanvasQuiz[]> {
    return this.request<CanvasQuiz[]>("GET", `/courses/${courseId}/quizzes`);
  }

  async getQuiz(courseId: number | string, quizId: number): Promise<CanvasQuiz> {
    return this.request<CanvasQuiz>("GET", `/courses/${courseId}/quizzes/${quizId}`);
  }

  async createQuiz(courseId: number, quizData: Partial<CanvasQuiz>): Promise<CanvasQuiz> {
    return this.request<CanvasQuiz>("POST", `/courses/${courseId}/quizzes`, { body: { quiz: quizData } });
  }

  async startQuizAttempt(courseId: number, quizId: number): Promise<unknown> {
    return this.request<unknown>("POST", `/courses/${courseId}/quizzes/${quizId}/submissions`);
  }

  // Account Management
  async getAccount(accountId: number): Promise<CanvasAccount> {
    return this.request<CanvasAccount>("GET", `/accounts/${accountId}`);
  }

  async listAccountCourses(args: ListAccountCoursesArgs): Promise<CanvasCourse[]> {
    const { account_id, ...params } = args;
    return this.request<CanvasCourse[]>("GET", `/accounts/${account_id}/courses`, { params: params as Record<string, unknown> });
  }

  async listAccountUsers(args: ListAccountUsersArgs): Promise<CanvasUser[]> {
    const { account_id, ...params } = args;
    return this.request<CanvasUser[]>("GET", `/accounts/${account_id}/users`, { params: params as Record<string, unknown> });
  }

  async createUser(args: CreateUserArgs): Promise<CanvasUser> {
    const { account_id, ...userData } = args;
    return this.request<CanvasUser>("POST", `/accounts/${account_id}/users`, { body: userData });
  }

  async listSubAccounts(accountId: number): Promise<CanvasAccount[]> {
    return this.request<CanvasAccount[]>("GET", `/accounts/${accountId}/sub_accounts`);
  }

  // Account Reports
  async getAccountReports(accountId: number): Promise<unknown[]> {
    return this.request<unknown[]>("GET", `/accounts/${accountId}/reports`);
  }

  async createAccountReport(args: CreateReportArgs): Promise<CanvasAccountReport> {
    const { account_id, report, parameters } = args;
    return this.request<CanvasAccountReport>("POST", `/accounts/${account_id}/reports/${report}`, {
      body: { parameters: parameters || {} },
    });
  }
}
