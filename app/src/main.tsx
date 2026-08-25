import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx'
import './index.css'

// Fundamentally prevent stale cache & version rollback issues:
// Unregister all legacy service workers and clear cache storage completely
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const reg of registrations) {
      reg.unregister();
    }
  });
}
if ('caches' in window) {
  caches.keys().then(names => {
    for (const name of names) {
      caches.delete(name);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
