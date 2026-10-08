// Fixture bar for the host. In document flow below the stage, never over the picture.
// Every control is a real <button>/<select>/<input> with a visible label; no colour-only state, and a control
// that does not apply to the current look says so in its label.
import { useCallback, useEffect, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { WalkerFacing } from '../scene/arrival.ts';
import type { BackendPreference } from '../scene/types.ts';
import { buildChoices, clampSeed, DENSITIES, SEED_MAX, SEED_MIN } from './params.ts';
import type { Density, Look } from './params.ts';

export interface FixtureControlsProps {
  look: Look;
  onLook: (look: Look) => void;
  buildMs: number;
  onBuildMs: (buildMs: number) => void;
  /** The `t` the clip (re)starts at, ms, and the top of the scrub range. */
  startMs: number;
  onStartMs: (startMs: number) => void;
  scrubMaxMs: number;
  backend: BackendPreference;
  onBackend: (backend: BackendPreference) => void;
  paused: boolean;
  onPaused: (paused: boolean) => void;
  showTiles: boolean;
  onShowTiles: (show: boolean) => void;
  /** False when the current look has no tiles; the toggle then says so instead of doing nothing silently. */
  tilesAvailable: boolean;
  reduced: boolean;
  onReduced: (reduced: boolean) => void;
  facing: WalkerFacing;
  onFacing: (facing: WalkerFacing) => void;
  density: Density;
  onDensity: (density: Density) => void;
  seed: number;
  onSeed: (seed: number) => void;
  onReseed: () => void;
  /** The status line text; the parent keeps it to at most four updates per second. */
  status: string;
  /** State-only text for the live region: backend, degraded, unavailable, build phase. Numbers are not announced. */
  liveState: string;
}

/** How long typing in the seed box (or dragging the scrub) waits before it rebuilds the scene. Enter and blur apply at once. */
const COMMIT_DELAY_MS = 600;
const SCRUB_COMMIT_DELAY_MS = 500;

function SeedField({ seed, onSeed }: { seed: number; onSeed: (seed: number) => void }) {
  const id = useId();
  // null means "not editing": the box shows the effective seed.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (/^\d+$/.test(trimmed)) onSeed(clampSeed(Number(trimmed)));
      setDraft(null); // an unusable draft reverts to the effective seed
    },
    [onSeed],
  );
  useEffect(() => {
    if (draft === null) return undefined;
    const timer = window.setTimeout(() => commit(draft), COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, commit]);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit(event.currentTarget.value);
  };
  return (
    <span className="field">
      <label htmlFor={id}>Seed</label>
      <input
        id={id}
        className="seed-input"
        type="number"
        inputMode="numeric"
        min={SEED_MIN}
        max={SEED_MAX}
        step={1}
        value={draft ?? String(seed)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          if (draft !== null) commit(event.currentTarget.value);
        }}
        onKeyDown={onKeyDown}
      />
    </span>
  );
}

const seconds = (ms: number): string => (ms / 1000).toFixed(1);

/**
 * Time scrub: sets `t`. The clip restarts at that time (the scene is re-authored, because idle life and the
 * tile swaps can only run forward), so the slider commits after a short pause or on release, not on every tick.
 */
function ScrubField({ startMs, maxMs, onStartMs }: { startMs: number; maxMs: number; onStartMs: (ms: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<number | null>(null);
  const commit = useCallback(
    (ms: number) => {
      setDraft(null);
      if (ms !== startMs) onStartMs(ms);
    },
    [onStartMs, startMs],
  );
  useEffect(() => {
    if (draft === null) return undefined;
    const timer = window.setTimeout(() => commit(draft), SCRUB_COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, commit]);
  const shown = draft ?? startMs;
  return (
    <span className="field">
      <label htmlFor={id}>Start time</label>
      <input
        id={id}
        className="range-input"
        type="range"
        min={0}
        max={maxMs}
        step={100}
        value={shown}
        aria-valuetext={`${seconds(shown)} seconds`}
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onBlur={(event) => {
          if (draft !== null) commit(Number(event.currentTarget.value));
        }}
      />
      <output htmlFor={id} className="range-value">
        {seconds(shown)} s
      </output>
    </span>
  );
}

const buildLabel = (ms: number): string => (ms === 0 ? 'Complete (no build)' : `${Number.isInteger(ms / 1000) ? ms / 1000 : seconds(ms)} s`);

export function FixtureControls(props: FixtureControlsProps) {
  const lookId = useId();
  const buildId = useId();
  const backendId = useId();
  const facingId = useId();
  const densityId = useId();
  const seed33 = props.look === 'seed33';
  return (
    <section className="bar" aria-labelledby="fixture-heading">
      <div className="bar-row">
        <h2 id="fixture-heading" className="bar-heading">
          Fixture controls — Week 4 Paris frame, not the live demo
        </h2>
        <div className="controls">
          {/* Tab order follows this reading order. Esc and S shortcuts are wired in step 5, not here. */}
          <span className="field">
            <label htmlFor={lookId}>Look</label>
            <select id={lookId} value={props.look} onChange={(event) => props.onLook(event.currentTarget.value as Look)}>
              <option value="seed33">Seed 33 (selected)</option>
              <option value="arrival">Arrival (earlier frame)</option>
            </select>
          </span>
          <span className="field">
            <label htmlFor={buildId}>Build length{seed33 ? '' : ' (seed-33 look only)'}</label>
            <select id={buildId} value={String(props.buildMs)} disabled={!seed33} onChange={(event) => props.onBuildMs(Number(event.currentTarget.value))}>
              {buildChoices(props.buildMs).map((ms) => (
                <option key={ms} value={String(ms)}>
                  {buildLabel(ms)}
                </option>
              ))}
            </select>
          </span>
          <ScrubField startMs={props.startMs} maxMs={props.scrubMaxMs} onStartMs={props.onStartMs} />
          <span className="field">
            <label htmlFor={backendId}>Backend</label>
            <select id={backendId} value={props.backend} onChange={(event) => props.onBackend(event.currentTarget.value as BackendPreference)}>
              <option value="auto">Auto</option>
              <option value="webgl2">WebGL2</option>
              <option value="canvas2d">Canvas2D</option>
            </select>
          </span>
          <button type="button" className="toggle-pause" onClick={() => props.onPaused(!props.paused)}>
            {props.paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            className="toggle-tiles"
            aria-pressed={props.tilesAvailable && props.showTiles}
            disabled={!props.tilesAvailable}
            onClick={() => props.onShowTiles(!props.showTiles)}
          >
            {props.tilesAvailable ? `Tiles: ${props.showTiles ? 'on' : 'off'}` : 'Tiles: none in this look'}
          </button>
          <button type="button" className="toggle-reduced" aria-pressed={props.reduced} onClick={() => props.onReduced(!props.reduced)}>
            Reduced motion: {props.reduced ? 'on' : 'off'}
          </button>
          <span className="field">
            <label htmlFor={facingId}>Near walker facing{seed33 ? ' (arrival look only)' : ''}</label>
            <select id={facingId} value={props.facing} disabled={seed33} onChange={(event) => props.onFacing(event.currentTarget.value as WalkerFacing)}>
              <option value="away">Away</option>
              <option value="toward">Toward</option>
            </select>
          </span>
          <span className="field">
            <label htmlFor={densityId}>Density</label>
            <select id={densityId} value={String(props.density)} onChange={(event) => props.onDensity(Number(event.currentTarget.value) as Density)}>
              {DENSITIES.map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          </span>
          <SeedField seed={props.seed} onSeed={props.onSeed} />
          <button type="button" onClick={props.onReseed}>
            Reseed
          </button>
        </div>
      </div>
      <p className="status">{props.status}</p>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {props.liveState}
      </p>
    </section>
  );
}
