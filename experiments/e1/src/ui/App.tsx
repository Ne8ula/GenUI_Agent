import { getE1RuntimeInfo } from "../native";
import { VoiceWeather } from "./weave/VoiceWeather";
import "./tokens.css";
import "./layout.css";

const runtime=getE1RuntimeInfo();

export default function App() {
  if(runtime.native)return <div className="e1-root"><section className="weave-quarantine" role="alert">
    <h1>Native rendering is quarantined</h1>
    <p>This build must not initialize the desktop GPU renderer after the reported black-screen/freeze incident.</p>
    <p>Close E1. The replacement particle design is available only in the isolated browser preview.</p>
  </section></div>;
  return <div className="e1-root"><VoiceWeather native={false}/></div>;
}
