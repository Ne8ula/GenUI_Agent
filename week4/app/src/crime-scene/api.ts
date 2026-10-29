const API = '/api/room-workflow/';
export async function sceneRequest<T>(path: string, csrf: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(API + path, { signal, method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'x-eva-csrf': csrf },
    body: body === undefined ? null : JSON.stringify(body) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(typeof value.error === 'string' ? value.error : /^crime-scene\/(ask|investigation)$/.test(path) ? 'EVA is unavailable.' : 'Private notebook is unavailable.');
  return value as T;
}
