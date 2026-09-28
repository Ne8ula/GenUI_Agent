/**
 * Loads brain/fixtures/contracts. Valid fixtures are complete documents. Invalid
 * fixtures are declarative patches over a named valid base (see
 * fixtures/contracts/README.md), so each one differs from a passing document only
 * by the change it describes.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
export const schemasDirectory = join(workspaceRoot, "schemas");
export const contractFixturesDirectory = join(workspaceRoot, "fixtures", "contracts");

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface PatchOperation {
  op: "add" | "replace" | "remove";
  path: string;
  value?: Json;
}

export interface InvalidFixture {
  description: string;
  base: string;
  patch: PatchOperation[];
  expect: { keyword: string; instancePath?: string };
}

export function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

export function schemaNames(): string[] {
  return readdirSync(schemasDirectory)
    .filter((file) => file.endsWith(".schema.json"))
    .map((file) => file.slice(0, -".schema.json".length))
    .sort();
}

export function schemaId(name: string): string {
  return `https://eva.local/schemas/brain/${name}.schema.json`;
}

export function fixtureFiles(schema: string, kind: "valid" | "invalid"): string[] {
  const directory = join(contractFixturesDirectory, schema, kind);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort();
}

export function readFixture(schema: string, kind: "valid" | "invalid", file: string): Json {
  return readJson(join(contractFixturesDirectory, schema, kind, file));
}

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodePointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new Error(`JSON pointer must start with "/": ${path}`);
  return path
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** Applies an RFC 6902 subset (add, replace, remove) to a deep copy of `document`. */
export function applyPatch(document: Json, operations: readonly PatchOperation[]): Json {
  const root = structuredClone(document);
  for (const operation of operations) {
    const tokens = decodePointer(operation.path);
    const last = tokens.pop();
    if (last === undefined) throw new Error("patching the document root is not supported");
    let parent: Json | undefined = root;
    for (const token of tokens) {
      parent = Array.isArray(parent) ? parent[Number(token)] : isObject(parent) ? parent[token] : undefined;
      if (parent === undefined) throw new Error(`patch path not found: ${operation.path}`);
    }
    if (Array.isArray(parent)) {
      const index = last === "-" ? parent.length : Number(last);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) {
        throw new Error(`bad array index in ${operation.path}`);
      }
      if (operation.op === "add") parent.splice(index, 0, operation.value as Json);
      else if (index >= parent.length) throw new Error(`patch path not found: ${operation.path}`);
      else if (operation.op === "replace") parent[index] = operation.value as Json;
      else parent.splice(index, 1);
    } else if (isObject(parent)) {
      if (operation.op !== "add" && !(last in parent)) throw new Error(`patch path not found: ${operation.path}`);
      if (operation.op === "remove") delete parent[last];
      else parent[last] = operation.value as Json;
    } else {
      throw new Error(`patch parent is not a container: ${operation.path}`);
    }
  }
  return root;
}
