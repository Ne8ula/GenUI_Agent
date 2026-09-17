/** Preserve the phrase, soften the waveform edge, then leave room after it. */
export function speechEnding(samples: Float32Array, sampleRate: number): Float32Array<ArrayBuffer> {
  const output = new Float32Array(samples.length + sampleRate);
  output.set(samples);
  const quietTail = Math.min(samples.length, Math.round(sampleRate * 0.08));
  let peak = 0;
  for (let i = samples.length - quietTail; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  // A full fade only touches an already quiet tail. Active speech gets a tiny
  // de-click ramp, so the final syllable isn't swallowed by a long fade-out.
  const fade = peak < 0.015 ? quietTail : Math.min(samples.length, Math.round(sampleRate * 0.005));
  for (let i = 0; i < fade; i++) output[samples.length - fade + i] *= (1 + Math.cos(Math.PI * (i + 1) / fade)) / 2;
  return output;
}
