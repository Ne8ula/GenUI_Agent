// The room's memory is its ledger (grammar.ts): the ordered list of changes visitors caused. It is stored here and read back
// through parseLedger, which treats what storage holds as untrusted data.
// shortcut: it is kept in this browser's storage, so on one machine, in one browser profile, for one address. A server route keeps
// it from step 9 (LIMINAL-GRAMMAR.md), when one room has to last across visitors and machines.
import { parseLedger, type BaseRoom, type Change, type Thing } from './grammar.ts';

const KEY = 'eva.astral.ledger';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Storage can be missing (tests, a locked-down browser) or refuse (a full or private profile): the room then simply does not remember.
const storage = (): Store | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };

/** The seed of the next decision in a slot: the ledger's length and the slot, never chance, so the same picks in the same order
 * are decided the same way and a capture can be repeated. */
export const pickSeed = (base: BaseRoom, ledger: readonly Change[], slot: string): number =>
  ledger.length * 31 + base.slots.findIndex(each => each.id === slot);

/** The stored ledger of this room: only changes to its slots, with things of this shelf or none, within range. Anything else is dropped. */
export function readLedger(base: BaseRoom, shelf: readonly Thing[], store: Store | undefined = storage()): Change[] {
  try { return parseLedger(JSON.parse(store?.getItem(KEY) ?? 'null'), base, shelf); } catch { return []; }
}

/** Keeps the ledger; an empty one forgets the room, which is the recording again the next time it loads. */
export function writeLedger(ledger: readonly Change[], store: Store | undefined = storage()): void {
  try { if (ledger.length) store?.setItem(KEY, JSON.stringify(ledger)); else store?.removeItem(KEY); } catch { /* not remembered */ }
}
