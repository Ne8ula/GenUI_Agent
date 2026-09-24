import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

test("workspace manifest is the isolated brain package", () => {
  const manifest = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8")) as {
    name: string;
    private: boolean;
    type: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.equal(manifest.name, "@eva/brain");
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.deepEqual(Object.keys(manifest.dependencies), ["ajv"]);
  assert.deepEqual(Object.keys(manifest.devDependencies), ["typescript"]);
});

test("contracts module loads", async () => {
  const contracts = await import("../src/contracts/index.ts");
  assert.equal(typeof contracts, "object");
});
