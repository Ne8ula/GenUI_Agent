import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoomMatrixGeometry} from '../src/room/matrix-style.ts';
import {sampleSurfacePoints} from '../src/room/surface-points.ts';

test('mixed face provenance stays local across shared vertices, independent layouts and scales',()=>{
  for(const scale of [.1,7]){
    const positions=[0,0,0,1,0,0,1,1,0,0,1,0].map(v=>v*scale+scale*2);
    const indices=[0,1,2,0,2,3],colors=Array(12).fill(.4);
    const buffer=new THREE.BufferGeometry();
    buffer.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    buffer.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    buffer.setIndex(indices);
    for(const tags of [
      ['photo-estimated','authored-room-shell'],
      ['authored-door-cap','photo-estimated'],
      ['generated-influenced','authored-aesthetic-object'],
      ['unknown','authored-window-cap'],
    ]){
      const rendered=createRoomMatrixGeometry(buffer,tags);
      for(let corner=0;corner<6;corner++){
        assert.equal(rendered.getAttribute('roomInferred').getX(corner),tags[Math.floor(corner/3)]==='photo-estimated'?0:1);
        for(let axis=0;axis<3;axis++)assert.equal(
          rendered.getAttribute('position').array[corner*3+axis],
          buffer.getAttribute('position').array[indices[corner]!*3+axis]);
      }
      assert.equal(rendered.getAttribute('roomShell').getX(0),tags[0]==='authored-door-cap'?1:0);
      assert.equal(rendered.getAttribute('roomShell').getX(3),['authored-room-shell','authored-window-cap'].includes(tags[1]!)?1:0);
      rendered.dispose();
    }
    assert.equal(buffer.getAttribute('roomInferred'),undefined);
    assert.deepEqual([...buffer.index!.array],indices);
    assert.throws(()=>createRoomMatrixGeometry(buffer,['photo-estimated']),/Missing face provenance/);
    const sampled=sampleSurfacePoints({positions,indices,colors},scale*.1);
    assert.equal(sampled.faces.length,sampled.positions.length/3);
    assert.deepEqual(new Set(sampled.faces),new Set([0,1]));
    for(let i=0;i<sampled.faces.length;i++){
      const x=sampled.positions[i*3]!,y=sampled.positions[i*3+1]!;
      assert.ok(sampled.faces[i]===0?x>=y-1e-5:x<=y+1e-5,'point provenance follows its actual source triangle');
    }
    buffer.dispose();
  }
});
