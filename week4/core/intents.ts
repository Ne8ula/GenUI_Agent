// Deterministic closed-set intent routing over transcript text (planning.md §6.5).
// No provider, no model, no microphone. Ambiguity, negation and unsupported requests
// resolve to `unknown` with a reason so nothing is changed and nothing is claimed.
import type { Intent } from './ids.ts';

export type UnknownReason =
  | 'empty'
  | 'negated'
  | 'ambiguous'
  | 'multiple_requests'
  | 'unsupported_place'
  | 'unsupported_era'
  | 'too_long'
  | 'unrecognized';

export interface Routed {
  intent: Intent;
  reason?: UnknownReason;
  candidates?: Intent[];
}

export const MAX_TRANSCRIPT_CHARS = 400;

const CONTRACTIONS: [RegExp, string][] = [
  [/\bdon't\b/g, 'do not'],
  [/\bdoesn't\b/g, 'does not'],
  [/\bcan't\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/\bwon't\b/g, 'will not'],
  [/\bisn't\b/g, 'is not'],
  [/\bit's\b/g, 'it is'],
  [/\blet's\b/g, 'let us'],
  [/\bthat's\b/g, 'that is'],
  [/\bi'd\b/g, 'i would'],
  [/\bi'm\b/g, 'i am'],
  [/\bwhat's\b/g, 'what is'],
  [/\bwe're\b/g, 'we are'],
];

const ERA_80S = /\b(?:nineteen[\s-]?eight(?:ies|y(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?)|198[0-9]'?s?|'?80'?s|eighties)\b/g;
const OTHER_ERA = /\b(?:1[0-9]{3}'?s?|20[0-9]{2}'?s?|nineteen[\s-]?(?:twenties|thirties|forties|fifties|sixties|seventies|nineties)|(?:twenties|thirties|forties|fifties|sixties|seventies|nineties)|today|modern|nowadays|present day|contemporary|future|medieval)\b/;

export function normalizeTranscript(text: string): string {
  let s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'");
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  s = s.replace(ERA_80S, ' era80 ');
  s = s.replace(/[^a-z0-9'\s]/g, ' ').replace(/'(?![a-z])|(?<![a-z0-9])'/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const NEGATORS = new Set(['not', 'no', 'never', 'without', 'nothing', 'nor']);

// True if a negator appears within `window` tokens before the first token matching `keyword`.
function negatedNear(tokens: string[], keyword: RegExp, window = 4): boolean {
  const idx = tokens.findIndex((t) => keyword.test(t));
  if (idx < 0) return false;
  for (let i = Math.max(0, idx - window); i < idx; i++) {
    if (NEGATORS.has(tokens[i] ?? '')) return true;
  }
  return false;
}

const has = (s: string, re: RegExp) => re.test(s);

const CANCEL = [/\b(?:cancel|abort)\b/, /\bstop (?:the|this) (?:experience|scene|whole thing)\b/, /\bstop everything\b/, /\bend (?:the|this) (?:experience|scene)\b/, /\bget me out\b/];
const CANCEL_WORD = /^(?:cancel|abort|stop|end|get)$/;

const STOP_SPEAKING = [/^(?:stop|shh+|hush|quiet)(?: please)?$/, /\b(?:stop|quit) (?:talking|speaking)\b/, /\bbe quiet\b/, /\b(?:shh+|hush)\b/, /\benough talking\b/];

const GO_BACK_AMBIGUOUS = /^(?:(?:can we|please) )?go back(?: please| now)?$/;

const RETURN_HOME = [
  /\btake me (?:back|home)(?: home)?(?: now)?(?: please)?$/,
  /\btake me back to (?:my |the )?(?:desktop|computer|room)\b/,
  /\b(?:go|bring me|let us go|we can go) (?:back )?home\b/,
  /\bi (?:want|would like) to (?:go|come) (?:back|home)$/,
  /\b(?:leave|exit) (?:paris|the cafe|here|this place)\b/,
  /\bback to (?:my |the )?(?:desktop|reality|computer)\b/,
  /\blet us go back(?: now)?$/,
];

const SKIP = [/\bskip(?: ahead| it| this| forward| to the end)?\b/, /\bjust take me there\b/, /\bfast forward\b/, /\bget me there (?:now|faster)\b/];

const UNDO = [/\bundo\b/, /\bchange it back\b/, /\bput it back\b/, /\bthe way it was\b/, /\brevert\b/, /\bgo back one\b/, /\bone step back\b/];

const ERA_QUESTION = [/\bwhat year\b/, /\bis (?:this|it) real\b/, /\bwhen is this\b/, /\bis this (?:really )?(?:the )?era80\b/, /\bwhere are we\b/, /\bis this a real (?:cafe|place)\b/];

const CLEAR_EXPLICIT = [/\bstop (?:the )?rain(?:ing)?\b/, /\bmake (?:the|it) (?:rain )?stop rain(?:ing)?\b/, /\bmake the rain stop\b/, /\bno more rain\b/, /\bend the rain\b/, /\bclear (?:up|skies|sky)\b/, /\b(?:sunny|sunshine|sunlight)\b/, /\bbring (?:back )?the sun\b/, /\bback to (?:the )?sun\b/, /\bdry (?:it )?(?:up|out)\b/, /\bthe rain stop\b/];
const RAIN_WORD = /^(?:rain|raining|rainy|drizzle|drizzling|showers?|downpour|pouring)$/;
const EVENING_WORD = /^(?:evening|dusk|sunset|night|nightfall|twilight|dark|darker)$/;
const EVENING_PHRASE = [/\bblue hour\b/, /\blamps? (?:come |go )?on\b/, /\blater in the day\b/, /\bgetting dark\b/];
const AFTERNOON_WORD = /^(?:afternoon|daytime|daylight|brighter|lighter)$/;
const AFTERNOON_PHRASE = [/\bback to (?:the )?day\b/, /\bmake it day\b/, /\bday time\b/];

const PLACE_REQUEST = /\b(?:take me to|go to|show me|bring me to|let us go to|i want to (?:go to|be in|visit)|feel like to be in|build|make me|create|generate)\b/;

const PARIS = /\bparis\b/;
const CAFE_WORDS = /\b(?:cafe|coffee|terrace|bistro|espresso|era80)\b/;

export function routeTranscript(raw: string): Routed {
  if (raw.length > MAX_TRANSCRIPT_CHARS) return { intent: 'unknown', reason: 'too_long' };
  const s = normalizeTranscript(raw);
  if (s.length === 0) return { intent: 'unknown', reason: 'empty' };
  const tokens = s.split(' ');

  // Safety first: an emergency cancel outranks every other reading.
  if (CANCEL.some((re) => has(s, re))) {
    // Only verb-level negation ("do not cancel", "never cancel") blocks the kill switch;
    // a leading interjection ("No, cancel", "Never mind, cancel that") must not.
    const at = tokens.findIndex((t) => CANCEL_WORD.test(t));
    const before = tokens[at - 1];
    return before === 'not' || before === 'never' ? { intent: 'unknown', reason: 'negated' } : { intent: 'cancel_experience' };
  }
  if (STOP_SPEAKING.some((re) => has(s, re))) return { intent: 'stop_speaking' };
  if (has(s, GO_BACK_AMBIGUOUS)) return { intent: 'unknown', reason: 'ambiguous', candidates: ['undo', 'return_home'] };
  if (RETURN_HOME.some((re) => has(s, re))) {
    return negatedNear(tokens, /^(?:take|go|leave|exit|back)$/) ? { intent: 'unknown', reason: 'negated' } : { intent: 'return_home' };
  }
  if (SKIP.some((re) => has(s, re))) {
    return negatedNear(tokens, /^(?:skip|just|fast|get)$/) ? { intent: 'unknown', reason: 'negated' } : { intent: 'skip' };
  }
  if (UNDO.some((re) => has(s, re))) {
    return negatedNear(tokens, /^(?:undo|change|put|revert|go)$/) ? { intent: 'unknown', reason: 'negated' } : { intent: 'undo' };
  }
  if (ERA_QUESTION.some((re) => has(s, re))) return { intent: 'ask_about_era' };

  if (has(s, PARIS)) {
    if (OTHER_ERA.test(s)) return { intent: 'unknown', reason: 'unsupported_era' };
    if (negatedNear(tokens, /^paris$/, 6)) return { intent: 'unknown', reason: 'negated' };
    if (has(s, CAFE_WORDS) || has(s, PLACE_REQUEST)) return { intent: 'arrive_paris_cafe' };
    return { intent: 'unknown', reason: 'ambiguous', candidates: ['arrive_paris_cafe'] };
  }

  const matched: Intent[] = [];
  let negated = false;
  const clearExplicit = CLEAR_EXPLICIT.some((re) => has(s, re));
  if (clearExplicit) matched.push('weather_clear');
  if (!clearExplicit && tokens.some((t) => RAIN_WORD.test(t))) {
    if (negatedNear(tokens, RAIN_WORD)) negated = true;
    else matched.push('weather_rain');
  }
  if (tokens.some((t) => EVENING_WORD.test(t)) || EVENING_PHRASE.some((re) => has(s, re))) {
    if (negatedNear(tokens, EVENING_WORD)) negated = true;
    else matched.push('light_evening');
  }
  if (tokens.some((t) => AFTERNOON_WORD.test(t)) || AFTERNOON_PHRASE.some((re) => has(s, re))) {
    if (negatedNear(tokens, AFTERNOON_WORD)) negated = true;
    else matched.push('light_afternoon');
  }
  if (matched.length > 1) return { intent: 'unknown', reason: 'multiple_requests', candidates: matched };
  if (matched.length === 1) return { intent: matched[0] as Intent };
  if (negated) return { intent: 'unknown', reason: 'negated' };

  if (has(s, PLACE_REQUEST)) return { intent: 'unknown', reason: 'unsupported_place' };
  return { intent: 'unknown', reason: 'unrecognized' };
}
