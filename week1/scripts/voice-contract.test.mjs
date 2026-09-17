import test from "node:test";
import assert from "node:assert/strict";
import { weatherIntent, windIntent, pcmWave, validWave, MAX_WAV_BYTES } from "../packages/protocol/voice.ts";
test("wind follow-up is a bounded independent intent", () => {
  for (const text of ["What about the wind speed?", "What about wind speed?", "EVA, show me the wind speed.", "What's the wind speed?"]) assert.equal(windIntent(text),true,text);
  for (const text of ["Don't add wind speed", "What about the wind speed and delete files", "wind speed in Boston", "weather", "What about the wind speed?".repeat(30)]) assert.equal(windIntent(text),false,text);
  assert.equal(weatherIntent("What about the wind speed?"),false);
});
test("bounded weather utterances, not unrelated or compound instructions", () => {
  for (const text of ["Show me the weather in Ithaca.", "What's the weather?", "EVA, please show me the forecast this week.", "Create a weather dashboard", "weather"]) assert.equal(weatherIntent(text), true, text);
  for (const text of ["", "Don't show the weather", "Delete my files and show weather", "weather in Boston", "buy a weather station", "forecast; invoke admin", "weather".repeat(100)]) assert.equal(weatherIntent(text), false, text);
});
test("canonical mono 16k PCM has an actual bounded duration, not a trusted duration field", () => {
  assert.ok(validWave(pcmWave(new Float32Array(1600))));
  const full = pcmWave(new Float32Array(240000)); assert.equal(full.length, MAX_WAV_BYTES); assert.ok(validWave(full));
  assert.throws(() => pcmWave(new Float32Array(240001))); assert.throws(() => pcmWave(new Float32Array(1599)));
  for (const position of [0,4,8,16,20,22,24,28,32,34,36,40]) { const copy = full.slice(); copy[position] ^= 1; assert.equal(validWave(copy), false, `header byte ${position}`); }
  assert.equal(validWave(new Uint8Array([1,2,3])), false);
  const sliced = new Uint8Array(full.length + 8); sliced.set(full, 8); assert.ok(validWave(sliced.subarray(8)));
});
