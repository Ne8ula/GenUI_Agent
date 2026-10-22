export type Opening={id:string;edge_index:number;t0:number;t1:number;bottom:number;top:number;kind:'door'|'window'};
export function OpeningReview({value,onChange,boundary}:{value:Opening[];onChange:(v:Opening[])=>void;boundary:{polygon:number[][];floor:number;ceiling:number}}){
  function change(i:number,patch:Partial<Opening>){onChange(value.map((o,j)=>i===j?{...o,...patch}:o));}
  return <fieldset className="opening-review"><legend>Door and window closures</legend>
    <p>The room shell closes all boundary gaps. Mark visible openings to give them a simple door or opaque window panel. These are assumptions.</p>
    {value.map((o,i)=><div className="opening-row" key={o.id}>
      <label>Closure {i+1}<select value={o.kind} onChange={e=>change(i,{kind:e.target.value as Opening['kind']})}><option value="door">Door</option><option value="window">Window</option></select></label>
      <label>Wall<select value={o.edge_index} onChange={e=>change(i,{edge_index:Number(e.target.value)})}>{o.edge_index<0&&<option value={-1} disabled>Choose wall again</option>}{boundary.polygon.map((_,index)=><option key={index} value={index}>Corner {index+1} to {(index+1)%boundary.polygon.length+1}</option>)}</select></label>
      {(['t0','t1','bottom','top'] as const).map(key=><label key={key}>{{t0:'Start (0–1)',t1:'End (0–1)',bottom:'Bottom',top:'Top'}[key]}
        <input type="number" step=".01" value={o[key]} onChange={e=>change(i,{[key]:Number(e.target.value)})}/></label>)}
      <button className="secondary" onClick={()=>onChange(value.filter((_,j)=>i!==j))}>Remove closure {i+1}</button>
    </div>)}
    <button className="secondary" disabled={value.length>=32} onClick={()=>onChange([...value,{id:crypto.randomUUID(),edge_index:0,t0:.35,t1:.65,
      bottom:boundary.floor,top:boundary.floor+(boundary.ceiling-boundary.floor)*.8,kind:'door'}])}>Add door or window closure</button>
  </fieldset>;
}
