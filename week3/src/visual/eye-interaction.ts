// Adapted from Week 1 SignalEye's authored 40ms gaze / 145ms tissue response.
export interface LocalEyeMotion {
  targetX: number; targetY: number; pointerActive: boolean;
  gazeX: number; gazeY: number; tissueX: number; tissueY: number;
  closure: number; nextBlink: number; blinkStart: number; blinkIndex: number;
}
export function createEyeMotion(): LocalEyeMotion {
  return { targetX: 0, targetY: 0, pointerActive: false, gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0, nextBlink: 2.7, blinkStart: -100, blinkIndex: 0 };
}
const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export function pointEye(motion: LocalEyeMotion, x: number, y: number) {
  motion.targetX = Math.max(-.145, Math.min(.145, x));
  motion.targetY = Math.max(-.075, Math.min(.075, y));
  motion.pointerActive = true;
}
export function restEye(motion: LocalEyeMotion) {
  motion.targetX = motion.targetY = 0; motion.pointerActive = false;
}
export function stepEyeMotion(motion: LocalEyeMotion, dt: number, time: number, quiet: boolean) {
  if (quiet) return { gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0, quiet: true };
  const follow = 1 - Math.exp(-Math.min(.1, dt) / .04);
  const weight = 1 - Math.exp(-Math.min(.1, dt) / .145);
  const x = motion.targetX + (motion.pointerActive ? 0 : Math.sin(time * .51) * Math.sin(time * .29) * .05);
  const y = motion.targetY + (motion.pointerActive ? 0 : Math.sin(time * .37) * .022);
  motion.gazeX += (x - motion.gazeX) * follow;
  motion.gazeY += (y - motion.gazeY) * follow;
  motion.tissueX += (motion.gazeX - motion.tissueX) * weight;
  motion.tissueY += (motion.gazeY - motion.tissueY) * weight;
  if (dt > 0) {
    if (time >= motion.nextBlink) {
      motion.blinkStart = time;
      motion.nextBlink = time + 4.4 + Math.sin(++motion.blinkIndex * 2.17) * 1.2;
    }
    const age = time - motion.blinkStart;
    motion.closure = age < .09 ? ease(age / .09) : age < .125 ? 1 : 1 - ease((age - .125) / .175);
  }
  return { gazeX: motion.gazeX, gazeY: motion.gazeY, tissueX: motion.tissueX, tissueY: motion.tissueY, closure: motion.closure, quiet: false };
}
