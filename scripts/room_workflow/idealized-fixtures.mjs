import {readFileSync} from 'node:fs';

// Test-only fixture; no loader or broker may import this as fallback content.
const fixture=JSON.parse(readFileSync(new URL('./idealized-fixture.json',import.meta.url),'utf8'));
export const makeIdealizedFixture=()=>structuredClone(fixture);
export const expectedIdealizedBinding=value=>structuredClone({
  job_id:value.job_id,bindings:value.bindings,parent_revision:value.parent_revision,
  boundary:value.boundary,openings:value.openings,inventory:value.inventory,
});
