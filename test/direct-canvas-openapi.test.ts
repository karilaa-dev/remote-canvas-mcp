import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { getDirectCanvasOpenApiDocument } from "../scripts/generate-direct-canvas-openapi.js";

const execFileAsync = promisify(execFile);

type Operation = {
  operationId?: string;
  "x-openai-isConsequential"?: boolean;
};

type PathItem = Record<string, Operation>;

type DirectCanvasDocument = {
  components: {
    securitySchemes: {
      canvasBearer: {
        scheme: string;
        type: string;
      };
    };
  };
  paths: Record<string, PathItem>;
  security: Array<Record<string, unknown[]>>;
  servers: Array<{ url: string }>;
};

test("builds a direct Canvas OpenAPI document for private GPT Actions", () => {
  const doc = getDirectCanvasOpenApiDocument("https://school.instructure.com/") as DirectCanvasDocument;

  assert.deepEqual(doc.servers, [{ url: "https://school.instructure.com" }]);
  assert.deepEqual(doc.security, [{ canvasBearer: [] }]);
  assert.equal(doc.components.securitySchemes.canvasBearer.type, "http");
  assert.equal(doc.components.securitySchemes.canvasBearer.scheme, "bearer");

  assert.ok(doc.paths["/api/v1/courses"]);
  assert.ok(doc.paths["/api/v1/courses/{course_id}/assignments"]);
  assert.ok(doc.paths["/api/v1/users/self/upcoming_events"]);
  assert.ok(doc.paths["/api/v1/courses/{course_id}/modules/{module_id}/items"]);
});

test("direct Canvas schema only exposes non-consequential GET operations", () => {
  const doc = getDirectCanvasOpenApiDocument("https://school.instructure.com") as DirectCanvasDocument;
  const operationIds: string[] = [];

  for (const pathItem of Object.values(doc.paths)) {
    assert.deepEqual(Object.keys(pathItem), ["get"]);
    const operation = pathItem.get;
    assert.equal(operation?.["x-openai-isConsequential"], false);
    if (operation?.operationId) operationIds.push(operation.operationId);
  }

  assert.equal(operationIds.includes("getUserGrades"), false);
  assert.equal(operationIds.length, 30);
  assert.equal(operationIds.some((id) => /create|update|submit|enroll/i.test(id)), false);
  assert.equal(operationIds.some((id) => /account/i.test(id)), false);
});

test("direct Canvas OpenAPI CLI writes JSON to the requested output file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "direct-canvas-openapi-"));
  const outputPath = path.join(dir, "canvas-openapi.json");

  await execFileAsync(
    process.execPath,
    ["--import", "tsx", "scripts/generate-direct-canvas-openapi.ts", "--server", "https://school.instructure.com", "--out", outputPath],
    { cwd: process.cwd() },
  );

  const raw = await readFile(outputPath, "utf8");
  const doc = JSON.parse(raw) as DirectCanvasDocument;
  assert.deepEqual(doc.servers, [{ url: "https://school.instructure.com" }]);
  assert.ok(doc.paths["/api/v1/courses/{course_id}/assignments"]);
});
