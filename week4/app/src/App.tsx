import { lazy, Suspense } from 'react';
import { RustApp } from './RustApp.tsx';

// The old host and its asset imports are excluded from the production dependency graph.
// History is an explicit development route, never a fallback from a Rust failure.
const Historical = import.meta.env.DEV
  ? lazy(() => import('./HistoricalApp.tsx').then((module) => ({ default: module.HistoricalApp })))
  : null;

export function App() {
  if (Historical && new URLSearchParams(window.location.search).get('historical') === '1') {
    return <Suspense fallback={<p>Loading historical renderer…</p>}><Historical /></Suspense>;
  }
  return <RustApp />;
}
