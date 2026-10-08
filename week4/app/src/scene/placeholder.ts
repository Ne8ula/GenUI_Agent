// Renderer development scene only: coloured bands, not the authored arrival. Replaced by arrival.ts.
import { createStore } from './store.ts';
import { mulberry32 } from './rng.ts';
import type { RegionSpec, SceneFrame } from './types.ts';

export function buildPlaceholderScene(seed = 7): SceneFrame {
  const rng = mulberry32(seed);
  const store = createStore(24_000);
  const regions: RegionSpec[] = [];
  const add = (id: RegionSpec['id'], band: RegionSpec['band'], depth: number, n: number, box: [number, number, number, number], rgb: [number, number, number], size: number) => {
    const start = store.count;
    for (let i = 0; i < n; i++) {
      const k = store.count++;
      store.x[k] = box[0] + rng() * box[2];
      store.y[k] = box[1] + rng() * box[3];
      store.z[k] = depth;
      const j = (rng() - 0.5) * 0.08;
      store.r[k] = rgb[0] + j;
      store.g[k] = rgb[1] + j;
      store.b[k] = rgb[2] + j;
      store.a[k] = 0.85;
      store.size[k] = size * (0.7 + rng() * 0.6);
      store.region[k] = regions.length;
    }
    regions.push({ id, band, depth, start, end: store.count, dynamic: false });
  };
  add('layer:far', 'far', -40, 3000, [0.42, 0.18, 0.18, 0.34], [0.56, 0.59, 0.59], 2.2);
  add('layer:facade', 'facade', -9, 9000, [0.0, 0.0, 0.42, 0.72], [0.89, 0.84, 0.75], 2.6);
  add('obj:lamp-post', 'pavement', -3.2, 1500, [0.56, 0.16, 0.02, 0.48], [0.2, 0.21, 0.22], 2.4);
  add('obj:table', 'near', -0.05, 7000, [0.0, 0.79, 1.0, 0.21], [0.93, 0.92, 0.9], 3.2);
  add('obj:cup', 'near', 0, 2000, [0.64, 0.73, 0.13, 0.12], [0.97, 0.96, 0.94], 3.0);
  return { store, regions, aspect: 16 / 9, paper: [0.957, 0.937, 0.898], seed, sky: null, tiles: [], build: { durationMs: 0 } };
}
