// The glow, after RICH&MIYU's point-cloud plants. The grains stay crisp; only where they are bright and
// dense does a halo gather. A bloom over the finished frame, thresholded on a neighbourhood's mean so lone grains never bloom.
import {
  LinearSRGBColorSpace, UnsignedByteType, Vector2, WebGLRenderTarget, type Camera, type IUniform, type Scene, type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const THRESHOLD = 0.68;   // of the neighbourhood's mean, brightest channel: lit fittings, the lamp, the eye, the tunnel's arms
const SOFT = 0.25;        // the threshold's ramp
const STRENGTH = 0.5;
const RADIUS = 0.35;      // small: a halo hugs what is bright instead of hazing the room

// Not the stock high pass. It thresholds one pixel's luminance, so every lone white grain would bloom and pure red would count
// as dim (0.39). This takes the mean over 8x8 pixels first: a halo needs grains that are both bright and dense, as in the reference.
const DENSE_BRIGHT_FS = /* glsl */ `
uniform sampler2D tDiffuse; uniform float luminosityThreshold, smoothWidth;
varying vec2 vUv;
void main() {
  vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0));
  vec3 sum = vec3(0.0);
  // taps on texel corners, two texels apart: each bilinear tap is the mean of 2x2 pixels, sixteen of them cover 8x8
  for (int j = -2; j < 2; j++) for (int i = -2; i < 2; i++) sum += texture2D(tDiffuse, vUv + (vec2(i, j) + 0.5) * 2.0 * px).rgb;
  vec3 mean = sum / 16.0;
  float v = max(mean.r, max(mean.g, mean.b));
  gl_FragColor = vec4(mean * smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v), 1.0);
}`;

/** The scene into the composer's buffer: plainly, or by a layered drawing (the splat swap) when one is set. */
class ScenePass extends Pass {
  draw: ((target: WebGLRenderTarget) => void) | null = null;
  constructor(private readonly scene: Scene, private readonly camera: Camera) { super(); this.needsSwap = false; }
  override render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget): void {
    if (this.draw) { this.draw(read); return; }
    renderer.setRenderTarget(read);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }
}

export interface Glow {
  render(): void;
  /** Draw the scene this way instead of plainly; null restores the plain drawing. */
  setSceneDraw(draw: ((target: WebGLRenderTarget) => void) | null): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export function createGlow(renderer: WebGLRenderer, scene: Scene, camera: Camera): Glow {
  // The point shaders write display-ready colour straight out; through the composer the final pass must copy it, not encode it again.
  renderer.outputColorSpace = LinearSRGBColorSpace;
  // 8-bit, like the screen: the field's blend (one, one minus source colour) relies on colours being clamped to 1 before blending.
  const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: UnsignedByteType }));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), STRENGTH, RADIUS, THRESHOLD);
  bloom.materialHighPassFilter.fragmentShader = DENSE_BRIGHT_FS;
  bloom.materialHighPassFilter.needsUpdate = true;
  (bloom.highPassUniforms as Record<string, IUniform>).smoothWidth!.value = SOFT;
  const output = new OutputPass();
  const scenePass = new ScenePass(scene, camera);
  composer.addPass(scenePass);
  composer.addPass(bloom);
  composer.addPass(output);
  return {
    render() { composer.render(); },
    setSceneDraw(draw) { scenePass.draw = draw; },
    setSize(width, height, pixelRatio) { composer.setPixelRatio(pixelRatio); composer.setSize(width, height); },
    dispose() { bloom.dispose(); output.dispose(); composer.dispose(); },
  };
}
