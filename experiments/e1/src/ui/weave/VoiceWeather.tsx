import { useCallback, useEffect, useRef, useState } from "react";
import { E1Controller, formatForecastAnswer } from "../../core";
import { useE1Snapshot } from "../hooks/useE1Snapshot";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { useViewportSize } from "../hooks/useViewportSize";
import { compositionCenter, WeaveMaterial } from "./WeaveMaterial";
import backdrop from "../../../weave/inputs/BG-mock-desktop.png";
import "./weave.css";

export function VoiceWeather(_props: { native: boolean }) {
  const [controller]=useState(()=>new E1Controller());
  const snapshot=useE1Snapshot(controller);
  const reduced=useReducedMotionPreference();
  const viewport=useViewportSize();
  const [notice,setNotice]=useState("");
  const today=useRef<HTMLButtonElement>(null);
  const forecast=snapshot.status==="ready"?snapshot.forecast:null;
  const [placardSettled,setPlacardSettled]=useState(false);
  useEffect(()=>{
    if(!forecast||snapshot.transition.status==="active")setPlacardSettled(false);
    else if(snapshot.transition.status==="settled")setPlacardSettled(true);
  },[forecast,snapshot.transition.status]);
  const showPlacard=snapshot.plain||snapshot.reducedMotion||(placardSettled&&snapshot.transition.status!=="active");
  const center=compositionCenter(snapshot);
  const frameWidth=Math.min(viewport.width,viewport.height*1088/608),frameHeight=frameWidth*608/1088;
  const settled=useCallback(()=>{controller.completeTransition();},[controller]);
  const failure=useCallback((message:string)=>setNotice(message),[]);
  useEffect(()=>{if(reduced)controller.setReducedMotion(true);},[controller,reduced]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
      if(event.key==="Escape"){event.preventDefault();controller.dismiss();today.current?.focus();}
      if(event.key.toLowerCase()==="s")controller.stop();
      if(event.key.toLowerCase()==="l")controller.setReducedMotion(!controller.getSnapshot().reducedMotion);
      if(event.key.toLowerCase()==="p")controller.setPlain(!controller.getSnapshot().plain);
    };
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[controller]);
  useEffect(()=>{
    if(!import.meta.env.DEV)return;
    Object.assign(window,{__E1_WEAVE_TEST__:{controller,getSnapshot:controller.getSnapshot}});
    return()=>{delete (window as unknown as Record<string,unknown>).__E1_WEAVE_TEST__;};
  },[controller]);
  return <>
    <img className="weave-backdrop" src={backdrop} alt=""/>
    <WeaveMaterial snapshot={snapshot} onSettled={settled} onFailure={failure}/>
    {forecast&&<section className={`weave-facts ${snapshot.plain?"is-plain":""} ${snapshot.reducedMotion?"is-reduced":""} ${snapshot.transition.status==="interrupted"?"is-paused":""}`} aria-label="Synthetic New York City weather"
      style={{width:frameWidth,height:frameHeight,left:(viewport.width-frameWidth)/2+(center.x-.5)*viewport.width,top:(viewport.height-frameHeight)/2+(center.y-.38)*viewport.height}}>
      {showPlacard&&<div className="weave-readout">
        <div className="weave-place"><span>NYC</span><strong>{forecast.day==="today"?"Today":"Tomorrow"}</strong></div>
        <div className="weave-answer"><span className="weave-condition">{forecast.condition==="sunny"?"Sunny":"Rainy"}</span>
          <div className="weave-temperature">{forecast.temperatureC}<span>°C</span></div>
        </div>
      </div>}
      <p className={snapshot.plain?"weave-plain-context":"e1-visually-hidden"}>{formatForecastAnswer(forecast)} {forecast.date}, America/New_York. Rain probability {forecast.precipitationProbabilityPercent}%, wind {forecast.windKmh} km/h. Synthetic fixture {forecast.fixtureId}, not live weather.</p>
    </section>}
    <nav className="weave-day-controls" aria-label="Weather day">
      <button ref={today} aria-pressed={forecast?.day==="today"} onClick={()=>controller.requestForecast("today","NYC")}>Today in NYC</button>
      <button aria-pressed={forecast?.day==="tomorrow"} onClick={()=>controller.requestForecast("tomorrow","NYC")}>Tomorrow</button>
    </nav>
    {notice&&<p className="weave-notice" role="alert">{notice}</p>}
  </>;
}
