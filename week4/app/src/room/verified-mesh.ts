export async function verifiedMesh(url: string, record: { bytes: number; sha256: string }, signal: AbortSignal, progress: (value: number) => void): Promise<ArrayBuffer> {
  if (!Number.isSafeInteger(record.bytes) || record.bytes <= 0 || record.bytes > 64 * 1024 * 1024) throw new Error('Room exceeds the download limit.');
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error('The room file could not be loaded.');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(record.bytes);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > bytes.length) throw new Error('Room file exceeded its expected size.');
      bytes.set(value, length); length += value.length;
      progress(length / bytes.length);
    }
  } finally { await reader.cancel(); }
  if (length !== bytes.length) throw new Error('The room download was incomplete.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== record.sha256) throw new Error('The room file failed its integrity check.');
  signal.throwIfAborted();
  return bytes.buffer;
}
