import { useRef, useState } from 'react';
export type RoomBoundary = {polygon:number[][];floor:number;ceiling:number};
export function BoundaryReview({value,positions,onChange}:{value:RoomBoundary;positions:number[];onChange:(b:RoomBoundary)=>void}) {
  const svg=useRef<SVGSVGElement>(null);
  const [selected,setSelected]=useState(0);
  // A replacement proposal may contain fewer corners than the edited outline.
  const activeCorner=Math.max(0,Math.min(selected,value.polygon.length-1));
  const xs=value.polygon.map(p=>p[0]!),ys=value.polygon.map(p=>p[1]!);
  const [frame]=useState(()=>{const minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY;
    const size=Math.max(width,height,.01)*1.4;return {x:(minX+Math.max(...xs)-size)/2,y:(minY+Math.max(...ys)-size)/2,size};});
  const project=(p:number[])=>[(p[0]!-frame.x)/frame.size*500,500-(p[1]!-frame.y)/frame.size*500];
  const move=(index:number,x:number,y:number)=>{
    const polygon=value.polygon.map((p,i)=>i===index?[x,y]:p);
    onChange({...value,polygon});
  };
  const dots=[];
  const step=Math.max(3,Math.ceil(positions.length/9000)*3);
  for(let i=0;i<positions.length;i+=step){const p=project([positions[i]!,positions[i+1]!]);dots.push(<circle key={i} cx={p[0]} cy={p[1]} r="1" fill="#aab5a3"/>);}
  return <div className="boundary-review">
    <p>Top view of the estimate. Move the corners to include only this room. Doorways and windows close along this outline.</p>
    <svg ref={svg} viewBox="0 0 500 500" aria-label="Editable room outline" role="group" style={{width:'100%',maxHeight:420,background:'#151a14',touchAction:'none'}}>
      {dots}
      <polygon points={value.polygon.map(project).map(p=>p.join(',')).join(' ')} fill="#e9d8b122" stroke="#e9d8b1" strokeWidth="2"/>
      {value.polygon.map((point,index)=>{
        const p=project(point);
        return <circle key={index} cx={p[0]} cy={p[1]} r="10" fill={activeCorner===index?'#f1c76a':'#e9d8b1'} tabIndex={0} role="button"
          aria-label={`Room corner ${index+1}. Use arrow keys to adjust.`}
          onFocus={()=>setSelected(index)}
          onKeyDown={e=>{
            const d=frame.size/100;const deltas:Record<string,number[]>={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,d],ArrowDown:[0,-d]};
            const delta=deltas[e.key];if(delta){e.preventDefault();move(index,point[0]!+delta[0]!,point[1]!+delta[1]!);}
          }}
          onPointerDown={e=>{setSelected(index);e.currentTarget.setPointerCapture(e.pointerId);}}
          onPointerMove={e=>{
            if(!e.currentTarget.hasPointerCapture(e.pointerId)||!svg.current)return;
            const matrix=svg.current.getScreenCTM();if(!matrix)return;
            const cursor=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
            move(index,frame.x+Math.max(0,Math.min(500,cursor.x))/500*frame.size,frame.y+(1-Math.max(0,Math.min(500,cursor.y))/500)*frame.size);
          }}
          onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}/>;
      })}
    </svg>
    <div className="upload-actions">
      <button className="secondary" disabled={value.polygon.length<3||value.polygon.length>=16} onClick={()=>{
        const next=value.polygon[(activeCorner+1)%value.polygon.length]!,p=value.polygon[activeCorner]!;
        const polygon=value.polygon.slice();polygon.splice(activeCorner+1,0,[(p[0]!+next[0]!)/2,(p[1]!+next[1]!)/2]);setSelected(activeCorner);onChange({...value,polygon});
      }}>Add corner after {activeCorner+1}</button>
      <button className="secondary" disabled={value.polygon.length<=3} onClick={()=>{
        onChange({...value,polygon:value.polygon.filter((_,i)=>i!==activeCorner)});setSelected(0);
      }}>Remove selected corner</button>
    </div>
    <label>Floor level <input type="number" step="0.01" value={value.floor} onChange={e=>onChange({...value,floor:Number(e.target.value)})}/></label>
    <label>Ceiling level <input type="number" step="0.01" value={value.ceiling} onChange={e=>onChange({...value,ceiling:Number(e.target.value)})}/></label>
    <p className="upload-privacy">Levels are relative to the photo estimate, not measured metres. Correct the outline before accepting it.</p>
  </div>;
}
