import { duration, frameAt, sortedSteps, steppedFrame } from './playback.ts';
import type { Scenario } from './playback.ts';
// EVA's reply (validated against eva-investigation.schema.json at the broker) is shown as plain text only.
export type Investigation = {
  answer: string;
  inconsistencies: { claim: string; basis: 'scanned' | 'documented-absence' | 'research'; source_ids: string[] }[];
  look_for: { kind: string; where: string; why: string }[];
  reconstruction: Scenario;
  citations: string[];
};
export type Source = { id: string; citation: string; verification: string };
export const EVA_LIMIT = 20;
export function investigationCopy(demo?: boolean) {
  return demo === true ? {
    intro: 'Canned demo — replies and figure poses are written in advance. This mode cannot evaluate free-text questions or infer events. No provider is called; photos are not uploaded for reasoning.',
    consent: 'Show a canned example using this question and the scanned tags',
    working: 'Loading the pre-written example.',
    answered: 'Canned example loaded. This is an authored hypothesis, not evidence.',
    cancelled: 'Example cancelled locally. No retry. No provider request was made.',
  } : {
    intro: 'EVA reasons only from the clues you scanned, their source photos and a curated research digest. Every answer is one hypothesis among several possible, not evidence.',
    consent: 'Send this question, your scanned clues and their photos',
    working: 'EVA is examining the scanned clues and their photos.',
    answered: 'EVA answered. This is a hypothesis, not evidence.',
    cancelled: 'Question cancelled locally. No retry; remote processing or cost may have occurred.',
  };
}
export const askBody = (question: string, scanned: number[], history_revision: string) => ({ question: question.trim(), scanned, history_revision, consent: true as const });
const BASIS = { scanned: 'scanned clue', 'documented-absence': 'documented absence', research: 'research' };
export function investigationSections(value: Investigation, research: Source[]): { title: string; items: string[] }[] {
  const cite = (id: string) => { const source = research.find(s => s.id === id); return source ? `${source.citation} (verification: ${source.verification})` : id; };
  return [
    { title: 'Answer', items: [value.answer] },
    { title: 'Inconsistencies', items: value.inconsistencies.map(x => `${x.claim} Basis: ${BASIS[x.basis]}. Sources: ${x.source_ids.map(cite).join('; ') || 'none'}.`) },
    { title: 'Look for', items: value.look_for.map(x => `${x.kind}, ${x.where}: ${x.why}`) },
    { title: 'Sources', items: value.citations.map(cite) },
  ];
}
export function stepCaption(s: Scenario, t: number) {
  const steps = sortedSteps(s), i = frameAt(s, t).step;
  return i < 0 ? 'Before the first step' : `Step ${i + 1} of ${steps.length}: ${steps[i]!.caption}`;
}

// Playback bar state. t is the scenario's own clock in seconds; walking and scanning never touch it.
export type Playback = { scenario: Scenario | null; t: number; playing: boolean };
export const IDLE: Playback = { scenario: null, t: 0, playing: false };
// Reduced motion starts on the first step and never auto-plays.
export function load(scenario: Scenario | null, reduced: boolean): Playback {
  return scenario ? { scenario, t: reduced ? sortedSteps(scenario)[0]!.t : 0, playing: !reduced } : IDLE;
}
export function toggle(p: Playback): Playback {
  if (!p.scenario) return p;
  return p.playing ? { ...p, playing: false } : { ...p, t: p.t >= duration(p.scenario) ? 0 : p.t, playing: true };
}
// Previous or next step by index, clamped by steppedFrame.
export function step(p: Playback, direction: -1 | 1): Playback {
  if (!p.scenario) return p;
  const i = steppedFrame(p.scenario, frameAt(p.scenario, p.t).step + direction).step;
  return { ...p, t: sortedSteps(p.scenario)[i]!.t, playing: false };
}
export function advance(p: Playback, dt: number): Playback {
  if (!p.scenario || !p.playing) return p;
  const t = Math.min(duration(p.scenario), p.t + Math.max(0, dt));
  return { ...p, t, playing: t < duration(p.scenario) };
}
// First Escape pauses; the next clears the loaded hypothesis; null leaves Escape to the panels.
export function escape(p: Playback): Playback | null {
  return p.playing ? { ...p, playing: false } : p.scenario ? IDLE : null;
}
