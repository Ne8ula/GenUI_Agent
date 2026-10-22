/** TEST ONLY: invented geometry and cameras, never an inference implementation.
 * The executed flag exercises the worker protocol; no model runs in this helper.
 */
import { createHash } from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`
  :value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`:JSON.stringify(value);
function meshHash(mesh) {
  const h=createHash('sha256');
  for(const key of ['positions','colors','indices']) {
    h.update(key);const bytes=Buffer.alloc(mesh[key].length*4);
    mesh[key].forEach((v,i)=>key==='indices'?bytes.writeUInt32LE(v,i*4):bytes.writeFloatLE(v,i*4));h.update(bytes);
  }
  return h.digest('hex');
}
export function makeSyntheticAnalysis(request) {
  const originals=request.images.map(({id,sha256})=>({id,sha256}));
  const ids=new Set(originals.map(image=>image.id));
  const masks=Object.fromEntries(Object.entries(request.masks??{}).filter(([id])=>ids.has(id)).map(([id,value])=>[id,value.sha256]));
  const geometry={positions:[0,0,1,1,0,1,0,1,1],colors:[.5,.5,.5,.5,.5,.5,.5,.5,.5],
    indices:[0,1,2],normals:[0,0,1,0,0,1,0,0,1],provenance:['photo-estimated'],
    source_view_indices:[0],units:'relative',representation:'synthetic-test-triangle'};
  const analysis_binding={model_config_sha256:hash('SYNTHETIC TEST CONFIGURATION; NO MODEL'),
    original_inputs_sha256:hash(canonical({images:originals,masks})),analysis_geometry_sha256:meshHash(geometry)};
  return {version:1,job_id:request.job_id,status:'complete',model_execution:'executed',units:'relative',
    arms:{A:{status:'complete',geometry,cameras:originals.map(image=>({image_id:image.id,
      world_to_camera:[[1,0,0,0],[0,1,0,0],[0,0,1,0]],intrinsics:[[500,0,259],[0,500,259],[0,0,1]],
      center:[0,0,0],depth_kind:'OpenCV-z',units:'relative'}))}},
    original_input_hashes:originals,...analysis_binding,analysis_binding,
    boundary_proposal:{value:{polygon:[[0,0],[2,0],[2,2],[0,2]],floor:0,ceiling:2},
      requires_user_confirmation:true,origin:'Synthetic test fixture; not a room estimate'},
    limitations:['TEST FIXTURE ONLY: no model, cloud or real room inference occurred.']};
}
