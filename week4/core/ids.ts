// Stable identifiers and closed vocabularies for the Week 4 Paris scene.
// Source: week4/planning.md §6.1, §6.5 and §7. These are contracts, not rendered assets.

export const SCENE_ID = 'scene:paris-1980s-terrace' as const;
export type SceneId = typeof SCENE_ID;

export const WEATHERS = ['clear', 'rain'] as const;
export type Weather = (typeof WEATHERS)[number];

export const LIGHTS = ['afternoon', 'evening'] as const;
export type Light = (typeof LIGHTS)[number];

export const VARIANT_IDS = ['afternoon-clear', 'afternoon-rain', 'evening-clear', 'evening-rain'] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

export function variantOf(light: Light, weather: Weather): VariantId {
  return `${light}-${weather}`;
}

// The IDs planning.md §7 names. A scene definition must contain all of them.
export const REQUIRED_STABLE_IDS = [
  'anchor:seat',
  'obj:table',
  'obj:cup',
  'obj:saucer',
  'obj:ashtray',
  'obj:cigarette',
  'obj:awning',
  'layer:far',
  'actors:passersby',
] as const;

export const STABLE_ID_PATTERN = /^(?:scene|anchor|obj|layer|actors|fx):[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ID_LENGTH = 64;

export function isStableId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_LENGTH && STABLE_ID_PATTERN.test(value);
}

export const INTENTS = [
  'arrive_paris_cafe',
  'weather_rain',
  'weather_clear',
  'light_evening',
  'light_afternoon',
  'undo',
  'skip',
  'return_home',
  'cancel_experience',
  'stop_speaking',
  // Derived from planning.md §6.5: historical questions get an honest framing line.
  'ask_about_era',
  'unknown',
] as const;
export type Intent = (typeof INTENTS)[number];
