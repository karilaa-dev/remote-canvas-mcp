import assert from "node:assert/strict";
import test from "node:test";
import { getActionsOpenApiDocument } from "../src/actions-openapi.js";

test("builds an importable GPT Actions OpenAPI document", () => {
  const doc = getActionsOpenApiDocument("https://canvas-actions.example/") as {
    components: {
      securitySchemes?: unknown;
    };
    openapi: string;
    paths: Record<string, {
      get?: {
        responses?: {
          "200"?: {
            content?: {
              "application/json"?: {
                schema?: unknown;
              };
            };
          };
        };
        security?: unknown;
      };
    }>;
    servers: Array<{ url: string }>;
  };

  assert.equal(doc.openapi, "3.1.0");
  assert.deepEqual(doc.servers, [{ url: "https://canvas-actions.example" }]);
  assert.ok(doc.paths["/actions/api/courses/{course_id}/assignments"]);
  assert.ok(doc.paths["/actions/api/courses/{course_id}/pages/{page_url}"]);
  assert.deepEqual(
    doc.paths["/actions/api/health"].get?.responses?.["200"]?.content?.["application/json"]?.schema,
    { $ref: "#/components/schemas/CanvasDataResponse" },
  );
  assert.equal(doc.components.securitySchemes, undefined);
  assert.equal(doc.paths["/actions/api/health"].get?.security, undefined);
});

test("can include OAuth security for external OpenAPI clients", () => {
  const doc = getActionsOpenApiDocument("https://canvas-actions.example/", { includeOAuthSecurity: true }) as {
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
    paths: Record<string, {
      get?: {
        security?: unknown;
      };
    }>;
  };

  assert.deepEqual(doc.paths["/actions/api/health"].get?.security, [{ canvasOAuth: ["canvas.read"] }]);
  assert.equal(
    doc.components.securitySchemes.canvasOAuth.flows.authorizationCode.authorizationUrl,
    "https://canvas-actions.example/authorize",
  );
  assert.equal(
    doc.components.securitySchemes.canvasOAuth.flows.authorizationCode.tokenUrl,
    "https://canvas-actions.example/token",
  );
});
