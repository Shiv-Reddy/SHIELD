/**
 * Popup entry.
 *
 * `createRoot` rather than hydration: the popup is built fresh each time it is
 * opened and has no server-rendered markup to adopt.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { App } from './App';

const host = document.getElementById('root');
if (!host) throw new Error('popup root is missing');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
