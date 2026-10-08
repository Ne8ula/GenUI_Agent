// EVA-owned JSON Schema Draft 2020-12 validation with byte limits applied before parsing.
// Schemas are imported statically so this module runs unchanged under Node (tests) and in
// the browser renderer host; nothing here touches the file system at runtime.
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import sceneSchema from '../schemas/scene.schema.json' with { type: 'json' };
import stageRequestSchema from '../schemas/stage-request.schema.json' with { type: 'json' };
import transcriptEventSchema from '../schemas/transcript-event.schema.json' with { type: 'json' };
import narrationManifestSchema from '../schemas/narration-manifest.schema.json' with { type: 'json' };
import assetInventorySchema from '../schemas/asset-inventory.schema.json' with { type: 'json' };
import weaveJobsSchema from '../schemas/weave-jobs.schema.json' with { type: 'json' };

export const SCHEMA_NAMES = [
  'scene',
  'stage-request',
  'transcript-event',
  'narration-manifest',
  'asset-inventory',
  'weave-jobs',
] as const;
export type SchemaName = (typeof SCHEMA_NAMES)[number];

const SCHEMAS: Readonly<Record<SchemaName, object>> = {
  scene: sceneSchema,
  'stage-request': stageRequestSchema,
  'transcript-event': transcriptEventSchema,
  'narration-manifest': narrationManifestSchema,
  'asset-inventory': assetInventorySchema,
  'weave-jobs': weaveJobsSchema,
};

// Upper bounds on serialized input, checked before JSON.parse.
export const BYTE_LIMITS: Readonly<Record<SchemaName, number>> = {
  scene: 64 * 1024,
  'stage-request': 512,
  'transcript-event': 2 * 1024,
  'narration-manifest': 64 * 1024,
  'asset-inventory': 128 * 1024,
  'weave-jobs': 64 * 1024,
};

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false });
const compiled = new Map<SchemaName, ValidateFunction>();
const utf8 = new TextEncoder();

function validatorFor(name: SchemaName): ValidateFunction {
  let fn = compiled.get(name);
  if (!fn) {
    fn = ajv.compile(SCHEMAS[name]);
    compiled.set(name, fn);
  }
  return fn;
}

export function validateValue<T>(name: SchemaName, value: unknown): Validation<T> {
  const fn = validatorFor(name);
  if (fn(value)) return { ok: true, value: value as T };
  const errors = (fn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
  return { ok: false, errors: errors.length > 0 ? errors : ['invalid'] };
}

export function parseJson<T>(name: SchemaName, text: string): Validation<T> {
  const bytes = utf8.encode(text).length;
  if (bytes > BYTE_LIMITS[name]) {
    return { ok: false, errors: [`input is ${bytes} bytes; limit is ${BYTE_LIMITS[name]}`] };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['malformed JSON'] };
  }
  return validateValue<T>(name, value);
}

// Defence in depth for free-text fields: refuse anything that looks like it carries authority.
const AUTHORITY_LIKE = [
  /[a-z][a-z0-9+.-]*:\/\//i, // URL with scheme
  /^[a-z]:[\\/]/i, // drive path
  /(^|[\s"'])\/(?:home|users|etc|var|tmp|windows)\//i, // absolute POSIX/Windows-ish path
  /\\\\/, // UNC or escaped path
  /<\s*\/?\s*[a-z]/i, // markup
  /\bjavascript:/i,
  /\b0x[0-9a-f]{4,}\b/i, // handle-like hex
];

export function looksAuthorityBearing(text: string): boolean {
  return AUTHORITY_LIKE.some((re) => re.test(text));
}
