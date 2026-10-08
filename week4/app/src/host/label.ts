// The accessible name of the picture. DOM-free so `node --test` can run it.
// It describes the look actually shown (seed 33 or the earlier arrival frame), the way the near walker faces in the
// arrival look, and whether the tiles are on, so a screen-reader user is never told about something that is not there.

export interface LabelInput {
  /** `seed33` or `arrival`; anything else is described as the seed-33 look. */
  look: string;
  /** Arrival look only: which way the near walker faces. The seed-33 woman always walks toward the viewer. */
  facing: string;
  /** Seed-33 look only: whether the colour tiles are handed to the renderer. */
  showTiles: boolean;
}

export function canvasLabel({ look, facing, showTiles }: LabelInput): string {
  if (look === 'arrival') {
    const way = facing === 'toward' ? 'toward you' : 'away from you';
    return `EVA's Paris frame, the earlier arrival look: a café table with an espresso and a glass ashtray, a rattan chair, a woman in a camel trench coat walking ${way} and two walkers farther down a quiet 1980s Paris street, drawn as points of light on warm paper`;
  }
  const tiles = showTiles ? ', with small flat, dotted and dithered colour tiles floating over the façades' : '';
  return `EVA's Paris frame, drawn as beaded points of light on a dark ground: a café table with an espresso and a glass ashtray, a rattan chair, a woman in a camel trench coat walking toward you with no readable face, and two walkers farther down a quiet 1980s Paris street near a gas lamp${tiles}`;
}
