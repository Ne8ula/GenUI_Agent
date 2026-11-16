/**
 * Prototype looks the owner is choosing between, switched from the address bar: ?look=ribbons,data
 * No parameter = the current look. Looks the owner keeps become the default and leave this list; the rest are deleted.
 * Kept so far (2026-11-12): ordered dots and glow, now always on.
 */
export const ASTRAL_LOOKS = ['ribbons', 'data', 'sand'] as const;
export type AstralLook = typeof ASTRAL_LOOKS[number];

const requested = typeof location === 'undefined' ? [] : (new URLSearchParams(location.search).get('look') ?? '').split(',');
export const hasLook = (look: AstralLook): boolean => requested.includes(look);
