import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE, advance, askBody, escape, investigationSections, load, step, stepCaption, toggle, type Investigation, type Playback } from '../src/crime-scene/investigation.ts';

import * as investigationUI from '../src/crime-scene/investigation.ts';

const investigation: Investigation = {
  answer: 'One hypothesis: the chair was pushed over. <b>Plain</b> text only.',
  inconsistencies: [{ claim: 'The reddish traces are staged.', basis: 'research', source_ids: ['swgstain-terminology-2009', 'unknown-id'] }, { claim: 'No hair was documented.', basis: 'documented-absence', source_ids: [] }],
  look_for: [{ kind: 'footwear marks', where: 'near the chair', why: 'they would date the displacement' }],
  reconstruction: {
    title: 'Chair knocked over', hypothetical: true, actors: [{ id: 'A', label: 'Person A' }],
    steps: [
      { t: 4, actor: 'A', pose: 'push', position: [1, 1], facing: 0, object_moves: [{ tag: 69, state: 'displaced', position: [1, 2, 0] }], caption: 'A pushes the chair' },
      { t: 2, actor: 'A', pose: 'stand', position: [0, 0], facing: 0, object_moves: [], caption: 'A stands by the chair' },
    ],
  },
  citations: ['nij-csi-guide-2000', 'swgstain-terminology-2009'],
};
const research = [
  { id: 'nij-csi-guide-2000', citation: 'NIJ (2000). Crime Scene Investigation.', verification: 'full-text' },
  { id: 'swgstain-terminology-2009', citation: 'SWGSTAIN (2009). Terminology.', verification: 'abstract' },
];

test('demo wording discloses authored replies before consent and never claims live photo reasoning', () => {
  assert.equal(typeof investigationUI.investigationCopy, 'function');
  const demo = investigationUI.investigationCopy(true);
  assert.match(demo.intro, /Canned demo.*written in advance/);
  assert.match(demo.intro, /cannot evaluate free-text/);
  assert.match(demo.consent, /canned example/);
  assert.match(demo.working, /pre-written/);
  assert.match(demo.answered, /Canned/);
  assert.match(demo.cancelled, /No provider request/);
  assert.doesNotMatch(Object.values(demo).join(' '), /Opus|send.*photos|remote processing or cost/i);
  for (const value of [false, undefined]) {
    const live = investigationUI.investigationCopy(value);
    assert.equal(live.consent, 'Send this question, your scanned clues and their photos');
    assert.match(live.cancelled, /remote processing or cost may have occurred/);
  }
});

test('investigation sections are plain-text strings; cited ids map to citation and verification, unknown ids fall back', () => {
  const sections = investigationSections(investigation, research);
  assert.deepEqual(sections.map(section => section.title), ['Answer', 'Inconsistencies', 'Look for', 'Sources']);
  assert.deepEqual(sections[0]!.items, [investigation.answer]);
  assert.deepEqual(sections[1]!.items, [
    'The reddish traces are staged. Basis: research. Sources: SWGSTAIN (2009). Terminology. (verification: abstract); unknown-id.',
    'No hair was documented. Basis: documented absence. Sources: none.',
  ]);
  assert.deepEqual(sections[2]!.items, ['footwear marks, near the chair: they would date the displacement']);
  assert.deepEqual(sections[3]!.items, ['NIJ (2000). Crime Scene Investigation. (verification: full-text)', 'SWGSTAIN (2009). Terminology. (verification: abstract)']);
  assert.deepEqual(investigationSections(investigation, [])[3]!.items, investigation.citations);
  const empty = investigationSections({ ...investigation, inconsistencies: [], look_for: [], citations: [] }, research);
  assert.deepEqual(empty.slice(1).map(section => section.items), [[], [], []]);
  for (const section of sections) for (const item of section.items) assert.equal(typeof item, 'string');
});

test('ask body carries exactly the four contract fields with consent true', () => {
  assert.deepEqual(askBody('  Why is the chair over?  ', [18, 13], 'abc'), { question: 'Why is the chair over?', scanned: [18, 13], history_revision: 'abc', consent: true });
  assert.deepEqual(Object.keys(askBody('q', [1], 'r')).sort(), ['consent', 'history_revision', 'question', 'scanned']);
});

test('step caption follows chronological order', () => {
  const s = investigation.reconstruction;
  assert.equal(stepCaption(s, 0), 'Before the first step');
  assert.equal(stepCaption(s, 2), 'Step 1 of 2: A stands by the chair');
  assert.equal(stepCaption(s, 3), 'Step 1 of 2: A stands by the chair');
  assert.equal(stepCaption(s, 4), 'Step 2 of 2: A pushes the chair');
  assert.equal(stepCaption(s, 60), 'Step 2 of 2: A pushes the chair');
});

test('playback transitions: load, play/pause, advance to the end, escape, clear', () => {
  const s = investigation.reconstruction;
  const loaded = load(s, false);
  assert.deepEqual(loaded, { scenario: s, t: 0, playing: true });
  assert.deepEqual(load(null, false), IDLE);
  const paused = toggle(loaded);
  assert.equal(paused.playing, false);
  assert.equal(paused.t, 0, 'pause keeps t');
  assert.deepEqual(toggle(paused), loaded);
  assert.deepEqual(advance(paused, 1), paused, 'paused state does not advance');
  const mid = advance(loaded, 2.5);
  assert.deepEqual(mid, { scenario: s, t: 2.5, playing: true });
  assert.deepEqual(advance(mid, 10), { scenario: s, t: 4, playing: false }, 'stops at the last step');
  assert.deepEqual(advance(mid, -1), mid, 'negative dt is ignored');
  assert.deepEqual(toggle(advance(mid, 10)), loaded, 'play after the end restarts');
  assert.deepEqual(escape(mid), { ...mid, playing: false }, 'first Escape pauses and keeps t');
  assert.deepEqual(escape({ ...mid, playing: false }), IDLE, 'second Escape clears the hypothesis');
  assert.equal(escape(IDLE), null, 'Escape without a hypothesis is left to the panels');
  assert.equal(toggle(IDLE), IDLE);
  const single = load({ ...s, steps: [{ ...s.steps[1]!, t: 0 }] }, false);
  assert.equal(advance(single, 0.016).playing, false);
});

test('reduced motion loads on the first step and steps by index without playing', () => {
  const s = investigation.reconstruction;
  const first = load(s, true);
  assert.deepEqual(first, { scenario: s, t: 2, playing: false });
  const next = step(first, 1);
  assert.deepEqual(next, { scenario: s, t: 4, playing: false });
  assert.deepEqual(step(next, 1), next, 'clamped at the last step');
  assert.deepEqual(step(next, -1), first);
  assert.deepEqual(step(first, -1), first, 'clamped at the first step');
  assert.deepEqual(step({ scenario: s, t: 3, playing: true }, 1), { scenario: s, t: 4, playing: false }, 'stepping pauses');
  assert.deepEqual(step({ scenario: s, t: 0, playing: false }, 1), first, 'before the first step, next lands on the first step');
  const idle: Playback = IDLE;
  assert.equal(step(idle, 1), idle);
});
