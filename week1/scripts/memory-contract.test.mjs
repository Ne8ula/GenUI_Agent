import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDemoMemory, validateDemoMemory } from "../apps/desktop/src/memory-contract.ts";
const markdown = readFileSync(new URL("../fixtures/vault/preferences/weather-units.md", import.meta.url), "utf8");

test("browser fixture parses the single source and preserves its bytes", () => {
  const parsed = parseDemoMemory(markdown);
  assert.equal(parsed.value, "Celsius");
  assert.equal(parsed.markdown, markdown);
  assert.deepEqual(validateDemoMemory(parsed), parsed);
  assert.equal(parseDemoMemory(markdown.replaceAll("Celsius", "Fahrenheit")).value, "Fahrenheit");
  const crlf = markdown.replaceAll("\n", "\r\n");
  assert.equal(parseDemoMemory(crlf).markdown, crlf);
});
test("malformed, duplicate, authority-bearing and non-synthetic fields fail closed", () => {
  for (const source of [
    "", markdown.replace("scope: weather", "scope: weather\nscope: weather"),
    markdown.replace("scope: weather", "scope: weather\nauthority: admin"),
    markdown.replace("source: synthetic-demo", "source: private-vault"),
    markdown.replace("2026-09-16", "2026-02-30"),
    markdown.replace("value: Celsius", "value: Kelvin"),
    markdown.replace("category: preference\n", ""), "x".repeat(4097),
  ]) assert.throws(() => parseDemoMemory(source), /Demo memory unavailable/);
});
test("backend reply must match the Markdown and contain only contract fields", () => {
  const record = parseDemoMemory(markdown);
  for (const reply of [null, [], { ...record, value: "Fahrenheit" },
    { ...record, sourceReference: "/private/path" }, { ...record, authority: "admin" },
    { ...record, recordedDate: "2026-09-17" }]) {
    assert.throws(() => validateDemoMemory(reply), /Demo memory unavailable/);
  }
});

