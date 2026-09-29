import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import './index.css';

// Make the app light-only before the first React paint.
document.documentElement.classList.remove('dark');
localStorage.setItem('spenddesk_theme', 'light');

// Remove legacy offline caches. They were serving stale UI bundles after deploys.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister()))
    ).then(() => caches.keys()).then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).catch((err) => console.warn('Cache cleanup failed:', err));
  });
}

// Block touch pinch zoom and gesture zooming on iOS Safari / Mobile browsers
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());
document.addEventListener('touchstart', (e) => {
  if (e.touches && e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
