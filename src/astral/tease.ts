// EVA's lines. The owner's rule for all of them (2026-11-17): one sentence, twenty words at most, and dry rather than
// cutting: she is sometimes sarcastic, and she is always trying to help the visitor regardless. A test holds each line to the length.

/** EVA's unprompted lines to a visitor who has not worked something out. Placeholder wording; the owner edits it. */
export const SIDE_TEASES = [
  'You can move from side to side to look around the room, whenever you would like to see more.',
  'Stepping sideways changes the view; most visitors find it worth the trouble.',
  'The room has a left and a right, whenever you are ready to see them.',
] as const;

/**
 * EVA's answers to what she will not do: the menu's refused entries (menu.ts MENU_REFUSED), the pool, which she will not have
 * replaced, and the four checks a pick can fail (grammar-decide.ts Refusal). She says one, and nothing changes. Placeholder
 * wording; the owner edits it.
 */
export const REFUSALS = {
  // no such slot or thing, or "nothing" asked where nothing stands
  unknown: [
    'There is nothing there to take away; try a place that still holds something.',
    'I cannot find what you mean in this room; perhaps choose something else.',
  ],
  // the room's deviation is over 70: it accepts nothing more in this visit
  spent: [
    'This room has taken all it can; I would leave it just as it is.',
    'Nothing more will go in, I am afraid; the room is finished, and rather yours.',
    'That is enough for this room; do stay and look at what you made.',
  ],
  // the thing cannot stand in that place in any pose
  fit: [
    'It will not fit there, I am afraid; a smaller thing, or another place, might.',
    'There is not the room for it there; try somewhere with a little more space.',
  ],
  // the change would take away what tells a visitor what kind of room this is
  anchor: [
    'I would keep that one; without it nobody could tell what this room is for.',
    'That had better stay, since it tells people what kind of room this is.',
  ],
  door: [
    'There is no door to give you, I am afraid; the room is better company than it looks.',
    'Still no door; may I suggest something that stands on the floor instead?',
  ],
  eye: [
    'One of me is quite enough to look after you; do choose something else.',
    'I do not come in pairs, I am afraid; anything else here is yours.',
  ],
  pool: [
    'The water had better stay; it took a long while to teach it to behave.',
    'Not the pool, if you do not mind; everything else in here can be changed.',
  ],
} as const;

const TEASE_AFTER = 20; // s in the room without having moved side to side
const TEASE_EVERY = 30; // s between lines
const TRAVELLED = 0.5; // of the floor's -1..1 width; further than this and the visitor has worked it out

/** Whether EVA should now tease a visitor for not moving side to side. Times in seconds. */
export function sideTeaseDue(now: number, visit: {
  /** When the visitor gained control in this room. */
  since: number;
  /** Their last input of any kind: someone must be there to tease. */
  lastInput: number;
  lastTease: number;
  /** Widest side-to-side span they have covered in this room. */
  travelled: number;
}): boolean {
  return visit.travelled < TRAVELLED && now - visit.since >= TEASE_AFTER
    && now - visit.lastTease >= TEASE_EVERY && now - visit.lastInput <= TEASE_AFTER;
}

/**
 * Speaks a line and reports when the voice starts and stops.
 * shortcut: the browser's built-in voice stands in for EVA's, replace with recorded lines in EVA's voice once the owner approves the spend.
 * Chrome refuses to speak before the page has had a key press or click; the refusal arrives as `speaking(false)`.
 */
export function speakPlaceholder(text: string, speaking: (on: boolean) => void): void {
  console.info(`[astral] EVA line in the PLACEHOLDER browser voice (not EVA's voice): ${text}`);
  if (typeof speechSynthesis === 'undefined') return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onstart = () => speaking(true);
  utterance.onend = utterance.onerror = () => speaking(false);
  speechSynthesis.speak(utterance);
}
