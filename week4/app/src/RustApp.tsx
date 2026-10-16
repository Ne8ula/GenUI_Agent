import { useEffect, useState } from 'react';
import { FixtureControls } from './host/FixtureControls.tsx';
import { formatLiveState, formatStatus } from './host/frameStats.ts';
import { parseParams, reseed, scrubMaxMs, PARIS_TIMELINE_MS } from './host/params.ts';
import type { Density, Look, SceneId } from './host/params.ts';
import { RustStage } from './host/RustStage.tsx';
import { SourceWindows } from './host/SourceWindows.tsx';
import type { LoopSnapshot } from './host/useRenderLoop.ts';
import type { BackendPreference } from './scene/types.ts';

export function RustApp() {
  const [initial] = useState(() => parseParams(window.location.search, { prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }));
  const [sceneId, setSceneId] = useState<SceneId>(initial.sceneId);
  const [backend, setBackend] = useState<BackendPreference>(initial.backend);
  const [buildMs, setBuildMs] = useState(initial.buildMs);
  const [startMs, setStartMs] = useState(initial.startMs);
  const [seed, setSeed] = useState(initial.seed);
  const [density, setDensity] = useState<Density>(initial.density);
  const [reduced, setReduced] = useState(initial.reduced);
  const [paused, setPaused] = useState(initial.paused);
  const [showTiles, setShowTiles] = useState(initial.showTiles);
  const [snapshot, setSnapshot] = useState<LoopSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const effectiveBuildMs = sceneId === 'paris-r8' ? PARIS_TIMELINE_MS : buildMs;
  const seek = (ms: number) => { setStartMs(ms); setReplay(value => value + 1); };
  // Escape is an immediate local stop.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPaused(true); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const key = ['seed33-rust', sceneId, seed, density, effectiveBuildMs, startMs, replay].join(':');
  const stats = snapshot?.stats;
  const statusInput = {
    backend: stats?.backend ?? null, detail: stats?.detail ?? null, degraded: stats?.degraded ?? false,
    particles: 0, frame: snapshot?.frame ?? null, drawMs: stats?.lastDrawMs ?? null, unavailable: error,
    tiles: snapshot?.tiles ?? null, build: snapshot ? { timeMs: snapshot.timeMs, durationMs: effectiveBuildMs, paused } : null,
  };
  const historicalLook = (look: Look) => {
    if (look === 'arrival') {
      const params = new URLSearchParams(window.location.search);
      params.set('historical', '1'); params.set('look', 'arrival');
      window.location.search = params.toString();
    }
  };
  return <main data-capture={initial.capture ? '1' : undefined}>
    <h1 className="visually-hidden">EVA Week 4 — Rust procedural Seed-33 reconstruction</h1>
    <RustStage sceneKey={key} startMs={startMs} preference={backend} paused={paused} reducedMotion={reduced}
      showTiles={showTiles} fixture={initial.fixture} manualClock={initial.manualClock} paris={sceneId === 'paris-r8'}
      info={{ look: 'seed33', facing: 'away', seed, density, buildMs: effectiveBuildMs }} publish={!initial.capture}
      unavailable={error} onSnapshot={setSnapshot} onUnavailable={setError}
      overlay={<SourceWindows active={sceneId === 'paris-r8' && !error} reducedMotion={reduced} />} />
    {initial.capture ? null : <FixtureControls look="seed33" historicalAvailable={import.meta.env.DEV} onLook={historicalLook} buildMs={effectiveBuildMs} onBuildMs={setBuildMs}
      startMs={startMs} onStartMs={seek} scrubMaxMs={scrubMaxMs(effectiveBuildMs, startMs)}
      backend={backend} onBackend={(value) => { setSnapshot(null); setBackend(value); }} paused={paused} onPaused={setPaused}
      showTiles={showTiles} onShowTiles={setShowTiles} tilesAvailable reduced={reduced} onReduced={setReduced}
      facing="away" onFacing={() => {}} density={density} onDensity={setDensity} seed={seed} onSeed={setSeed}
      onReseed={() => setSeed((value) => reseed(value))} status={formatStatus(statusInput)} liveState={formatLiveState(statusInput)}
      sceneId={sceneId} onSceneId={setSceneId}
      onReplay={() => { seek(0); setPaused(false); }} onJumpToIdle={() => { seek(PARIS_TIMELINE_MS); setPaused(false); }} />}
  </main>;
}
