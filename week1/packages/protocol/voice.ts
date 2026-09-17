// Deliberately narrow demo intent, not a general language/action interpreter.
export function windIntent(input: string): boolean {
  if (typeof input !== "string" || input.length > 240) return false;
  const text = input.toLowerCase().replace(/[’']/g, "").replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();
  return /^(?:hey eva |eva )?(?:please )?(?:what about (?:the )?wind speed|(?:show|add) (?:me )?(?:the )?wind speed|(?:whats|what is) (?:the )?wind speed)(?: please)?$/.test(text);
}

export function weatherIntent(input: string): boolean {
  if (typeof input !== "string" || input.length > 240) return false;
  const text = input.toLowerCase().replace(/[’']/g, "").replace(/[.,!?]/g, "").trim();
  return /^(?:hey eva |eva )?(?:please )?(?:(?:show|give) me (?:the )?|(?:whats|what is) (?:the )?|(?:open|load|create|build) (?:a |the )?)?(?:weather|weather dashboard|weather forecast|forecast|temperature)(?: (?:in|for) ithaca(?: new york)?)?(?: (?:for )?(?:this week|today))?(?: please)?$/.test(text);
}

export const AUDIO_RATE = 16000;
export const AUDIO_SECONDS = 15;
export const MAX_WAV_BYTES = 44 + AUDIO_RATE * AUDIO_SECONDS * 2;
export function pcmWave(samples: Float32Array): Uint8Array {
  if (samples.length < 1600 || samples.length > AUDIO_RATE * AUDIO_SECONDS) throw new Error("invalid_audio");
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const str = (offset: number, value: string) => [...value].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)));
  str(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); str(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, AUDIO_RATE, true); view.setUint32(28, AUDIO_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
  return bytes;
}
export function validWave(bytes: Uint8Array): boolean {
  if (bytes.length < 3244 || bytes.length > MAX_WAV_BYTES || bytes.length % 2) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, size: number) => String.fromCharCode(...bytes.slice(offset, offset + size));
  return tag(0, 4) === "RIFF" && tag(8, 8) === "WAVEfmt " && tag(36, 4) === "data" &&
    v.getUint32(4, true) === bytes.length - 8 && v.getUint32(16, true) === 16 &&
    v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1 && v.getUint32(24, true) === AUDIO_RATE &&
    v.getUint32(28, true) === 32000 && v.getUint16(32, true) === 2 && v.getUint16(34, true) === 16 && v.getUint32(40, true) === bytes.length - 44;
}
