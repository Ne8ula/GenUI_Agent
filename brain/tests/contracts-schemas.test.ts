/**
 * Structural checks over brain/schemas: naming, closed objects, declared required
 * names (replacing Ajv's strictRequired, see scripts/generate-validators.mjs), and
 * agreement between the label enums and src/provenance/labels.ts.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  CONFIDENTIALITY_ORDER,
  INTEGRITY_ORDER,
  LINEAGE_OPERATIONS,
  ORIGIN_KINDS,
} from "../src/provenance/labels.ts";
import { readJson, schemaId, schemaNames, schemasDirectory, type Json } from "./support/fixtures.ts";

type SchemaNode = { [key: string]: Json };

function isNode(value: Json | undefined): value is SchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadSchema(name: string): SchemaNode {
  const schema = readJson(join(schemasDirectory, `${name}.schema.json`));
  assert.ok(isNode(schema));
  return schema;
}

/** Keywords whose subschemas describe conditions or constraints on an existing shape. */
const CONDITIONAL = new Set(["if", "then", "else", "not"]);
const SUBSCHEMA_LISTS = new Set(["allOf", "anyOf", "oneOf"]);

interface Visit {
  node: SchemaNode;
  path: string;
  conditional: boolean;
  /** The non-conditional object shape describing this instance location, if any. */
  shape: SchemaNode | undefined;
}

/** Follows a local `#/$defs/<name>` reference; other references are left unresolved. */
function resolve(root: SchemaNode, node: Json | undefined): SchemaNode | undefined {
  if (!isNode(node)) return undefined;
  const ref = node.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) return node;
  const defs = root.$defs;
  const target = isNode(defs) ? defs[ref.slice("#/$defs/".length)] : undefined;
  return isNode(target) ? target : undefined;
}

/**
 * Walks every subschema. `declared` is the non-conditional schema for the current
 * instance location: conditions (if/then/else/not) and combinators constrain that same
 * location, so a `required` inside them is checked against the declared shape, with
 * local $refs followed for nested properties and array items.
 */
function* walk(
  root: SchemaNode,
  node: SchemaNode,
  path = "#",
  conditional = false,
  declared?: SchemaNode,
): Generator<Visit> {
  const location = conditional ? declared : isNode(node.properties) ? node : (declared ?? node);
  const shape = location && isNode(location.properties) ? location : undefined;
  yield { node, path, conditional, shape };
  for (const [key, value] of Object.entries(node)) {
    if (key === "$defs" && isNode(value)) {
      for (const [name, child] of Object.entries(value)) {
        if (isNode(child)) yield* walk(root, child, `${path}/$defs/${name}`);
      }
    } else if (key === "properties" && isNode(value)) {
      for (const [name, child] of Object.entries(value)) {
        if (!isNode(child)) continue;
        const childDeclared = conditional && isNode(location?.properties) ? resolve(root, location.properties[name]) : undefined;
        yield* walk(root, child, `${path}/properties/${name}`, conditional, childDeclared);
      }
    } else if (key === "items" && isNode(value)) {
      const childDeclared = conditional ? resolve(root, location?.items) : undefined;
      yield* walk(root, value, `${path}/items`, conditional, childDeclared);
    } else if (SUBSCHEMA_LISTS.has(key) && Array.isArray(value)) {
      for (const [index, child] of value.entries()) {
        if (isNode(child)) yield* walk(root, child, `${path}/${key}/${index}`, conditional, location);
      }
    } else if (CONDITIONAL.has(key) && isNode(value)) {
      yield* walk(root, value, `${path}/${key}`, true, location);
    }
  }
}

function walkSchema(name: string): Generator<Visit> {
  const schema = loadSchema(name);
  return walk(schema, schema);
}

test("schemas use Draft 2020-12 and the brain $id convention", () => {
  const names = schemaNames();
  assert.equal(names.length, 18, `expected the 18 B1 schemas, found ${names.join(", ")}`);
  for (const name of names) {
    const schema = loadSchema(name);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", name);
    assert.equal(schema.$id, schemaId(name), name);
  }
});

test("every object shape is closed", () => {
  for (const name of schemaNames()) {
    for (const { node, path, conditional } of walkSchema(name)) {
      if (conditional) continue;
      const declaresShape = node.type === "object" || isNode(node.properties);
      if (!declaresShape) continue;
      assert.equal(node.type, "object", `${name} ${path}: a shape with properties must declare type object`);
      assert.ok(
        node.additionalProperties === false || node.unevaluatedProperties === false,
        `${name} ${path}: object is not closed`,
      );
    }
  }
});

test("every required name is declared on its enclosing object shape", () => {
  for (const name of schemaNames()) {
    for (const { node, path, shape } of walkSchema(name)) {
      if (!Array.isArray(node.required)) continue;
      assert.ok(shape && isNode(shape.properties), `${name} ${path}: required without an enclosing properties`);
      for (const key of node.required) {
        assert.equal(typeof key, "string");
        assert.ok(
          Object.hasOwn(shape.properties, key as string),
          `${name} ${path}: required "${String(key)}" is not a declared property`,
        );
      }
    }
  }
});

test("label enums match the provenance module's orders", () => {
  const defs = loadSchema("common").$defs;
  assert.ok(isNode(defs));
  const integrity = defs.integrityLabel;
  const confidentiality = defs.confidentialityLabel;
  assert.ok(isNode(integrity) && Array.isArray(integrity.enum));
  assert.ok(isNode(confidentiality) && Array.isArray(confidentiality.enum));
  assert.deepEqual([...integrity.enum].sort(), [...INTEGRITY_ORDER].sort());
  assert.deepEqual([...confidentiality.enum].sort(), [...CONFIDENTIALITY_ORDER].sort());
});

test("lineage operations and origin kinds match the provenance module", () => {
  const defs = loadSchema("common").$defs;
  assert.ok(isNode(defs) && isNode(defs.originKind) && Array.isArray(defs.originKind.enum));
  assert.deepEqual([...defs.originKind.enum].sort(), [...ORIGIN_KINDS].sort());
  const entry = defs.lineageEntry;
  assert.ok(isNode(entry) && isNode(entry.properties) && isNode(entry.properties.operation));
  const operations = entry.properties.operation.enum;
  assert.ok(Array.isArray(operations));
  assert.deepEqual([...operations].sort(), [...LINEAGE_OPERATIONS].sort());
});

test("memory nodes can never carry trusted_policy or quarantined integrity", () => {
  const properties = loadSchema("memory-node").properties;
  assert.ok(isNode(properties) && isNode(properties.labels) && isNode(properties.labels.properties));
  const integrity = properties.labels.properties.integrity;
  assert.ok(isNode(integrity) && Array.isArray(integrity.enum));
  assert.ok(!integrity.enum.includes("trusted_policy"));
  assert.ok(!integrity.enum.includes("quarantined"));
});

test("model-output label shapes never admit integrity above untrusted_generated", () => {
  const defs = loadSchema("common").$defs;
  assert.ok(isNode(defs) && isNode(defs.generatedLabels) && isNode(defs.generatedLabels.properties));
  const integrity = defs.generatedLabels.properties.integrity;
  assert.ok(isNode(integrity));
  assert.deepEqual(integrity.enum, ["untrusted_generated", "quarantined"]);
});

test("trace events have no raw text fields", () => {
  const properties = loadSchema("trace-event").properties;
  assert.ok(isNode(properties));
  for (const key of Object.keys(properties)) {
    assert.doesNotMatch(key, /prompt|text|content|message|transcript|body|claim|quote/i, `trace-event.${key}`);
  }
});

test("session affect has no PAD or Plutchik fields", () => {
  const properties = loadSchema("session-affect").properties;
  assert.ok(isNode(properties));
  for (const key of Object.keys(properties)) {
    assert.doesNotMatch(key, /pleasure|arousal|dominance|pad|plutchik|emotion/i, `session-affect.${key}`);
  }
});
