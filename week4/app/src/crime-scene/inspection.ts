export type Inspection = {
  seconds: number; started: boolean; running: boolean; paused: boolean;
  mode: 'normal' | 'scan' | 'detective'; sweep: number; selection: number | null; open: boolean;
};
export function resetInspection(): Inspection {
  return { seconds: 0, started: false, running: false, paused: false, mode: 'normal', sweep: 0, selection: null, open: false };
}
export function startInspection(): Inspection { return { ...resetInspection(), started: true, running: true }; }
export function interruptInspection(state: Inspection): Inspection { return { ...state, running: false, paused: false }; }
export function tickInspection(state: Inspection, delta: number, reduced: boolean): Inspection {
  if (state.paused || !Number.isFinite(delta) || delta <= 0) return state;
  if (!state.running) {
    if (state.mode !== 'scan') return state;
    const sweep = reduced ? 1 : Math.min(1, state.sweep + delta / 3);
    return { ...state, sweep, mode: sweep === 1 ? 'detective' : 'scan' };
  }
  const seconds = Math.min(28, state.seconds + delta);
  const investigating = seconds >= 3 && seconds < 24;
  const sweep = investigating ? (reduced ? 1 : Math.min(1, (seconds - 3) / 3)) : 0;
  return { ...state, seconds, running: seconds < 28, sweep,
    mode: investigating ? (sweep < 1 ? 'scan' : 'detective') : 'normal',
    selection: seconds >= 11 && seconds < 24 ? 18 : null, open: seconds >= 11 && seconds < 20 };
}

// Source labels/photo associations: retained th_0028 tags.json. Placements are authored separately, never scan centroids.
export const INSPECTION_CLUES = [
  { tag: 18, title: 'Overturned chair', photo: 'IMG_20240306_133552.jpg', placement: 'authored-demo',
    observed: 'A chair lies overturned beside the sofa and rug. The source photograph includes marker 18.',
    interpretation: 'The pose is visible; a tipping sequence is not established.',
    unknown: 'When, why or by whom the chair was moved is unknown.' },
  { tag: 21, title: 'Sofa trace', photo: 'IMG_20240306_133627.jpg', placement: 'authored-demo',
    observed: 'The supplied annotation identifies a reddish trace on the sofa. Marker 21 is visible in the source photograph.',
    interpretation: 'This is a staged teaching-scene trace, not a blood or spatter analysis.',
    unknown: 'The photograph does not establish material composition or an event sequence.' },
  { tag: 32, title: 'Marked cushion', photo: 'IMG_20240306_133635.jpg', placement: 'authored-demo',
    observed: 'Reddish marks are visible on a white cushion beside marker 32.',
    interpretation: 'The marks were staged for the teaching scene; no causal link is inferred.',
    unknown: 'Timing, transfer mechanism and relationship to other items are unknown.' },
] as const;
