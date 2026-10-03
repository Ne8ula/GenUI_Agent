// EVA-owned JSON Schema Draft 2020-12 validation with byte limits applied before parsing.
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';

export const SCHEMA_NAMES = [
  'scene',
  'stage-request',
  'transcript-event',
  'narration-manifest',
  'asset-inventory',
  'weave-jobs',
] as const;
export type SchemaName = (typeof SCHEMA_NAMES)[number];

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

function validatorFor(name: SchemaName): ValidateFunction {
  let fn = compiled.get(name);
  if (!fn) {
    const url = new URL(`../schemas/${name}.schema.json`, import.meta.url);
    fn = ajv.compile(JSON.parse(readFileSync(url, 'utf8')) as object);
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
  const bytes = Buffer.byteLength(text, 'utf8');
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
