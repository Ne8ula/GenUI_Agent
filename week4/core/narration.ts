// Narration manifest checks and line selection. Only the narrator speaks user-facing prose;
// callers pass a line ID and never text, voice, model or provider settings.
import { parseJson, validateValue } from './validate.ts';
import type { Validation } from './validate.ts';

export interface NarrationPolicy {
  modelId: 'eleven_v3';
  stability: 0.5;
  maxStackedTags: number;
  maxCharacters: number;
  targetMinCharacters: number;
  allowedTags: string[];
  quietTags: string[];
  loudTags: string[];
  source: string;
}

export type LineAudio =
  | { status: 'missing' }
  | { status: 'reviewed'; assetId: string; sha256: string; listenedBy: 'owner'; listenedOn: string };

export interface NarrationLine {
  lineId: string;
  text: string;
  origin: 'planning.md §3' | 'planning.md §6.5' | 'cloud-proposal-unreviewed';
  shortFormException: string | null;
  audio: LineAudio;
}

export interface NarrationManifest {
  schemaVersion: 1;
  policy: NarrationPolicy;
  lines: NarrationLine[];
}

const TAG = /\[([^\]]*)\]/g;

export function tagsOf(text: string): string[] {
  return [...text.matchAll(TAG)].map((m) => (m[1] ?? '').trim());
}

// Mirrors the Week 1 v3 authoring rules (VOICE_PROMPTING.md) for this manifest.
export function lintLine(line: NarrationLine, policy: NarrationPolicy): string[] {
  const errors: string[] = [];
  const id = line.lineId;
  const tags = tagsOf(line.text);
  const spoken = line.text.replace(TAG, '').trim();

  if (/<[^>]*>/.test(line.text)) errors.push(`${id}: SSML/markup is not allowed`);
  if (/(\.\.\.|…)/.test(line.text)) errors.push(`${id}: ellipses are not allowed in short lines`);
  if (spoken.length === 0) errors.push(`${id}: no spoken text`);
  if (line.text.length > policy.maxCharacters) errors.push(`${id}: exceeds ${policy.maxCharacters} characters`);
  if (tags.length === 0) errors.push(`${id}: needs a delivery cue`);
  for (const tag of tags) if (!policy.allowedTags.includes(tag)) errors.push(`${id}: tag [${tag}] is not allowed`);
  // Cues are stacked before the text; count the leading run.
  const leading = /^(?:\s*\[[^\]]*\])+/.exec(line.text)?.[0] ?? '';
  if (tagsOf(leading).length > policy.maxStackedTags) errors.push(`${id}: more than ${policy.maxStackedTags} stacked cues`);
  if (tags.some((t) => policy.quietTags.includes(t)) && tags.some((t) => policy.loudTags.includes(t))) {
    errors.push(`${id}: quiet and loud cues in one clip`);
  }
  if (line.text.length < policy.targetMinCharacters && !line.shortFormException) {
    errors.push(`${id}: short line needs a documented short-form exception`);
  }
  if (/[A-Z]{2,}/.test(spoken.replace(/\bEVA\b/g, ''))) errors.push(`${id}: emphatic capitals are not allowed in short lines`);
  return errors;
}

export function checkManifest(value: unknown): Validation<NarrationManifest> {
  const shape = validateValue<NarrationManifest>('narration-manifest', value);
  if (!shape.ok) return shape;
  const m = shape.value;
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const line of m.lines) {
    if (seen.has(line.lineId)) errors.push(`duplicate line ${line.lineId}`);
    seen.add(line.lineId);
    errors.push(...lintLine(line, m.policy));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: m };
}

export function parseManifest(text: string): Validation<NarrationManifest> {
  const parsed = parseJson<unknown>('narration-manifest', text);
  return parsed.ok ? checkManifest(parsed.value) : parsed;
}

export type LineRequest =
  | { ok: true; lineId: string; playable: true; assetId: string }
  // Missing audio: the line is known, but nothing may be played or claimed as spoken.
  | { ok: true; lineId: string; playable: false; reason: 'audio_missing' }
  | { ok: false; reason: 'unknown_line' };

export function requestLine(m: NarrationManifest, lineId: unknown): LineRequest {
  if (typeof lineId !== 'string') return { ok: false, reason: 'unknown_line' };
  const line = m.lines.find((l) => l.lineId === lineId);
  if (!line) return { ok: false, reason: 'unknown_line' };
  if (line.audio.status !== 'reviewed') return { ok: true, lineId, playable: false, reason: 'audio_missing' };
  return { ok: true, lineId, playable: true, assetId: line.audio.assetId };
}

export function audioCoverage(m: NarrationManifest): { reviewed: number; missing: number } {
  const reviewed = m.lines.filter((l) => l.audio.status === 'reviewed').length;
  return { reviewed, missing: m.lines.length - reviewed };
}
