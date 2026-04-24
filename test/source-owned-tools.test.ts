import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const generatedDir = ["src", "generated"].join("/");
const syncScriptStem = ["sync", "upstream"].join("-");
const syncScript = ["scripts", `${syncScriptStem}.ts`].join("/");
const generatedInstaller = ["install", "Api", "Methods"].join("");

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("runtime Canvas tools are owned by this project", () => {
  assert.equal(existsSync(path.join(root, generatedDir)), false);
  assert.equal(existsSync(path.join(root, syncScript)), false);

  const packageJson = JSON.parse(readProjectFile("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts ?? {}, "sync"), false);

  for (const relativePath of ["README.md", "src/index.ts", "src/types.ts", "src/canvas-client.ts"]) {
    const source = readProjectFile(relativePath);
    assert.equal(source.includes(generatedDir), false, relativePath);
    assert.equal(source.includes(syncScriptStem), false, relativePath);
    assert.equal(source.includes(generatedInstaller), false, relativePath);
  }
});

test("owned tool registry exposes the read-only Canvas surface", () => {
  const source = readProjectFile("src/canvas-tools.ts");
  const registrations = source.match(/server\.registerTool\(/g) ?? [];

  assert.equal(registrations.length, 39);
  assert.match(source, /readOnlyHint: true/);

  const mutatingToolNames = [
    ["canvas", "create", "course"],
    ["canvas", "update", "course"],
    ["canvas", "create", "assignment"],
    ["canvas", "update", "assignment"],
    ["canvas", "submit", "assignment"],
    ["canvas", "submit", "grade"],
    ["canvas", "create", "conversation"],
    ["canvas", "update", "user", "profile"],
    ["canvas", "enroll", "user"],
    ["canvas", "mark", "module", "item", "complete"],
    ["canvas", "post", "to", "discussion"],
    ["canvas", "create", "quiz"],
    ["canvas", "start", "quiz", "attempt"],
    ["canvas", "create", "user"],
    ["canvas", "create", "account", "report"],
  ].map((parts) => parts.join("_"));

  for (const toolName of mutatingToolNames) {
    assert.equal(source.includes(`"${toolName}"`), false, toolName);
  }
});
