import assert from "node:assert/strict";
import test from "node:test";
import { getActionsOpenApiDocument } from "../src/actions-openapi.js";

test("builds an importable GPT Actions OpenAPI document", () => {
  const doc = getActionsOpenApiDocument("https://canvas-actions.example/") as {
    components: {
      securitySchemes: {
        canvasOAuth: {
          flows: {
            authorizationCode: {
              authorizationUrl: string;
              tokenUrl: string;
            };
          };
        };
      };
    };
    openapi: string;
    paths: Record<string, unknown>;
    servers: Array<{ url: string }>;
  };

  assert.equal(doc.openapi, "3.1.0");
  assert.deepEqual(doc.servers, [{ url: "https://canvas-actions.example" }]);
  assert.ok(doc.paths["/actions/api/courses/{course_id}/assignments"]);
  assert.ok(doc.paths["/actions/api/courses/{course_id}/pages/{page_url}"]);
  assert.equal(
    doc.components.securitySchemes.canvasOAuth.flows.authorizationCode.authorizationUrl,
    "https://canvas-actions.example/authorize",
  );
  assert.equal(
    doc.components.securitySchemes.canvasOAuth.flows.authorizationCode.tokenUrl,
    "https://canvas-actions.example/token",
  );
});
