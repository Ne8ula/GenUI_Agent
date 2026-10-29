import { lazy, Suspense } from 'react';
import { RustApp } from './RustApp.tsx';

// The old host and its asset imports are excluded from the production dependency graph.
// History is an explicit development route, never a fallback from a Rust failure.
const Historical = import.meta.env.DEV
  ? lazy(() => import('./HistoricalApp.tsx').then((module) => ({ default: module.HistoricalApp })))
  : null;

const Hybrid = lazy(() => import('./hybrid/HybridApp.tsx').then(module => ({ default: module.HybridApp })));

const Scan = lazy(() => import('./scan/ScanApp.tsx').then(module => ({ default: module.ScanApp })));

const Arrival = lazy(() => import('./arrival/ArrivalApp.tsx').then(module => ({ default: module.ArrivalApp })));
const Room = lazy(() => import('./room/RoomApp.tsx').then(module => ({ default: module.RoomApp })));
const UploadRoom = lazy(() => import('./room/UploadRoom.tsx').then(module => ({ default: module.UploadRoom })));
const BenchmarkRoom = lazy(() => import('./room/BenchmarkRoom.tsx').then(module => ({ default: module.BenchmarkRoom })));
const Demo = lazy(() => import('./demo/DemoApp.tsx').then(module => ({ default: module.DemoApp })));
const Bedroom = lazy(() => import('./bedroom/BedroomApp.tsx').then(module => ({ default: module.BedroomApp })));

const CrimeScene = lazy(() => import('./crime-scene/PanoramaApp.tsx').then(module => ({ default: module.CrimeSceneEntry })));

export function App() {
  const scene = new URLSearchParams(window.location.search).get('scene');
  if (scene === 'crime-scene') return <Suspense fallback={<p>Opening the investigation…</p>}><CrimeScene /></Suspense>;
  if (scene === 'demo') return <Suspense fallback={null}><Demo /></Suspense>;
  if (scene === 'teal-bedroom') return <Suspense fallback={<p>Opening the teal bedroom…</p>}><Bedroom /></Suspense>;
  if (scene === 'arkitscenes-room') return <Suspense fallback={<p>Opening the saved room estimate…</p>}><BenchmarkRoom /></Suspense>;
  if (scene === 'upload-room') return <Suspense fallback={<p>Opening your room workspace…</p>}><UploadRoom /></Suspense>;
  if ((scene === null && !new URLSearchParams(window.location.search).has('historical')) || scene === 'hypersim-room') {
    return <Suspense fallback={<p>Opening the reconstructed room…</p>}><Room /></Suspense>;
  }
  if (new URLSearchParams(window.location.search).get('scene') === 'paris-arrival') {
    return <Suspense fallback={<p>Preparing EVA and Paris…</p>}><Arrival /></Suspense>;
  }
  if (new URLSearchParams(window.location.search).get('scene') === 'paris-scan') {
    return <Suspense fallback={<p>Loading scan-inspired GPU renderer…</p>}><Scan /></Suspense>;
  }
  if (new URLSearchParams(window.location.search).get('scene') === 'paris-hybrid') {
    return <Suspense fallback={<p>Loading source-derived GPU renderer…</p>}><Hybrid /></Suspense>;
  }
  if (Historical && new URLSearchParams(window.location.search).get('historical') === '1') {
    return <Suspense fallback={<p>Loading historical renderer…</p>}><Historical /></Suspense>;
  }
  return <RustApp />;
}
