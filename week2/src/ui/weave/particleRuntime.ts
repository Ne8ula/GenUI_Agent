export const PARTICLE_LIMIT = 8192;
export const PARTICLE_STRIDE = 8;
export const MEMORY_LIMIT = 16 * 1024 * 1024;

export interface ParticleExports {
  memory: WebAssembly.Memory;
  init(seed: number): void;
  set_target(mode: number, generation: number, reduced: number): number;
  step(time: number, width: number, height: number, x: number, y: number, gazeX: number, gazeY: number, paused: number): void;
  positions_ptr(): number;
  particle_count(): number;
  transition_active(): number;
  stride(): number;
}

export function readParticles(engine: ParticleExports): Float32Array {
  const count=engine.particle_count(), ptr=engine.positions_ptr();
  const memory=engine.memory.buffer;
  if (!Number.isInteger(count)||count<0||count>PARTICLE_LIMIT||engine.stride()!==PARTICLE_STRIDE||
      !Number.isInteger(ptr)||ptr<0||ptr%4!==0||memory.byteLength>MEMORY_LIMIT||ptr+count*PARTICLE_STRIDE*4>memory.byteLength) {
    throw new Error("Particle engine exceeded its fixed resource contract");
  }
  return new Float32Array(memory,ptr,count*PARTICLE_STRIDE);
}

export async function loadParticleEngine(signal: AbortSignal): Promise<ParticleExports> {
  const response=await fetch("/particles.wasm",{signal});
  if(!response.ok)throw new Error("Rust particle module is unavailable. Run npm run build:particles.");
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>2*1024*1024)throw new Error("Particle module exceeds its code budget");
  const module=await WebAssembly.compile(bytes);
  // Pure math only: no imported network, file, native, clock or rendering calls.
  if(WebAssembly.Module.imports(module).length)throw new Error("Particle module must have no host imports");
  const instance=await WebAssembly.instantiate(module,{});
  const engine=instance.exports as unknown as ParticleExports;
  for(const name of ["init","set_target","step","positions_ptr","particle_count","transition_active","stride"] as const){
    if(typeof engine[name]!=="function")throw new Error("Particle module has an incompatible ABI");
  }
  if(!(engine.memory instanceof WebAssembly.Memory))throw new Error("Particle memory unavailable");
  engine.init(20261014);readParticles(engine);
  return engine;
}
