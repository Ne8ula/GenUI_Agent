/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');

// Both pages load dynamically so neither one's global styles reach the other.
if (new URLSearchParams(window.location.search).has('legacy')) {
  void Promise.all([
    import('./App.tsx'),
    import('./App.css'),
    import('@fontsource/ibm-plex-sans/300.css'),
    import('@fontsource/ibm-plex-sans/300-italic.css'),
    import('@fontsource/ibm-plex-sans/400.css'),
    import('@fontsource/ibm-plex-sans/500.css'),
  ]).then(([{ default: App }]) => createRoot(root).render(<StrictMode><App /></StrictMode>));
} else {
  void import('./astral/AstralRoom.tsx').then(({ default: AstralRoom }) =>
    createRoot(root).render(<StrictMode><AstralRoom /></StrictMode>));
}
