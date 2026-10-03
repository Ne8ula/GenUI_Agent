// Experience director: a pure state machine from events to effects (planning.md §4, §6.1, §7).
// It owns lifecycle, consent gating, the construction clock, queued follow-ups and
// stale-result rejection. Effects are requests; the broker and narrator decide outcomes.
import { SCENE_ID } from './ids.ts';
import type { Intent, VariantId } from './ids.ts';
import { routeTranscript } from './intents.ts';
import type { Routed } from './intents.ts';
import { initialPresentation, presentationVariant, reducePresentation } from './scene.ts';
import type { Presentation, PresentationCommand, SceneDefinition } from './scene.ts';
import { ARRIVAL_FULL, ARRIVAL_REDUCED, RETURN_GRACEFUL, cuesBetween, skipPlan } from './timeline.ts';
import type { Cue, Timeline } from './timeline.ts';

export type Mode = 'home' | 'consent' | 'constructing' | 'arrived' | 'returning' | 'restoring';

export interface Consent {
  receiptId: string;
  microphone: boolean;
  camera: boolean;
  windows: boolean;
  wallpaper: boolean;
}

export type StageRequest =
  | { op: 'prepare'; sceneId: typeof SCENE_ID }
  | { op: 'enter' | 'setFarField'; variantId: VariantId }
  | { op: 'restore'; mode: 'graceful' | 'emergency' };

export type Effect =
  | { type: 'stage'; request: StageRequest }
  | { type: 'speak'; lineId: string }
  | { type: 'stop_speaking' }
  | { type: 'cue'; cueId: string }
  | { type: 'blend'; variant: VariantId; revision: number; durationMs: number }
  | { type: 'notice'; code: NoticeCode };

export type NoticeCode =
  | 'windows_left_in_place'
  | 'wallpaper_skipped'
  | 'camera_off'
  | 'microphone_off'
  | 'stage_degraded'
  | 'restore_incomplete'
  | 'failure';

type FollowUp = Extract<Intent, 'weather_rain' | 'weather_clear' | 'light_evening' | 'light_afternoon' | 'undo'>;
const FOLLOW_UPS: readonly Intent[] = ['weather_rain', 'weather_clear', 'light_evening', 'light_afternoon', 'undo'];

export interface ClockState {
  timeline: Timeline;
  startedAtMs: number;
  elapsedMs: number;
  emitted: readonly string[];
  // Set while a skip crossfade is running; arrival happens at this time.
  skipEndsAtMs: number | null;
}

export interface DirectorState {
  mode: Mode;
  // Every experience start and every restore start opens a new epoch. Results and
  // transcripts carry the session ID they were produced for; anything older is stale.
  epoch: number;
  revision: number;
  lastUtteranceSeq: number;
  consent: Consent | null;
  presentation: Presentation | null;
  clock: ClockState | null;
  queued: { intent: FollowUp; utteranceSeq: number } | null;
  reducedMotion: boolean;
  failure: string | null;
}

export type DirectorEvent =
  | { type: 'transcript'; atMs: number; sessionId: string; utteranceSeq: number; text: string }
  | { type: 'speech_onset'; atMs: number; sessionId: string }
  | { type: 'key'; atMs: number; key: 'Escape' | 'S' }
  | { type: 'consent'; atMs: number; sessionId: string; consent: Consent; reducedMotion: boolean }
  | { type: 'consent_cancelled'; atMs: number; sessionId: string }
  | { type: 'tick'; atMs: number }
  | { type: 'stage_result'; atMs: number; sessionId: string; op: StageRequest['op']; ok: boolean }
  | { type: 'blend_complete'; atMs: number; sessionId: string; revision: number }
  | { type: 'restore_complete'; atMs: number; sessionId: string; outcome: 'restored' | 'partial' | 'unresolved' }
  | { type: 'failure'; atMs: number; sessionId: string; code: string };

export type Rejection = 'stale' | 'out_of_order' | 'not_applicable' | 'consent_required';

export interface Step {
  state: DirectorState;
  effects: Effect[];
  rejected?: Rejection;
  routed?: Routed;
}

export const BLEND_MS = 4000;

export function sessionIdOf(s: DirectorState): string {
  return `w4s-${s.epoch}`;
}

export function initialDirector(): DirectorState {
  return {
    mode: 'home',
    epoch: 1,
    revision: 0,
    lastUtteranceSeq: -1,
    consent: null,
    presentation: null,
    clock: null,
    queued: null,
    reducedMotion: false,
    failure: null,
  };
}

// Back to the eye without any staged effects; a new epoch makes late results stale.
function resetHome(s: DirectorState): DirectorState {
  return { ...initialDirector(), epoch: s.epoch + 1, lastUtteranceSeq: s.lastUtteranceSeq };
}

const speak = (lineId: string): Effect => ({ type: 'speak', lineId });
const stage = (request: StageRequest): Effect => ({ type: 'stage', request });

function cueEffects(s: DirectorState, cues: readonly Cue[]): Effect[] {
  const out: Effect[] = [];
  const variant = s.presentation ? presentationVariant(s.presentation) : 'afternoon-clear';
  for (const c of cues) {
    if (c.id === 'stage.enter') {
      if (s.consent?.windows) out.push(stage({ op: 'enter', variantId: variant }));
      else out.push({ type: 'notice', code: 'windows_left_in_place' });
    } else if (c.id === 'stage.setFarField') {
      if (s.consent?.wallpaper) out.push(stage({ op: 'setFarField', variantId: variant }));
      else out.push({ type: 'notice', code: 'wallpaper_skipped' });
    } else if (c.id === 'stage.restore.graceful') {
      out.push(stage({ op: 'restore', mode: 'graceful' }));
    } else if (c.id.startsWith('speak:')) {
      out.push(speak(c.id.slice('speak:'.length)));
    } else {
      out.push({ type: 'cue', cueId: c.id });
    }
  }
  return out;
}

function lineForUnknown(r: Routed): string | null {
  switch (r.reason) {
    case 'unsupported_place':
    case 'unsupported_era':
      return 'unknown.offer';
    case 'multiple_requests':
      return 'clarify.one-at-a-time';
    case 'ambiguous':
      return r.candidates?.includes('return_home') ? 'clarify.undo-or-return' : 'clarify.not-sure';
    case 'empty':
      return null;
    default:
      return 'clarify.not-sure';
  }
}

function toCommand(intent: FollowUp): PresentationCommand {
  switch (intent) {
    case 'weather_rain':
      return { kind: 'set_weather', weather: 'rain' };
    case 'weather_clear':
      return { kind: 'set_weather', weather: 'clear' };
    case 'light_evening':
      return { kind: 'set_light', light: 'evening' };
    case 'light_afternoon':
      return { kind: 'set_light', light: 'afternoon' };
    case 'undo':
      return { kind: 'undo' };
  }
}

const ACK: Record<Exclude<FollowUp, 'undo'>, string> = {
  weather_rain: 'followup.rain',
  weather_clear: 'followup.clear',
  light_evening: 'followup.evening',
  light_afternoon: 'followup.afternoon',
};

function applyFollowUp(s: DirectorState, intent: FollowUp): Step {
  if (!s.presentation) return { state: s, effects: [], rejected: 'not_applicable' };
  const result = reducePresentation(s.presentation, toCommand(intent));
  if (result.outcome === 'nothing_to_undo') return { state: s, effects: [speak('undo.nothing')] };
  if (result.outcome === 'already_so') return { state: s, effects: [speak('followup.already')] };
  const revision = s.revision + 1;
  const state: DirectorState = { ...s, presentation: result.state, revision };
  const effects: Effect[] = [{ type: 'blend', variant: result.variant, revision, durationMs: BLEND_MS }];
  if (s.consent?.wallpaper) effects.push(stage({ op: 'setFarField', variantId: result.variant }));
  if (intent === 'undo') effects.push(speak(result.state.look.weather === 'rain' ? 'undo.to-rain' : 'undo.generic'));
  else effects.push(speak(ACK[intent]));
  return { state, effects };
}

function arrive(s: DirectorState): Step {
  const arrived: DirectorState = { ...s, mode: 'arrived', clock: null, queued: null, revision: s.revision + 1 };
  if (!s.queued) return { state: arrived, effects: [] };
  return applyFollowUp(arrived, s.queued.intent);
}

function emergency(s: DirectorState, failure: string | null): Step {
  if (s.mode === 'home') return { state: s, effects: [], rejected: 'not_applicable' };
  if (s.mode === 'restoring') {
    // Escalate or retry: the broker restore is idempotent, and emergency outranks a graceful restore in flight.
    return { state: { ...s, failure: s.failure ?? failure }, effects: [{ type: 'stop_speaking' }, stage({ op: 'restore', mode: 'emergency' })] };
  }
  if (s.mode === 'consent') {
    // Nothing has been staged before consent; there is nothing to restore.
    return { state: resetHome(s), effects: [{ type: 'stop_speaking' }] };
  }
  const state: DirectorState = {
    ...s,
    mode: 'restoring',
    epoch: s.epoch + 1,
    clock: null,
    queued: null,
    failure,
  };
  const effects: Effect[] = [{ type: 'stop_speaking' }, stage({ op: 'restore', mode: 'emergency' })];
  if (failure) effects.push({ type: 'notice', code: 'failure' }, speak('failure.restoring'));
  return { state, effects };
}

function beginReturn(s: DirectorState, atMs: number): Step {
  const clock: ClockState = { timeline: RETURN_GRACEFUL, startedAtMs: atMs, elapsedMs: 0, emitted: [], skipEndsAtMs: null };
  const state: DirectorState = { ...s, mode: 'returning', clock, queued: null, revision: s.revision + 1 };
  return advance(state, atMs, [{ type: 'stop_speaking' }], -1);
}

// Emit timeline cues up to `atMs` and handle the end of a timeline.
function advance(s: DirectorState, atMs: number, prefix: Effect[] = [], from?: number): Step {
  const clock = s.clock;
  if (!clock) return { state: s, effects: prefix };
  const elapsed = Math.max(atMs - clock.startedAtMs, clock.elapsedMs);
  let effects = [...prefix];
  let state = s;

  if (clock.skipEndsAtMs !== null) {
    if (atMs < clock.skipEndsAtMs) return { state: { ...s, clock: { ...clock, elapsedMs: elapsed } }, effects };
    const pending = clock.timeline.cues.filter((c) => c.arrival && !clock.emitted.includes(c.id));
    effects = effects.concat(cueEffects(state, pending));
    const done = arrive({ ...state, clock: null });
    return { state: done.state, effects: effects.concat(done.effects) };
  }

  const due = cuesBetween(clock.timeline, from ?? clock.elapsedMs, Math.min(elapsed, clock.timeline.durationMs));
  effects = effects.concat(cueEffects(state, due));
  state = { ...state, clock: { ...clock, elapsedMs: elapsed, emitted: [...clock.emitted, ...due.map((c) => c.id)] } };

  if (elapsed >= clock.timeline.durationMs) {
    if (state.mode === 'constructing') {
      const done = arrive(state);
      return { state: done.state, effects: effects.concat(done.effects) };
    }
    if (state.mode === 'returning') {
      // The graceful restore cue was emitted above; a new epoch makes late results stale.
      return { state: { ...state, mode: 'restoring', clock: null, epoch: state.epoch + 1 }, effects };
    }
  }
  return { state, effects };
}

function handleIntent(s: DirectorState, routed: Routed, atMs: number, utteranceSeq: number, scene: SceneDefinition): Step {
  const intent = routed.intent;
  const withRouted = (step: Step): Step => ({ ...step, routed });

  if (intent === 'cancel_experience') return withRouted(emergency(s, null));
  if (intent === 'stop_speaking') return withRouted({ state: s, effects: [{ type: 'stop_speaking' }] });

  switch (s.mode) {
    case 'home': {
      if (intent !== 'arrive_paris_cafe') return withRouted({ state: s, effects: [], rejected: 'not_applicable' });
      const state: DirectorState = {
        ...initialDirector(),
        mode: 'consent',
        epoch: s.epoch + 1,
        lastUtteranceSeq: utteranceSeq,
        presentation: initialPresentation(scene),
      };
      return withRouted({ state, effects: [stage({ op: 'prepare', sceneId: SCENE_ID })] });
    }
    case 'consent':
      if (intent === 'return_home') return withRouted({ state: resetHome(s), effects: [] });
      return withRouted({ state: s, effects: [], rejected: intent === 'skip' ? 'consent_required' : 'not_applicable' });
    case 'constructing': {
      if (intent === 'return_home') return withRouted(beginReturn(s, atMs));
      if (intent === 'skip') {
        const clock = s.clock;
        if (!clock || clock.skipEndsAtMs !== null) return withRouted({ state: s, effects: [], rejected: 'not_applicable' });
        const plan = skipPlan(clock.timeline, new Set(clock.emitted));
        const emitted = [...clock.emitted, ...plan.required.map((c) => c.id)];
        // Never arrive later than the authored timeline would have.
        const remaining = Math.max(clock.timeline.durationMs - (atMs - clock.startedAtMs), 0);
        const state: DirectorState = { ...s, clock: { ...clock, emitted, skipEndsAtMs: atMs + Math.min(plan.crossfadeMs, remaining) } };
        return withRouted({ state, effects: cueEffects(s, plan.required) });
      }
      if (FOLLOW_UPS.includes(intent)) {
        // At most one follow-up waits for arrival; a newer request supersedes it.
        return withRouted({ state: { ...s, queued: { intent: intent as FollowUp, utteranceSeq } }, effects: [] });
      }
      if (intent === 'ask_about_era') return withRouted({ state: s, effects: [speak('era.framing')] });
      if (intent === 'unknown') {
        const line = lineForUnknown(routed);
        return withRouted({ state: s, effects: line ? [speak(line)] : [] });
      }
      return withRouted({ state: s, effects: [], rejected: 'not_applicable' });
    }
    case 'arrived': {
      if (intent === 'return_home') return withRouted(beginReturn(s, atMs));
      if (FOLLOW_UPS.includes(intent)) return withRouted(applyFollowUp(s, intent as FollowUp));
      if (intent === 'ask_about_era') return withRouted({ state: s, effects: [speak('era.framing')] });
      if (intent === 'unknown') {
        const line = lineForUnknown(routed);
        return withRouted({ state: s, effects: line ? [speak(line)] : [] });
      }
      return withRouted({ state: s, effects: [], rejected: 'not_applicable' });
    }
    case 'returning':
    case 'restoring':
      return withRouted({ state: s, effects: [], rejected: 'not_applicable' });
  }
}

export function reduce(s: DirectorState, e: DirectorEvent, scene: SceneDefinition): Step {
  const current = sessionIdOf(s);
  const stale = (): Step => ({ state: s, effects: [], rejected: 'stale' });

  switch (e.type) {
    case 'key':
      if (e.key === 'Escape') return emergency(s, null);
      return handleIntent(s, { intent: 'skip' }, e.atMs, s.lastUtteranceSeq, scene);

    case 'tick':
      if (s.mode === 'constructing' || s.mode === 'returning') return advance(s, e.atMs);
      return { state: s, effects: [] };

    case 'speech_onset':
      if (e.sessionId !== current) return stale();
      // Interruption stops EVA's voice; construction keeps going.
      return { state: s, effects: [{ type: 'stop_speaking' }] };

    case 'transcript': {
      if (e.sessionId !== current) return stale();
      if (e.utteranceSeq <= s.lastUtteranceSeq) return { state: s, effects: [], rejected: 'out_of_order' };
      const routed = routeTranscript(e.text);
      const step = handleIntent({ ...s, lastUtteranceSeq: e.utteranceSeq }, routed, e.atMs, e.utteranceSeq, scene);
      // The arrival intent opens a new epoch; keep the utterance ordering across it.
      return { ...step, state: { ...step.state, lastUtteranceSeq: Math.max(step.state.lastUtteranceSeq, e.utteranceSeq) } };
    }

    case 'consent': {
      if (e.sessionId !== current) return stale();
      if (s.mode !== 'consent') return { state: s, effects: [], rejected: 'not_applicable' };
      const timeline = e.reducedMotion ? ARRIVAL_REDUCED : ARRIVAL_FULL;
      const state: DirectorState = {
        ...s,
        mode: 'constructing',
        consent: { ...e.consent },
        reducedMotion: e.reducedMotion,
        revision: s.revision + 1,
        clock: { timeline, startedAtMs: e.atMs, elapsedMs: 0, emitted: [], skipEndsAtMs: null },
      };
      const notices: Effect[] = [];
      if (!e.consent.camera) notices.push({ type: 'notice', code: 'camera_off' });
      if (!e.consent.microphone) notices.push({ type: 'notice', code: 'microphone_off' });
      return advance(state, e.atMs, notices, -1);
    }

    case 'consent_cancelled':
      if (e.sessionId !== current) return stale();
      if (s.mode !== 'consent') return { state: s, effects: [], rejected: 'not_applicable' };
      return { state: resetHome(s), effects: [] };

    case 'stage_result':
      if (e.sessionId !== current) return stale();
      if (!e.ok && e.op === 'restore' && s.mode === 'restoring') {
        // The broker could not complete (e.g. recovery lock held, adapter or journal error).
        // Do not wait forever: return home and surface it; the journal keeps what is unresolved.
        const home: DirectorState = { ...initialDirector(), epoch: s.epoch, lastUtteranceSeq: s.lastUtteranceSeq, failure: s.failure };
        return { state: home, effects: [{ type: 'notice', code: 'restore_incomplete' }] };
      }
      if (!e.ok && (e.op === 'enter' || e.op === 'setFarField')) {
        // Labelled degraded mode; the experience continues in the foreground.
        return { state: s, effects: [{ type: 'notice', code: 'stage_degraded' }] };
      }
      return { state: s, effects: [] };

    case 'blend_complete':
      if (e.sessionId !== current || e.revision !== s.revision) return stale();
      return { state: s, effects: [] };

    case 'restore_complete': {
      if (e.sessionId !== current || s.mode !== 'restoring') return stale();
      const home: DirectorState = { ...initialDirector(), epoch: s.epoch, lastUtteranceSeq: s.lastUtteranceSeq, failure: s.failure };
      const effects: Effect[] = e.outcome === 'restored' ? [] : [{ type: 'notice', code: 'restore_incomplete' }];
      return { state: home, effects };
    }

    case 'failure':
      if (e.sessionId !== current) return stale();
      return emergency(s, e.code.slice(0, 64));
  }
}
