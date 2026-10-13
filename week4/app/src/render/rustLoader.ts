// Loading and bounded host transport only. All scene/material/GPU work is in Rust.
import init, { RustRenderer } from '../generated/seed33/eva_seed33_renderer.js';
import type { InitOutput } from '../generated/seed33/eva_seed33_renderer.js';
let pending: Promise<InitOutput> | null = null;
export async function loadRust(): Promise<{ Renderer: typeof RustRenderer; memory: WebAssembly.Memory }> {
  pending ??= init().catch((error: unknown) => { pending = null; throw error; });
  const module = await pending;
  return { Renderer: RustRenderer, memory: module.memory };
}
export type RustInstance = RustRenderer;
