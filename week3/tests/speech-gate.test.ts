import { describe, expect, it, vi } from 'vitest';
import { encodeWav, SpeechGate } from '../src/voice/speech-gate';
const frame = (level: number) => new Float32Array(320).fill(level);

describe('bounded local speech detection', () => {
  it('ignores silence and preserves pre-roll before confirmed onset', () => {
    const onset = vi.fn(); const complete = vi.fn(); const gate = new SpeechGate(onset, complete);
    for (let i = 0; i < 50; i++) gate.push(frame(0));
    expect(onset).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) gate.push(frame(.08));
    expect(onset).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 35; i++) gate.push(frame(0));
    expect(complete).toHaveBeenCalledTimes(1);
    const samples = complete.mock.calls[0][0] as Float32Array;
    expect(samples[0]).toBe(0); expect(samples.length).toBeGreaterThan(16000);
  });
  it('drops incomplete capture on reset and caps a long turn at 30 seconds', () => {
    const complete = vi.fn(); const gate = new SpeechGate(vi.fn(), complete);
    for (let i = 0; i < 10; i++) gate.push(frame(.08));
    gate.reset(); for (let i = 0; i < 40; i++) gate.push(frame(0));
    expect(complete).not.toHaveBeenCalled();
    for (let i = 0; i < 1600; i++) gate.push(frame(.08));
    expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][0].length).toBeLessThanOrEqual(480_000);
  });
  it('encodes canonical bounded mono PCM WAV', () => {
    const wav = encodeWav(new Float32Array([-1, 0, 1])); const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(16000); expect(view.getUint16(22, true)).toBe(1);
    expect(view.getInt16(44, true)).toBe(-32767); expect(wav.length).toBe(50);
  });
});
