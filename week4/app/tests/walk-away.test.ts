import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWalkAwayFigure, walkAwayPose, walkJoints, WALK_HOME } from '../src/scene/walkAwayFigure.ts';
import { buildTileBodies } from '../src/scene/tileBodies.ts';
import type { TileBodyInput } from '../src/scene/tileBodies.ts';

const tiles: TileBodyInput = {
  regions: [{ id: 'coral', group: 'left', rectNorm: [0.1,0.1,0.12,0.16], sourceBoxPx: [100,100,220,260] }],
  atlasSizePx: [1000,1000], msAfterBuild: 0, seed: 33, reducedMotion: false,
};

test('away trajectory immediately moves left and continuously recedes, never approaches', () => {
  let previous = walkAwayPose(0,false);
  for (let t=100;t<=24000;t+=100) {
    const p=walkAwayPose(t,false);
    assert.ok(p.centerX < previous.centerX);
    assert.ok(p.heightFrac < previous.heightFrac);
    previous=p;
  }
  assert.ok(walkAwayPose(16000,false).centerX<0.12, 'reaches the left-chair side slowly');
  assert.ok(walkAwayPose(5000,false).centerX>0.25, 'does not zip to the edge');
});

test('away trajectory eventually leaves scene-left without growing or wrapping', () => {
  assert.ok(walkAwayPose(30000,false).offFrame);
  assert.deepEqual(walkAwayPose(1e9,false),walkAwayPose(30000,false));
  assert.deepEqual(buildWalkAwayFigure(30000,false),[]);
});

test('negative/nonfinite time starts at home and custom placement is retained', () => {
  assert.deepEqual(walkAwayPose(-50,false),walkAwayPose(0,false));
  assert.deepEqual(walkAwayPose(NaN,false),walkAwayPose(0,false));
  const home={...WALK_HOME,centerX:0.6};
  assert.equal(walkAwayPose(0,false,home).centerX,0.6);
});

test('feet alternate stance/swing with a fixed planted contact as the pelvis advances', () => {
  const a=walkJoints(0,false), b=walkJoints(400,false);
  assert.ok(a.rightFoot.stance && b.rightFoot.stance);
  assert.deepEqual(a.rightFoot.contact,b.rightFoot.contact);
  assert.ok(b.rightHip[0]<a.rightHip[0]);
  assert.equal(a.leftFoot.stance,false);
  assert.equal(walkJoints(800,false).rightFoot.stance,false);
  assert.equal(walkJoints(800,false).leftFoot.stance,true);
  const c=walkJoints(600,false),d=walkJoints(1000,false);
  assert.deepEqual(c.leftFoot.contact,d.leftFoot.contact);
});

test('swing foot clears the floor, stance sole stays at ground contact', () => {
  for (let t=0;t<3200;t+=50) {
    const j=walkJoints(t,false);
    for (const foot of [j.leftFoot,j.rightFoot]) {
      const soleY=foot.ankle[1]+j.pose.heightFrac*0.025;
      if(foot.stance) assert.ok(Math.abs(soleY-foot.contact[1])<1e-12);
      else assert.ok(soleY<=foot.contact[1]+1e-12);
    }
  }
});

test('knees bend independently and remain finite through repeated steps', () => {
  for(let t=0;t<18000;t+=100) {
    const j=walkJoints(t,false);
    for(const p of [j.leftHip,j.rightHip,j.leftKnee,j.rightKnee,j.leftFoot.ankle,j.rightFoot.ankle]) assert.ok(p.every(Number.isFinite));
    const hx=j.rightHip[0], ax=j.rightFoot.ankle[0];
    assert.ok(j.rightKnee[0] <= Math.max(hx,ax)+0.005);
  }
  assert.notDeepEqual(walkJoints(0,false).leftKnee,walkJoints(400,false).leftKnee);
});

test('separate limbs/shoes are live geometry rather than a whole-sprite translation', () => {
  const a=buildWalkAwayFigure(0,false),b=buildWalkAwayFigure(400,false);
  for(const part of ['left-calf','right-calf','left-shoe','right-shoe','left-forearm','right-forearm','coat-left','coat-right']) {
    assert.ok(a.some(c=>c.id.includes(part)),part);
  }
  assert.ok(a.some(c=>c.kind==='disc'&&c.id.includes('calf')));
  assert.notDeepEqual(a,b);
  assert.deepEqual(a,buildWalkAwayFigure(0,false));
});

test('reduced gait and body plan are truly time invariant, including stance state', () => {
  assert.deepEqual(walkJoints(0,true),walkJoints(22000,true));
  assert.deepEqual(buildWalkAwayFigure(0,true),buildWalkAwayFigure(22000,true));
  assert.ok(buildWalkAwayFigure(22000,true).length>0);
});

test('walker commands stay bounded and source UVs remain inside the static source', () => {
  for(let t=0;t<25000;t+=211) {
    const commands=buildWalkAwayFigure(t,false);
    assert.ok(commands.length<800);
    for(const c of commands) {
      if(c.kind==='texture') for(const v of c.vertices) {
        assert.ok([v.x,v.y,v.u,v.v].every(Number.isFinite));
        assert.ok(v.u>=0&&v.u<=1&&v.v>=0&&v.v<=1);
      }
    }
  }
});

test('tile bodies have no full-height intact backing quad and retain authored IDs', () => {
  const commands=buildTileBodies(tiles);
  assert.ok(commands.length>4);
  for(const c of commands) {
    assert.equal(c.kind,'texture');
    if(c.kind!=='texture') continue;
    assert.ok(c.id.startsWith('tile:coral:body:'));
    assert.ok(Math.max(...c.vertices.map(v=>v.y))-Math.min(...c.vertices.map(v=>v.y))<0.16*0.4);
  }
});

test('tile material fragments move independently rather than translating one whole rectangle', () => {
  const a=buildTileBodies(tiles),b=buildTileBodies({...tiles,msAfterBuild:350});
  assert.notDeepEqual(a,b);
  const xs=new Set(a.filter(c=>c.kind==='texture'&&c.id.endsWith(':a')).map(c=>c.kind==='texture'?c.vertices[0].x:0));
  assert.ok(xs.size>3);
  assert.deepEqual(a,buildTileBodies(tiles));
});

test('tile body corruption persists long after formation and has a static reduced equivalent', () => {
  assert.notDeepEqual(buildTileBodies({...tiles,msAfterBuild:20000}),buildTileBodies({...tiles,msAfterBuild:20500}));
  assert.deepEqual(buildTileBodies({...tiles,reducedMotion:true}),buildTileBodies({...tiles,reducedMotion:true,msAfterBuild:90000}));
});

test('tile fragments have bounded coordinates/UVs, finite guards, and empty input is empty', () => {
  assert.deepEqual(buildTileBodies({...tiles,regions:[]}),[]);
  assert.deepEqual(buildTileBodies({...tiles,atlasSizePx:[0,1000]}),[]);
  for(let t=0;t<20000;t+=317) for(const c of buildTileBodies({...tiles,msAfterBuild:t})) {
    if(c.kind==='texture') for(const v of c.vertices) assert.ok([v.x,v.y,v.u,v.v].every(n=>Number.isFinite(n)&&n>=0&&n<=1));
  }
});

test('both settled renderer paths invoke shared articulated and fragment plans, not old sliding draws', () => {
  for(const name of ['canvas2d','webgl2']) {
    const source=readFileSync(new URL(`../src/render/${name}.ts`,import.meta.url),'utf8');
    assert.match(source,/buildWalkAwayFigure\(/);
    assert.match(source,/buildTileBodies\(/);
    assert.doesNotMatch(source,/photoApproachPose\(|tileDriftOffset\(/);
  }
});
