/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AstralRoom from './astral/AstralRoom.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');

createRoot(root).render(<StrictMode><AstralRoom /></StrictMode>);
