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

export function App() {
  const scene = new URLSearchParams(window.location.search).get('scene');
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
