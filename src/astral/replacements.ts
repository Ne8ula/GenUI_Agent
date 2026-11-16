// The room remembers which hero was replaced by which object of the shelf, and the replacements are made again when it loads.
// shortcut: they are kept in this browser's storage, so on one machine, in one browser profile, for one address. Keep them with the
// room on the server once a room has to outlive the browser's data or be the same on two screens.

const KEY = 'eva.astral.replacements';
const MAX_HERO = 32;

export interface Replacement { readonly hero: number; readonly object: string }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The list with hero `hero` now replaced by `object`. One entry per hero: a hero replaced again keeps only the latest. */
export function withReplacement(list: readonly Replacement[], hero: number, object: string): Replacement[] {
  return [...list.filter(entry => entry.hero !== hero), { hero, object }];
}

/** What storage held, as replacements. Storage is data, not trusted: whatever is not a hero index and a shelf id is dropped. */
export function parseReplacements(text: string | null | undefined): Replacement[] {
  let value: unknown;
  try { value = JSON.parse(text ?? ''); } catch { return []; }
  if (!Array.isArray(value)) return [];
  let list: Replacement[] = [];
  for (const entry of value.slice(0, 4 * MAX_HERO) as unknown[]) {
    const { hero, object } = (entry ?? {}) as Record<string, unknown>;
    if (typeof hero === 'number' && Number.isInteger(hero) && hero >= 0 && hero < MAX_HERO && typeof object === 'string' && /^[a-z0-9-]{1,40}$/.test(object))
      list = withReplacement(list, hero, object);
  }
  return list;
}

// Storage can be missing (tests, a locked-down browser) or refuse (a full or private profile): the room then simply does not remember.
const storage = (): Store | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };

export function readReplacements(store: Store | undefined = storage()): Replacement[] {
  try { return parseReplacements(store?.getItem(KEY)); } catch { return []; }
}

/** Keeps the list; an empty list forgets everything, which returns the room to the recording the next time it loads. */
export function writeReplacements(list: readonly Replacement[], store: Store | undefined = storage()): void {
  try { if (list.length) store?.setItem(KEY, JSON.stringify(list)); else store?.removeItem(KEY); } catch { /* not remembered */ }
}
