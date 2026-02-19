export class CanvasAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = "CanvasAPIError";
  }
}

// User types
export interface CanvasUser {
  readonly id: number;
  readonly name: string;
  readonly sortable_name: string;
  readonly short_name: string;
  readonly sis_user_id: string | null;
  readonly email: string;
  readonly avatar_url: string;
  readonly login_id?: string;
}

export interface CanvasUserProfile {
  id: number;
  name: string;
  sortable_name: string;
  short_name: string;
  sis_user_id: string | null;
  login_id: string;
  avatar_url: string;
  primary_email: string;
  locale: string;
  bio: string | null;
  title?: string;
  time_zone?: string;
  calendar?: unknown;
}

// Course types
export interface CanvasCourse {
  readonly id: number;
  readonly name: string;
  readonly course_code: string;
  readonly workflow_state: string;
  readonly account_id: number;
  readonly start_at: string | null;
  readonly end_at: string | null;
  readonly enrollments?: ReadonlyArray<CanvasEnrollment>;
  readonly total_students?: number;
  readonly syllabus_body?: string;
  readonly term?: CanvasTerm;
  readonly course_progress?: CanvasCourseProgress;
}

export interface CanvasTerm {
  id: number;
  name: string;
  start_at: string | null;
  end_at: string | null;
}

export interface CanvasCourseProgress {
  requirement_count: number;
  requirement_completed_count: number;
  next_requirement_url: string | null;
  completed_at: string | null;
}

// Assignment types
export interface CanvasAssignment {
  readonly id: number;
  readonly course_id: number;
  readonly name: string;
  readonly description: string;
  readonly due_at: string | null;
  readonly lock_at: string | null;
  readonly unlock_at: string | null;
  readonly points_possible: number;
  readonly position: number;
  readonly submission_types: ReadonlyArray<string>;
  readonly assignment_group_id: number;
  readonly assignment_group?: CanvasAssignmentGroup;
  readonly rubric?: CanvasRubric[];
  readonly rubric_settings?: CanvasRubricSettings;
  readonly allowed_extensions?: string[];
  readonly submission?: CanvasSubmission;
  readonly html_url: string;
  readonly published: boolean;
  readonly grading_type: string;
}

export interface CanvasAssignmentGroup {
  id: number;
  name: string;
  position: number;
  weight: number;
  assignments?: CanvasAssignment[];
  group_weight: number;
}

// Submission types
export interface CanvasSubmission {
  readonly id: number;
  readonly assignment_id: number;
  readonly user_id: number;
  readonly submitted_at: string | null;
  readonly score: number | null;
  readonly grade: string | null;
  readonly attempt: number;
  readonly workflow_state: string;
  readonly body?: string;
  readonly url?: string;
  readonly attachments?: CanvasFile[];
  readonly submission_comments?: CanvasSubmissionComment[];
  readonly rubric_assessment?: CanvasRubricAssessment;
  readonly late: boolean;
  readonly missing: boolean;
}

export interface CanvasSubmissionComment {
  id: number;
  comment: string;
  created_at: string;
  author_id: number;
  author_name: string;
  attachments?: CanvasFile[];
}

export interface CanvasRubricAssessment {
  [criterionId: string]: {
    points: number;
    rating_id?: string;
    comments?: string;
  };
}

export interface CanvasAssignmentSubmission {
  id: number;
  submission_type: string;
  body?: string;
  url?: string;
  submitted_at: string | null;
  assignment_id: number;
  user_id: number;
  workflow_state: string;
  file_ids?: number[];
  attachments?: CanvasFile[];
}

// Enrollment types
export interface CanvasEnrollment {
  readonly id: number;
  readonly user_id: number;
  readonly course_id: number;
  readonly type: string;
  readonly role: string;
  readonly enrollment_state: string;
  readonly grades?: CanvasGrades;
  readonly user?: CanvasUser;
  readonly observed_users?: CanvasUser[];
}

export interface CanvasGrades {
  readonly current_score: number | null;
  readonly final_score: number | null;
  readonly current_grade: string | null;
  readonly final_grade: string | null;
  readonly override_score?: number | null;
  readonly override_grade?: string | null;
}

// Content types
export interface CanvasDiscussionTopic {
  id: number;
  title: string;
  message: string;
  html_url: string;
  posted_at: string;
  assignment_id: number | null;
  assignment?: CanvasAssignment;
  discussion_type: string;
  require_initial_post: boolean;
  user_has_posted: boolean;
  discussion_subentry_count: number;
  read_state: string;
  unread_count: number;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  unlock_at: string | null;
  require_sequential_progress: boolean;
  prerequisite_module_ids: number[];
  state: string;
  completed_at: string | null;
  items_count: number;
  items_url: string;
  items?: CanvasModuleItem[];
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  type: string;
  module_id: number;
  position: number;
  indent: number;
  html_url: string;
  url?: string;
  page_url?: string;
  external_url?: string;
  content_id?: number;
  content_details?: {
    points_possible?: number;
    due_at?: string;
    unlock_at?: string;
    lock_at?: string;
  };
  completion_requirement?: {
    type: string;
    min_score?: number;
    completed: boolean;
  };
  published: boolean;
}

export interface CanvasPage {
  page_id: number;
  url: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  published: boolean;
  front_page: boolean;
  locked_for_user: boolean;
  lock_explanation?: string;
  editing_roles: string;
  html_url: string;
}

export interface CanvasQuiz {
  id: number;
  title: string;
  html_url: string;
  quiz_type: string;
  assignment_id?: number;
  time_limit: number | null;
  published: boolean;
  description: string | null;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  points_possible: number;
  question_count: number;
  allowed_attempts: number;
  scoring_policy: string;
  show_correct_answers: boolean;
  show_correct_answers_at: string | null;
  hide_correct_answers_at: string | null;
  shuffle_answers: boolean;
  has_access_code: boolean;
  ip_filter?: string;
  locked_for_user: boolean;
  lock_explanation?: string;
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  html_url: string;
  user_has_posted: boolean;
  discussion_subentry_count: number;
}

// Rubric types
export interface CanvasRubric {
  id: number;
  title: string;
  context_id: number;
  context_type: string;
  points_possible: number;
  reusable: boolean;
  public: boolean;
  read_only: boolean;
  free_form_criterion_comments: boolean;
  criteria: CanvasRubricCriterion[];
}

export interface CanvasRubricCriterion {
  id: string;
  description: string;
  long_description: string;
  points: number;
  criterion_use_range: boolean;
  ratings: CanvasRubricRating[];
}

export interface CanvasRubricRating {
  id: string;
  description: string;
  long_description: string;
  points: number;
}

export interface CanvasRubricSettings {
  points_possible: number;
  free_form_criterion_comments: boolean;
  hide_score_total?: boolean;
  hide_points?: boolean;
}

// Communication types
export interface CanvasConversation {
  id: number;
  subject: string;
  workflow_state: string;
  last_message: string;
  last_message_at: string;
  last_authored_message: string;
  last_authored_message_at: string;
  message_count: number;
  subscribed: boolean;
  private: boolean;
  starred: boolean;
  properties: string[];
  audience: number[];
  avatar_url: string;
  participants: CanvasConversationParticipant[];
  messages?: CanvasConversationMessage[];
}

export interface CanvasConversationParticipant {
  id: number;
  name: string;
  full_name: string;
  avatar_url: string;
}

export interface CanvasConversationMessage {
  id: number;
  created_at: string;
  body: string;
  author_id: number;
  generated: boolean;
  media_comment?: unknown;
  forwarded_messages?: CanvasConversationMessage[];
  attachments?: CanvasFile[];
}

export interface CanvasNotification {
  id: number;
  title: string;
  message: string;
  html_url: string;
  type: string;
  read_state: boolean;
  created_at: string;
  updated_at: string;
  context_type: string;
  context_id: number;
}

// File types
export interface CanvasFile {
  id: number;
  uuid: string;
  folder_id: number;
  display_name: string;
  filename: string;
  content_type: string;
  url: string;
  size: number;
  created_at: string;
  updated_at: string;
  unlock_at?: string;
  locked: boolean;
  hidden: boolean;
  lock_at?: string;
  hidden_for_user: boolean;
  thumbnail_url?: string;
  modified_at: string;
  mime_class: string;
  media_entry_id?: string;
  locked_for_user: boolean;
  lock_explanation?: string;
  preview_url?: string;
}

export interface CanvasSyllabus {
  course_id: number;
  syllabus_body: string;
}

// Dashboard types
export interface CanvasDashboard {
  dashboard_cards: CanvasDashboardCard[];
  planner_items: CanvasPlannerItem[];
}

export interface CanvasDashboardCard {
  id: number;
  shortName: string;
  originalName: string;
  courseCode: string;
  assetString: string;
  href: string;
  term?: CanvasTerm;
  subtitle: string;
  enrollmentType: string;
  observee?: string;
  image?: string;
  color: string;
  position?: number;
}

export interface CanvasPlannerItem {
  context_type: string;
  context_name: string;
  planner_date: string;
  submissions: boolean;
  plannable_id: number;
  plannable_type: string;
  plannable: {
    id: number;
    title: string;
    due_at: string;
    points_possible?: number;
  };
  html_url: string;
  completed: boolean;
}

// Calendar types
export interface CanvasCalendarEvent {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  description: string;
  location_name?: string;
  location_address?: string;
  context_type: string;
  context_id: number;
  workflow_state: string;
  hidden: boolean;
  url?: string;
  html_url: string;
  all_day: boolean;
  assignment?: CanvasAssignment;
}

// Account types
export interface CanvasAccount {
  id: number;
  name: string;
  uuid: string;
  parent_account_id: number | null;
  root_account_id: number | null;
  default_storage_quota_mb: number;
  default_user_storage_quota_mb: number;
  default_group_storage_quota_mb: number;
  default_time_zone: string;
  sis_account_id: string | null;
  integration_id: string | null;
  sis_import_id: number | null;
  lti_guid: string;
  workflow_state: string;
}

export interface CanvasAccountReport {
  id: number;
  report: string;
  file_url?: string;
  attachment?: CanvasFile;
  status: string;
  created_at: string;
  started_at?: string;
  ended_at?: string;
  parameters: Record<string, unknown>;
  progress: number;
  current_line?: number;
}

export interface CanvasScope {
  resource: string;
  resource_name: string;
  controller: string;
  action: string;
  verb: string;
  scope: string;
}

// Argument types for mutations
export interface CreateCourseArgs {
  account_id: number;
  name: string;
  course_code?: string;
  start_at?: string;
  end_at?: string;
  license?: string;
  is_public?: boolean;
  is_public_to_auth_users?: boolean;
  public_syllabus?: boolean;
  public_syllabus_to_auth?: boolean;
  public_description?: string;
  allow_student_wiki_edits?: boolean;
  allow_wiki_comments?: boolean;
  allow_student_forum_attachments?: boolean;
  open_enrollment?: boolean;
  self_enrollment?: boolean;
  restrict_enrollments_to_course_dates?: boolean;
  term_id?: number;
  sis_course_id?: string;
  integration_id?: string;
  hide_final_grades?: boolean;
  apply_assignment_group_weights?: boolean;
  time_zone?: string;
  syllabus_body?: string;
}

export interface UpdateCourseArgs {
  course_id: number;
  name?: string;
  course_code?: string;
  start_at?: string;
  end_at?: string;
  license?: string;
  is_public?: boolean;
  is_public_to_auth_users?: boolean;
  public_syllabus?: boolean;
  public_syllabus_to_auth?: boolean;
  public_description?: string;
  allow_student_wiki_edits?: boolean;
  allow_wiki_comments?: boolean;
  allow_student_forum_attachments?: boolean;
  open_enrollment?: boolean;
  self_enrollment?: boolean;
  restrict_enrollments_to_course_dates?: boolean;
  hide_final_grades?: boolean;
  apply_assignment_group_weights?: boolean;
  time_zone?: string;
  syllabus_body?: string;
}

export interface CreateAssignmentArgs {
  course_id: number;
  name: string;
  description?: string;
  due_at?: string;
  lock_at?: string;
  unlock_at?: string;
  points_possible?: number;
  grading_type?: string;
  submission_types?: string[];
  allowed_extensions?: string[];
  assignment_group_id?: number;
  position?: number;
  peer_reviews?: boolean;
  automatic_peer_reviews?: boolean;
  notify_of_update?: boolean;
  group_category_id?: number;
  published?: boolean;
  omit_from_final_grade?: boolean;
  hide_in_gradebook?: boolean;
}

export interface UpdateAssignmentArgs {
  course_id: number;
  assignment_id: number;
  name?: string;
  description?: string;
  due_at?: string;
  lock_at?: string;
  unlock_at?: string;
  points_possible?: number;
  grading_type?: string;
  submission_types?: string[];
  allowed_extensions?: string[];
  assignment_group_id?: number;
  position?: number;
  peer_reviews?: boolean;
  automatic_peer_reviews?: boolean;
  notify_of_update?: boolean;
  published?: boolean;
  omit_from_final_grade?: boolean;
  hide_in_gradebook?: boolean;
}

export interface SubmitGradeArgs {
  course_id: number;
  assignment_id: number;
  user_id: number;
  grade: number | string;
  comment?: string;
  rubric_assessment?: CanvasRubricAssessment;
}

export interface EnrollUserArgs {
  course_id: number;
  user_id: number;
  role?: string;
  enrollment_state?: string;
  notify?: boolean;
  limit_privileges_to_course_section?: boolean;
}

export interface SubmitAssignmentArgs {
  course_id: number;
  assignment_id: number;
  submission_type: string;
  body?: string;
  url?: string;
  file_ids?: number[];
  media_comment_id?: string;
  media_comment_type?: string;
  user_id?: number;
}

export interface FileUploadArgs {
  course_id?: number;
  folder_id?: number;
  name: string;
  size: number;
  content_type?: string;
  on_duplicate?: string;
}

export interface CreateUserArgs {
  account_id: number;
  user: {
    name: string;
    short_name?: string;
    sortable_name?: string;
    time_zone?: string;
    locale?: string;
    birthdate?: string;
    terms_of_use?: boolean;
    skip_registration?: boolean;
  };
  pseudonym: {
    unique_id: string;
    password?: string;
    sis_user_id?: string;
    integration_id?: string;
    send_confirmation?: boolean;
    force_validations?: boolean;
    authentication_provider_id?: string;
  };
  communication_channel?: {
    type: string;
    address: string;
    skip_confirmation?: boolean;
  };
  force_validations?: boolean;
  enable_sis_reactivation?: boolean;
}

export interface ListAccountCoursesArgs {
  account_id: number;
  with_enrollments?: boolean;
  enrollment_type?: string[];
  published?: boolean;
  completed?: boolean;
  blueprint?: boolean;
  blueprint_associated?: boolean;
  by_teachers?: number[];
  by_subaccounts?: number[];
  hide_enrollmentless_courses?: boolean;
  state?: string[];
  enrollment_term_id?: number;
  search_term?: string;
  include?: string[];
  sort?: string;
  order?: string;
  search_by?: string;
}

export interface ListAccountUsersArgs {
  account_id: number;
  search_term?: string;
  enrollment_type?: string;
  sort?: string;
  order?: string;
  include?: string[];
}

export interface CreateReportArgs {
  account_id: number;
  report: string;
  parameters?: Record<string, unknown>;
}
