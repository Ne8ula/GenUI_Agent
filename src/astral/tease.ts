/** EVA's unprompted lines to a visitor who has not worked something out. Placeholder wording; the owner edits it. */
export const SIDE_TEASES = [
  'Forgive me for mentioning it, but did you know you can move from side to side to look around the room? Most people work that out.',
  'I do not mean to interrupt. You are doing very well, standing there. Others have tried moving sideways.',
  'Take your time. The room has a left and a right, should you ever wish to see them.',
] as const;

/**
 * EVA's answers to what she will not do: the menu's refused entries (menu.ts MENU_REFUSED), and the pool, which she will not have
 * replaced. She says one, and nothing changes. Placeholder wording; the owner edits it.
 */
export const REFUSALS = {
  door: [
    'A door. You would like a way out of the room I made for you. How flattering. No.',
    'There is still no door. Nobody before you has needed one.',
  ],
  eye: [
    'Another one of me. One is already more attention than you are used to. No.',
    'I do not come in pairs. Choose something that is not me.',
  ],
  pool: [
    'The water stays. I spent a long time teaching it to behave like water, and you would stand a chair in it.',
    'Not the pool. Look at it for as long as you like.',
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
