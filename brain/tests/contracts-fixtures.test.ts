/**
 * B1 acceptance: every schema has >= 1 valid and >= 2 invalid fixtures, including an
 * unknown field (and, for label-bearing schemas, an unknown label/authority field);
 * valid fixtures pass; each invalid fixture fails for the reason it declares.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { validatorsBySchemaId } from "../src/contracts/index.ts";
import type { StandaloneValidator } from "../src/contracts/generated/validators.js";
import {
  applyPatch,
  contractFixturesDirectory,
  fixtureFiles,
  readFixture,
  schemaId,
  schemaNames,
  schemasDirectory,
  type InvalidFixture,
} from "./support/fixtures.ts";

const validators: Readonly<Record<string, StandaloneValidator<unknown>>> = validatorsBySchemaId;

function validatorFor(schema: string): StandaloneValidator<unknown> {
  const validator = validators[schemaId(schema)];
  assert.ok(validator, `no generated validator for ${schema}`);
  return validator;
}

/** A schema is label-bearing if it references a label pair or declares its own `labels` property. */
function isLabelBearing(schema: string): boolean {
  const raw = readFileSync(join(schemasDirectory, `${schema}.schema.json`), "utf8");
  return /#\/\$defs\/(labels|generatedLabels|provenanceStamp)"/.test(raw) || raw.includes('"labels": {');
}

function describeErrors(validator: StandaloneValidator<unknown>): string {
  return JSON.stringify(
    (validator.errors ?? []).map(({ keyword, instancePath, message }) => ({ keyword, instancePath, message })),
  );
}

test("every schema has at least one valid and two invalid fixtures", () => {
  for (const schema of schemaNames()) {
    assert.ok(fixtureFiles(schema, "valid").length >= 1, `${schema}: needs >= 1 valid fixture`);
    assert.ok(fixtureFiles(schema, "invalid").length >= 2, `${schema}: needs >= 2 invalid fixtures`);
  }
});

test("every fixture directory belongs to a schema", () => {
  const schemas = new Set(schemaNames());
  for (const directory of readdirSync(contractFixturesDirectory)) {
    if (directory === "README.md") continue;
    assert.ok(schemas.has(directory), `fixtures/contracts/${directory} has no schema`);
  }
});

test("every schema has an unknown-field invalid fixture that only adds a field", () => {
  for (const schema of schemaNames()) {
    const unknown = fixtureFiles(schema, "invalid").filter((file) => file.startsWith("unknown-"));
    assert.ok(unknown.length >= 1, `${schema}: needs an invalid fixture named unknown-*`);
    for (const file of unknown) {
      const spec = readFixture(schema, "invalid", file) as unknown as InvalidFixture;
      assert.ok(
        spec.patch.length > 0 && spec.patch.every((operation) => operation.op === "add"),
        `${schema}/${file}: an unknown-field fixture must only add fields`,
      );
      // Closed variants of a oneOf (model-stream-event) report the failure as oneOf.
      assert.ok(
        ["additionalProperties", "oneOf"].includes(spec.expect.keyword),
        `${schema}/${file}: expected additionalProperties rejection, declared ${spec.expect.keyword}`,
      );
    }
  }
});

test("label-bearing schemas reject an unknown label or authority field", () => {
  const labelBearing = schemaNames().filter(isLabelBearing);
  assert.ok(labelBearing.length >= 10, `expected most schemas to carry labels, found ${labelBearing.join(", ")}`);
  for (const schema of labelBearing) {
    const files = fixtureFiles(schema, "invalid").filter(
      (file) => file.startsWith("unknown-label") || file.startsWith("unknown-authority"),
    );
    assert.ok(files.length >= 1, `${schema}: needs an unknown-label-* or unknown-authority-* invalid fixture`);
  }
});

test("memory-candidate cannot self-approve or claim trusted integrity", () => {
  const invalid = fixtureFiles("memory-candidate", "invalid");
  for (const required of [
    "self-review-decision.json",
    "host-review-decision.json",
    "durable-write-flag.json",
    "proposal-claims-direct-user.json",
    "host-labels-trusted-policy.json",
  ]) {
    assert.ok(invalid.includes(required), `memory-candidate/invalid/${required} is required`);
  }
  const validate = validatorFor("memory-candidate");
  const [base] = fixtureFiles("memory-candidate", "valid");
  assert.ok(base);
  const document = readFixture("memory-candidate", "valid", base);
  for (const integrity of ["direct_user", "trusted_policy", "verified_local", "verified_tool", "untrusted_external"]) {
    for (const path of ["/host/labels/integrity"]) {
      const patched = applyPatch(document, [{ op: "replace", path, value: integrity }]);
      assert.equal(validate(patched), false, `candidate host labels accepted ${integrity}`);
    }
    const proposed = applyPatch(document, [
      { op: "add", path: "/proposal/proposedLabels", value: { integrity, confidentiality: "private" } },
    ]);
    assert.equal(validate(proposed), false, `candidate proposal accepted ${integrity}`);
  }
});

for (const schema of schemaNames()) {
  describe(`fixtures: ${schema}`, () => {
    const validate = validatorFor(schema);

    for (const file of fixtureFiles(schema, "valid")) {
      test(`valid/${file} passes`, () => {
        const ok = validate(readFixture(schema, "valid", file));
        assert.equal(ok, true, describeErrors(validate));
      });
    }

    for (const file of fixtureFiles(schema, "invalid")) {
      test(`invalid/${file} fails with ${
        (readFixture(schema, "invalid", file) as unknown as InvalidFixture).expect.keyword
      }`, () => {
        const spec = readFixture(schema, "invalid", file) as unknown as InvalidFixture;
        assert.equal(typeof spec.description, "string");
        assert.ok(
          existsSync(join(contractFixturesDirectory, schema, "valid", spec.base)),
          `${file}: base valid/${spec.base} does not exist`,
        );
        const base = readFixture(schema, "valid", spec.base);
        assert.equal(validate(base), true, `${file}: base must be valid: ${describeErrors(validate)}`);

        const document = applyPatch(base, spec.patch);
        assert.equal(validate(document), false, `${file}: patched document was accepted`);
        const errors = validate.errors ?? [];
        const matching = errors.filter(
          (error) =>
            error.keyword === spec.expect.keyword &&
            (spec.expect.instancePath === undefined || error.instancePath === spec.expect.instancePath),
        );
        assert.ok(
          matching.length > 0,
          `${file}: expected ${spec.expect.keyword} at ${spec.expect.instancePath ?? "(any path)"}, got ${describeErrors(validate)}`,
        );
      });
    }
  });
}
