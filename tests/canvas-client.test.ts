import assert from "node:assert/strict";
import test from "node:test";
import { CanvasClient } from "../src/canvas-client.js";
import { CanvasAPIError } from "../src/types.js";

type FetchResponder = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function createFetchStub(responders: FetchResponder[]) {
  const calls: Array<{ init?: RequestInit; url: string }> = [];

  const fetchStub: typeof fetch = async (input, init) => {
    calls.push({ init, url: String(input) });

    const responder = responders.shift();
    if (!responder) {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }

    return responder(input, init);
  };

  return { calls, fetchStub };
}

test("listCourses serializes active-state filters by default", async () => {
  const { calls, fetchStub } = createFetchStub([() => jsonResponse([])]);
  const client = new CanvasClient("token", "school.instructure.com", {
    fetchImpl: fetchStub,
    maxRetries: 0,
    retryDelay: 0,
  });

  await client.listCourses(false);

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/api/v1/courses");
  assert.deepEqual(url.searchParams.getAll("state[]"), ["available"]);
  assert.deepEqual(url.searchParams.getAll("include[]"), [
    "total_students",
    "teachers",
    "term",
    "course_progress",
  ]);
});

test("listCalendarEvents keeps the requested date range and omits all_events", async () => {
  const { calls, fetchStub } = createFetchStub([() => jsonResponse([])]);
  const client = new CanvasClient("token", "school.instructure.com", {
    fetchImpl: fetchStub,
    maxRetries: 0,
    retryDelay: 0,
  });

  await client.listCalendarEvents("2026-04-01", "2026-04-07");

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/api/v1/calendar_events");
  assert.equal(url.searchParams.get("type"), "event");
  assert.equal(url.searchParams.get("start_date"), "2026-04-01");
  assert.equal(url.searchParams.get("end_date"), "2026-04-07");
  assert.equal(url.searchParams.has("all_events"), false);
});

test("request reuses pagination logic across pages", async () => {
  const { fetchStub } = createFetchStub([
    () =>
      jsonResponse([{ id: 1 }], {
        headers: {
          Link: '<https://school.instructure.com/api/v1/courses?page=2>; rel="next"',
        },
      }),
    () => jsonResponse([{ id: 2 }]),
  ]);
  const client = new CanvasClient("token", "school.instructure.com", {
    fetchImpl: fetchStub,
    maxRetries: 0,
    retryDelay: 0,
  });

  const result = await client.request<Array<{ id: number }>>("GET", "/courses");
  assert.deepEqual(result, [{ id: 1 }, { id: 2 }]);
});

test("request retries 429 responses using the shared retry path", async () => {
  const { calls, fetchStub } = createFetchStub([
    () => new Response("Too many requests", { headers: { "Retry-After": "0" }, status: 429 }),
    () => jsonResponse({ ok: true }),
  ]);
  const client = new CanvasClient("token", "school.instructure.com", {
    fetchImpl: fetchStub,
    maxRetries: 1,
    retryDelay: 0,
  });

  const result = await client.request<{ ok: boolean }>("GET", "/users/self/profile");
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 2);
});

test("request formats Canvas API errors with response text", async () => {
  const { fetchStub } = createFetchStub([
    () => new Response("Bad request", { status: 400 }),
  ]);
  const client = new CanvasClient("token", "school.instructure.com", {
    fetchImpl: fetchStub,
    maxRetries: 0,
    retryDelay: 0,
  });

  await assert.rejects(
    () => client.request("GET", "/courses"),
    (error: unknown) => {
      assert.ok(error instanceof CanvasAPIError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.message, "Canvas API Error (400): Bad request");
      return true;
    },
  );
});

test("listAssignmentsForActiveCourses chunks courses, merges pages, dedupes, sorts, and excludes undated assignments", async () => {
  const activeCourses = Array.from({ length: 11 }, (_, index) => ({
    id: index + 1,
    name: `Course ${index + 1}`,
  }));

  const { calls, fetchStub } = createFetchStub([
    () => jsonResponse(activeCourses),
    () =>
      jsonResponse(
        [
          {
            id: 901,
            title: "Later assignment",
            start_at: "2026-04-06T10:00:00Z",
            end_at: "2026-04-06T10:00:00Z",
            description: "",
            context_type: "Course",
            context_id: 2,
            workflow_state: "active",
            hidden: false,
            html_url: "https://canvas.example/events/901",
            all_day: false,
            assignment: {
              id: 200,
              course_id: 2,
              due_at: "2026-04-06T10:00:00Z",
              name: "Later assignment",
            },
          },
          {
            id: 900,
            title: "Earlier assignment",
            start_at: "2026-04-03T10:00:00Z",
            end_at: "2026-04-03T10:00:00Z",
            description: "",
            context_type: "Course",
            context_id: 1,
            workflow_state: "active",
            hidden: false,
            html_url: "https://canvas.example/events/900",
            all_day: false,
            assignment: {
              id: 100,
              course_id: 1,
              due_at: "2026-04-03T10:00:00Z",
              name: "Earlier assignment",
            },
          },
        ],
        {
          headers: {
            Link: '<https://school.instructure.com/api/v1/calendar_events?page=2>; rel="next"',
          },
        },
      ),
    () =>
      jsonResponse([
        {
          id: 999,
          title: "Earlier assignment duplicate",
          start_at: "2026-04-03T10:00:00Z",
          end_at: "2026-04-03T10:00:00Z",
          description: "",
          context_type: "Course",
          context_id: 1,
          workflow_state: "active",
          hidden: false,
          html_url: "https://canvas.example/events/999",
          all_day: false,
          assignment: {
            id: 100,
            course_id: 1,
            due_at: "2026-04-03T10:00:00Z",
            name: "Earlier assignment",
          },
        },
        {
          id: 998,
          title: "Undated assignment",
          start_at: "2026-04-05T10:00:00Z",
          end_at: "2026-04-05T10:00:00Z",
          description: "",
          context_type: "Course",
          context_id: 3,
          workflow_state: "active",
          hidden: false,
          html_url: "https://canvas.example/events/998",
          all_day: false,
          assignment: {
            id: 300,
            course_id: 3,
            due_at: null,
            name: "Undated assignment",
          },
        },
      ]),
    () =>
      jsonResponse([
        {
          id: 950,
          title: "Middle assignment",
          start_at: "2026-04-04T10:00:00Z",
          end_at: "2026-04-04T10:00:00Z",
          description: "",
          context_type: "Course",
          context_id: 11,
          workflow_state: "active",
          hidden: false,
          html_url: "https://canvas.example/events/950",
          all_day: false,
          assignment: {
            id: 400,
            course_id: 11,
            due_at: "2026-04-04T10:00:00Z",
            name: "Middle assignment",
          },
        },
      ]),
  ]);

  const client = new CanvasClient("token", "school.instructure.com", {
    fetchImpl: fetchStub,
    maxRetries: 0,
    retryDelay: 0,
  });

  const result = await client.listAssignmentsForActiveCourses("2026-04-01", "2026-04-07");

  assert.equal(calls.length, 4);
  const firstChunk = new URL(calls[1].url);
  const secondChunk = new URL(calls[3].url);
  assert.equal(firstChunk.pathname, "/api/v1/calendar_events");
  assert.equal(secondChunk.pathname, "/api/v1/calendar_events");
  assert.equal(firstChunk.searchParams.getAll("context_codes[]").length, 10);
  assert.deepEqual(secondChunk.searchParams.getAll("context_codes[]"), ["course_11"]);

  assert.deepEqual(
    result.map((event) => ({
      assignment_id: (event.assignment as { id: number }).id,
      course_id: event.course_id,
      course_name: event.course_name,
      due_at: (event.assignment as { due_at: string }).due_at,
    })),
    [
      {
        assignment_id: 100,
        course_id: 1,
        course_name: "Course 1",
        due_at: "2026-04-03T10:00:00Z",
      },
      {
        assignment_id: 400,
        course_id: 11,
        course_name: "Course 11",
        due_at: "2026-04-04T10:00:00Z",
      },
      {
        assignment_id: 200,
        course_id: 2,
        course_name: "Course 2",
        due_at: "2026-04-06T10:00:00Z",
      },
    ],
  );
});
