/**
 * B1 acceptance: `generate-validators --check` detects drift. Drift is simulated on a
 * copy of the schemas in a temp directory; the real schemas are never edited.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { schemasDirectory, workspaceRoot } from "./support/fixtures.ts";

const script = join(workspaceRoot, "scripts", "generate-validators.mjs");
const generatedDirectory = join(workspaceRoot, "src", "contracts", "generated");

function run(args: readonly string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: workspaceRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex");
}

function withSchemaCopy(fn: (schemas: string, scratch: string) => void): void {
  const scratch = mkdtempSync(join(tmpdir(), "eva-brain-validators-"));
  try {
    const schemas = join(scratch, "schemas");
    cpSync(schemasDirectory, schemas, { recursive: true });
    fn(schemas, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function editSchema(schemas: string, name: string, edit: (schema: Record<string, unknown>) => void): void {
  const path = join(schemas, `${name}.schema.json`);
  const schema = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  edit(schema);
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
}

const realFiles = ["validators.js", "validators.d.ts"].map((file) => join(generatedDirectory, file));
const before = realFiles.map(digest);

test("--check passes for the committed schemas", () => {
  const result = run(["--check"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /current \(18 schema\(s\)\)/);
});

test("--check passes for an unmodified copy of the schemas", () => {
  withSchemaCopy((schemas) => {
    const result = run(["--check", "--schemas-dir", schemas, "--out-dir", generatedDirectory]);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("--check fails when a schema changes", () => {
  withSchemaCopy((schemas) => {
    editSchema(schemas, "context-item", (schema) => {
      schema.description = "drifted";
    });
    const result = run(["--check", "--schemas-dir", schemas, "--out-dir", generatedDirectory]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /stale/);
  });
});

test("--check fails when a schema constraint is loosened", () => {
  withSchemaCopy((schemas) => {
    editSchema(schemas, "memory-candidate-proposal", (schema) => {
      schema.additionalProperties = true;
    });
    const result = run(["--check", "--schemas-dir", schemas, "--out-dir", generatedDirectory]);
    assert.equal(result.status, 1);
  });
});

test("--check fails when a schema is added", () => {
  withSchemaCopy((schemas) => {
    writeFileSync(
      join(schemas, "extra.schema.json"),
      JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://eva.local/schemas/brain/extra.schema.json",
        type: "object",
        additionalProperties: false,
        properties: {},
      }),
      "utf8",
    );
    const result = run(["--check", "--schemas-dir", schemas, "--out-dir", generatedDirectory]);
    assert.equal(result.status, 1);
  });
});

test("a schema with a non-conventional $id is refused", () => {
  withSchemaCopy((schemas) => {
    editSchema(schemas, "trace-event", (schema) => {
      schema.$id = "https://example.invalid/trace-event.schema.json";
    });
    const result = run(["--check", "--schemas-dir", schemas, "--out-dir", generatedDirectory]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /\$id must be/);
  });
});

test("generation into a temp directory round-trips through --check", () => {
  withSchemaCopy((schemas, scratch) => {
    const out = join(scratch, "generated");
    const written = run(["--schemas-dir", schemas, "--out-dir", out]);
    assert.equal(written.status, 0, written.stderr);
    const checked = run(["--check", "--schemas-dir", schemas, "--out-dir", out]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(digest(join(out, "validators.js")), before[0], "generation is deterministic");
  });
});

test("the committed generated files were not modified by these tests", () => {
  assert.deepEqual(realFiles.map(digest), before);
});
