export interface HybridLayer {
  id: string;
  label: string;
  image: string;
  relativeDepth: number;
}
export interface HybridScene {
  version: 1;
  id: string;
  title: string;
  width: number;
  height: number;
  reference: string;
  layers: HybridLayer[];
}
const assetPattern = /^(?:layers\/)?[a-z0-9_-]+\.png$/;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown scene manifest field');
}
function boundedString(value: unknown, max: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max; }
export function parseHybridScene(value: unknown): HybridScene {
  if (!record(value)) throw new Error('Invalid scene manifest');
  keys(value, ['version', 'id', 'title', 'width', 'height', 'reference', 'layers']);
  if (value.version !== 1 || !boundedString(value.id, 80) || !boundedString(value.title, 100)) throw new Error('Unsupported scene identity/version');
  const { width, height } = value;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 8_388_608) throw new Error('Scene dimensions exceed limits');
  if (typeof value.reference !== 'string' || !assetPattern.test(value.reference)) throw new Error('Reference must be a local PNG filename');
  if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 32) throw new Error('Scene layer count exceeds limits');
  // Full-frame decoded RGBA textures plus the optional source comparison are bounded together.
  if (width * height * 4 * (value.layers.length + 1) > 128 * 1024 * 1024) throw new Error('Scene texture budget exceeds 128 MiB');
  const ids = new Set<string>();
  const layers = value.layers.map((item): HybridLayer => {
    if (!record(item)) throw new Error('Invalid scene layer');
    keys(item, ['id', 'label', 'image', 'relativeDepth']);
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(item.id) || ids.has(item.id)) throw new Error('Invalid or duplicate layer ID');
    if (!boundedString(item.label, 100) || typeof item.image !== 'string' || !assetPattern.test(item.image)) throw new Error('Invalid layer asset/label');
    if (typeof item.relativeDepth !== 'number' || !Number.isFinite(item.relativeDepth) || Math.abs(item.relativeDepth) > 100) throw new Error('Invalid illustrative depth rank');
    ids.add(item.id);
    return { id: item.id, label: item.label, image: item.image, relativeDepth: item.relativeDepth };
  });
  return { version: 1, id: value.id, title: value.title, width, height, reference: value.reference, layers };
}
