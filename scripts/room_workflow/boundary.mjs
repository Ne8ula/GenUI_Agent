/** Validate the human-confirmed outline before spending on reconstruction. */
export function validateBoundary(b) {
  if (!b || Object.keys(b).some(k=>!['polygon','floor','ceiling'].includes(k)) ||
    !Array.isArray(b.polygon) || b.polygon.length<3 || b.polygon.length>16 ||
    b.polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1000)) ||
    !Number.isFinite(b.floor)||!Number.isFinite(b.ceiling)||Math.abs(b.floor)>1000||Math.abs(b.ceiling)>1000||b.ceiling-b.floor<.001)
    throw Error('Confirm a finite single-room outline and height.');
  const p=b.polygon, cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  let area=0;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length];
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<1e-6)throw Error('Room corners must be distinct.');
    area+=a[0]*b[1]-a[1]*b[0];
    for(let j=i+1;j<p.length;j++){
      if(j===i+1||(i===0&&j===p.length-1))continue;
      const c=p[j],d=p[(j+1)%p.length];
      const overlap=Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))+1e-9 &&
        Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))+1e-9;
      if(overlap && cross(a,b,c)*cross(a,b,d)<=1e-12 && cross(c,d,a)*cross(c,d,b)<=1e-12)
        throw Error('Room edges must not cross or touch other edges.');
    }
  }
  if(Math.abs(area)<1e-6)throw Error('The room outline needs an area.');
  return b;
}
export function validateOpenings(openings,b) {
  if(!Array.isArray(openings)||openings.length>32)throw Error('Use at most 32 opening closures.');
  const ids=new Set();
  for(let i=0;i<openings.length;i++){
    const o=openings[i];
    if(!o||Object.keys(o).some(k=>!['id','edge_index','t0','t1','bottom','top','kind'].includes(k))||
      typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(o.id)||ids.has(o.id)||!['door','window'].includes(o.kind)||
      !Number.isInteger(o.edge_index)||o.edge_index<0||o.edge_index>=b.polygon.length||
      [o.t0,o.t1,o.bottom,o.top].some(n=>!Number.isFinite(n))||o.t0<0||o.t0>=o.t1||o.t1>1||o.bottom<b.floor||o.bottom>=o.top||o.top>b.ceiling)
      throw Error('Keep each door/window closure within its wall and room height.');
    ids.add(o.id);
    for(const other of openings.slice(0,i))if(other.edge_index===o.edge_index&&Math.max(other.t0,o.t0)<Math.min(other.t1,o.t1)&&Math.max(other.bottom,o.bottom)<Math.min(other.top,o.top))
      throw Error('Door/window closures must not overlap.');
  }
  return openings;
}
