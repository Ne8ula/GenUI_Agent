import type { DrawOptions, FieldBackend } from "./types";
import { cellGeometry, cellStart } from "./cellGeometry";

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute float a_tone;
uniform vec2 u_resolution;
uniform float u_pointSize;
varying float v_tone;
void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clip = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_tone = a_tone;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying float v_tone;
uniform vec3 u_colorField;
uniform vec3 u_colorOcclusion;
uniform vec3 u_colorUnknown;
void main() {
  // v_tone is 0.0, 1.0, or 2.0 (PointTone), never interpolated across a
  // single point sprite, so a direct threshold pick (not a continuous mix)
  // keeps each of the three tones a distinct, non-blended color.
  vec3 color = u_colorField;
  if (v_tone > 1.5) {
    color = u_colorUnknown;
  } else if (v_tone > 0.5) {
    color = u_colorOcclusion;
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

function hexToRgb01(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Small, development-authored WebGL primitive: one program, gl.POINTS,
 * consuming the exact same seeded point buffer as the Canvas2D backend.
 * No shader is ever supplied by a model/score.
 */
export class WebGLBackend implements FieldBackend {
  readonly kind = "webgl" as const;
  failed = false;
  contextLost = false;

  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private toneBuffer: WebGLBuffer | null = null;
  private locations: {
    position: number;
    tone: number;
    resolution: WebGLUniformLocation | null;
    pointSize: WebGLUniformLocation | null;
    colorField: WebGLUniformLocation | null;
    colorOcclusion: WebGLUniformLocation | null;
    colorUnknown: WebGLUniformLocation | null;
  } | null = null;
  private width = 1;
  private height = 1;
  private readonly onLost: () => void;
  private readonly onRestored: () => void;
  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.failed = true;
    this.onLost();
  };
  private readonly handleContextRestored = () => {
    this.contextLost = false;
    this.setup();
    this.onRestored();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    simulateFailure: "unavailable" | "context-lost" | null,
    callbacks: { onLost: () => void; onRestored: () => void },
  ) {
    this.onLost = callbacks.onLost;
    this.onRestored = callbacks.onRestored;
    canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored, false);

    if (simulateFailure === "unavailable") {
      this.failed = true;
      return;
    }

    this.setup();

    if (this.gl && simulateFailure === "context-lost") {
      const ext = this.gl.getExtension("WEBGL_lose_context");
      if (ext) {
        // Defer so the caller receives a constructed (if soon-to-be-lost) backend first.
        queueMicrotask(() => ext.loseContext());
      }
    }
  }

  private setup(): void {
    const gl = this.canvas.getContext("webgl", { antialias: false, alpha: true });
    if (!gl) {
      this.failed = true;
      this.gl = null;
      return;
    }
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      this.failed = true;
      return;
    }
    const program = gl.createProgram();
    if (!program) {
      this.failed = true;
      return;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      this.failed = true;
      return;
    }

    this.gl = gl;
    this.program = program;
    this.positionBuffer = gl.createBuffer();
    this.toneBuffer = gl.createBuffer();
    this.locations = {
      position: gl.getAttribLocation(program, "a_position"),
      tone: gl.getAttribLocation(program, "a_tone"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      pointSize: gl.getUniformLocation(program, "u_pointSize"),
      colorField: gl.getUniformLocation(program, "u_colorField"),
      colorOcclusion: gl.getUniformLocation(program, "u_colorOcclusion"),
      colorUnknown: gl.getUniformLocation(program, "u_colorUnknown"),
    };
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.failed = false;
  }

  resize(widthPx: number, heightPx: number, dpr: number): void {
    this.width = Math.max(1, Math.round(widthPx * dpr));
    this.height = Math.max(1, Math.round(heightPx * dpr));
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
    this.gl?.viewport(0, 0, this.width, this.height);
  }

  draw(positions: Float32Array, tones: Uint8Array, count: number, options: DrawOptions): void {
    const { gl, program, locations, positionBuffer, toneBuffer } = this;
    if (!gl || !program || !locations || !positionBuffer || !toneBuffer || this.failed) return;

    const { cellSizePx, colors, dpr } = options;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (count === 0) return;

    gl.useProgram(program);

    // Same integer cell edges and tone ordering as the Canvas2D path.
    const { pitch, fill, inset } = cellGeometry(cellSizePx, dpr);
    const scaled = new Float32Array(count * 2);
    const sortedTones = new Uint8Array(count);
    let cursor = 0;
    for (const tone of [0, 1, 2]) {
      for (let i = 0; i < count; i++) {
        if (tones[i] !== tone) continue;
        scaled[cursor * 2] = cellStart(positions[i * 2], dpr, pitch, inset) + fill / 2;
        scaled[cursor * 2 + 1] = cellStart(positions[i * 2 + 1], dpr, pitch, inset) + fill / 2;
        sortedTones[cursor++] = tone;
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, scaled, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, toneBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sortedTones, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(locations.tone);
    gl.vertexAttribPointer(locations.tone, 1, gl.UNSIGNED_BYTE, false, 0, 0);

    gl.uniform2f(locations.resolution, this.width, this.height);
    gl.uniform1f(locations.pointSize, fill);
    const [fr, fg, fb] = hexToRgb01(colors.field);
    const [or, og, ob] = hexToRgb01(colors.occlusion);
    const [ur, ug, ub] = hexToRgb01(colors.unknown);
    gl.uniform3f(locations.colorField, fr, fg, fb);
    gl.uniform3f(locations.colorOcclusion, or, og, ob);
    gl.uniform3f(locations.colorUnknown, ur, ug, ub);

    gl.drawArrays(gl.POINTS, 0, count);
  }

  destroy(): void {
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost, false);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored, false);
    const gl = this.gl;
    if (gl) {
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
      if (this.toneBuffer) gl.deleteBuffer(this.toneBuffer);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.gl = null;
    this.program = null;
  }
}
