import { useEffect, useState } from "react";
import { SomaticFrame } from "./SomaticFrame";

/** Authored retrieval choreography for the single allowlisted preference record. */
export function WeatherAssembly({ memoryState, quiet, units }: { memoryState: "loading" | "ready" | "error"; quiet: boolean; units: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (quiet) { setStep(2); return; }
    const timers = [1800, 3600, 6000].map((ms, index) => window.setTimeout(() => setStep(index + 1), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [quiet]);
  const scan = !quiet && step === 3 && memoryState !== "loading";
  const path = ["VAULT", "PREFERENCES", "WEATHER-UNITS.MD"];
  return <section className="weather-skeleton crt-assembly" data-stage={scan ? "raster" : "memory"}
    role="status" aria-label="Preparing weather" aria-busy="true" data-testid="weather-loading">
    <SomaticFrame />
    <div className="crt-heading"><span>{scan ? "02" : "01"}</span><strong>{scan ? "CONSTRUCT" : "MEMORY"}</strong><b aria-hidden="true">EVA</b></div>
    <div className="retrieval-scene">
      <div className="retrieval-path"><span>MEMORY / READ</span><span>{memoryState === "error" ? "UNAVAILABLE" : memoryState === "loading" ? "PENDING" : "RECORD BOUND"}</span></div>
      <div className="folder-bank" aria-hidden="true">{path.map((name, index) => <div className={"folder " + (Math.min(step, 2) === index ? "selected" : "")} key={name}>
        <span className="folder-tab">{String(index + 1).padStart(2, "0")}</span><div className="folder-sheets"><i /><i /><i /></div><div className="folder-face"><span>{name}</span><b>{index === 2 ? "MD" : "/"}</b></div>
      </div>)}</div>
      <div className="retrieval-address"><span aria-hidden="true">↳</span><strong>{path[Math.min(step, 2)]}</strong></div>
      <div className="retrieval-strip" aria-hidden="true">{Array.from({length: 24},(_,i)=><i key={i} style={{animationDelay:`${i*150}ms`}} />)}</div>
    </div>
    <div className="raster-scene" aria-hidden="true">
      <div className="raster-title"><b>WEATHER</b><span>ITHACA, NEW YORK</span></div>
      <div className="raster-reading"><span>{units}</span><div><i/><i/><i/></div></div>
      <div className="raster-days">{Array.from({length:7},(_,i)=><div key={i}><b>{String(i+1).padStart(2,"0")}</b><i/><i/></div>)}</div>
      <div className="raster-baseline"/>
    </div>
    <div className="crt-footer"><span>{scan ? "RASTER / BUILD" : "LOCAL / MEMORY"}</span><span>{memoryState === "error" ? "DEFAULT / CELSIUS" : scan ? "WEATHER / 01" : "PREFERENCES"}</span></div>
  </section>;
}
