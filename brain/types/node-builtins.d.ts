/**
 * Minimal ambient declarations for the Node built-ins this workspace uses.
 *
 * `@types/node` is not a dependency yet (B0/B1 allow only `ajv` and
 * `typescript`; see brain/docs/decisions.md). `tsconfig.json` sets
 * `"types": []`, so these declarations are the only Node typings in scope.
 * Delete this file when the owner approves `@types/node`.
 */

interface ImportMeta {
  readonly url: string;
  readonly filename: string;
  readonly dirname: string;
}

declare const console: {
  log(...data: unknown[]): void;
  error(...data: unknown[]): void;
  warn(...data: unknown[]): void;
};

declare const process: {
  readonly argv: string[];
  readonly env: Record<string, string | undefined>;
  readonly platform: string;
  readonly execPath: string;
  exitCode: number | undefined;
  cwd(): string;
};

declare class URL {
  constructor(input: string, base?: string | URL);
  readonly href: string;
  readonly pathname: string;
  toString(): string;
}

declare function structuredClone<T>(value: T): T;

declare module "node:test" {
  export interface TestContext {
    readonly name: string;
  }
  export type TestFn = (t: TestContext) => void | Promise<void>;
  export function test(name: string, fn: TestFn): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: TestFn): void;
}

declare module "node:assert/strict" {
  type ThrowsExpected = RegExp | object | ((error: unknown) => boolean);
  interface Assert {
    (value: unknown, message?: string | Error): asserts value;
    ok(value: unknown, message?: string | Error): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    strictEqual<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
    notDeepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
    notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    throws(fn: () => unknown, expected?: ThrowsExpected, message?: string | Error): void;
    rejects(
      promise: Promise<unknown> | (() => Promise<unknown>),
      expected?: ThrowsExpected,
      message?: string | Error,
    ): Promise<void>;
    match(value: string, regExp: RegExp, message?: string | Error): void;
    doesNotMatch(value: string, regExp: RegExp, message?: string | Error): void;
    fail(message?: string | Error): never;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:fs" {
  export interface Stats {
    readonly size: number;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
  export function writeFileSync(path: string | URL, data: string, encoding?: "utf8"): void;
  export function readdirSync(path: string | URL): string[];
  export function mkdirSync(path: string | URL, options?: { recursive?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string | URL, options?: { recursive?: boolean; force?: boolean }): void;
  export function cpSync(source: string, destination: string, options?: { recursive?: boolean }): void;
  export function existsSync(path: string | URL): boolean;
  export function statSync(path: string | URL): Stats;
}

declare module "node:path" {
  export const sep: string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, suffix?: string): string;
  export function relative(from: string, to: string): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
  export function pathToFileURL(path: string): URL;
}

declare module "node:crypto" {
  export interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module "node:child_process" {
  export interface SpawnSyncResult {
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly error?: Error;
  }
  export function spawnSync(
    command: string,
    args: readonly string[],
    options?: { cwd?: string; encoding: "utf8"; env?: Record<string, string | undefined> },
  ): SpawnSyncResult;
}
