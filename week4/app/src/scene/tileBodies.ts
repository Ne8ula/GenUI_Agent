// Filled tile bodies, not decoration over intact floating quads. Walk-away-r3 reference packet.
import type { ConstructionCommand, ConstructionTextureVertex } from './constructionTypes.ts';
import type { PhotoTileRegion } from './types.ts';
import { hash01 } from './rng.ts';

export interface TileBodyInput {
  regions: readonly PhotoTileRegion[];
  atlasSizePx: readonly [number, number];
  msAfterBuild: number;
  seed: number;
  reducedMotion: boolean;
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const saltFor = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export function buildTileBodies(input: TileBodyInput): readonly ConstructionCommand[] {
  const [aw, ah] = input.atlasSizePx;
  if (!(aw > 0 && ah > 0 && Number.isFinite(aw + ah))) return [];
  const t = input.reducedMotion ? 2200 : Number.isFinite(input.msAfterBuild) ? Math.max(0, input.msAfterBuild) : 0;
  const commands: ConstructionCommand[] = [];
  for (const region of input.regions.slice(0, 64)) {
    const [x,y,w,h] = region.rectNorm, [sx0,sy0,sx1,sy1] = region.sourceBoxPx;
    if (![x,y,w,h,sx0,sy0,sx1,sy1].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    const salt = (saltFor(region.id) ^ input.seed) >>> 0;
    const rows = Math.max(4, Math.min(12, Math.round(h * 1080 / 7)));
    const emit = (id: string, left: number, top: number, width: number, height: number, a: number, b: number, c: number, d: number, alpha = 1) => {
      const v = (dx: number,dy: number,u: number,vv: number): ConstructionTextureVertex => ({x:clamp(dx),y:clamp(dy),u:clamp(u),v:clamp(vv)});
      const tl=v(left,top,a,b),tr=v(left+width,top,c,b),bl=v(left,top+height,a,d),br=v(left+width,top+height,c,d);
      commands.push({kind:'texture',id:`tile:${region.id}:body:${id}:a`,component:'tile-body',alpha,texture:'tiles',vertices:[tl,tr,br]},
        {kind:'texture',id:`tile:${region.id}:body:${id}:b`,component:'tile-body',alpha,texture:'tiles',vertices:[tl,br,bl]});
    };
    for (let row=0; row<rows; row++) {
      const rs = (salt ^ Math.imul(row+1,0x9e3779b1)) >>> 0;
      const hold = 160 + hash01(rs,1)*260;
      const cycle = Math.floor((t+hash01(rs,2)*hold)/hold);
      // One retained row guarantees a nonempty body for every authored tile; the others leave real gaps.
      if (row !== 0 && hash01(rs,cycle ^ 3)<0.23) continue;
      const shift = (hash01(rs,cycle ^ 4)*2-1)*Math.min(w*0.34,0.027);
      const split = hash01(rs,cycle ^ 5)<0.38;
      const cuts = split ? [0,0.28+hash01(rs,cycle ^ 6)*0.43,1] : [0,1];
      const top=y+h*row/rows, height=h/rows*(row===0?1:0.78+hash01(rs,cycle ^ 7)*0.22);
      const sourceRow = hash01(rs,cycle ^ 8)<0.18 ? (row+1)%rows : row;
      const v0=(sy0+(sy1-sy0)*sourceRow/rows)/ah, v1=(sy0+(sy1-sy0)*(sourceRow+1)/rows)/ah;
      for (let k=0;k<cuts.length-1;k++) {
        const a=cuts[k]!, b=cuts[k+1]!;
        const localShift=shift*(k===0?1:-0.55);
        const gap=split ? w*0.035 : 0;
        emit(`${row}-${k}`,x+w*a+localShift,top,Math.max(w*(b-a)-gap,w*0.02),height,
          (sx0+(sx1-sx0)*a)/aw,v0,(sx0+(sx1-sx0)*b)/aw,v1);
      }
      if (hash01(rs,cycle ^ 9)<0.18) {
        // A source-row stretch extends the actual colored material, without restoring its backing quad.
        emit(`${row}-stretch`,x+shift-w*0.12,top+h/rows*0.3,w*1.28,Math.min(height*0.22,0.0035),sx0/aw,v0,sx1/aw,v1,0.76);
      }
    }
  }
  return commands;
}
