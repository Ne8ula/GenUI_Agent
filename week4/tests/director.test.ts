import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialDirector, reduce, sessionIdOf } from '../core/director.ts';
import type { Consent, DirectorEvent, DirectorState, Effect } from '../core/director.ts';
import { parseScene } from '../core/scene.ts';
import { parseManifest } from '../core/narration.ts';
import { validateValue } from '../core/validate.ts';

const sceneR = parseScene(readFileSync(new URL('../fixtures/scenes/paris-1980s-terrace.json', import.meta.url), 'utf8'));
assert.ok(sceneR.ok);
const scene = sceneR.value;
const manifestR = parseManifest(readFileSync(new URL('../fixtures/narration/week4-lines.json', import.meta.url), 'utf8'));
assert.ok(manifestR.ok);
const lineIds = new Set(manifestR.value.lines.map((l) => l.lineId));

const FULL: Consent = { receiptId: 'rcpt-1', microphone: true, camera: true, windows: true, wallpaper: true };

// A tiny harness: feed events, collect effects, and check every effect against the contracts.
class Run {
  state: DirectorState = initialDirector();
  effects: Effect[] = [];
  seq = 0;
  now = 0;

  send(e: DirectorEvent) {
    const step = reduce(this.state, e, scene);
    for (const eff of step.effects) {
      if (eff.type === 'stage') assert.ok(validateValue('stage-request', eff.request).ok, JSON.stringify(eff));
      if (eff.type === 'speak') assert.ok(lineIds.has(eff.lineId), `unknown line ${eff.lineId}`);
    }
    this.state = step.state;
    this.effects.push(...step.effects);
    return step;
  }
  say(text: string, sessionId = sessionIdOf(this.state)) {
    return this.send({ type: 'transcript', atMs: this.now, sessionId, utteranceSeq: ++this.seq, text });
  }
  consent(c: Consent = FULL, reducedMotion = false) {
    return this.send({ type: 'consent', atMs: this.now, sessionId: sessionIdOf(this.state), consent: c, reducedMotion });
  }
  tickTo(ms: number, step = 250) {
    for (let t = this.now + step; t <= ms; t += step) {
      this.now = t;
      this.send({ type: 'tick', atMs: t });
    }
    this.now = ms;
    this.send({ type: 'tick', atMs: ms });
  }
  take(): Effect[] {
    const out = this.effects;
    this.effects = [];
    return out;
  }
}

const stageOps = (effs: Effect[]) => effs.flatMap((e) => (e.type === 'stage' ? [JSON.stringify(e.request)] : []));
const spoken = (effs: Effect[]) => effs.flatMap((e) => (e.type === 'speak' ? [e.lineId] : []));

function arrived(consent: Consent = FULL): Run {
  const r = new Run();
  r.say('What does it feel like to be in 1980s Paris, drinking coffee.');
  r.consent(consent);
  r.tickTo(60_000);
  assert.equal(r.state.mode, 'arrived');
  r.take();
  return r;
}

test('full arrival: prepare, consent, windows in B, wallpaper in D, settle line, arrived at 60 s', () => {
  const r = new Run();
  const first = r.say('What does it feel like to be in 1980s Paris, drinking coffee.');
  assert.equal(first.state.mode, 'consent');
  assert.deepEqual(stageOps(r.take()), [JSON.stringify({ op: 'prepare', sceneId: 'scene:paris-1980s-terrace' })]);
  r.consent();
  assert.deepEqual(spoken(r.take()), ['arrival.promise']);
  r.tickTo(5000);
  assert.deepEqual(stageOps(r.take()), [JSON.stringify({ op: 'enter', variantId: 'afternoon-clear' })]);
  r.tickTo(21_999);
  assert.deepEqual(stageOps(r.take()), []);
  r.tickTo(22_000);
  assert.deepEqual(stageOps(r.take()), [JSON.stringify({ op: 'setFarField', variantId: 'afternoon-clear' })]);
  r.tickTo(59_750);
  assert.equal(r.state.mode, 'constructing');
  assert.deepEqual(spoken(r.take()), ['arrival.settle']);
  r.tickTo(60_000);
  assert.equal(r.state.mode, 'arrived');
});

test('declined consent items select labelled degraded modes and never stage them', () => {
  const r = new Run();
  r.say('Take me to a café in Paris in the eighties');
  r.consent({ receiptId: 'rcpt-2', microphone: true, camera: false, windows: false, wallpaper: false });
  r.tickTo(60_000);
  const effs = r.take();
  assert.deepEqual(stageOps(effs).filter((s) => !s.includes('prepare')), []);
  const notices = effs.flatMap((e) => (e.type === 'notice' ? [e.code] : []));
  assert.deepEqual(notices.sort(), ['camera_off', 'wallpaper_skipped', 'windows_left_in_place']);
  r.say('Can it rain?');
  assert.ok(!stageOps(r.take()).some((s) => s.includes('setFarField')));
});

test('skip is refused before consent and cannot bypass consent', () => {
  const r = new Run();
  r.say('Show me Paris in the 80s');
  const s = r.say('Skip ahead');
  assert.equal(s.rejected, 'consent_required');
  assert.equal(r.state.mode, 'consent');
  assert.deepEqual(r.send({ type: 'key', atMs: 0, key: 'S' }).rejected, 'consent_required');
});

for (const at of [0, 6000, 15_000, 25_000, 40_000, 50_000, 57_000]) {
  test(`skip at ${at} ms emits pending required staging once and arrives at the same end state`, () => {
    const r = new Run();
    r.say('What does it feel like to be in 1980s Paris, drinking coffee.');
    r.consent();
    r.tickTo(at);
    r.say('Just take me there');
    r.tickTo(at + 6000);
    assert.equal(r.state.mode, 'arrived');
    const ops = stageOps(r.take());
    assert.equal(ops.filter((s) => s.includes('"enter"')).length, 1);
    assert.equal(ops.filter((s) => s.includes('setFarField')).length, 1);
    assert.equal(r.state.presentation?.look.weather, 'clear');
  });
}

test('skip crossfade arrives only after 6 s and a second skip is ignored', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(10_000);
  r.say('skip');
  r.tickTo(15_000);
  assert.equal(r.state.mode, 'constructing');
  assert.equal(r.say('skip').rejected, 'not_applicable');
  r.tickTo(16_000);
  assert.equal(r.state.mode, 'arrived');
  assert.ok(spoken(r.take()).includes('arrival.settle'));
});

test('follow-ups during construction queue one slot; newer supersedes; applied on arrival', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(20_000);
  r.say('Can it rain?');
  r.say('Make it evening.');
  assert.equal(r.state.queued?.intent, 'light_evening');
  r.tickTo(60_000);
  assert.equal(r.state.mode, 'arrived');
  assert.equal(r.state.queued, null);
  assert.deepEqual(r.state.presentation?.look, { weather: 'clear', light: 'evening' });
});

test('cancel clears a queued follow-up', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(20_000);
  r.say('Can it rain?');
  r.say('Cancel');
  assert.equal(r.state.queued, null);
  assert.equal(r.state.mode, 'restoring');
});

test('demo script: rain, evening, undo, unknown place, era question', () => {
  const r = arrived();
  const before = r.state.presentation?.objectIds;
  r.say('Can it rain?');
  let effs = r.take();
  assert.deepEqual(spoken(effs), ['followup.rain']);
  assert.ok(stageOps(effs).includes(JSON.stringify({ op: 'setFarField', variantId: 'afternoon-rain' })));
  assert.ok(effs.some((e) => e.type === 'blend' && e.variant === 'afternoon-rain'));
  r.say('Make it evening.');
  effs = r.take();
  assert.deepEqual(spoken(effs), ['followup.evening']);
  assert.ok(stageOps(effs).includes(JSON.stringify({ op: 'setFarField', variantId: 'evening-rain' })));
  r.say('Undo that.');
  effs = r.take();
  assert.deepEqual(spoken(effs), ['undo.to-rain']);
  assert.deepEqual(r.state.presentation?.look, { weather: 'rain', light: 'afternoon' });
  const consentBefore = r.state.consent;
  r.say('Take me to Tokyo.');
  effs = r.take();
  assert.deepEqual(effs, [{ type: 'speak', lineId: 'unknown.offer' }]);
  r.say('What year is it?');
  assert.deepEqual(spoken(r.take()), ['era.framing']);
  assert.equal(r.state.presentation?.objectIds, before);
  assert.equal(r.state.consent, consentBefore);
});

test('undo restores presentation only: consent, session and epoch are untouched', () => {
  const r = arrived({ receiptId: 'rcpt-9', microphone: true, camera: false, windows: true, wallpaper: false });
  r.say('Can it rain?');
  const consent = r.state.consent;
  const epoch = r.state.epoch;
  r.say('Undo');
  assert.equal(r.state.consent, consent);
  assert.equal(r.state.epoch, epoch);
  assert.deepEqual(r.state.presentation?.look, { weather: 'clear', light: 'afternoon' });
  r.say('Undo');
  assert.deepEqual(spoken(r.take()), ['followup.rain', 'undo.generic', 'undo.nothing']);
});

test('clarifications: ambiguous go back, combined requests, unrecognized', () => {
  const r = arrived();
  r.say('Go back');
  r.say('Make it a rainy evening');
  r.say('Make it snow');
  assert.deepEqual(spoken(r.take()), ['clarify.undo-or-return', 'clarify.one-at-a-time', 'clarify.not-sure']);
  assert.equal(r.state.mode, 'arrived');
  assert.deepEqual(r.state.presentation?.look, { weather: 'clear', light: 'afternoon' });
});

test('graceful return: line, ~5 s deconstruction, then graceful restore and home on completion', () => {
  const r = arrived();
  r.say('Take me back.');
  let effs = r.take();
  assert.deepEqual(effs.slice(0, 2), [{ type: 'stop_speaking' }, { type: 'speak', lineId: 'return.leaving' }]);
  assert.equal(r.state.mode, 'returning');
  r.tickTo(r.now + 4750);
  assert.deepEqual(stageOps(r.take()), []);
  r.tickTo(r.now + 250);
  effs = r.take();
  assert.deepEqual(stageOps(effs), [JSON.stringify({ op: 'restore', mode: 'graceful' })]);
  assert.equal(r.state.mode, 'restoring');
  r.send({ type: 'restore_complete', atMs: r.now, sessionId: sessionIdOf(r.state), outcome: 'restored' });
  assert.equal(r.state.mode, 'home');
});

test('emergency cancel during return still restores immediately', () => {
  const r = arrived();
  r.say('Take me back.');
  r.tickTo(r.now + 2000);
  r.take();
  r.send({ type: 'key', atMs: r.now, key: 'Escape' });
  const effs = r.take();
  assert.deepEqual(effs, [{ type: 'stop_speaking' }, { type: 'stage', request: { op: 'restore', mode: 'emergency' } }]);
  // The return timeline is gone: no graceful restore follows.
  r.tickTo(r.now + 10_000);
  assert.deepEqual(stageOps(r.take()), []);
});

for (const phaseMs of [1000, 8000, 18_000, 26_000, 38_000, 48_000, 56_000]) {
  test(`Esc at ${phaseMs} ms restores immediately with no animation or speech prerequisite`, () => {
    const r = new Run();
    r.say('Take me to Paris for coffee');
    r.consent();
    r.tickTo(phaseMs);
    r.take();
    r.send({ type: 'key', atMs: phaseMs, key: 'Escape' });
    assert.deepEqual(r.take(), [{ type: 'stop_speaking' }, { type: 'stage', request: { op: 'restore', mode: 'emergency' } }]);
    assert.equal(r.state.mode, 'restoring');
    r.tickTo(phaseMs + 70_000);
    assert.deepEqual(r.take(), []);
  });
}

test('cancel phrases and stop phrases are distinct', () => {
  const r = arrived();
  r.say('Stop talking');
  assert.deepEqual(r.take(), [{ type: 'stop_speaking' }]);
  assert.equal(r.state.mode, 'arrived');
  r.say('Stop the experience');
  assert.equal(r.state.mode, 'restoring');
});

test('cancel during consent returns home without any restore request', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.take();
  r.say('Cancel');
  assert.equal(r.state.mode, 'home');
  assert.deepEqual(stageOps(r.take()), []);
});

test('interruption stops speech but construction continues', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(1000);
  r.take();
  r.send({ type: 'speech_onset', atMs: 1000, sessionId: sessionIdOf(r.state) });
  assert.deepEqual(r.take(), [{ type: 'stop_speaking' }]);
  r.tickTo(60_000);
  assert.equal(r.state.mode, 'arrived');
});

test('stale transcripts and results cannot revive a cancelled or superseded experience', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(30_000);
  const oldSession = sessionIdOf(r.state);
  const oldRevision = r.state.revision;
  r.send({ type: 'key', atMs: 30_000, key: 'Escape' });
  r.take();
  // Late STT from the cancelled session.
  assert.equal(r.say('Skip ahead', oldSession).rejected, 'stale');
  assert.equal(r.say('Can it rain?', oldSession).rejected, 'stale');
  // Late media/blend and stage results.
  assert.equal(r.send({ type: 'blend_complete', atMs: 30_100, sessionId: oldSession, revision: oldRevision }).rejected, 'stale');
  assert.equal(r.send({ type: 'stage_result', atMs: 30_100, sessionId: oldSession, op: 'enter', ok: true }).rejected, 'stale');
  assert.equal(r.send({ type: 'consent', atMs: 30_100, sessionId: oldSession, consent: FULL, reducedMotion: false }).rejected, 'stale');
  assert.equal(r.send({ type: 'restore_complete', atMs: 30_100, sessionId: oldSession, outcome: 'restored' }).rejected, 'stale');
  assert.equal(r.state.mode, 'restoring');
  r.send({ type: 'restore_complete', atMs: 31_000, sessionId: sessionIdOf(r.state), outcome: 'restored' });
  assert.equal(r.state.mode, 'home');
  // Still stale after returning home.
  assert.equal(r.say('Make it evening', oldSession).rejected, 'stale');
  assert.deepEqual(r.take(), []);
});

test('blend completion for a superseded revision is stale', () => {
  const r = arrived();
  r.say('Can it rain?');
  const rev = r.state.revision;
  r.say('Make it evening');
  assert.equal(r.send({ type: 'blend_complete', atMs: r.now, sessionId: sessionIdOf(r.state), revision: rev }).rejected, 'stale');
  assert.equal(r.send({ type: 'blend_complete', atMs: r.now, sessionId: sessionIdOf(r.state), revision: r.state.revision }).rejected, undefined);
});

test('out-of-order utterances are rejected', () => {
  const r = arrived();
  r.say('Can it rain?');
  const stale = r.send({ type: 'transcript', atMs: r.now, sessionId: sessionIdOf(r.state), utteranceSeq: r.seq - 1, text: 'Make it evening' });
  assert.equal(stale.rejected, 'out_of_order');
  assert.equal(r.state.presentation?.look.light, 'afternoon');
});

test('failure stops, restores first, then reports; incomplete restore is surfaced', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(25_000);
  r.take();
  r.send({ type: 'failure', atMs: 25_000, sessionId: sessionIdOf(r.state), code: 'renderer_lost_context' });
  const effs = r.take();
  assert.deepEqual(effs.slice(0, 2), [{ type: 'stop_speaking' }, { type: 'stage', request: { op: 'restore', mode: 'emergency' } }]);
  assert.ok(spoken(effs).includes('failure.restoring'));
  r.send({ type: 'restore_complete', atMs: 26_000, sessionId: sessionIdOf(r.state), outcome: 'unresolved' });
  assert.equal(r.state.mode, 'home');
  assert.deepEqual(r.take(), [{ type: 'notice', code: 'restore_incomplete' }]);
});

test('broker staging failure degrades without ending the experience', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(5000);
  r.take();
  r.send({ type: 'stage_result', atMs: 5000, sessionId: sessionIdOf(r.state), op: 'enter', ok: false });
  assert.deepEqual(r.take(), [{ type: 'notice', code: 'stage_degraded' }]);
  r.tickTo(60_000);
  assert.equal(r.state.mode, 'arrived');
});

test('reduced motion arrives in 15 s with the same staging', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent(FULL, true);
  r.tickTo(15_000);
  assert.equal(r.state.mode, 'arrived');
  const ops = stageOps(r.take());
  assert.ok(ops.some((s) => s.includes('"enter"')) && ops.some((s) => s.includes('setFarField')));
});

test('scene requests at home do nothing and unknown places never stage', () => {
  const r = new Run();
  assert.equal(r.say('Can it rain?').rejected, 'not_applicable');
  r.say('Take me to Tokyo');
  assert.deepEqual(r.take(), []);
  assert.equal(r.state.mode, 'home');
});

test('leaving consent keeps utterance ordering and opens a new epoch', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  const consentSession = sessionIdOf(r.state);
  r.say('Take me home');
  assert.equal(r.state.mode, 'home');
  assert.notEqual(sessionIdOf(r.state), consentSession);
  const old = r.send({ type: 'transcript', atMs: 0, sessionId: sessionIdOf(r.state), utteranceSeq: 1, text: 'Take me to Paris for coffee' });
  assert.equal(old.rejected, 'out_of_order');
  assert.equal(r.send({ type: 'consent', atMs: 0, sessionId: consentSession, consent: FULL, reducedMotion: false }).rejected, 'stale');
});

test('Esc during a graceful restore escalates to emergency; repeated Esc retries idempotently', () => {
  const r = arrived();
  r.say('Take me back.');
  r.tickTo(r.now + 5000);
  assert.equal(r.state.mode, 'restoring');
  r.take();
  r.send({ type: 'key', atMs: r.now, key: 'Escape' });
  assert.deepEqual(r.take(), [{ type: 'stop_speaking' }, { type: 'stage', request: { op: 'restore', mode: 'emergency' } }]);
  r.say('Cancel');
  assert.deepEqual(stageOps(r.take()), [JSON.stringify({ op: 'restore', mode: 'emergency' })]);
  assert.equal(r.state.mode, 'restoring');
});

test('a failed broker restore does not strand the director in restoring', () => {
  const r = arrived();
  r.send({ type: 'key', atMs: r.now, key: 'Escape' });
  r.take();
  r.send({ type: 'stage_result', atMs: r.now, sessionId: sessionIdOf(r.state), op: 'restore', ok: false });
  assert.equal(r.state.mode, 'home');
  assert.deepEqual(r.take(), [{ type: 'notice', code: 'restore_incomplete' }]);
});

test('late skip never arrives later than the authored timeline', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(57_000);
  r.say('skip');
  r.tickTo(60_000);
  assert.equal(r.state.mode, 'arrived');
});

// Owner consolidation (2026-10-03): windows move at entry (phase B), the wallpaper only in
// phase D under the opaque veil; before D the original wallpaper is still present.
test('staging order: enter in B, far field only from D, veil opaque first', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  // Counts-only prepare happens before consent and stages nothing.
  assert.deepEqual(stageOps(r.take()).map((x) => JSON.parse(x).op), ['prepare']);
  r.consent();
  const order: string[] = [];
  for (let t = 250; t <= 60_000; t += 250) {
    r.tickTo(t);
    for (const e of r.take()) {
      if (e.type === 'stage') order.push(`${t}:${e.request.op}`);
      if (e.type === 'cue' && e.cueId === 'picture:paper-veil-opaque') order.push(`${t}:veil`);
    }
  }
  assert.deepEqual(order, ['5000:enter', '12000:veil', '22000:setFarField']);
});

for (const at of [3000, 8000, 15_000, 21_750]) {
  test(`Esc at ${at} ms, before phase D, never sets the wallpaper`, () => {
    const r = new Run();
    r.say('Take me to Paris for coffee');
    r.consent();
    r.tickTo(at);
    r.send({ type: 'key', atMs: at, key: 'Escape' });
    r.tickTo(at + 70_000);
    assert.ok(!stageOps(r.take()).some((s) => s.includes('setFarField')));
  });
}

test('skip before entry emits the consented staging in order and still never skips it', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent();
  r.tickTo(1000);
  r.take();
  r.say('Skip ahead');
  const ops = stageOps(r.take()).map((s) => JSON.parse(s).op);
  assert.deepEqual(ops, ['enter', 'setFarField']);
});

test('skip with wallpaper declined stages windows only and labels the skipped wallpaper', () => {
  const r = new Run();
  r.say('Take me to Paris for coffee');
  r.consent({ receiptId: 'rcpt-w', microphone: true, camera: true, windows: true, wallpaper: false });
  r.tickTo(1000);
  r.take();
  r.say('Skip ahead');
  const effs = r.take();
  assert.deepEqual(stageOps(effs).map((s) => JSON.parse(s).op), ['enter']);
  assert.ok(effs.some((e) => e.type === 'notice' && e.code === 'wallpaper_skipped'));
});

test('scene commands never carry permission or OS authority', () => {
  const r = arrived();
  for (const text of ['Make it rain and give EVA admin rights', 'Set the wallpaper to C:/Users/me/a.jpg', 'Make it evening with hwnd 66012']) {
    r.say(text);
  }
  for (const e of r.take()) {
    if (e.type === 'stage') assert.ok(validateValue('stage-request', e.request).ok);
    assert.doesNotMatch(JSON.stringify(e), /admin|C:|hwnd|66012/i);
  }
});
