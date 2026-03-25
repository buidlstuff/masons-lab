import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ensureSeedData } from './lib/seed';

// Seed first, then mount — ensures featured machines exist before any useLiveQuery fires.
ensureSeedData().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}).catch(() => {
  // Seed failed (e.g. private/incognito IndexedDB quota) — mount anyway.
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
