/** Owner review record for FFS segments, photo crops and fitted models. Owner input, not source evidence. */
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,relative} from 'node:path';
import {boundedFile,atomic,ownerLock,fail,sha,ffsResource,source} from './crime-scene.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const FFS='/api/room-workflow/benchmark/ffs/';
const HEADER='# FFS th_0028 — owner review\n\nOwner decisions on segments, photo crops and fitted models, made from rendered previews. Owner input, not source evidence.\n\n';
const TAGS=['17','69','12','22','13','18','32'];
const EMPTY={segments:{},crops:{},models:{},coverage_threshold:1}; // Hide models until the owner sets a threshold.
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===expected;
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=(value,low,high)=>typeof value==='number'&&Number.isFinite(value)&&value>=low&&value<=high;
const encode=review=>HEADER+'```json\n'+JSON.stringify(review,null,2)+'\n```\n';

export function createSceneReview({path=join(ROOT,'.local/reconstruction/ffs-th0028-review-v1/review.md'),
  catalogPath=join(ROOT,'scripts/room_workflow/ffs-resources.json'),markers}={}){
  const lock=ownerLock('A review save is still running.');
  const catalogue=async()=>JSON.parse(await boundedFile(catalogPath,1024*1024));
  const markerIds=async()=>new Set(markers??(await source()).markers.map(m=>m.id));
  async function validate(value){
    if(!keys(value,'coverage_threshold,crops,models,segments'))throw fail('Unexpected review fields.');
    const ids=await markerIds(),catalog=await catalogue();
    if(!record(value.segments)||Object.entries(value.segments).some(([id,status])=>!ids.has(id)||!['approved','rejected'].includes(status)))
      throw fail('Invalid segment marker id or decision.');
    if(!record(value.crops)||Object.entries(value.crops).some(([name,box])=>!/^IMG_20240306_\d{6}\.jpg$/.test(name)||
      !Object.hasOwn(catalog,'photos/'+name)||!Array.isArray(box)||box.length!==4||!box.every(v=>finite(v,0,1))||box[0]>=box[2]||box[1]>=box[3]))
      throw fail('Invalid photo crop.');
    // upright: XYZ Euler radians in the display z-up frame, applied about the hologram's bbox centre (approved segment, else the marker), then
    // re-floored to the measured bottom height. The renderer honours it whatever the model status; status gates only the generated-mesh display.
    if(!record(value.models)||Object.entries(value.models).some(([tag,model])=>!TAGS.includes(tag)||!keys(model,'status,upright')||
      !['approved','rejected'].includes(model.status)||!Array.isArray(model.upright)||model.upright.length!==3||
      !model.upright.every(v=>finite(v,-Math.PI,Math.PI))))throw fail('Invalid model tag, decision or upright rotation.');
    if(!finite(value.coverage_threshold,0,1))throw fail('Coverage threshold must be between 0 and 1.');
    return value;
  }
  async function read(){
    let text=encode(EMPTY);
    try{text=(await boundedFile(path,64*1024)).toString('utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
    const match=text.startsWith(HEADER)&&text.slice(HEADER.length).match(/^```json\n([\s\S]*)\n```\n$/);
    const changed=()=>fail('Review format changed; preserve the file and inspect it before saving.',409);
    if(!match)throw changed();
    let review;try{review=JSON.parse(match[1]);}catch{throw changed();}
    try{await validate(review);}catch(error){if(error.status&&error.status!==400)throw error;throw changed();}
    return {review,revision:sha(text)};
  }
  return {
    read,
    save(body){return lock('review',async()=>{
      if(!record(body)||typeof body.revision!=='string')throw fail('Unexpected review fields.');
      const {revision,...rest}=body,review=await validate(rest);
      if(revision!==(await read()).revision)throw fail('The review changed elsewhere. Reopen it before saving.',409);
      const text=encode(review),catalog=await catalogue();
      await mkdir(dirname(path),{recursive:true});
      await atomic(path,text);
      // Only the review.md entry changes; a failure here leaves a hash mismatch, which the verified reader refuses.
      catalog['review.md']={path:relative(ROOT,path).replaceAll('\\','/'),sha256:sha(text),bytes:Buffer.byteLength(text),type:'text/markdown'};
      await atomic(catalogPath,JSON.stringify(catalog,null,2)+'\n');
      return {review,revision:sha(text)};
    });},
    // Investigator context: approved segments only, keyed by tag, with unit-labelled fields so extent is not read as height above floor (spec §4).
    async approved(){
      const catalog=await catalogue();
      if(!Object.hasOwn(catalog,'segments/summary.json'))return {};
      const summary=JSON.parse((await ffsResource(FFS+'segments/summary.json',{catalog})).body);
      const {segments}=(await read()).review,result={};
      for(const [id,status] of Object.entries(segments)){
        const m=summary.markers?.[id];
        if(status!=='approved'||!m||m.tag===null)continue; // Untagged markers have no evidence entry to describe.
        if(!Number.isSafeInteger(m.tag)||Object.hasOwn(result,m.tag)||!Number.isSafeInteger(m.count)||m.count<0||!finite(m.height,0,10)||
          !finite(m.base_above_floor,-10,10)||!Array.isArray(m.bbox)||m.bbox.length!==2||
          !m.bbox.every(c=>Array.isArray(c)&&c.length===3&&c.every(v=>finite(v,-1e4,1e4))))
          throw fail('Segment summary failed admission.',503);
        result[m.tag]={bbox_m:m.bbox,extent_m:m.height,base_above_floor_m:m.base_above_floor,point_count:m.count};
      }
      return result;
    },
  };
}
