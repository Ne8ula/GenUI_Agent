// Provenance: bounded E1 rewrite of week1/apps/desktop/src/SignalEye.tsx
// (repository HEAD 23e0450e..., week1/ archive left unchanged). Reuse inside
// E1 is owner-authorized; no new license assertion is made. See eye.shader.ts
// for shader-level provenance and transparent framing changes.
//
// What changed versus the source component, and why:
// - The source read `state`/`quiet`/`energy` props, tracked the pointer with
//   window-level `pointermove`/`pointerout`/`blur` listeners, and ran a
//   perpetual 45 Hz requestAnimationFrame loop plus an 80 ms setInterval poll
//   for as long as it was mounted (idle drift, continuous blink schedule,
//   continuous breathing). This task explicitly requires bounded local
//   host-driven behavior instead of global cursor tracking or a perpetual
//   loop, so none of that is reused here.
// - This component instead takes an explicit `target` (a normalized -1..1
//   gaze offset the host derives from the selected fact vs. the eye center),
//   an `active` flag permitting bounded cues (it may remain true while the
//   eye is settled), a `reducedMotion` flag, and an optional
//   `visible` flag. There is no pointer listener, no audio/energy input, no
//   window/document-level listener, and no background wake timer.
// - Animation only ever runs inside a bounded window (<= ANIM_WINDOW_MS,
//   comfortably under the 1200 ms cap) started by an explicit trigger
//   (`active` transitioning false -> true, or `target` changing while
//   `active` is true). The window self-terminates even if `active` stays
//   true continuously; a later target change (or another false -> true edge)
//   is required to start a fresh window. `active` turning false cancels the
//   running requestAnimationFrame immediately and does not resume, restart,
//   or play a closing animation — the canvas simply keeps showing its last
//   drawn (already-composited) frame, i.e. the current pose is retained.
// - When settled (no bounded window running) the shader's own `reduced`
//   uniform is set to 1, which — per the shader's existing branches — zeroes
//   its internal breathing/roll wiggle. This reuses the source shader's own
//   "quiet" switch to satisfy "no perpetual idle drift/breathing when
//   settled" without touching the shader's core geometry. Gaze/tissue values
//   are never zeroed for this settled state (unlike the source's "still"
//   path), so the eye keeps looking at the last resolved target instead of
//   snapping back to center.
// - `reducedMotion` draws exactly one static frame per relevant prop/size
//   change and never schedules requestAnimationFrame or setInterval.
// - `visible === false` renders nothing (the wrapper, canvas and any GL
//   resources are torn down by effect cleanup) with no delay.
// - The WebGL context now requests `alpha: true` (the source used
//   `alpha: false`) and the fragment shader outputs a procedural silhouette
//   alpha mask (see eye.shader.ts) so pixels outside the eye/brow/lash
//   shape are exactly transparent instead of filling the canvas with an
//   opaque skin-toned rectangle. The wrapper CSS has no background and
//   `pointer-events: none` — the actual click-through region belongs to the
//   host's existing material window, not this module.
// - `state`/`energy`/`age` uniforms the shader still declares are fed fixed
//   constants (open baseline, no audio-driven pupil dilation, unused age)
//   since this bounded component has no discrete open/closing state machine
//   and no audio input.

import { useEffect, useRef, useState } from "react";
import { EYE_VERTEX_SHADER, EYE_FRAGMENT_SHADER } from "./eye.shader";
import "./eye.css";

export interface E1EyeTarget {
  x: number;
  y: number;
}

export interface E1SignalEyeProps {
  /** Normalized gaze offset (-1..1 on both axes) from the eye's center to the
   * currently emphasized fact, or null when nothing is currently emphasized.
   * The host derives this from its own layout; this component never reads
   * the pointer or any global input. */
  target: E1EyeTarget | null;
  /** Permits a bounded cue; true alone does not cause perpetual animation.
   * A false -> true edge (or a target change while already true) starts one
   * bounded animation window. Turning false cancels any running animation
   * immediately and retains the current pose. */
  active: boolean;
  /** When true, render exactly one static frame per relevant change; never
   * schedule requestAnimationFrame or a timer. */
  reducedMotion: boolean;
  /** When false, render nothing and release GL resources immediately.
   * Defaults to true. */
  visible?: boolean;
}

interface Pose {
  gazeX: number;
  gazeY: number;
  tissueX: number;
  tissueY: number;
}

interface GLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  vs: WebGLShader;
  fs: WebGLShader;
  loc: Record<string, WebGLUniformLocation | null>;
}

// Same screen-space scale the source pointer-driven eye used for its gaze
// uniform, preserved so the eye keeps its original range of motion.
const GAZE_X_SCALE = 0.145;
const GAZE_Y_SCALE = 0.075;

// The full bounded window for one triggered animation. Always well under the
// <= 1200 ms cap so a stuck `active === true` prop cannot keep it animating.
const ANIM_WINDOW_MS = 900;
const GAZE_EASE_MS = 420;
const TISSUE_EASE_MS = 760;
// Same close/hold/reopen envelope as the source component's blink.
const BLINK_DELAY_MS = 160;
const BLINK_CLOSE_MS = 90;
const BLINK_HOLD_MS = 125;
const BLINK_REOPEN_MS = 300;

const UNIFORM_NAMES = ["resolution", "time", "age", "state", "energy", "reduced", "gaze", "tissue", "closure"] as const;

function ease(v: number): number {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mapGaze(target: E1EyeTarget | null): { x: number; y: number } {
  if (!target) return { x: 0, y: 0 };
  const cx = Math.max(-1, Math.min(1, target.x));
  const cy = Math.max(-1, Math.min(1, target.y));
  return { x: cx * GAZE_X_SCALE, y: -cy * GAZE_Y_SCALE };
}

function blinkClosure(age: number): number {
  if (!Number.isFinite(age) || age < 0) return 0;
  if (age < BLINK_CLOSE_MS) return ease(age / BLINK_CLOSE_MS);
  if (age < BLINK_HOLD_MS) return 1;
  if (age < BLINK_REOPEN_MS) return 1 - ease((age - BLINK_HOLD_MS) / (BLINK_REOPEN_MS - BLINK_HOLD_MS));
  return 0;
}

function sameTarget(a: E1EyeTarget | null, b: E1EyeTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

function paint(state: GLState, canvas: HTMLCanvasElement, pose: Pose, opts: { reduced: boolean; closure: number; time: number }) {
  const { gl, loc } = state;
  gl.uniform2f(loc.resolution, canvas.width, canvas.height);
  gl.uniform1f(loc.time, opts.time);
  gl.uniform1f(loc.age, 1);
  gl.uniform1f(loc.state, 1); // constant open baseline; no discrete state machine here
  gl.uniform1f(loc.energy, 0); // no audio input in this bounded component
  gl.uniform1f(loc.reduced, opts.reduced ? 1 : 0);
  gl.uniform2f(loc.gaze, pose.gazeX, pose.gazeY);
  gl.uniform2f(loc.tissue, pose.tissueX, pose.tissueY);
  gl.uniform1f(loc.closure, opts.closure);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if (import.meta.env.DEV) canvas.dataset.eyeDrawCount = String(Number(canvas.dataset.eyeDrawCount ?? 0) + 1);
}

export function E1SignalEye({ target, active, reducedMotion, visible = true }: E1SignalEyeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glStateRef = useRef<GLState | null>(null);
  const lostRef = useRef(false);
  const rafRef = useRef(0);
  const sessionRef = useRef(0);
  const animatingRef = useRef(false);
  const poseRef = useRef<Pose>({ gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0 });
  const prevActiveRef = useRef(false);
  const prevTargetRef = useRef<E1EyeTarget | null>(null);
  const [fallback, setFallback] = useState(false);

  const targetX = target ? target.x : null;
  const targetY = target ? target.y : null;

  // Create/tear down the GL context strictly with actual visibility (and the
  // unsupported/lost fallback). No global listeners are registered here.
  useEffect(() => {
    if (!visible || fallback) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, powerPreference: "low-power" });
    if (!gl) {
      setFallback(true);
      return;
    }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        throw new Error("E1 eye shader unavailable");
      }
      return shader;
    };
    let vs: WebGLShader, fs: WebGLShader, program: WebGLProgram;
    try {
      vs = compile(gl.VERTEX_SHADER, EYE_VERTEX_SHADER);
      fs = compile(gl.FRAGMENT_SHADER, EYE_FRAGMENT_SHADER);
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("E1 eye program unavailable");
    } catch {
      setFallback(true);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const loc: Record<string, WebGLUniformLocation | null> = {};
    for (const name of UNIFORM_NAMES) loc[name] = gl.getUniformLocation(program, name);

    lostRef.current = false;
    glStateRef.current = { gl, program, buffer, vs, fs, loc };

    const redraw = () => {
      const state = glStateRef.current;
      if (!state || lostRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        state.gl.viewport(0, 0, width, height);
      }
      // A resize mid-animation is picked up by the running loop's next
      // frame; only force a redraw here when settled, so we don't fight the
      // active animation's own scheduling.
      if (!animatingRef.current) paint(state, canvas, poseRef.current, { reduced: true, closure: 0, time: 1.5 });
    };
    const resizeObserver = new ResizeObserver(redraw);
    resizeObserver.observe(canvas);
    redraw();

    const onContextLost = (event: Event) => {
      event.preventDefault();
      lostRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      animatingRef.current = false;
      setFallback(true);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      animatingRef.current = false;
      const state = glStateRef.current;
      if (state) {
        state.gl.deleteBuffer(state.buffer);
        state.gl.deleteProgram(state.program);
        state.gl.deleteShader(state.vs);
        state.gl.deleteShader(state.fs);
      }
      glStateRef.current = null;
    };
  }, [visible, fallback]);

  // React to explicit prop changes. This is the only place animation is
  // scheduled; there is no perpetual RAF loop and no background poll timer.
  useEffect(() => {
    if (!visible || fallback) {
      prevActiveRef.current = active;
      prevTargetRef.current = target;
      return;
    }

    const drawNow = (reduced: boolean, closure: number, time = 1.5) => {
      const state = glStateRef.current;
      const canvas = canvasRef.current;
      if (!state || !canvas || lostRef.current) return;
      paint(state, canvas, poseRef.current, { reduced, closure, time });
    };

    if (reducedMotion) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      animatingRef.current = false;
      const g = mapGaze(target);
      poseRef.current = { gazeX: g.x, gazeY: g.y, tissueX: g.x, tissueY: g.y };
      drawNow(true, 0);
      prevActiveRef.current = active;
      prevTargetRef.current = target;
      return;
    }

    if (!active) {
      // Stop scheduling immediately and retain whatever pose is already
      // drawn; do not restart, resume, or play a closing animation.
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      animatingRef.current = false;
      prevActiveRef.current = active;
      prevTargetRef.current = target;
      return;
    }

    const activated = active && !prevActiveRef.current;
    const changed = !sameTarget(target, prevTargetRef.current);

    if (activated || changed) {
      sessionRef.current += 1;
      const session = sessionRef.current;
      const from = { x: poseRef.current.gazeX, y: poseRef.current.gazeY };
      const to = mapGaze(target);
      const animStart = performance.now();
      const shouldBlink = activated || changed;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      animatingRef.current = true;

      const step = (now: number) => {
        if (sessionRef.current !== session) return; // superseded by a newer trigger
        const elapsed = now - animStart;
        if (elapsed >= ANIM_WINDOW_MS) {
          poseRef.current = { gazeX: to.x, gazeY: to.y, tissueX: to.x, tissueY: to.y };
          drawNow(true, 0);
          animatingRef.current = false;
          rafRef.current = 0;
          return;
        }
        const gp = ease(Math.min(1, elapsed / GAZE_EASE_MS));
        const tp = ease(Math.min(1, elapsed / TISSUE_EASE_MS));
        poseRef.current = {
          gazeX: lerp(from.x, to.x, gp),
          gazeY: lerp(from.y, to.y, gp),
          tissueX: lerp(from.x, to.x, tp),
          tissueY: lerp(from.y, to.y, tp),
        };
        const closure = shouldBlink ? blinkClosure(elapsed - BLINK_DELAY_MS) : 0;
        drawNow(false, closure, elapsed / 1000 + 1.5);
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    }

    prevActiveRef.current = active;
    prevTargetRef.current = target;
    // target is compared by value (targetX/targetY), not by object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fallback, reducedMotion, active, targetX, targetY]);

  if (!visible) return null;

  return (
    <div className="e1-signal-eye" data-origin="week1-signal-eye" data-renderer={fallback ? "svg" : "webgl"} aria-hidden="true">
      {fallback ? (
        <svg viewBox="0 0 500 240" aria-hidden="true">
          <defs>
            <radialGradient id="e1-eye-iris">
              <stop stopColor="#ff7770" />
              <stop offset=".75" stopColor="#74211f" />
              <stop offset="1" stopColor="#1a0d0d" />
            </radialGradient>
            <clipPath id="e1-eye-aperture">
              <path d="M40 136C146 4 333 35 466 118C350 229 152 224 40 136" />
            </clipPath>
          </defs>
          <path d="M36 112C146 -8 350 15 473 97" fill="none" stroke="#782b26" strokeWidth="8" />
          <path d="M40 136C146 4 333 35 466 118C350 229 152 224 40 136" fill="#ff6259" />
          <g clipPath="url(#e1-eye-aperture)">
            <circle cx="238" cy="112" r="75" fill="url(#e1-eye-iris)" />
            <rect x="208" y="82" width="60" height="60" rx="2" fill="#090b0a" />
            <ellipse cx="216" cy="86" rx="9" ry="5" fill="#ffceca" />
          </g>
          <path d="M40 136C146 4 333 35 466 118" stroke="#080909" strokeWidth="12" fill="none" />
        </svg>
      ) : (
        <canvas ref={canvasRef} aria-hidden="true" />
      )}
    </div>
  );
}
