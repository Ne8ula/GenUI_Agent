import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioCoverage, checkManifest, lintLine, parseManifest, requestLine } from '../core/narration.ts';
import type { NarrationManifest } from '../core/narration.ts';

const text = readFileSync(new URL('../fixtures/narration/week4-lines.json', import.meta.url), 'utf8');
const manifest = (): NarrationManifest => {
  const r = parseManifest(text);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  return r.value;
};
const clone = (): any => JSON.parse(text);

test('manifest validates and every line passes the v3 authoring lint', () => {
  const m = manifest();
  assert.ok(m.lines.length >= 8);
});

test('the planning script lines are present verbatim', () => {
  const m = manifest();
  const byId = new Map(m.lines.map((l) => [l.lineId, l.text]));
  assert.equal(byId.get('arrival.promise'), '[softly] Nineteen-eighties Paris. Stay with me a moment.');
  assert.equal(byId.get('arrival.settle'), "[softly] There. Your coffee's still warm.");
  assert.equal(byId.get('unknown.offer'), "[calm] I haven't built that one yet. I can make it rain, bring the evening, or take you home.");
  assert.equal(byId.get('return.leaving'), "[softly] Let's go back. I'll restore what I changed.");
});

test('no audio is claimed: every take is missing and nothing is playable', () => {
  const m = manifest();
  assert.deepEqual(audioCoverage(m), { reviewed: 0, missing: m.lines.length });
  for (const line of m.lines) assert.deepEqual(requestLine(m, line.lineId), { ok: true, lineId: line.lineId, playable: false, reason: 'audio_missing' });
});

test('callers can request only known line IDs', () => {
  const m = manifest();
  assert.deepEqual(requestLine(m, 'free text from the renderer'), { ok: false, reason: 'unknown_line' });
  assert.deepEqual(requestLine(m, { text: 'hello' }), { ok: false, reason: 'unknown_line' });
});

test('a reviewed take requires owner listening evidence and a hash', () => {
  const v = clone();
  v.lines[0].audio = { status: 'reviewed', assetId: 'voice:arrival.promise.v1' };
  assert.equal(checkManifest(v).ok, false);
  v.lines[0].audio = { status: 'reviewed', assetId: 'voice:arrival.promise.v1', sha256: 'a'.repeat(64), listenedBy: 'agent', listenedOn: '2026-10-03' };
  assert.equal(checkManifest(v).ok, false);
  v.lines[0].audio = { status: 'missing', file: 'C:/tmp/take.mp3' };
  assert.equal(checkManifest(v).ok, false);
});

test('manifest rejects provider settings, credentials and unknown fields', () => {
  for (const mutate of [
    (v: any) => (v.voiceId = 'abc'),
    (v: any) => (v.policy.apiKey = 'sk-x'),
    (v: any) => (v.lines[0].model = 'eleven_multilingual_v2'),
    (v: any) => (v.policy.stability = 1),
  ]) {
    const v = clone();
    mutate(v);
    assert.equal(checkManifest(v).ok, false);
  }
});

test('lint catches SSML, ellipses, unknown tags, stacked cues, loud+quiet and missing exceptions', () => {
  const m = manifest();
  const base = { lineId: 'x.y', origin: 'cloud-proposal-unreviewed' as const, shortFormException: 'test', audio: { status: 'missing' as const } };
  const bad = [
    '[calm] Wait <break time="1s"/> here.',
    '[calm] Wait... here.',
    '[dramatic] Here.',
    '[calm] [warm] [softly] [curious] Here.',
    '[whispers] Here. [shouts] There.',
    'No cue at all.',
    '[calm] STOP here.',
  ];
  for (const t of bad) assert.ok(lintLine({ ...base, text: t }, m.policy).length > 0, t);
  assert.ok(lintLine({ ...base, text: '[calm] Fine.', shortFormException: null }, m.policy).length > 0);
  assert.deepEqual(lintLine({ ...base, text: '[calm] Fine.' }, m.policy), []);
});
