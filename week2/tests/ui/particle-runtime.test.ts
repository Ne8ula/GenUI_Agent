import { describe,it,expect } from "vitest";
import { readParticles,PARTICLE_LIMIT,MEMORY_LIMIT,type ParticleExports } from "../../src/ui/weave/particleRuntime";

function engine(count=1,ptr=0):ParticleExports {
  return {memory:new WebAssembly.Memory({initial:1}),init(){},set_target(){return 1;},step(){},positions_ptr:()=>ptr,particle_count:()=>count,stride:()=>8,transition_active:()=>0};
}
describe("bounded Rust particle bridge",()=>{
  it("views only the declared fixed particle buffer",()=>{
    const e=engine(2,32),view=readParticles(e);expect(view.length).toBe(16);expect(view.byteOffset).toBe(32);
  });
  it.each([PARTICLE_LIMIT+1,-1,NaN,Infinity,1.5])("rejects invalid count %s",count=>expect(()=>readParticles(engine(count))).toThrow());
  it.each([-4,1,65536,Infinity])("rejects invalid buffer pointer %s",ptr=>expect(()=>readParticles(engine(1,ptr))).toThrow());
  it("rejects memory expansion and incompatible records",()=>{
    const e=engine();e.memory={buffer:{byteLength:MEMORY_LIMIT+1}} as unknown as WebAssembly.Memory;
    expect(()=>readParticles(e)).toThrow();const other=engine();other.stride=()=>7;expect(()=>readParticles(other)).toThrow();
  });
});
