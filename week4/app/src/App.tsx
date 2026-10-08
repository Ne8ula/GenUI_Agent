// Week 4 host: the renderer foundation showing the seed-33 look (beaded light, dither tiles, a timed build) or,
// for comparison, the earlier arrival frame. Fixture only. No camera, microphone, provider calls or desktop
// effects; head tracking is off. Keyboard shortcuts (Esc to cancel, S to skip) are deliberately absent: they
// are wired in step 5. Every control lives in the bar below the picture, never over it.
import { useCallback, useMemo, useState } from 'react';
import { FixtureControls } from './host/FixtureControls.tsx';
import { formatLiveState, formatStatus } from './host/frameStats.ts';
import type { BuildProgress } from './host/frameStats.ts';
import { parseParams, reseed, scrubMaxMs, seedAfterLookChange } from './host/params.ts';
import type { Density, Look } from './host/params.ts';
import { buildHostScene, sceneKey } from './host/scenes.ts';
import { Stage } from './host/Stage.tsx';
import type { LoopSnapshot } from './host/useRenderLoop.ts';
import type { WalkerFacing } from './scene/arrival.ts';
import type { BackendPreference } from './scene/types.ts';

export function App() {
  // URL parameters are read once; the controls own the state afterwards.
  const [initial] = useState(() =>
    parseParams(window.location.search, { prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches }),
  );
  const [backend, setBackend] = useState<BackendPreference>(initial.backend);
  const [look, setLook] = useState<Look>(initial.look);
  const [buildMs, setBuildMs] = useState(initial.buildMs);
  const [startMs, setStartMs] = useState(initial.startMs);
  const [seed, setSeed] = useState(initial.seed);
  const [density, setDensity] = useState<Density>(initial.density);
  const [facing, setFacing] = useState<WalkerFacing>(initial.facing);
  const [reduced, setReduced] = useState(initial.reduced);
  const [paused, setPaused] = useState(initial.paused);
  const [showTiles, setShowTiles] = useState(initial.showTiles);
  const [snapshot, setSnapshot] = useState<LoopSnapshot | null>(null);
  const [rendererError, setRendererError] = useState<string | null>(null);

  // Look, seed, density, facing, build length or start time re-author the scene and its idle life; the renderer is
  // kept. `startMs` is a dependency without being an input: idle life and the tile swaps only run forward, so moving
  // the time scrub needs a fresh scene to step from zero. Reduced motion is deliberately NOT here: the render loop
  // applies it to the existing scene in place, so toggling it never rebuilds, replays or moves a clock.
  const built = useMemo(
    () => buildHostScene({ look, seed, density, facing, buildMs }),
    [look, seed, density, facing, buildMs, startMs],
  );
  const key = sceneKey({ look, seed, density, facing, buildMs, startMs });
  const unavailable = built.error ?? rendererError;

  // A backend change mounts a fresh canvas inside the render loop; drop the previous backend's numbers. The clocks
  // and the scene are not touched (the loop keeps the host clock; see useRenderLoop.ts).
  const changeBackend = useCallback((next: BackendPreference) => {
    setSnapshot(null);
    setBackend(next);
  }, []);
  // The default seed follows the look (33 for seed33, 7 for arrival); a seed the user chose is kept.
  const changeLook = useCallback(
    (next: Look) => {
      setSeed((current) => seedAfterLookChange(current, look, next));
      setLook(next);
    },
    [look],
  );
  const onReseed = useCallback(() => setSeed((current) => reseed(current)), []);

  const stats = snapshot?.stats ?? null;
  const build: BuildProgress | null = snapshot ? { timeMs: snapshot.timeMs, durationMs: snapshot.buildMs, paused } : null;
  const statusInput = {
    backend: stats?.backend ?? null,
    detail: stats?.detail ?? null,
    degraded: stats?.degraded ?? false,
    particles: stats?.particlesDrawn ?? 0,
    frame: snapshot?.frame ?? null,
    drawMs: stats?.lastDrawMs ?? null,
    unavailable,
    tiles: snapshot?.tiles ?? null,
    build,
  };
  const status = formatStatus(statusInput);
  // Announced only when it changes (backend, degraded, unavailable, build phase); the numbers stay silent.
  const liveState = formatLiveState(statusInput);
  const tilesAvailable = (built.scene?.frame.tiles.length ?? 0) > 0;

  return (
    <main data-capture={initial.capture ? '1' : undefined}>
      <h1 className="visually-hidden">EVA Week 4 — Paris frame (fixture)</h1>
      <Stage
        scene={built.scene}
        sceneKey={key}
        startMs={startMs}
        preference={backend}
        paused={paused}
        reducedMotion={reduced}
        showTiles={showTiles}
        fixture={initial.fixture}
        manualClock={initial.manualClock}
        info={{ look, facing, seed, density, buildMs: built.scene?.frame.build.durationMs ?? 0 }}
        publish={!initial.capture}
        unavailable={unavailable}
        onSnapshot={setSnapshot}
        onUnavailable={setRendererError}
      />
      {initial.capture ? null : (
        <FixtureControls
          look={look}
          onLook={changeLook}
          buildMs={buildMs}
          onBuildMs={setBuildMs}
          startMs={startMs}
          onStartMs={setStartMs}
          scrubMaxMs={scrubMaxMs(look === 'seed33' ? buildMs : 0, startMs)}
          backend={backend}
          onBackend={changeBackend}
          paused={paused}
          onPaused={setPaused}
          showTiles={showTiles}
          onShowTiles={setShowTiles}
          tilesAvailable={tilesAvailable}
          reduced={reduced}
          onReduced={setReduced}
          facing={facing}
          onFacing={setFacing}
          density={density}
          onDensity={setDensity}
          seed={seed}
          onSeed={setSeed}
          onReseed={onReseed}
          status={status}
          liveState={liveState}
        />
      )}
    </main>
  );
}
