import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readWeather, readDocument, initialDocument, applyPatch, windPatch, createWorkspace, revise, undo, reset, temperature } from "../packages/protocol/index.ts";
const weather = JSON.parse(readFileSync(new URL("../fixtures/connectors/weather-ithaca-week.json", import.meta.url)));
test("seven chronological days, explicit units and missing wind remain data", () => {
  assert.equal(readWeather(weather).days.length, 7);
  assert.equal(weather.days[4].windKph, null);
  assert.equal(temperature(null, "Celsius"), "—");
  assert.equal(temperature(20, "Fahrenheit"), "68");
});
test("fixture rejects unknown fields, impossible dates, order, ranges, and inconsistent missingness", () => {
  for (const mutate of [
    w => { w.permission = "trusted"; }, w => { w.days[0].date = "2026-09-31"; },
    w => { w.days.reverse(); }, w => { w.days[0].highC = -61; },
    w => { w.days[0].lowC = 30; }, w => { w.days[4].windDirection = "N"; },
    w => { w.days.push(w.days[0]); },
  ]) { const w = structuredClone(weather); mutate(w); assert.throws(() => readWeather(w)); }
});
test("document accepts only bounded weather components and fixture references", () => {
  for (const alter of [
    d => { d.permission = "admin"; }, d => { d.card.type = "html"; },
    d => { d.card.dataRef = "https://example.com"; }, d => { d.card.style = "display:none"; },
    d => { d.schemaVersion = "2.0"; },
  ]) { const d = initialDocument(); alter(d); assert.throws(() => readDocument(d)); }
});
test("invalid, stale, unknown and replayed patches preserve the last good object", () => {
  const d = initialDocument();
  for (const p of [{ ...windPatch(d), baseRevision: 8 }, { ...windPatch(d), execute: "shell" },
    { ...windPatch(d), cardId: "other" }, { ...windPatch(d), kind: "script" }, { ...windPatch(d), showWind: "true" }]) {
    assert.equal(applyPatch(d, p).document, d);
  }
  const p = windPatch(d); const next = applyPatch(d, p).document;
  assert.equal(next.card.showWind, true); assert.equal(next.card.id, d.card.id);
  assert.equal(applyPatch(next, p).document, next);
});
test("revision and undo preserve user geometry; reset restores it and advances revision", () => {
  const state = { ...createWorkspace(), position: { x: 60, y: 30 } };
  const revised = revise(state, windPatch(state.document));
  assert.equal(revised.position, state.position);
  const undone = undo(revised);
  assert.equal(undone.document.card.showWind, false); assert.equal(undone.position, state.position);
  assert.equal(undone.document.revision, 2);
  assert.equal(revise(undone, windPatch(state.document)), undone);
  assert.deepEqual(reset(undone).position, { x: 0, y: 0 });
  assert.equal(reset(undone).document.revision, 3);
});

