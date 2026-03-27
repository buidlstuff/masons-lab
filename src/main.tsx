import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AppBootProvider } from './lib/app-boot';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppBootProvider>
      <App />
    </AppBootProvider>
  </StrictMode>,
);
