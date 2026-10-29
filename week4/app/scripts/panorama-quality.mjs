export function assertInteriorDetail(pixels) {
  if (!pixels.length || pixels.length % 4 || pixels.some(value => !Number.isFinite(value) || value < 0 || value > 255)) throw new Error('Invalid decoded interior pixels.');
  let sum = 0, squares = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const luma = (299 * pixels[i] + 587 * pixels[i + 1] + 114 * pixels[i + 2]) / 1000;
    sum += luma; squares += luma * luma;
  }
  const count = pixels.length / 4, lumaStddev = Math.sqrt(Math.max(0, squares / count - (sum / count) ** 2));
  // shortcut: flat-frame sentinel, not scene understanding; retain manual interior review even when it passes.
  if (lumaStddev < 4) throw new Error(`Interior is nearly uniform (luma stddev ${lumaStddev.toFixed(3)}); visual review required.`);
  return { lumaStddev, visualAcceptance: 'pending' };
}
