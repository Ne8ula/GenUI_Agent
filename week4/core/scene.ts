// Fixed-scene definition checks and the pure presentation reducer (weather, light, undo).
import { REQUIRED_STABLE_IDS, SCENE_ID, variantOf } from './ids.ts';
import type { Light, VariantId, Weather } from './ids.ts';
import { looksAuthorityBearing, parseJson, validateValue } from './validate.ts';
import type { Validation } from './validate.ts';

export type Vec3 = [number, number, number];
export type Band = 'near' | 'overhead' | 'pavement' | 'facade' | 'far';

export interface SceneDefinition {
  schemaVersion: 1;
  sceneId: typeof SCENE_ID;
  status: 'provisional-blockout-anchors';
  interpretationNotice: string;
  units: { length: string; frame: string };
  anchors: { id: string; position: Vec3 }[];
  objects: {
    id: string;
    band: Band;
    anchor: string;
    size: Vec3;
    persistence: 'fixed' | 'state-dependent';
    occludes?: string[];
  }[];
  states: VariantId[];
  defaultState: { weather: Weather; light: Light };
}

// Schema validation plus cross-reference rules a schema cannot express.
export function checkScene(value: unknown): Validation<SceneDefinition> {
  const shape = validateValue<SceneDefinition>('scene', value);
  if (!shape.ok) return shape;
  const scene = shape.value;
  const errors: string[] = [];

  const anchorIds = new Set<string>();
  for (const a of scene.anchors) {
    if (anchorIds.has(a.id)) errors.push(`duplicate anchor ${a.id}`);
    anchorIds.add(a.id);
  }
  const objectIds = new Set<string>();
  for (const o of scene.objects) {
    if (objectIds.has(o.id)) errors.push(`duplicate object ${o.id}`);
    objectIds.add(o.id);
    if (!anchorIds.has(o.anchor)) errors.push(`${o.id} references missing anchor ${o.anchor}`);
  }
  for (const o of scene.objects) {
    for (const target of o.occludes ?? []) {
      if (!objectIds.has(target)) errors.push(`${o.id} occludes missing object ${target}`);
      if (target === o.id) errors.push(`${o.id} cannot occlude itself`);
    }
  }
  for (const id of REQUIRED_STABLE_IDS) {
    if (!anchorIds.has(id) && !objectIds.has(id)) errors.push(`required stable id ${id} is missing`);
  }
  if (looksAuthorityBearing(scene.interpretationNotice)) errors.push('interpretationNotice carries authority-like text');

  // Depth bands must stay ordered so authored parallax remains plausible.
  const depth = (band: Band) =>
    scene.objects
      .filter((o) => o.band === band)
      .map((o) => scene.anchors.find((a) => a.id === o.anchor)?.position[2] ?? Number.NaN);
  const near = Math.min(...depth('near'));
  const pavement = depth('pavement');
  const facade = depth('facade');
  const far = depth('far');
  if (!(Math.max(...pavement) < near && Math.max(...facade) < Math.min(...pavement) && Math.max(...far) < Math.min(...facade))) {
    errors.push('depth bands are not ordered near > pavement > facade > far');
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: scene };
}

export function parseScene(text: string): Validation<SceneDefinition> {
  const parsed = parseJson<unknown>('scene', text);
  return parsed.ok ? checkScene(parsed.value) : parsed;
}

// ---------------------------------------------------------------------------
// Presentation state. It deliberately contains no consent, lease, permission or
// freshness fields, so undo can only ever restore presentation.

export const MAX_UNDO = 16;

export interface Look {
  weather: Weather;
  light: Light;
}

export interface Presentation {
  sceneId: typeof SCENE_ID;
  revision: number;
  look: Look;
  undo: readonly Look[];
  objectIds: readonly string[];
}

export type PresentationCommand =
  | { kind: 'set_weather'; weather: Weather }
  | { kind: 'set_light'; light: Light }
  | { kind: 'undo' };

export type PresentationOutcome = 'changed' | 'already_so' | 'nothing_to_undo';

export interface PresentationResult {
  state: Presentation;
  outcome: PresentationOutcome;
  variant: VariantId;
}

export function initialPresentation(scene: SceneDefinition): Presentation {
  return {
    sceneId: scene.sceneId,
    revision: 0,
    look: { ...scene.defaultState },
    undo: [],
    objectIds: Object.freeze(scene.objects.map((o) => o.id)),
  };
}

export function presentationVariant(p: Presentation): VariantId {
  return variantOf(p.look.light, p.look.weather);
}

export function reducePresentation(p: Presentation, cmd: PresentationCommand): PresentationResult {
  let next: Look;
  switch (cmd.kind) {
    case 'set_weather':
      next = { ...p.look, weather: cmd.weather };
      break;
    case 'set_light':
      next = { ...p.look, light: cmd.light };
      break;
    case 'undo': {
      const previous = p.undo.at(-1);
      if (!previous) return { state: p, outcome: 'nothing_to_undo', variant: presentationVariant(p) };
      const state: Presentation = { ...p, revision: p.revision + 1, look: { ...previous }, undo: p.undo.slice(0, -1) };
      return { state, outcome: 'changed', variant: presentationVariant(state) };
    }
  }
  if (next.weather === p.look.weather && next.light === p.look.light) {
    return { state: p, outcome: 'already_so', variant: presentationVariant(p) };
  }
  const undo = [...p.undo, { ...p.look }].slice(-MAX_UNDO);
  const state: Presentation = { ...p, revision: p.revision + 1, look: next, undo };
  return { state, outcome: 'changed', variant: presentationVariant(state) };
}
