import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { pruneExpiredAiCache } from './lib/gemini.ts';

// Clean up expired AI cache items on startup
pruneExpiredAiCache();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
